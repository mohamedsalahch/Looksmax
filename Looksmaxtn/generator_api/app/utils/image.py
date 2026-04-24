"""Image utilities for handling base64 encoding/decoding."""

import base64
import io
import logging

from PIL import Image, ImageOps, UnidentifiedImageError
from google.genai import types

logger = logging.getLogger(__name__)

MAX_DIMENSION = 1600
JPEG_QUALITY = 82
WEBP_QUALITY = 82

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


def _compress_image(data: bytes, original_mime: str) -> tuple[bytes, str]:
    """Resize and recompress an image while preserving quality."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)

            if max(image.size) > MAX_DIMENSION:
                image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

            has_alpha = "A" in image.getbands() or (
                image.mode == "P" and "transparency" in image.info
            )

            output = io.BytesIO()
            if has_alpha:
                image.save(output, format="WEBP", quality=WEBP_QUALITY, method=6)
                compressed = output.getvalue()
                compressed_mime = "image/webp"
            else:
                if image.mode not in {"RGB", "L"}:
                    image = image.convert("RGB")
                image.save(
                    output,
                    format="JPEG",
                    quality=JPEG_QUALITY,
                    optimize=True,
                    progressive=True,
                    subsampling=2,
                )
                compressed = output.getvalue()
                compressed_mime = "image/jpeg"

            if len(compressed) >= len(data):
                return data, original_mime

            logger.info(
                "compress_image: %s -> %s bytes (%s -> %s)",
                len(data),
                len(compressed),
                original_mime,
                compressed_mime,
            )
            return compressed, compressed_mime
    except UnidentifiedImageError:
        logger.warning("compress_image: unsupported image data, skipping compression")
    except Exception as exc:
        logger.warning("compress_image: failed to compress image: %s", exc)

    return data, original_mime


def b64_to_part(b64_string: str) -> types.Part:
    """Convert base64 string to Gemini Part."""
    if not b64_string or not b64_string.strip():
        raise ValueError("Empty base64 string provided — image data is missing")

    raw_b64 = _strip_data_url(b64_string.strip())
    data = base64.b64decode(raw_b64)

    if len(data) == 0:
        raise ValueError("Base64 decoded to 0 bytes — image data is missing")

    actual_mime = _detect_mime(data)
    compressed_data, compressed_mime = _compress_image(data, actual_mime if actual_mime != "unknown" else "image/png")
    size_kb = len(data) / 1024

    logger.info(
        f"b64_to_part: decoded {len(b64_string)} b64 chars -> "
        f"{size_kb:.1f} KB, detected mime={actual_mime}, sent mime={compressed_mime}"
    )

    if actual_mime == "unknown":
        logger.warning(
            f"b64_to_part: unrecognized image format (first 16 bytes: {data[:16].hex()})"
        )

    return types.Part.from_bytes(
        data=compressed_data,
        mime_type=compressed_mime
    )
