"""
Verify a "Sign in with Google" ID token (Google Identity Services).

The browser gets a signed JWT from Google; we check it ourselves against
Google's public keys (no client secret needed):
  • RS256 signature with a key from https://www.googleapis.com/oauth2/v3/certs
  • aud == our GOOGLE_CLIENT_ID, iss is accounts.google.com, not expired
  • email_verified is true
Keys are cached for an hour (Google rotates them rarely).
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

import httpx
from jose import jwt, JWTError

from database.config import settings

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
_CACHE_SECONDS = 3600
_jwks: Optional[Dict[str, Any]] = None
_jwks_at = 0.0


class GoogleTokenError(Exception):
    pass


def google_client_ids() -> list[str]:
    return [c.strip() for c in (settings.google_client_id or "").split(",") if c.strip()]


async def _google_keys(force: bool = False) -> Dict[str, Any]:
    global _jwks, _jwks_at
    if not force and _jwks and time.time() - _jwks_at < _CACHE_SECONDS:
        return _jwks
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GOOGLE_CERTS_URL)
    resp.raise_for_status()
    _jwks, _jwks_at = resp.json(), time.time()
    return _jwks


async def verify_google_id_token(credential: str) -> Dict[str, Any]:
    client_ids = google_client_ids()
    if not client_ids:
        raise GoogleTokenError("Google sign-in is not configured on the server (GOOGLE_CLIENT_ID).")
    try:
        kid = jwt.get_unverified_header(credential).get("kid")
    except JWTError:
        raise GoogleTokenError("Malformed Google token.")
    try:
        keys = await _google_keys()
        if kid and not any(k.get("kid") == kid for k in keys.get("keys", [])):
            keys = await _google_keys(force=True)          # Google rotated its keys
    except httpx.HTTPError:
        raise GoogleTokenError("Could not reach Google to check the sign-in. Try again.")

    last_error = None
    for aud in client_ids:
        try:
            claims = jwt.decode(
                credential, keys, algorithms=["RS256"], audience=aud,
                options={"verify_at_hash": False},
            )
            break
        except JWTError as exc:
            last_error = exc
    else:
        raise GoogleTokenError(f"Google sign-in could not be verified ({type(last_error).__name__}).")

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleTokenError("Token was not issued by Google.")
    if not claims.get("email") or claims.get("email_verified") not in (True, "true"):
        raise GoogleTokenError("Your Google account's email is not verified.")
    return claims
