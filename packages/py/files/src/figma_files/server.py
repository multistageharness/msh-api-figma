"""FastAPI server for Figma Files API with token validation middleware."""
from __future__ import annotations

import os
import ssl
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .errors import ApiError, AuthenticationError
from .models import ImageFormat
from .sdk import FigmaFileSDK
from .utils import FIGMA_SSL_VERIFY_ENV, resolve_verify

# TLS verification is resolved ONCE, here, at import — never per request.
#
# The asymmetry with the API token below is deliberate. The token is
# per-request because each caller brings their own credential. Certificate
# verification is not: a header or query parameter that could turn it off would
# let any caller disable TLS checking on this server's own outbound connection
# to api.figma.com — a credential-bearing hop the caller does not own. Whoever
# deploys the process decides, and nobody else.
#
# See msh-api-figma/v100/docs/ssl-verify-contract.md.
SSL_VERIFY_SOURCE = "env" if os.getenv(FIGMA_SSL_VERIFY_ENV) is not None else "default"
SSL_VERIFY = resolve_verify(None)

# Per-request clients get this, not SSL_VERIFY itself. When verification is off,
# an explicit CERT_NONE context carries the same meaning as `verify=False` — it
# is what httpx builds internally, and what the sibling downloader builds at
# figma_downloader/http_fetch.py:48-50 — while keeping the "verification is
# disabled" warning to the single one already emitted at startup, instead of
# re-emitting it on every request.
if SSL_VERIFY is False:
    _insecure_context = ssl.create_default_context()
    _insecure_context.check_hostname = False
    _insecure_context.verify_mode = ssl.CERT_NONE
    CLIENT_SSL_VERIFY: bool | str | ssl.SSLContext = _insecure_context
else:
    CLIENT_SSL_VERIFY = SSL_VERIFY


def _describe_ssl_verify() -> str:
    """One-line, log-safe description of the resolved verification setting."""
    if SSL_VERIFY is True:
        return "enabled"
    if SSL_VERIFY is False:
        return "DISABLED"
    if isinstance(SSL_VERIFY, str):
        return f"enabled (CA bundle: {SSL_VERIFY})"
    return "enabled (custom ssl.SSLContext)"


# Pydantic models for request/response
class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    message: str
    status_code: int


class HealthResponse(BaseModel):
    """Health check response."""
    status: str


class RenderImagesRequest(BaseModel):
    """Request model for rendering images."""
    node_ids: List[str]
    format: Optional[ImageFormat] = ImageFormat.PNG
    scale: Optional[float] = Field(1.0, ge=0.01, le=4.0)
    version: Optional[str] = None


class SearchNodesRequest(BaseModel):
    """Request model for searching nodes."""
    name_pattern: str
    case_sensitive: Optional[bool] = False
    limit: Optional[int] = Field(20, ge=1, le=100)


# Dependency for Figma token validation
async def get_figma_token(
    x_figma_token: Optional[str] = Header(None),
    figma_token: Optional[str] = Query(None, alias="token"),
) -> str:
    """
    Validate and retrieve Figma token from headers or environment.
    
    Priority order:
    1. X-Figma-Token header
    2. Query parameter 'token'
    3. FIGMA_TOKEN environment variable
    
    Raises:
        HTTPException: If no valid token is found
    """
    # Check header first
    token = x_figma_token

    # Fall back to query parameter
    if not token:
        token = figma_token

    # Fall back to environment variable
    if not token:
        token = os.getenv("FIGMA_TOKEN")

    if not token:
        raise HTTPException(
            status_code=401,
            detail="X-Figma-Token header is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token


# Dependency for SDK instance
async def get_sdk(token: str = Depends(get_figma_token)) -> FigmaFileSDK:
    """Get SDK instance with validated token.

    The token comes from the request; TLS verification does not — it is the
    process-level value resolved at import. Nothing in the request can reach it.
    """
    return FigmaFileSDK(api_key=token, verify=CLIENT_SSL_VERIFY)


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application lifecycle."""
    # Startup
    print("Starting Figma Files API server...")
    print(
        f"TLS certificate verification: {_describe_ssl_verify()} "
        f"(from {SSL_VERIFY_SOURCE})"
    )
    yield
    # Shutdown
    print("Shutting down Figma Files API server...")


# Create FastAPI app
app = FastAPI(
    title="Figma Files API",
    description="REST API for Figma Files operations",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(AuthenticationError)
async def authentication_error_handler(request: Request, exc: AuthenticationError):
    """Handle authentication errors."""
    return JSONResponse(
        status_code=401,
        content={
            "error": "AuthenticationError",
            "message": str(exc),
            "status_code": 401,
        },
    )


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    """Handle API errors."""
    status_code = getattr(exc, "status_code", 400)
    return JSONResponse(
        status_code=status_code,
        content={
            "error": "ApiError",
            "message": str(exc),
            "status_code": status_code,
        },
    )


# Routes
@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/v1/files/{file_key}", tags=["Files"])
async def get_file(
    file_key: str = Path(..., description="Figma file key"),
    version: Optional[str] = Query(None, description="Specific version ID"),
    depth: Optional[int] = Query(None, description="Tree traversal depth"),
    geometry: Optional[str] = Query(None, description="Geometry types to include"),
    plugin_data: Optional[str] = Query(None, description="Plugin IDs for plugin data"),
    branch_data: Optional[bool] = Query(False, description="Include branch data"),
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Get file JSON.
    
    Requires scopes: file_content:read, files:read
    """
    async with sdk:
        try:
            file_data = await sdk.get_file(
                file_key,
                version=version,
                depth=depth,
                include_geometry=bool(geometry),
                plugin_data=plugin_data,
                branch_data=branch_data,
            )
            return file_data.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/files/{file_key}/nodes", tags=["Files"])
async def get_file_nodes(
    file_key: str = Path(..., description="Figma file key"),
    ids: str = Query(..., description="Comma-separated node IDs"),
    version: Optional[str] = Query(None, description="Specific version ID"),
    depth: Optional[int] = Query(None, description="Tree traversal depth"),
    geometry: Optional[str] = Query(None, description="Geometry types to include"),
    plugin_data: Optional[str] = Query(None, description="Plugin IDs for plugin data"),
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Get file JSON for specific nodes.
    
    Requires scopes: file_content:read, files:read
    """
    async with sdk:
        try:
            node_ids = [nid.strip() for nid in ids.split(",")]
            nodes_data = await sdk.get_file_nodes(
                file_key,
                node_ids,
                version=version,
                depth=depth,
                include_geometry=bool(geometry),
                plugin_data=plugin_data,
            )
            return nodes_data.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/images/{file_key}", tags=["Images"])
async def render_images(
    file_key: str = Path(..., description="Figma file key"),
    ids: str = Query(..., description="Comma-separated node IDs"),
    scale: Optional[float] = Query(1.0, ge=0.01, le=4.0, description="Image scale"),
    format: Optional[ImageFormat] = Query(ImageFormat.PNG, description="Image format"),
    version: Optional[str] = Query(None, description="Specific version ID"),
    svg_include_id: Optional[bool] = Query(False, description="Include ID in SVG"),
    svg_simplify_stroke: Optional[bool] = Query(True, description="Simplify SVG strokes"),
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Render images of file nodes.
    
    Requires scopes: file_content:read, files:read
    """
    async with sdk:
        try:
            node_ids = [nid.strip() for nid in ids.split(",")]
            images_data = await sdk.render_images(
                file_key,
                node_ids,
                version=version,
                scale=scale,
                format=format,
                svg_include_id=svg_include_id,
                svg_simplify_stroke=svg_simplify_stroke,
            )
            return images_data.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/images/{file_key}", tags=["Images"])
async def render_images_post(
    file_key: str = Path(..., description="Figma file key"),
    request: RenderImagesRequest = ...,
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Render images of file nodes (POST variant for complex requests).
    
    Requires scopes: file_content:read, files:read
    """
    async with sdk:
        try:
            images_data = await sdk.render_images(
                file_key,
                request.node_ids,
                version=request.version,
                scale=request.scale,
                format=request.format,
            )
            return images_data.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/files/{file_key}/images", tags=["Images"])
async def get_image_fills(
    file_key: str = Path(..., description="Figma file key"),
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Get image fills.
    
    Requires scopes: file_content:read, files:read
    """
    async with sdk:
        try:
            fills_data = await sdk.get_image_fills(file_key)
            return fills_data.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/files/{file_key}/meta", tags=["Metadata"])
async def get_file_metadata(
    file_key: str = Path(..., description="Figma file key"),
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Get file metadata.
    
    Requires scopes: file_metadata:read, files:read
    """
    async with sdk:
        try:
            meta_data = await sdk.get_file_metadata(file_key)
            return meta_data.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/files/{file_key}/versions", tags=["Versions"])
async def get_file_versions(
    file_key: str = Path(..., description="Figma file key"),
    page_size: Optional[int] = Query(30, ge=1, le=100, description="Results per page"),
    before: Optional[str] = Query(None, description="Pagination cursor"),
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Get versions of a file.
    
    Requires scopes: file_versions:read, files:read
    """
    async with sdk:
        try:
            versions_data = await sdk.get_file_versions(
                file_key,
                page_size=page_size,
                before=before,
            )
            return versions_data.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


# Additional utility endpoints
@app.post("/v1/files/{file_key}/search", tags=["Search"])
async def search_nodes(
    file_key: str = Path(..., description="Figma file key"),
    request: SearchNodesRequest = ...,
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    Search for nodes by name pattern.
    
    Requires scopes: file_content:read, files:read
    """
    async with sdk:
        try:
            matches = await sdk.search_nodes_by_name(
                file_key,
                request.name_pattern,
                case_sensitive=request.case_sensitive,
            )
            # Apply limit
            if request.limit and len(matches) > request.limit:
                matches = matches[:request.limit]

            return {
                "results": matches,
                "count": len(matches),
            }
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/files/{file_key}/components", tags=["Components"])
async def list_components(
    file_key: str = Path(..., description="Figma file key"),
    sdk: FigmaFileSDK = Depends(get_sdk),
):
    """
    List all components in a file.
    
    Requires scopes: file_content:read, files:read
    """
    async with sdk:
        try:
            components = await sdk.get_components_in_file(file_key)
            return {
                "components": components,
                "count": len(components),
            }
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=str(e))
        except ApiError as e:
            raise HTTPException(status_code=400, detail=str(e))


# Run server if executed directly
if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    uvicorn.run(
        "figma_files.server:app",
        host=host,
        port=port,
        reload=True,
        log_level="info",
    )
