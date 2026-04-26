"""Image generation service using Google Gemini AI."""

import base64
import logging
from typing import Any

from fastapi import HTTPException
from google import genai
from google.genai import types

from app.models.requests import BodyZones, SecondaryColors
from app.prompts.templates import (
    CLOTHES_TOP_PROMPT_TEMPLATE,
    CLOTHES_BOTTOM_PROMPT_TEMPLATE,
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
        product_back: str,
        garment_zone: str = "top",
        secondary_colors: SecondaryColors | None = None,
    ) -> str:
        """Generate a single clothes view and return base64 image.

        Args:
            view_name: The view to generate ("front" or "back")
            model_front: Base64 encoded front view of model
            model_back: Base64 encoded back view of model
            product_front: Base64 encoded front view of product
            product_back: Base64 encoded back view of product
            garment_zone: The garment zone ("top" or "bottom")

        Returns:
            Base64 encoded generated image
        """
        template = CLOTHES_TOP_PROMPT_TEMPLATE if garment_zone == "top" else CLOTHES_BOTTOM_PROMPT_TEMPLATE

        if secondary_colors is not None:
            secondary_name = secondary_colors.garment.name
            secondary_hex = secondary_colors.garment.hex
            shoes_name = secondary_colors.shoes.name
            shoes_hex = secondary_colors.shoes.hex
        else:
            # Backward-compatible defaults: previous hardcoded values
            secondary_name = "Black" if garment_zone == "top" else "White"
            secondary_hex = "#000000" if garment_zone == "top" else "#FFFFFF"
            shoes_name = "White"
            shoes_hex = "#FFFFFF"

        prompt = (
            template
            .replace("{VIEW}", view_name.upper())
            .replace("{SECONDARY_COLOR_NAME}", secondary_name)
            .replace("{SECONDARY_COLOR_HEX}", secondary_hex)
            .replace("{SHOES_COLOR_NAME}", shoes_name)
            .replace("{SHOES_COLOR_HEX}", shoes_hex)
        )

        logger.info(
            f"generate_clothes_view({view_name}): input sizes - "
            f"model_front={len(model_front or '')}, model_back={len(model_back or '')}, "
            f"product_front={len(product_front or '')}, product_back={len(product_back or '')}"
        )

        if not all([model_front, model_back, product_front, product_back]):
            raise HTTPException(status_code=400, detail=f"Missing input images for {view_name} view")

        parts = [
            types.Part(text=prompt),
            b64_to_part(model_front),
            b64_to_part(model_back),
            b64_to_part(product_front),
            b64_to_part(product_back),
        ]

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(parts=parts)],
                config=self.default_config
            )
        except Exception as e:
            logger.error(f"generate_clothes_view({view_name}): Gemini API error: {e}")
            raise

        if not response.candidates:
            logger.error(f"generate_clothes_view({view_name}): No candidates returned")
            raise HTTPException(status_code=500, detail=f"No response from Gemini for {view_name} view")

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

        logger.info(
            f"generate_shoes_view({view_name}): input count={len(product_images)}, "
            f"sizes={[(k, len(v or '')) for k, v in product_images.items()]}"
        )

        parts = [
            types.Part(text=prompt),
            *[b64_to_part(img) for img in product_images.values()],
        ]

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(parts=parts)],
                config=self.default_config
            )
        except Exception as e:
            logger.error(f"generate_shoes_view({view_name}): Gemini API error: {e}")
            raise

        if not response.candidates:
            logger.error(f"generate_shoes_view({view_name}): No candidates returned")
            raise HTTPException(status_code=500, detail=f"No response from Gemini for {view_name} view")

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
        top_size: str,
        bottom_size: str,
        shoe_size: str
    ) -> str:
        """Generate front view of person wearing outfit.

        Args:
            person_image: Base64 encoded image of the person
            body_zones: Body zones configuration
            height: Person's height in cm
            weight: Person's weight in kg
            top_size: Top clothing size
            bottom_size: Bottom clothing size
            shoe_size: Shoe size

        Returns:
            Base64 encoded generated image
        """
        prompt = FRONT_VIEW_PROMPT_TEMPLATE.format(
            height=height,
            weight=weight,
            top_size=top_size,
            bottom_size=bottom_size,
            shoe_size=shoe_size,
            headwear_status="true" if body_zones.headwear.status else "false",
            outerwear_status="true" if body_zones.outerwear.status else "false",
            top_status="true" if body_zones.top.status else "false",
            bottom_status="true" if body_zones.bottom.status else "false",
            footwear_status="true" if body_zones.footwear.status else "false",
            headwear_piece_size=body_zones.headwear.size or "N/A",
            outerwear_piece_size=body_zones.outerwear.size or "N/A",
            top_piece_size=body_zones.top.size or "N/A",
            bottom_piece_size=body_zones.bottom.size or "N/A",
            footwear_piece_size=body_zones.footwear.size or "N/A",
        )

        front_images = _get_active_images(body_zones, "front")

        logger.info(
            f"generate_front_view: person_image={len(person_image)} chars, "
            f"front_images count={len(front_images)}, "
            f"sizes={[len(img) for img in front_images]}"
        )

        parts = [
            types.Part(text=prompt),
            b64_to_part(person_image),
            *[b64_to_part(img) for img in front_images],
        ]

        logger.info(f"generate_front_view: sending {len(parts)} parts to Gemini (1 prompt + {len(parts)-1} images)")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(parts=parts)]
            )
        except Exception as e:
            logger.error(f"generate_front_view: Gemini API exception: {type(e).__name__}: {e}")
            raise

        logger.info(
            f"generate_front_view: response received, candidates={len(response.candidates) if response.candidates else 0}"
        )

        if not response.candidates:
            logger.error(f"generate_front_view: no candidates in response")
            raise HTTPException(status_code=500, detail="Failed to generate front view - no candidates")

        for i, part in enumerate(response.candidates[0].content.parts):
            logger.info(f"generate_front_view: response part {i}: has_inline_data={part.inline_data is not None}")
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                logger.info(f"generate_front_view: got image {len(image_bytes)} bytes")
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail="Failed to generate front view - no image in response")

    async def generate_back_view(self, front_image: str, body_zones: BodyZones) -> str:
        """Generate back view using front image as reference.

        Args:
            front_image: Base64 encoded front view image
            body_zones: Body zones configuration

        Returns:
            Base64 encoded generated image
        """
        back_images = _get_active_images(body_zones, "back")

        logger.info(
            f"generate_back_view: front_image={len(front_image)} chars, "
            f"back_images count={len(back_images)}, "
            f"sizes={[len(img) for img in back_images]}"
        )

        parts = [
            types.Part(text=BACK_VIEW_PROMPT_TEMPLATE),
            b64_to_part(front_image),
            *[b64_to_part(img) for img in back_images],
        ]

        logger.info(f"generate_back_view: sending {len(parts)} parts to Gemini (1 prompt + {len(parts)-1} images)")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(parts=parts)]
            )
        except Exception as e:
            logger.error(f"generate_back_view: Gemini API exception: {type(e).__name__}: {e}")
            raise

        logger.info(
            f"generate_back_view: response received, candidates={len(response.candidates) if response.candidates else 0}"
        )

        if not response.candidates:
            logger.error(f"generate_back_view: no candidates in response")
            raise HTTPException(status_code=500, detail="Failed to generate back view - no candidates")

        for i, part in enumerate(response.candidates[0].content.parts):
            logger.info(f"generate_back_view: response part {i}: has_inline_data={part.inline_data is not None}")
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                logger.info(f"generate_back_view: got image {len(image_bytes)} bytes")
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail="Failed to generate back view - no image in response")

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
