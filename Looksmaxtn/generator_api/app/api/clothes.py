import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks

from app.models.requests import ClothesRequest
from app.models.responses import GenerationResponse, ImageResult, OutfitResponse
from app.services.generator import ImageGenerator
from app.services.webhook import send_webhook, send_error_webhook

router = APIRouter(prefix="/api", tags=["clothes"])
logger = logging.getLogger(__name__)


# Global instance set by main app
_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator | None) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


async def process_clothes_generation(job_id: str, webhook_url: str, request: ClothesRequest):
    """Background task to generate clothes images and send webhooks."""
    if _generator is None:
        return

    try:
        # Front view
        front_b64 = await _generator.generate_clothes_view(
            "front",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            request.garment_zone,
            request.secondary_colors,
        )
        await send_webhook(webhook_url, job_id, "front", front_b64)

        # Back view
        back_b64 = await _generator.generate_clothes_view(
            "back",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            request.garment_zone,
            request.secondary_colors,
        )
        await send_webhook(webhook_url, job_id, "back", back_b64)

    except Exception as e:
        logger.error(f"Job {job_id}: Clothes error: {str(e)}")
        await send_error_webhook(webhook_url, job_id, f"Clothes generation failed: {str(e)}")


@router.post("/generate")
async def generate_clothes_images(request: ClothesRequest, background_tasks: BackgroundTasks):
    """
    Generate fashion images of a model wearing a clothing item.
    """
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    # ASYNC MODE
    if request.job_id and request.webhook_url:
        background_tasks.add_task(
            process_clothes_generation,
            job_id=request.job_id,
            webhook_url=request.webhook_url,
            request=request
        )
        return OutfitResponse(job_id=request.job_id, status="processing")

    # SYNC MODE
    try:
        front_b64 = await _generator.generate_clothes_view(
            "front",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            request.garment_zone,
            request.secondary_colors,
        )

        back_b64 = await _generator.generate_clothes_view(
            "back",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            request.garment_zone,
            request.secondary_colors,
        )

        return GenerationResponse(images=[
            ImageResult(base64=front_b64),
            ImageResult(base64=back_b64)
        ])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
