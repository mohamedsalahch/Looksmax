"""Image utilities for handling base64 encoding/decoding."""

import base64
from google.genai import types


def b64_to_part(b64_string: str) -> types.Part:
    """Convert base64 string to Gemini Part."""
    return types.Part.from_bytes(
        data=base64.b64decode(b64_string),
        mime_type="image/png"
    )