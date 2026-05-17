"""Training-data capture client.

Posts a sample (prompt + inputs + outputs + metadata) to the Next.js backend's
internal ingest endpoint, which writes blobs to the R2 training bucket and
metadata to Mongo. Designed to be fire-and-forget: failures here must never
break a generation request.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=5.0)


def _enabled() -> bool:
    return os.getenv("DATASET_CAPTURE_ENABLED", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "",
    )


def _endpoint() -> str | None:
    base = os.getenv("BACK_INTERNAL_URL", "").strip().rstrip("/")
    if not base:
        return None
    return f"{base}/api/internal/dataset"


def _token() -> str | None:
    token = os.getenv("INTERNAL_DATASET_TOKEN", "").strip()
    return token or None


def _image(base64_data: str | None, mime: str = "image/png") -> dict[str, str] | None:
    if not base64_data:
        return None
    return {"base64": base64_data, "mime": mime}


async def _post(payload: dict[str, Any]) -> None:
    url = _endpoint()
    token = _token()
    if not url or not token:
        logger.warning("dataset: BACK_INTERNAL_URL or INTERNAL_DATASET_TOKEN not set; skipping")
        return
    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            r = await client.post(
                url,
                json=payload,
                headers={"x-internal-token": token},
            )
            if r.status_code >= 300:
                logger.warning(
                    "dataset: ingest returned %s: %s",
                    r.status_code,
                    r.text[:300],
                )
    except Exception as e:
        logger.warning("dataset: ingest failed: %s", e)


def record(
    *,
    flow: str,
    model: str,
    prompt_version: str,
    prompt_text: str,
    inputs: dict[str, str | None],
    outputs: dict[str, str | None],
    job_id: str | None = None,
    user_id: str | None = None,
    model_params: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    latency_ms: int | None = None,
    input_mime: str = "image/png",
    output_mime: str = "image/png",
) -> None:
    """Schedule a fire-and-forget dataset upload.

    `inputs` / `outputs` map role -> base64 string (or None to skip).
    """
    if not _enabled():
        return

    payload: dict[str, Any] = {
        "flow": flow,
        "model": model,
        "prompt_version": prompt_version,
        "prompt_text": prompt_text,
        "inputs": {
            role: img
            for role, b64 in inputs.items()
            if (img := _image(b64, input_mime)) is not None
        },
        "outputs": {
            role: img
            for role, b64 in outputs.items()
            if (img := _image(b64, output_mime)) is not None
        },
    }
    if job_id:
        payload["job_id"] = job_id
    if user_id:
        payload["user_id"] = user_id
    if model_params is not None:
        payload["model_params"] = model_params
    if extra is not None:
        payload["extra"] = extra
    if latency_ms is not None:
        payload["latency_ms"] = latency_ms

    try:
        asyncio.create_task(_post(payload))
    except RuntimeError:
        # No running event loop (rare in FastAPI context); skip silently.
        logger.debug("dataset: no event loop, skipping record")
