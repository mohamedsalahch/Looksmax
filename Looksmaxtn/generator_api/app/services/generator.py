"""Image generation service using Google Gemini AI."""

import base64
import logging

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
    GARMENT_ENHANCE_PROMPT_TEMPLATE,
    ACCESSORY_ENHANCE_PROMPT_TEMPLATE,
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
        self.default_config = types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio="9:16"),
        )

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
        target = secondary_colors.target if secondary_colors is not None else garment_zone
        template = CLOTHES_BOTTOM_PROMPT_TEMPLATE if target == "bottom" else CLOTHES_TOP_PROMPT_TEMPLATE

        if secondary_colors is not None:
            top_color = secondary_colors.top or secondary_colors.garment
            bottom_color = secondary_colors.bottom or secondary_colors.garment
            shoes_color = secondary_colors.shoes
            secondary_color = bottom_color if target in ["top", "outerwear"] else top_color
            secondary_name = secondary_color.name if secondary_color is not None else ("Black" if garment_zone == "top" else "White")
            secondary_hex = secondary_color.hex if secondary_color is not None else ("#000000" if garment_zone == "top" else "#FFFFFF")
            top_type = secondary_colors.top_type or "t-shirt"
            bottom_type = secondary_colors.bottom_type or "pants"
            footwear_type = secondary_colors.footwear_type or "shoes"
            top_name = top_color.name if top_color is not None else "White"
            top_hex = top_color.hex if top_color is not None else "#FFFFFF"
            bottom_name = bottom_color.name if bottom_color is not None else "Black"
            bottom_hex = bottom_color.hex if bottom_color is not None else "#000000"
            shoes_name = shoes_color.name if shoes_color is not None else "White"
            shoes_hex = shoes_color.hex if shoes_color is not None else "#FFFFFF"
        else:
            # Backward-compatible defaults: previous hardcoded values
            secondary_name = "Black" if garment_zone == "top" else "White"
            secondary_hex = "#000000" if garment_zone == "top" else "#FFFFFF"
            top_type = "t-shirt"
            bottom_type = "pants"
            footwear_type = "shoes"
            top_name = "White"
            top_hex = "#FFFFFF"
            bottom_name = "Black"
            bottom_hex = "#000000"
            shoes_name = "White"
            shoes_hex = "#FFFFFF"

        companion_instructions = _build_companion_instructions(
            target=target,
            top_type=top_type,
            top_name=top_name,
            top_hex=top_hex,
            bottom_type=bottom_type,
            bottom_name=bottom_name,
            bottom_hex=bottom_hex,
        )

        prompt = (
            template
            .replace("{VIEW}", view_name.upper())
            .replace("{GENERATION_TARGET}", target.upper())
            .replace("{COMPANION_GARMENTS_SECTION}", companion_instructions)
            .replace("{TOP_TYPE}", top_type)
            .replace("{BOTTOM_TYPE}", bottom_type)
            .replace("{TOP_COLOR_NAME}", top_name)
            .replace("{TOP_COLOR_HEX}", top_hex)
            .replace("{BOTTOM_COLOR_NAME}", bottom_name)
            .replace("{BOTTOM_COLOR_HEX}", bottom_hex)
            .replace("{FOOTWEAR_TYPE}", footwear_type)
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
        view_order = ["front", "back", "left", "right"]
        normalized_view = view_name.lower()
        if normalized_view not in view_order:
            raise HTTPException(status_code=400, detail=f"Invalid shoe view: {view_name}")

        missing_views = [view for view in view_order if not product_images.get(view)]
        if missing_views:
            raise HTTPException(
                status_code=400,
                detail=f"Missing shoe reference images: {', '.join(missing_views)}",
            )

        prompt = SHOES_PROMPT_TEMPLATE.replace("{VIEW}", normalized_view.upper())

        logger.info(
            f"generate_shoes_view({view_name}): input count={len(product_images)}, "
            f"sizes={[(k, len(v or '')) for k, v in product_images.items()]}"
        )

        parts = [types.Part(text=prompt)]
        for reference_view in view_order:
            parts.append(types.Part(text=f"{reference_view.upper()} VIEW REFERENCE IMAGE:"))
            parts.append(b64_to_part(product_images[reference_view]))

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

    async def enhance_garment_view(self, view_name: str, image_b64: str) -> str:
        """Enhance a single garment image (mannequin removal, flat lay).

        Args:
            view_name: The view label ("front" or "back")
            image_b64: Base64 encoded source image for that view

        Returns:
            Base64 encoded enhanced image
        """
        if not image_b64:
            raise HTTPException(status_code=400, detail=f"Missing garment image for {view_name} view")

        parts = [
            types.Part(text=GARMENT_ENHANCE_PROMPT_TEMPLATE),
            b64_to_part(image_b64),
        ]

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(parts=parts)],
                config=self.default_config,
            )
        except Exception as e:
            logger.error(f"enhance_garment_view({view_name}): Gemini API error: {e}")
            raise

        if not response.candidates:
            raise HTTPException(status_code=500, detail=f"No response from Gemini for {view_name} view")

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                return base64.b64encode(part.inline_data.data).decode("utf-8")

        raise HTTPException(status_code=500, detail=f"Failed to enhance {view_name} garment view")

    async def enhance_accessory_view(self, view_name: str, image_b64: str) -> str:
        """Enhance a single accessory image (background cleanup).

        Args:
            view_name: The view label ("front", "back", "left", or "right")
            image_b64: Base64 encoded source image for that view

        Returns:
            Base64 encoded enhanced image
        """
        if not image_b64:
            raise HTTPException(status_code=400, detail=f"Missing accessory image for {view_name} view")

        parts = [
            types.Part(text=ACCESSORY_ENHANCE_PROMPT_TEMPLATE),
            b64_to_part(image_b64),
        ]

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(parts=parts)],
                config=self.default_config,
            )
        except Exception as e:
            logger.error(f"enhance_accessory_view({view_name}): Gemini API error: {e}")
            raise

        if not response.candidates:
            raise HTTPException(status_code=500, detail=f"No response from Gemini for {view_name} view")

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                return base64.b64encode(part.inline_data.data).decode("utf-8")

        raise HTTPException(status_code=500, detail=f"Failed to enhance {view_name} accessory view")

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
            dress_status="true" if body_zones.dress.status else "false",
            top_status="true" if body_zones.top.status else "false",
            bottom_status="true" if body_zones.bottom.status else "false",
            footwear_status="true" if body_zones.footwear.status else "false",
            headwear_piece_size=body_zones.headwear.size or "N/A",
            outerwear_piece_size=body_zones.outerwear.size or "N/A",
            dress_piece_size=body_zones.dress.size or "N/A",
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
                contents=[types.Content(parts=parts)],
                config=self.default_config,
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
                contents=[types.Content(parts=parts)],
                config=self.default_config,
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
        prompt_with_format = (
            f"{prompt}\n\nFINAL OUTPUT FORMAT: Generate one portrait image in exact 9:16 aspect ratio. "
            "Full-body framing when a person is present, centered subject, no extra text."
        )
        parts = [types.Part(text=prompt_with_format)]
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
        "dress": body_zones.dress,
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


def _build_companion_instructions(
    target: str,
    top_type: str,
    top_name: str,
    top_hex: str,
    bottom_type: str,
    bottom_name: str,
    bottom_hex: str,
) -> str:
    """Build target-specific companion garment instructions for product generation."""
    if target == "top":
        return f"""
COMPANION GARMENT (BOTTOM = FIXED):
The bottom is not the hero product, but it MUST visibly match the admin selection.

STRICT RULES:
- Plain {bottom_name} {bottom_type} ONLY
- Color: exactly {bottom_hex} ({bottom_name})
- The visible bottom color must match {bottom_hex}; do not use black, white, gray, or denim unless that exact color was selected.
- No patterns, no logos, no distressing
- Straight or slightly relaxed fit
- Matte fabric
- Keep the silhouette simple, but keep the selected color clearly visible
"""

    if target == "bottom":
        return f"""
COMPANION GARMENT (TOP = FIXED):
The top is not the hero product, but it MUST visibly match the admin selection.

STRICT RULES:
- Plain {top_name} {top_type} ONLY
- Color: exactly {top_hex} ({top_name})
- The visible top color must match {top_hex}; do not use black, white, gray, beige, or another neutral unless that exact color was selected.
- No logos, no graphics, no texture
- Matte cotton appearance
- Keep the silhouette simple, but keep the selected color clearly visible
"""

    if target == "outerwear":
        return f"""
COMPANION GARMENTS (TOP + BOTTOM = FIXED):
The top and bottom are not the hero product, but both MUST visibly match the admin selections.

TOP STRICT RULES:
- Plain {top_name} {top_type} ONLY
- Color: exactly {top_hex} ({top_name})
- Do not use black, white, gray, beige, or another neutral unless {top_hex} is that color
- No logos, no graphics, no texture

BOTTOM STRICT RULES:
- Plain {bottom_name} {bottom_type} ONLY
- Color: exactly {bottom_hex} ({bottom_name})
- Do not use black, white, gray, denim, or another neutral unless {bottom_hex} is that color
- No patterns, no logos, no distressing

Keep both companion garments simple, but keep their selected colors clearly visible around the outerwear.
"""

    if target == "dress":
        return """
COMPANION GARMENTS:
- Do NOT add separate top or bottom garments.
- The provided DRESS is the complete body garment and must remain the only clothing item above the footwear.
- Do NOT add black pants, jeans, leggings, or a t-shirt unless such clothing is visibly part of the provided dress reference.
"""

    return f"""
COMPANION GARMENT:
- If a top is needed, use plain {top_name} {top_type}, exactly {top_hex} ({top_name}).
- If a bottom is needed, use plain {bottom_name} {bottom_type}, exactly {bottom_hex} ({bottom_name}).
- Do not replace selected colors with black, white, gray, denim, beige, or another neutral unless that exact color was selected.
"""
