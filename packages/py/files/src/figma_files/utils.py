"""Utility functions for figma_files."""
from __future__ import annotations

import os
import re
import ssl
import warnings
from typing import List, Optional
from urllib.parse import urlparse

FIGMA_SSL_VERIFY_ENV = "FIGMA_SSL_VERIFY"

_FALSE_VALUES = frozenset({"false", "0", "no", "off", ""})
_TRUE_VALUES = frozenset({"true", "1", "yes", "on"})


class InsecureTransportWarning(UserWarning):
    """Emitted when TLS certificate verification has been turned off."""


def _as_bool(value: str) -> bool | None:
    """Parse a boolean-ish string.

    Returns True or False for a recognized form, or None when the value is
    neither — in which case the caller treats it as a CA-bundle path.
    """
    normalized = value.strip().lower()
    if normalized in _FALSE_VALUES:
        return False
    if normalized in _TRUE_VALUES:
        return True
    return None


def resolve_verify(
    verify: bool | str | ssl.SSLContext | None,
) -> bool | str | ssl.SSLContext:
    """Resolve the effective httpx ``verify`` value.

    Precedence, highest wins:

    1. the explicit ``verify`` argument (anything that is not ``None``)
    2. the ``FIGMA_SSL_VERIFY`` environment variable
    3. ``True``

    ``None`` means *unspecified*, not *off*: it defers to the environment and
    then to ``True``. Passing ``verify=True`` explicitly forces verification on
    even when ``FIGMA_SSL_VERIFY=0`` is set.

    ``FIGMA_SSL_VERIFY`` accepts ``true/false``, ``1/0``, ``yes/no``, ``on/off``
    (case-insensitive, surrounding whitespace ignored); any other value is used
    as a path to a CA bundle.

    Emits exactly one :class:`InsecureTransportWarning` when the resolved value
    is ``False``. Never warns for a CA-bundle path or for ``True``.

    See ``msh-api-figma/v100/docs/ssl-verify-contract.md`` for the full contract.
    """
    if verify is not None:
        resolved: bool | str | ssl.SSLContext = verify
        source = "argument"
    else:
        raw = os.environ.get(FIGMA_SSL_VERIFY_ENV)
        if raw is None:
            resolved, source = True, "default"
        else:
            parsed = _as_bool(raw)
            resolved = raw if parsed is None else parsed
            source = "env"

    if resolved is False:
        warnings.warn(
            f"TLS certificate verification is DISABLED (from {source}).",
            InsecureTransportWarning,
            stacklevel=3,
        )

    return resolved


def extract_file_key_from_url(url: str) -> Optional[str]:
    """Extract file key from a Figma URL.
    
    Args:
        url: Figma file URL
        
    Returns:
        File key if found, None otherwise
        
    Examples:
        >>> extract_file_key_from_url("https://www.figma.com/file/abc123/My-Design")
        'abc123'
    """
    # Pattern for Figma file URLs
    pattern = r"https://www\.figma\.com/file/([a-zA-Z0-9]+)"
    match = re.search(pattern, url)
    return match.group(1) if match else None


def extract_node_id_from_url(url: str) -> Optional[str]:
    """Extract node ID from a Figma URL.
    
    Args:
        url: Figma file URL with node ID
        
    Returns:
        Node ID if found, None otherwise
        
    Examples:
        >>> extract_node_id_from_url("https://www.figma.com/file/abc123/My-Design?node-id=1%3A2")
        '1:2'
    """
    parsed = urlparse(url)
    if "node-id" in parsed.query:
        # Extract node-id parameter and URL decode it
        import urllib.parse
        query_params = urllib.parse.parse_qs(parsed.query)
        node_id = query_params.get("node-id", [None])[0]
        if node_id:
            return urllib.parse.unquote(node_id)
    return None


def format_node_ids(node_ids: List[str]) -> str:
    """Format node IDs for API requests.
    
    Args:
        node_ids: List of node IDs
        
    Returns:
        Comma-separated string of node IDs
    """
    return ",".join(node_ids)


def parse_comma_separated(value: str) -> List[str]:
    """Parse comma-separated string into list.
    
    Args:
        value: Comma-separated string
        
    Returns:
        List of trimmed values
    """
    return [item.strip() for item in value.split(",") if item.strip()]


def validate_file_key(file_key: str) -> bool:
    """Validate file key format.
    
    Args:
        file_key: File key to validate
        
    Returns:
        True if valid format, False otherwise
    """
    # Figma file keys are typically alphanumeric
    pattern = r"^[a-zA-Z0-9]+$"
    return bool(re.match(pattern, file_key))


def validate_node_id(node_id: str) -> bool:
    """Validate node ID format.
    
    Args:
        node_id: Node ID to validate
        
    Returns:
        True if valid format, False otherwise
    """
    # Node IDs are typically in format "number:number"
    pattern = r"^\d+:\d+$"
    return bool(re.match(pattern, node_id))


def build_query_params(**kwargs) -> dict[str, str]:
    """Build query parameters, filtering out None values.
    
    Args:
        **kwargs: Parameter key-value pairs
        
    Returns:
        Dictionary with non-None values converted to strings
    """
    params = {}
    for key, value in kwargs.items():
        if value is not None:
            if isinstance(value, bool):
                params[key] = str(value).lower()
            else:
                params[key] = str(value)
    return params
