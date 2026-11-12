"""
Image storage on Cloudinary.

Question / option / diagram images arrive from the editor and the PDF importer as
base64 data URLs. Storing those in Postgres makes every quiz payload huge, so when
Cloudinary is configured they are uploaded and replaced by a CDN URL
(auto-format, auto-quality). Without configuration — or if an upload fails —
the data URL is kept, so saving a quiz never fails because of image storage.

Solution PDFs are NOT uploaded: they must stay behind the "finished the test"
check of GET /quizzes/{id}/solution-pdf.

Uses Cloudinary's signed upload REST API directly (no SDK dependency).
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Optional
from urllib.parse import urlparse

import httpx

from database.config import settings

_CONCURRENCY = 6


def _credentials() -> Optional[tuple[str, str, str]]:
    """(cloud_name, api_key, api_secret) or None when not configured."""
    if settings.cloudinary_url:
        u = urlparse(settings.cloudinary_url)
        if u.scheme == "cloudinary" and u.hostname and u.username and u.password:
            return u.hostname, u.username, u.password
    if settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret:
        return settings.cloudinary_cloud_name, settings.cloudinary_api_key, settings.cloudinary_api_secret
    return None


def is_enabled() -> bool:
    return _credentials() is not None


def sign(params: dict, api_secret: str) -> str:
    """Cloudinary signature: SHA-1 of alphabetically sorted `k=v` pairs joined by `&`, plus the secret."""
    to_sign = "&".join(f"{k}={params[k]}" for k in sorted(params) if params[k] not in (None, ""))
    return hashlib.sha1((to_sign + api_secret).encode("utf-8")).hexdigest()


def _optimised(url: str) -> str:
    # serve WebP/AVIF where supported and an automatic quality level
    return url.replace("/image/upload/", "/image/upload/f_auto,q_auto/", 1) if "/image/upload/" in url else url


async def upload_data_url(data_url: str, folder: Optional[str] = None, client: Optional[httpx.AsyncClient] = None) -> str:
    creds = _credentials()
    if not creds:
        raise RuntimeError("Cloudinary is not configured")
    cloud, key, secret = creds
    params = {"folder": folder or settings.cloudinary_folder, "timestamp": int(time.time())}
    payload = {**params, "api_key": key, "signature": sign(params, secret)}
    url = f"https://api.cloudinary.com/v1_1/{cloud}/image/upload"
    own = client is None
    client = client or httpx.AsyncClient(timeout=60)
    try:
        r = await client.post(url, data=payload, files={"file": (None, data_url)})
        r.raise_for_status()
        return _optimised(r.json()["secure_url"])
    finally:
        if own:
            await client.aclose()


def is_data_image(v) -> bool:
    return isinstance(v, str) and v.startswith("data:image/")


async def externalize_question_images(questions: list, folder: Optional[str] = None) -> int:
    """
    Replace data-URL images on question payloads (pydantic models or ORM objects)
    with Cloudinary URLs, in place. Returns how many images were uploaded.
    """
    if not is_enabled():
        return 0
    targets = []  # (obj, attr)
    for q in questions:
        for attr in ("question_image", "diagram", "explanation_image"):
            if is_data_image(getattr(q, attr, None)):
                targets.append((q, attr))
        for o in getattr(q, "options", None) or []:
            if is_data_image(getattr(o, "image", None)):
                targets.append((o, "image"))
    if not targets:
        return 0
    sem = asyncio.Semaphore(_CONCURRENCY)
    uploaded = 0
    async with httpx.AsyncClient(timeout=60) as client:
        async def one(obj, attr):
            nonlocal uploaded
            async with sem:
                try:
                    setattr(obj, attr, await upload_data_url(getattr(obj, attr), folder, client))
                    uploaded += 1
                except Exception as e:  # keep the data URL — never fail the save
                    print(f"[media] Cloudinary upload failed, keeping inline image: {e}")
        await asyncio.gather(*(one(o, a) for o, a in targets))
    return uploaded
