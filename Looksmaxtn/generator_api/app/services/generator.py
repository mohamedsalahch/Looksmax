"""Image generation service using Google Gemini AI."""

import base64
import logging
from typing import Any

from fastapi import HTTPException
from google import genai
from google.genai import types

from app.models.requests import BodyZones
from app.prompts.templates import (
    CLOTHES_PROMPT_TEMPLATE,
    SHOES_PROMPT_TEMPLATE,
    FRONT_VIEW_PROMPT_TEMPLATE,
    BACK_VIEW_PROMPT_TEMPLATE,
)
from app.utils.image import b64_to_part

logger = logging.getLogger(__name__)


class ImageGenerator:
    """Service for generating images using Google Gemini AI."""

    def __init__(self, api_key: str):
        """Initialize the image generator.

        Args:
            api_key: Google API key for Gemini
        """
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-3.1-flash-image-preview"
        self.default_config: dict[str, Any] = {}

    async def generate_clothes_view(
        self,
        view_name: str,
        model_front: str,
        model_back: str,
        product_front: str,
        product_back: str
    ) -> str:
        """Generate a single clothes view and return base64 image.

        Args:
            view_name: The view to generate ("front" or "back")
            model_front: Base64 encoded front view of model
            model_back: Base64 encoded back view of model
            product_front: Base64 encoded front view of product
            product_back: Base64 encoded back view of product

        Returns:
            Base64 encoded generated image
        """
        prompt = CLOTHES_PROMPT_TEMPLATE.replace("{VIEW}", view_name.upper())

        parts = [
            types.Part(text=prompt),
            b64_to_part(model_front),
            b64_to_part(model_back),
            b64_to_part(product_front),
            b64_to_part(product_back),
        ]

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=[types.Content(parts=parts)],
            config=self.default_config
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail=f"Failed to generate {view_name} view")

    async def generate_shoes_view(self, view_name: str, product_images: dict[str, str]) -> str:
        """Generate a single shoe view and return base64 image.

        Args:
            view_name: The view to generate
            product_images: Dictionary of product images by view

        Returns:
            Base64 encoded generated image
        """
        prompt = SHOES_PROMPT_TEMPLATE

        parts = [
            types.Part(text=prompt),
            *[b64_to_part(img) for img in product_images.values()],
        ]

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=[types.Content(parts=parts)],
            config=self.default_config
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail=f"Failed to generate {view_name} view")

    async def generate_front_view(
        self,
        person_image: str,
        body_zones: BodyZones,
        height: str,
        weight: str,
        size: str
    ) -> str:
        """Generate front view of person wearing outfit.

        Args:
            person_image: Base64 encoded image of the person
            body_zones: Body zones configuration
            height: Person's height in cm
            weight: Person's weight in kg
            size: Clothing size

        Returns:
            Base64 encoded generated image
        """
        prompt = FRONT_VIEW_PROMPT_TEMPLATE.format(
            height=height,
            weight=weight,
            size=size,
            headwear_status="true" if body_zones.headwear.status else "false",
            outerwear_status="true" if body_zones.outerwear.status else "false",
            top_status="true" if body_zones.top.status else "false",
            bottom_status="true" if body_zones.bottom.status else "false",
            footwear_status="true" if body_zones.footwear.status else "false",
        )

        front_images = _get_active_images(body_zones, "front")

        parts = [
            types.Part(text=prompt),
            b64_to_part(person_image),
            *[b64_to_part(img) for img in front_images],
        ]

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=[types.Content(parts=parts)]
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail="Failed to generate front view")

    async def generate_back_view(self, front_image: str, body_zones: BodyZones) -> str:
        """Generate back view using front image as reference.

        Args:
            front_image: Base64 encoded front view image
            body_zones: Body zones configuration

        Returns:
            Base64 encoded generated image
        """
        back_images = _get_active_images(body_zones, "back")

        parts = [
            types.Part(text=BACK_VIEW_PROMPT_TEMPLATE),
            b64_to_part(front_image),
            *[b64_to_part(img) for img in back_images],
        ]

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=[types.Content(parts=parts)]
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail="Failed to generate back view")

    async def generate_from_prompt(self, prompt: str, images: list[str]) -> str:
        """Generate image from prompt and input images.

        Args:
            prompt: Text prompt for generation
            images: List of base64 encoded input images

        Returns:
            Base64 encoded generated image
        """
        parts = [types.Part(text=prompt)]
        parts.extend(b64_to_part(img) for img in images)

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=[types.Content(parts=parts)],
            config=self.default_config
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail="No image returned from Gemini")


def _get_active_images(body_zones: BodyZones, view: str) -> list[str]:
    """Extract images from zones where status=True for the given view.

    Args:
        body_zones: Body zones configuration
        view: The view to extract images for ("front" or "back")

    Returns:
        List of base64 encoded images
    """
    images = []

    zones_map = {
        "headwear": body_zones.headwear,
        "outerwear": body_zones.outerwear,
        "top": body_zones.top,
        "bottom": body_zones.bottom,
        "footwear": body_zones.footwear,
    }

    for zone_name, zone in zones_map.items():
        if zone.status:
            image = getattr(zone, view, "")
            if image:
                images.append(image)

    return images
