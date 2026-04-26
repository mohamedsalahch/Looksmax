"""Image utilities for handling base64 encoding/decoding."""

import base64
import logging

from google.genai import types

logger = logging.getLogger(__name__)

# Magic bytes for common image formats
_IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
    b"GIF8": "image/gif",
    b"RIFF": "image/webp",  # RIFF...WEBP
    b"BM": "image/bmp",
}


def _detect_mime(data: bytes) -> str:
    """Detect image MIME type from magic bytes."""
    for sig, mime in _IMAGE_SIGNATURES.items():
        if data[:len(sig)] == sig:
            return mime
    return "unknown"


def _strip_data_url(b64_string: str) -> str:
    if b64_string.startswith("data:") and "," in b64_string:
        return b64_string.split(",", 1)[1]
    return b64_string


def b64_to_part(b64_string: str) -> types.Part:
    """Convert base64 string to Gemini Part. Bytes are forwarded as-is — callers compress upstream."""
    if not b64_string or not b64_string.strip():
        raise ValueError("Empty base64 string provided — image data is missing")

    raw_b64 = _strip_data_url(b64_string.strip())
    data = base64.b64decode(raw_b64)

    if len(data) == 0:
        raise ValueError("Base64 decoded to 0 bytes — image data is missing")

    detected_mime = _detect_mime(data)
    mime_type = detected_mime if detected_mime != "unknown" else "image/png"
    size_kb = len(data) / 1024

    logger.info(
        f"b64_to_part: decoded {len(b64_string)} b64 chars -> "
        f"{size_kb:.1f} KB, mime={mime_type}"
    )

    if detected_mime == "unknown":
        logger.warning(
            f"b64_to_part: unrecognized image format (first 16 bytes: {data[:16].hex()})"
        )

    return types.Part.from_bytes(data=data, mime_type=mime_type)
