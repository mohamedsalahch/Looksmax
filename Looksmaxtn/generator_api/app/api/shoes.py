import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks

from app.models.requests import ShoesRequest
from app.models.responses import GenerationResponse, ImageResult, OutfitResponse
from app.services.generator import ImageGenerator
from app.services.webhook import send_webhook

router = APIRouter(prefix="/api", tags=["shoes"])
logger = logging.getLogger(__name__)


# Global instance set by main app
_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


async def process_shoes_generation(job_id: str, webhook_url: str, request: ShoesRequest):
    """Background task to generate shoe images and send webhooks."""
    if _generator is None:
        return

    try:
        product_images = request.product_pictures.model_dump()
        views = ["front", "back", "left", "right"]
        
        for view in views:
            image_b64 = await _generator.generate_shoes_view(view, product_images)
            await send_webhook(webhook_url, job_id, view, image_b64)

    except Exception as e:
        logger.error(f"Job {job_id}: Shoes error: {str(e)}")


@router.post("/generate-shoes")
async def generate_shoes_images(request: ShoesRequest, background_tasks: BackgroundTasks):
    """
    Generate product photography images of shoes from multiple angles.
    """
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    # ASYNC MODE
    if request.job_id and request.webhook_url:
        background_tasks.add_task(
            process_shoes_generation,
            job_id=request.job_id,
            webhook_url=request.webhook_url,
            request=request
        )
        return OutfitResponse(job_id=request.job_id, status="processing")

    # SYNC MODE
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
