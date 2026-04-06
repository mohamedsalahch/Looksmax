"""API endpoints for shoes image generation."""

import logging

from fastapi import APIRouter, HTTPException

from app.models.requests import ShoesRequest
from app.models.responses import GenerationResponse, ImageResult
from app.services.generator import ImageGenerator

router = APIRouter(prefix="/api", tags=["shoes"])
logger = logging.getLogger(__name__)


# Global instance set by main app
_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


@router.post("/generate-shoes", response_model=GenerationResponse)
async def generate_shoes_images(request: ShoesRequest):
    """
    Generate product photography images of shoes from multiple angles.

    **Request:**
    - product_pictures: { front, back, left, right } - base64 encoded shoe images

    **Returns:**
    - 4 images: front, back, left, right views
    """
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    try:
        product_images = request.product_pictures.model_dump()

        front_b64 = await _generator.generate_shoes_view("front", product_images)
        back_b64 = await _generator.generate_shoes_view("back", product_images)
        left_b64 = await _generator.generate_shoes_view("left", product_images)
        right_b64 = await _generator.generate_shoes_view("right", product_images)

        return GenerationResponse(images=[
            ImageResult(base64=front_b64),
            ImageResult(base64=back_b64),
            ImageResult(base64=left_b64),
            ImageResult(base64=right_b64)
        ])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
