"""Utility functions for the Figma Components library."""

from __future__ import annotations

import os
import ssl
import warnings
import re
from typing import Optional, Dict, Any
from urllib.parse import urlparse, parse_qs


def extract_file_key_from_url(figma_url: str) -> Optional[str]:
    """
    Extract file key from a Figma URL.
    
    Args:
        figma_url: A Figma file URL
        
    Returns:
        The file key if found, None otherwise
        
    Examples:
        >>> extract_file_key_from_url("https://www.figma.com/file/abc123/My-Design")
        "abc123"
    """
    pattern = r"figma\.com/file/([a-zA-Z0-9]+)"
    match = re.search(pattern, figma_url)
    return match.group(1) if match else None


def extract_team_id_from_url(figma_url: str) -> Optional[str]:
    """
    Extract team ID from a Figma team URL.
    
    Args:
        figma_url: A Figma team URL
        
    Returns:
        The team ID if found, None otherwise
        
    Examples:
        >>> extract_team_id_from_url("https://www.figma.com/team/123456")
        "123456"
    """
    pattern = r"figma\.com/team/([a-zA-Z0-9]+)"
    match = re.search(pattern, figma_url)
    return match.group(1) if match else None


def validate_api_key(api_key: str) -> bool:
    """
    Validate a Figma API key format.
    
    Args:
        api_key: The API key to validate
        
    Returns:
        True if the API key appears valid, False otherwise
    """
    if not api_key or not isinstance(api_key, str):
        return False
    
    # Figma API keys are typically 40+ characters and contain hyphens
    return len(api_key) >= 40 and "-" in api_key


def build_query_params(**kwargs: Any) -> Dict[str, Any]:
    """
    Build query parameters, filtering out None values.
    
    Args:
        **kwargs: Key-value pairs for query parameters
        
    Returns:
        Dictionary with non-None values
    """
    return {k: v for k, v in kwargs.items() if v is not None}


def parse_cursor_from_response(response_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parse cursor information from API response.
    
    Args:
        response_data: The API response data
        
    Returns:
        Cursor information if present, None otherwise
    """
    meta = response_data.get("meta", {})
    cursor = meta.get("cursor")
    return cursor if cursor else None


def format_component_key(key: str) -> str:
    """
    Format a component key for consistent display.
    
    Args:
        key: The component key
        
    Returns:
        Formatted key
    """
    return key.strip()


def sanitize_search_query(query: str) -> str:
    """
    Sanitize a search query string.
    
    Args:
        query: The search query
        
    Returns:
        Sanitized query string
    """
    # Remove special characters and normalize whitespace
    sanitized = re.sub(r'[^\w\s-]', '', query)
    return ' '.join(sanitized.split())


def format_pagination_info(cursor: Optional[Dict[str, Any]], total_items: int) -> str:
    """
    Format pagination information for display.
    
    Args:
        cursor: Cursor information
        total_items: Total number of items in current page
        
    Returns:
        Formatted pagination info string
    """
    if not cursor:
        return f"Showing {total_items} items"
    
    has_more = cursor.get("after") is not None
    return f"Showing {total_items} items{' (more available)' if has_more else ''}"


def convert_snake_to_camel(snake_str: str) -> str:
    """
    Convert snake_case to camelCase.
    
    Args:
        snake_str: String in snake_case
        
    Returns:
        String in camelCase
    """
    components = snake_str.split('_')
    return components[0] + ''.join(x.capitalize() for x in components[1:])


def convert_camel_to_snake(camel_str: str) -> str:
    """
    Convert camelCase to snake_case.
    
    Args:
        camel_str: String in camelCase
        
    Returns:
        String in snake_case
    """
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', camel_str)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


# --- SSL verification (msh-api-figma/v100/docs/ssl-verify-contract.md) ---

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
