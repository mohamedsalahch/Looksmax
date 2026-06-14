"""Image generation service supporting Google Gemini and OpenRouter backends.

The active backend is selected via the ``GENERATOR_BACKEND`` env var
(``gemini`` by default, or ``openrouter``). Both backends expose the same
``client.aio.models.generate_content(...)`` surface, so the generation logic
below is backend-agnostic.
"""

import asyncio
import base64
import logging
import os

from fastapi import HTTPException
from google import genai
from google.genai import types

from app.models.requests import BodyZones, SecondaryColors
from app.services.openrouter_client import OpenRouterClient
from app.prompts.templates import (
    CLOTHES_TOP_PROMPT_TEMPLATE,
    CLOTHES_BOTTOM_PROMPT_TEMPLATE,
    CLOTHES_AUTO_PROMPT_TEMPLATE,
    SHOES_PROMPT_TEMPLATE,
    FRONT_VIEW_PROMPT_TEMPLATE,
    BACK_VIEW_PROMPT_TEMPLATE,
    GARMENT_ENHANCE_PROMPT_TEMPLATE,
    ACCESSORY_ENHANCE_PROMPT_TEMPLATE,
)
from app.utils.image import b64_to_part

logger = logging.getLogger(__name__)

# Feature identifiers for per-feature image model selection.
FEATURE_OUTFIT_STUDIO = "outfit_studio"      # generate_front_view / generate_back_view
FEATURE_MODEL_PICTURE = "model_picture"      # clothes / clothes_auto / shoes on a model
FEATURE_ENHANCE_PRODUCT = "enhance_product"  # garment / accessory enhancement
FEATURE_ENHANCE_PROFILE = "enhance_profile"  # generate_from_prompt (proxy)

_FOOTWEAR_SECTION_TEMPLATE = """--------------------------------
FOOTWEAR (FIXED):
The shoes MUST be identical across all generations.

STRICT RULES:
- Plain {SHOES_COLOR_NAME} {FOOTWEAR_TYPE} ONLY
- Color: exactly {SHOES_COLOR_HEX} ({SHOES_COLOR_NAME})
- The visible footwear color must match {SHOES_COLOR_HEX}; do not use black, white, or gray unless that exact color was selected.
- Minimalist, low-profile silhouette
- No logos, no patterns, no contrasting accents
- Keep the silhouette simple, but keep the selected color clearly visible."""


class ImageGenerator:
    """Service for generating images via Gemini or OpenRouter."""

    def __init__(
        self,
        client,
        *,
        backend: str = "gemini",
        image_model: str = "gemini-3.1-flash-image-preview",
        text_model: str = "gemini-3-flash-preview",
        feature_models: dict[str, str] | None = None,
    ):
        """Initialize the image generator.

        Args:
            client: A genai ``Client`` or compatible adapter (e.g. ``OpenRouterClient``).
            backend: Active backend label ("gemini" or "openrouter"), for logging.
            image_model: Default image model; per-feature fallback.
            text_model: Model id used for text/JSON calls (describe, validate).
            feature_models: Optional per-feature model overrides, keyed by the
                FEATURE_* constants. Missing features fall back to ``image_model``.
        """
        self.client = client
        self.backend = backend
        self.model = image_model
        self.text_model = text_model

        # Per-feature image models (each defaults to the base image_model).
        fm = feature_models or {}
        self.model_outfit_studio = fm.get(FEATURE_OUTFIT_STUDIO, image_model)
        self.model_model_picture = fm.get(FEATURE_MODEL_PICTURE, image_model)
        self.model_enhance_product = fm.get(FEATURE_ENHANCE_PRODUCT, image_model)
        self.model_enhance_profile = fm.get(FEATURE_ENHANCE_PROFILE, image_model)

        def _make_config(env_var: str) -> types.GenerateContentConfig:
            size = os.getenv(env_var, "1K")
            return types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="9:16", image_size=size),
            )

        # Per-feature resolution — set the env var to "512", "1K", "2K", or "4K".
        self.product_config = _make_config("GEMINI_PRODUCT_IMAGE_SIZE")
        self.outfit_config = _make_config("GEMINI_OUTFIT_IMAGE_SIZE")
        self.profile_config = _make_config("GEMINI_PROFILE_IMAGE_SIZE")
        self._gemini_sem = asyncio.Semaphore(int(os.getenv("GEMINI_MAX_CONCURRENCY", "8")))

    async def _gemini_generate(self, **kwargs):
        async with self._gemini_sem:
            response = await self.client.aio.models.generate_content(**kwargs)
        self._log_usage(response, kwargs.get("model", self.model))
        return response

    @staticmethod
    def _log_usage(response, model: str):
        """Log token usage for a single generate_content call."""
        usage = getattr(response, "usage_metadata", None)
        if usage is None:
            return
        logger.info(
            "[gemini usage] model=%s input=%s output=%s total=%s",
            model,
            getattr(usage, "prompt_token_count", None),
            getattr(usage, "candidates_token_count", None),
            getattr(usage, "total_token_count", None),
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

        freewrite_prompt = (
            secondary_colors.companion_prompt.strip()
            if secondary_colors is not None and secondary_colors.companion_prompt
            else ""
        )

        if freewrite_prompt:
            companion_instructions = freewrite_prompt
            footwear_section = ""
            # Neutral values so remaining {SHOES_COLOR_NAME}/{FOOTWEAR_TYPE} refs in
            # the STRICT CONSTRAINTS block render sensibly.
            shoes_name = "companion"
            footwear_type = "footwear"
            shoes_hex = "#000000"
        else:
            companion_instructions = _build_companion_instructions(
                target=target,
                top_type=top_type,
                top_name=top_name,
                top_hex=top_hex,
                bottom_type=bottom_type,
                bottom_name=bottom_name,
                bottom_hex=bottom_hex,
            )
            footwear_section = (
                _FOOTWEAR_SECTION_TEMPLATE
                .replace("{FOOTWEAR_TYPE}", footwear_type)
                .replace("{SHOES_COLOR_NAME}", shoes_name)
                .replace("{SHOES_COLOR_HEX}", shoes_hex)
            )

        additional_instructions = (
            secondary_colors.additional_instructions.strip()
            if secondary_colors is not None and secondary_colors.additional_instructions
            else ""
        )
        additional_section = (
            f"--------------------------------\nADDITIONAL USER INSTRUCTIONS:\n{additional_instructions}\n"
            if additional_instructions
            else ""
        )

        prompt = (
            template
            .replace("{VIEW}", view_name.upper())
            .replace("{GENERATION_TARGET}", target.upper())
            .replace("{COMPANION_GARMENTS_SECTION}", companion_instructions)
            .replace("{FOOTWEAR_SECTION}", footwear_section)
            .replace("{ADDITIONAL_INSTRUCTIONS}", additional_section)
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
            response = await self._gemini_generate(
                model=self.model_model_picture,
                contents=[types.Content(parts=parts)],
                config=self.product_config
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

    async def generate_clothes_auto_view(
        self,
        view_name: str,
        model_front: str,
        model_back: str,
        product_front: str,
        product_back: str,
        previous_view_image: str | None = None,
        additional_instructions: str = "",
    ) -> str:
        """Generate a single fully-automated clothes view.

        The companion outfit is chosen by the model — caller passes only the
        product images. The prompt forces neutral, accessory-free styling so the
        product stays the hero of the shot.

        When ``previous_view_image`` is provided (e.g. the already-generated
        front image when generating the back view), it is attached as an extra
        reference so the model can replicate the same companion outfit, styling,
        and accessories instead of inventing a new one.
        """
        prompt = CLOTHES_AUTO_PROMPT_TEMPLATE.replace("{VIEW}", view_name.upper())
        additional_instructions = additional_instructions.strip()
        if additional_instructions:
            prompt = prompt + (
                "\n\n--------------------------------\n"
                "IMPORTANT ADMIN INSTRUCTIONS (CRITICAL):\n"
                f"{additional_instructions}\n\n"
                "Follow these admin instructions as high-priority constraints while still preserving the model identity, "
                "the product references, and the product-as-hero requirement.\n"
            )
        if previous_view_image:
            prompt = prompt + (
                "\n\n--------------------------------\n"
                "OUTFIT CONSISTENCY LOCK (CRITICAL):\n"
                "An additional reference image of the SAME model wearing the SAME outfit from the opposite view "
                "is provided as the FIRST input image. This is the canonical outfit for this shoot.\n\n"
                "- The companion garments, layering, footwear, and any accessories must match this reference EXACTLY: "
                "same garment types, same colors, same wash/texture, same proportions, same shoe model.\n"
                "- Do NOT invent a different outfit. Do NOT swap garments. Do NOT change colors. "
                "Do NOT add or remove accessories.\n"
                "- The product itself must still match its front/back reference images exactly.\n"
                "- Only the camera angle and pose change; everything else stays identical.\n"
            )

        logger.info(
            f"generate_clothes_auto_view({view_name}): input sizes - "
            f"model_front={len(model_front or '')}, model_back={len(model_back or '')}, "
            f"product_front={len(product_front or '')}, product_back={len(product_back or '')}, "
            f"previous_view={len(previous_view_image or '')}"
        )

        if not all([model_front, model_back, product_front, product_back]):
            raise HTTPException(status_code=400, detail=f"Missing input images for {view_name} view")

        parts: list[types.Part] = [types.Part(text=prompt)]
        if previous_view_image:
            parts.append(b64_to_part(previous_view_image))
        parts.extend([
            b64_to_part(model_front),
            b64_to_part(model_back),
            b64_to_part(product_front),
            b64_to_part(product_back),
        ])

        try:
            response = await self._gemini_generate(
                model=self.model_model_picture,
                contents=[types.Content(parts=parts)],
                config=self.product_config
            )
        except Exception as e:
            logger.error(f"generate_clothes_auto_view({view_name}): Gemini API error: {e}")
            raise

        if not response.candidates:
            logger.error(f"generate_clothes_auto_view({view_name}): No candidates returned")
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
            response = await self._gemini_generate(
                model=self.model_model_picture,
                contents=[types.Content(parts=parts)],
                config=self.product_config
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
            response = await self._gemini_generate(
                model=self.model_enhance_product,
                contents=[types.Content(parts=parts)],
                config=self.product_config,
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
            response = await self._gemini_generate(
                model=self.model_enhance_product,
                contents=[types.Content(parts=parts)],
                config=self.product_config,
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
            response = await self._gemini_generate(
                model=self.model_outfit_studio,
                contents=[types.Content(parts=parts)],
                config=self.outfit_config,
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
            response = await self._gemini_generate(
                model=self.model_outfit_studio,
                contents=[types.Content(parts=parts)],
                config=self.outfit_config,
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

        response = await self._gemini_generate(
            model=self.model_enhance_profile,
            contents=[types.Content(parts=parts)],
            config=self.profile_config
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_bytes = part.inline_data.data
                return base64.b64encode(image_bytes).decode("utf-8")

        raise HTTPException(status_code=500, detail="No image returned from Gemini")


def _read_feature_models(prefix: str) -> dict[str, str]:
    """Read per-feature model overrides from ``{PREFIX}_<FEATURE>_MODEL`` env vars.

    Only set vars are returned; unset features fall back to the base image model.
    """
    env_map = {
        FEATURE_OUTFIT_STUDIO: f"{prefix}_OUTFIT_STUDIO_MODEL",
        FEATURE_MODEL_PICTURE: f"{prefix}_MODEL_PICTURE_MODEL",
        FEATURE_ENHANCE_PRODUCT: f"{prefix}_ENHANCE_PRODUCT_MODEL",
        FEATURE_ENHANCE_PROFILE: f"{prefix}_ENHANCE_PROFILE_MODEL",
    }
    return {
        feature: value
        for feature, env_var in env_map.items()
        if (value := os.getenv(env_var, "").strip())
    }


def _log_feature_models(generator: "ImageGenerator") -> None:
    logger.info(
        "  per-feature image models: outfit_studio=%s | model_picture=%s | "
        "enhance_product=%s | enhance_profile=%s",
        generator.model_outfit_studio,
        generator.model_model_picture,
        generator.model_enhance_product,
        generator.model_enhance_profile,
    )


def create_generator() -> "ImageGenerator | None":
    """Build the image generator for the configured backend.

    Returns ``None`` (with a warning) when the required credentials for the
    selected backend are missing, so generation endpoints surface a clean
    initialization error instead of crashing on startup.
    """
    backend = os.getenv("GENERATOR_BACKEND", "gemini").strip().lower()

    if backend == "openrouter":
        api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
        if not api_key:
            logger.warning(
                "GENERATOR_BACKEND=openrouter but OPENROUTER_API_KEY is not set. "
                "Generation endpoints will return an initialization error."
            )
            return None
        modalities_raw = os.getenv("OPENROUTER_IMAGE_MODALITIES", "image,text")
        image_modalities = [m.strip() for m in modalities_raw.split(",") if m.strip()]
        max_tokens_raw = os.getenv("OPENROUTER_MAX_TOKENS", "").strip()
        max_tokens = int(max_tokens_raw) if max_tokens_raw else None
        client = OpenRouterClient(
            api_key=api_key,
            base_url=os.getenv("OPENROUTER_BASE_URL") or None,
            site_url=os.getenv("OPENROUTER_SITE_URL") or None,
            app_name=os.getenv("OPENROUTER_APP_NAME") or None,
            image_modalities=image_modalities or None,
            max_tokens=max_tokens,
        )
        generator = ImageGenerator(
            client,
            backend="openrouter",
            image_model=os.getenv(
                "OPENROUTER_IMAGE_MODEL", "google/gemini-2.5-flash-image-preview"
            ),
            text_model=os.getenv("OPENROUTER_TEXT_MODEL", "google/gemini-2.5-flash"),
            feature_models=_read_feature_models("OPENROUTER"),
        )
        logger.info(
            "Image generator initialized with OpenRouter backend "
            "(default image_model=%s, text_model=%s)",
            generator.model,
            generator.text_model,
        )
        _log_feature_models(generator)
        return generator

    # Default: Gemini.
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        logger.warning(
            "GOOGLE_API_KEY is not configured. Generation endpoints will return "
            "an initialization error."
        )
        return None
    client = genai.Client(api_key=api_key)
    generator = ImageGenerator(
        client,
        backend="gemini",
        image_model=os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image-preview"),
        text_model=os.getenv("GEMINI_TEXT_MODEL", "gemini-3-flash-preview"),
        feature_models=_read_feature_models("GEMINI"),
    )
    logger.info(
        "Image generator initialized with Gemini backend "
        "(default image_model=%s, text_model=%s)",
        generator.model,
        generator.text_model,
    )
    _log_feature_models(generator)
    return generator


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
