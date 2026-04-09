"""API endpoints for outfit generation with background tasks."""

import logging

from fastapi import APIRouter, BackgroundTasks

from app.models.requests import OutfitRequest
from app.models.responses import OutfitResponse
from app.services.generator import ImageGenerator
from app.services.webhook import send_webhook

router = APIRouter(prefix="/api", tags=["outfit"])
logger = logging.getLogger(__name__)


# Global instance set by main app
_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator | None) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


async def process_outfit_generation(
    job_id: str,
    webhook_url: str,
    profile_picture: str,
    body_zones,
    height: str,
    weight: str,
    size: str
):
    """Background task to generate outfit and send webhooks."""
    logger.info(f"=== OUTFIT GENERATION START ===")
    logger.info(f"Job ID: {job_id}")
    logger.info(f"Webhook URL: {webhook_url}")
    logger.info(f"Height: {height}, Weight: {weight}, Size: {size}")

    # Count active zones
    active_zones = [name for name, zone in [
        ("headwear", body_zones.headwear),
        ("outerwear", body_zones.outerwear),
        ("top", body_zones.top),
        ("bottom", body_zones.bottom),
        ("footwear", body_zones.footwear)
    ] if zone.status]
    logger.info(f"Active zones: {active_zones}")

    if _generator is None:
        logger.error(f"Job {job_id}: Generator not initialized")
        return

    try:
        # Step 1: Generate front view
        logger.info(f"Job {job_id}: Starting front view generation...")
        front_b64 = await _generator.generate_front_view(
            person_image=profile_picture,
            body_zones=body_zones,
            height=height,
            weight=weight,
            size=size
        )
        logger.info(f"Job {job_id}: Front view generated successfully ({len(front_b64)} chars)")

        # Send webhook with front image
        logger.info(f"Job {job_id}: Sending webhook with front image...")
        await send_webhook(
            webhook_url=webhook_url,
            job_id=job_id,
            view="front",
            image=front_b64
        )

        # Step 2: Generate back view using front as reference
        logger.info(f"Job {job_id}: Starting back view generation...")
        back_b64 = await _generator.generate_back_view(
            front_image=front_b64,
            body_zones=body_zones
        )
        logger.info(f"Job {job_id}: Back view generated successfully ({len(back_b64)} chars)")

        # Send webhook with back image (complete)
        logger.info(f"Job {job_id}: Sending final webhook with back image...")
        await send_webhook(
            webhook_url=webhook_url,
            job_id=job_id,
            view="back",
            image=back_b64
        )
        logger.info(f"Job {job_id}: === OUTFIT GENERATION COMPLETE ===")

    except Exception as e:
        logger.error(f"Job {job_id}: Error during outfit generation: {str(e)}")


@router.post("/generate_outfit", response_model=OutfitResponse)
async def generate_outfit_image(request: OutfitRequest, background_tasks: BackgroundTasks):
    """
    Generate virtual try-on images of a person wearing a complete outfit.

    **Request:**
    - job_id: unique job identifier
    - webhook_url: URL to send results to
    - profile_picture: base64 encoded image of the person
    - height: person's height in cm
    - weight: person's weight in kg
    - size: clothing size
    - body_zones: object containing clothing items for each zone with status flags

    **Returns immediately:**
    - job_id: the job identifier
    - status: "processing"

    **Webhook updates:**
    1. First webhook (front ready): status="processing", front_image filled
    2. Second webhook (complete): status="completed", both images filled
    """
    logger.info(f"=== OUTFIT REQUEST RECEIVED ===")
    logger.info(f"Job ID: {request.job_id}")
    logger.info(f"Webhook: {request.webhook_url}")
    logger.info(f"Profile picture size: {len(request.profile_picture)} chars")

    background_tasks.add_task(
        process_outfit_generation,
        job_id=request.job_id,
        webhook_url=request.webhook_url,
        profile_picture=request.profile_picture,
        body_zones=request.body_zones,
        height=request.height,
        weight=request.weight,
        size=request.size
    )

    logger.info(f"Job {request.job_id}: Background task started, returning processing status")
    return OutfitResponse(job_id=request.job_id, status="processing")
