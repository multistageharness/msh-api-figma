"""FastAPI server for Figma Dev Resources API with token validation."""

from __future__ import annotations

import ssl

import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .sdk import FigmaDevResourcesSDK
from .models import (
    DevResource,
    DevResourceCreate,
    DevResourceUpdate,
    CreateDevResourcesRequest,
    CreateDevResourcesResponse,
    UpdateDevResourcesRequest,
    UpdateDevResourcesResponse,
    DeleteDevResourceResponse,
)
from .errors import FigmaDevResourcesError
from .utils import FIGMA_SSL_VERIFY_ENV, resolve_verify


# TLS verification is resolved ONCE, here, at import — never per request.
#
# The asymmetry with the API token is deliberate. The token is per-request
# because each caller brings their own credential. Certificate verification is
# not: a header or query parameter that could turn it off would let any caller
# disable TLS checking on this server's own outbound connection to
# api.figma.com — a credential-bearing hop the caller does not own. Whoever
# deploys the process decides, and nobody else.
#
# See msh-api-figma/v100/docs/ssl-verify-contract.md.
SSL_VERIFY_SOURCE = "env" if os.getenv(FIGMA_SSL_VERIFY_ENV) is not None else "default"
SSL_VERIFY = resolve_verify(None)

# Per-request clients get this, not SSL_VERIFY itself. When verification is off,
# an explicit CERT_NONE context carries the same meaning as `verify=False` — it
# is what httpx builds internally, and what the sibling downloader builds at
# figma_downloader/http_fetch.py:48-50 — while keeping the "verification is
# disabled" warning to the single one already emitted here, instead of
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


print(f"TLS certificate verification: {_describe_ssl_verify()} (from {SSL_VERIFY_SOURCE})")



app = FastAPI(
    title="Figma Dev Resources API",
    description="RESTful API for managing Figma dev resources",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_figma_token(
    x_figma_token: Optional[str] = Header(None),
    figma_token: Optional[str] = Query(None, alias="token"),
) -> str:
    """Validate and retrieve token from headers, query, or env.
    
    Priority order:
    1. X-Figma-Token header (recommended)
    2. token query parameter
    3. FIGMA_TOKEN environment variable
    """
    token = x_figma_token or figma_token or os.getenv("FIGMA_TOKEN")
    
    if not token:
        raise HTTPException(
            status_code=401,
            detail="X-Figma-Token header is required. Provide token via header, query parameter, or environment variable."
        )
    
    return token


async def get_sdk(token: str = Depends(get_figma_token)) -> FigmaDevResourcesSDK:
    """Get SDK instance with validated token."""
    return FigmaDevResourcesSDK(api_key=token, verify=CLIENT_SSL_VERIFY)


@app.exception_handler(FigmaDevResourcesError)
async def figma_error_handler(request, exc: FigmaDevResourcesError):
    """Handle Figma API errors."""
    return JSONResponse(
        status_code=exc.status_code or 500,
        content={"error": True, "message": exc.message}
    )


@app.get("/health")
async def health_check():
    """Health check endpoint (no authentication required)."""
    return {"status": "healthy", "service": "figma-dev-resources-api"}


@app.get("/v1/files/{file_key}/dev_resources", response_model=List[DevResource])
async def get_dev_resources(
    file_key: str,
    node_ids: Optional[str] = Query(None, description="Comma-separated node IDs"),
    sdk: FigmaDevResourcesSDK = Depends(get_sdk)
):
    """Get dev resources in a file.
    
    Args:
        file_key: The file to get dev resources from
        node_ids: Optional comma-separated list of node IDs to filter by
        
    Returns:
        List of dev resources
    """
    try:
        async with sdk:
            node_id_list = node_ids.split(",") if node_ids else None
            resources = await sdk.get_dev_resources(file_key, node_id_list)
            return resources
    except FigmaDevResourcesError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/dev_resources", response_model=CreateDevResourcesResponse)
async def create_dev_resources(
    request: CreateDevResourcesRequest,
    sdk: FigmaDevResourcesSDK = Depends(get_sdk)
):
    """Create dev resources across multiple files.
    
    Args:
        request: Request containing dev resources to create
        
    Returns:
        Response with created resources and any errors
    """
    try:
        async with sdk:
            result = await sdk.create_dev_resources(request.dev_resources)
            return result
    except FigmaDevResourcesError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/v1/dev_resources", response_model=UpdateDevResourcesResponse)
async def update_dev_resources(
    request: UpdateDevResourcesRequest,
    sdk: FigmaDevResourcesSDK = Depends(get_sdk)
):
    """Update existing dev resources.
    
    Args:
        request: Request containing dev resource updates
        
    Returns:
        Response with updated resources and any errors
    """
    try:
        async with sdk:
            result = await sdk.update_dev_resources(request.dev_resources)
            return result
    except FigmaDevResourcesError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/v1/files/{file_key}/dev_resources/{dev_resource_id}")
async def delete_dev_resource(
    file_key: str,
    dev_resource_id: str,
    sdk: FigmaDevResourcesSDK = Depends(get_sdk)
):
    """Delete a dev resource from a file.
    
    Args:
        file_key: The file to delete the dev resource from
        dev_resource_id: The ID of the dev resource to delete
        
    Returns:
        Delete response
    """
    try:
        async with sdk:
            result = await sdk.delete_dev_resource(file_key, dev_resource_id)
            return {
                "status": 200,
                "error": False,
                "message": "Dev resource deleted successfully"
            }
    except FigmaDevResourcesError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/v1/files/{file_key}/dev_resources/search", response_model=List[DevResource])
async def search_dev_resources(
    file_key: str,
    q: str = Query(..., description="Search term"),
    node_ids: Optional[str] = Query(None, description="Comma-separated node IDs"),
    sdk: FigmaDevResourcesSDK = Depends(get_sdk)
):
    """Search dev resources by name or URL.
    
    Args:
        file_key: The file to search in
        q: Search term for names and URLs
        node_ids: Optional comma-separated list of node IDs to filter by
        
    Returns:
        List of matching dev resources
    """
    try:
        async with sdk:
            node_id_list = node_ids.split(",") if node_ids else None
            resources = await sdk.search_dev_resources(file_key, q, node_id_list)
            return resources
    except FigmaDevResourcesError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/v1/files/{file_key}/nodes/{node_id}/dev_resources", response_model=List[DevResource])
async def get_dev_resources_by_node(
    file_key: str,
    node_id: str,
    sdk: FigmaDevResourcesSDK = Depends(get_sdk)
):
    """Get all dev resources attached to a specific node.
    
    Args:
        file_key: The file key
        node_id: The specific node ID
        
    Returns:
        List of dev resources for the node
    """
    try:
        async with sdk:
            resources = await sdk.get_dev_resources_by_node(file_key, node_id)
            return resources
    except FigmaDevResourcesError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/dev_resources/batch")
async def batch_create_dev_resources(
    request: CreateDevResourcesRequest,
    batch_size: int = Query(100, description="Batch size for processing"),
    sdk: FigmaDevResourcesSDK = Depends(get_sdk)
):
    """Create dev resources in batches for large datasets.
    
    Args:
        request: Request containing dev resources to create
        batch_size: Maximum number of resources per batch
        
    Returns:
        List of responses for each batch
    """
    try:
        async with sdk:
            results = await sdk.batch_create_dev_resources(
                request.dev_resources, 
                batch_size
            )
            return {
                "batches_processed": len(results),
                "total_created": sum(len(r.links_created) for r in results),
                "total_errors": sum(len(r.errors) for r in results),
                "results": results
            }
    except FigmaDevResourcesError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)