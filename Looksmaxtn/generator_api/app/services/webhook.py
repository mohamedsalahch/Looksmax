"""Webhook service for sending notifications."""

import logging
from typing import Any

import httpx

from app.models.responses import WebhookPayload

import os

logger = logging.getLogger(__name__)

async def send_webhook(webhook_url: str, job_id: str, view: str, image: str) -> None:
    """Send webhook update with generated image.

    Args:
        webhook_url: The URL to send the webhook to
        job_id: The job identifier
        view: The view being sent ("front" or "back")
        image: Base64 encoded image
    """
    secret = os.getenv("OUTFIT_WEBHOOK_SECRET", "")
    headers = {}
    if secret:
        headers["x-webhook-secret"] = secret
    else:
        logger.warning("OUTFIT_WEBHOOK_SECRET is empty; sending unauthenticated webhook for job %s", job_id)

    payload = WebhookPayload(
        job_id=job_id,
        view=view,
        image=image
    )

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                webhook_url,
                json=payload.model_dump(),
                headers=headers,
                timeout=30.0
            )
            response.raise_for_status()
            logger.info(f"Webhook sent successfully for job {job_id}, view: {view}")
        except Exception as e:
            logger.error(f"Failed to send webhook for job {job_id}: {str(e)}")


async def send_error_webhook(webhook_url: str, job_id: str, error_message: str) -> None:
    """Send error notification via webhook so the backend can mark the job as failed."""
    secret = os.getenv("OUTFIT_WEBHOOK_SECRET", "")
    headers = {}
    if secret:
        headers["x-webhook-secret"] = secret
    else:
        logger.warning("OUTFIT_WEBHOOK_SECRET is empty; sending unauthenticated error webhook for job %s", job_id)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                webhook_url,
                json={"job_id": job_id, "error": error_message},
                headers=headers,
                timeout=30.0,
            )
            response.raise_for_status()
            logger.info(f"Error webhook sent for job {job_id}")
        except Exception as e:
            logger.error(f"Failed to send error webhook for job {job_id}: {str(e)}")
