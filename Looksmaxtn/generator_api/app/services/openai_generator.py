"""Image generation service using OpenAI's image model (gpt-image-2)."""

import base64
import io
import logging

from fastapi import HTTPException
from openai import AsyncOpenAI

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
from app.services.generator import (
    ImageGenerator,
    _build_companion_instructions,
    _get_active_images,
)

logger = logging.getLogger(__name__)


_IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": ("image/jpeg", "jpg"),
    b"\x89PNG": ("image/png", "png"),
    b"GIF8": ("image/gif", "gif"),
    b"RIFF": ("image/webp", "webp"),
    b"BM": ("image/bmp", "bmp"),
}


def _strip_data_url(b64_string: str) -> str:
    if b64_string.startswith("data:") and "," in b64_string:
        return b64_string.split(",", 1)[1]
    return b64_string


def _decode_image_b64(b64_string: str, index: int) -> tuple[str, bytes, str]:
    """Decode a base64 image string into a (filename, bytes, mime_type) tuple."""
    if not b64_string or not b64_string.strip():
        raise ValueError("Empty base64 string provided — image data is missing")

    raw = _strip_data_url(b64_string.strip())
    data = base64.b64decode(raw)
    if not data:
        raise ValueError("Base64 decoded to 0 bytes — image data is missing")

    mime, ext = "image/png", "png"
    for sig, (m, e) in _IMAGE_SIGNATURES.items():
        if data[: len(sig)] == sig:
            mime, ext = m, e
            break

    return (f"image_{index}.{ext}", data, mime)


class OpenAIImageGenerator(ImageGenerator):
    """Service for generating images using OpenAI's image model."""

    def __init__(self, api_key: str, model: str = "gpt-image-2"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        # Portrait size closest to 9:16 supported by gpt-image models.
        self.size = "1024x1536"

    async def _edit(self, prompt: str, images_b64: list[str]) -> str:
        """Call images.edit with one or more reference images. Returns base64 PNG."""
        if not images_b64:
            return await self._generate(prompt)

        files = [_decode_image_b64(b, i) for i, b in enumerate(images_b64)]
        # AsyncOpenAI accepts a list of (filename, bytes, content_type) tuples for multi-image edit.
        image_param = [(name, io.BytesIO(data), mime) for (name, data, mime) in files]

        try:
            response = await self.client.images.edit(
                model=self.model,
                image=image_param if len(image_param) > 1 else image_param[0],
                prompt=prompt,
                size=self.size,
                n=1,
            )
        except Exception as e:
            logger.error(f"OpenAI images.edit error: {type(e).__name__}: {e}")
            raise

        return self._extract_b64(response)

    async def _generate(self, prompt: str) -> str:
        """Call images.generate with no reference images. Returns base64 PNG."""
        try:
            response = await self.client.images.generate(
                model=self.model,
                prompt=prompt,
                size=self.size,
                n=1,
            )
        except Exception as e:
            logger.error(f"OpenAI images.generate error: {type(e).__name__}: {e}")
            raise

        return self._extract_b64(response)

    @staticmethod
    def _extract_b64(response) -> str:
        if not response.data:
            raise HTTPException(status_code=502, detail="No image returned from OpenAI")
        item = response.data[0]
        if getattr(item, "b64_json", None):
            return item.b64_json
        # Fallback: if SDK returned a URL, fetching is not supported here.
        raise HTTPException(status_code=502, detail="OpenAI did not return base64 image data")

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

        if not all([model_front, model_back, product_front, product_back]):
            raise HTTPException(status_code=400, detail=f"Missing input images for {view_name} view")

        prompt = (
            f"{prompt}\n\nReference images are attached in this order:\n"
            f"1) MODEL FRONT view\n2) MODEL BACK view\n3) PRODUCT FRONT view\n4) PRODUCT BACK view\n"
            f"Output a single portrait image with 9:16 framing."
        )

        return await self._edit(prompt, [model_front, model_back, product_front, product_back])

    async def generate_shoes_view(self, view_name: str, product_images: dict[str, str]) -> str:
        view_order = ["front", "back", "left", "right"]
        normalized_view = view_name.lower()
        if normalized_view not in view_order:
            raise HTTPException(status_code=400, detail=f"Invalid shoe view: {view_name}")

        missing = [v for v in view_order if not product_images.get(v)]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing shoe reference images: {', '.join(missing)}",
            )

        prompt = SHOES_PROMPT_TEMPLATE.replace("{VIEW}", normalized_view.upper())
        prompt = (
            f"{prompt}\n\nReference images are attached in this order: "
            f"1) FRONT 2) BACK 3) LEFT 4) RIGHT.\n"
            f"Output a single portrait image with 9:16 framing."
        )

        images = [product_images[v] for v in view_order]
        return await self._edit(prompt, images)

    async def enhance_garment_view(self, view_name: str, image_b64: str) -> str:
        if not image_b64:
            raise HTTPException(status_code=400, detail=f"Missing garment image for {view_name} view")
        return await self._edit(GARMENT_ENHANCE_PROMPT_TEMPLATE, [image_b64])

    async def enhance_accessory_view(self, view_name: str, image_b64: str) -> str:
        if not image_b64:
            raise HTTPException(status_code=400, detail=f"Missing accessory image for {view_name} view")
        return await self._edit(ACCESSORY_ENHANCE_PROMPT_TEMPLATE, [image_b64])

    async def generate_front_view(
        self,
        person_image: str,
        body_zones: BodyZones,
        height: str,
        weight: str,
        top_size: str,
        bottom_size: str,
        shoe_size: str,
    ) -> str:
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

        prompt = (
            f"{prompt}\n\nReference images attached in order: 1) PERSON, "
            f"then {len(front_images)} active garment/accessory front-view reference image(s).\n"
            f"Output a single portrait image with 9:16 framing, full-body."
        )
        return await self._edit(prompt, [person_image, *front_images])

    async def generate_back_view(self, front_image: str, body_zones: BodyZones) -> str:
        back_images = _get_active_images(body_zones, "back")
        prompt = (
            f"{BACK_VIEW_PROMPT_TEMPLATE}\n\nReference images attached in order: 1) FRONT view of the person, "
            f"then {len(back_images)} active garment/accessory back-view reference image(s).\n"
            f"Output a single portrait image with 9:16 framing, full-body."
        )
        return await self._edit(prompt, [front_image, *back_images])

    async def generate_from_prompt(self, prompt: str, images: list[str]) -> str:
        prompt_with_format = (
            f"{prompt}\n\nFINAL OUTPUT FORMAT: Generate one portrait image in roughly 9:16 aspect ratio. "
            "Full-body framing when a person is present, centered subject, no extra text."
        )
        return await self._edit(prompt_with_format, images)
