"""
Authentication and authorization utilities for Super Wings Simulator API.

Implements simple API key authentication suitable for single-player games.
For multi-user scenarios, consider upgrading to JWT tokens.
"""

import secrets
from typing import Optional

from fastapi import Header, HTTPException, status
from fastapi.security import APIKeyHeader

from ..config import get_settings


# API Key security scheme (optional, for documentation)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(x_api_key: Optional[str] = Header(None)) -> bool:
    """
    Verify API key from request header.

    Args:
        x_api_key: API key from X-API-Key header

    Returns:
        True if authentication successful

    Raises:
        HTTPException: If authentication fails
    """
    settings = get_settings()

    # In development mode, allow requests without API key
    if settings.api.dev_mode:
        return True

    # Check if API key is provided
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Provide X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Verify API key
    if not settings.api.api_key:
        # API key not configured, allow all requests (backward compatibility)
        return True

    # Use secrets.compare_digest to prevent timing attacks
    if not secrets.compare_digest(x_api_key, settings.api.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    return True


async def verify_api_key_optional(x_api_key: Optional[str] = Header(None)) -> bool:
    """
    Optional API key verification (doesn't raise exceptions).

    Useful for endpoints that should work with or without authentication
    but may provide extra features for authenticated users.

    Args:
        x_api_key: API key from X-API-Key header

    Returns:
        True if authenticated, False otherwise
    """
    settings = get_settings()

    if settings.api.dev_mode:
        return True

    if not x_api_key or not settings.api.api_key:
        return False

    return secrets.compare_digest(x_api_key, settings.api.api_key)


def generate_api_key() -> str:
    """
    Generate a secure random API key.

    Returns:
        A 32-character hexadecimal API key
    """
    return secrets.token_hex(32)


# Usage example in router:
# from fastapi import Depends
# from backend.api.auth import verify_api_key
#
# @router.post("/protected-endpoint")
# async def protected_endpoint(authenticated: bool = Depends(verify_api_key)):
#     # This endpoint requires valid API key
#     return {"message": "Access granted"}
