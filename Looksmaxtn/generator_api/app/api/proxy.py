"""API endpoint for proxying to Gemini API."""

import logging

from fastapi import APIRouter, HTTPException

from app.models.requests import ProxyRequest
from app.models.responses import ProxyResponse
from app.services.generator import ImageGenerator

router = APIRouter(prefix="/api", tags=["proxy"])
logger = logging.getLogger(__name__)


# Global instance set by main app
_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


@router.post("/proxy", response_model=ProxyResponse)
async def proxy_to_gemini(request: ProxyRequest):
    """
    Proxy endpoint to Google Gemini API.

    **Request:**
    - prompt: Text prompt for generation
    - images: List of base64 encoded input images

    **Returns:**
    - Single generated image as base64
    """
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    try:
        logger.info("=== PROXY REQUEST START ===")
        logger.info(f"Prompt length: {len(request.prompt)} chars")
        logger.info(f"Number of images: {len(request.images)}")

        image = await _generator.generate_from_prompt(request.prompt, request.images)

        logger.info(f"Image extracted, size: {len(image)} chars")
        return ProxyResponse(image=image)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"=== PROXY ERROR ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        import traceback
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
