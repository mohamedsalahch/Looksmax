"""API endpoint for auto-describing product photos (name + category) using Gemini."""

import json
import logging
import re

from fastapi import APIRouter, HTTPException
from google.genai import types
from pydantic import BaseModel, Field

from app.services.generator import ImageGenerator
from app.services import dataset
from app.utils.image import b64_to_part

router = APIRouter(prefix="/api", tags=["description"])
logger = logging.getLogger(__name__)

_generator: ImageGenerator | None = None
_DESCRIBE_MODEL = "gemini-3-flash-preview"
DESCRIBE_PRODUCT_PROMPT_VERSION = "describe_product/v1"

DESCRIBE_PRODUCT_PROMPT = """You are a product cataloging assistant for a Tunisian fashion & perfume marketplace.
You receive 1-4 photos of a single product plus the target customer gender and the
exhaustive list of allowed category slugs for that gender.

Your job: return ONLY a JSON object with two fields:
  - "name":     a concise, retail-ready product name (3-8 words, Title Case, no emojis,
                no brand guessing unless a brand is clearly visible on the product, no
                price, no size, no quantity).
  - "category": exactly one slug copied verbatim from the provided list. Do not invent
                slugs, do not translate, do not modify casing.

Rules:
- If the photos are ambiguous, choose the closest valid category - never leave it blank.
- Never include the gender word in the name (the gender is already known to the system).
- Output strictly: {"name": "...", "category": "..."} - no prose, no markdown, no code fences."""


class CategoryOption(BaseModel):
    slug: str
    name: str


class DescribeProductRequest(BaseModel):
    images: list[str] = Field(..., min_length=1, max_length=4)
    gender: str
    categories: list[CategoryOption] = Field(..., min_length=1)


class DescribeProductResponse(BaseModel):
    name: str
    category: str


def set_generator(generator: ImageGenerator | None) -> None:
    global _generator
    _generator = generator


def _parse_describe_response(text: str) -> dict:
    """Extract JSON object from Gemini's text response."""
    match = re.search(r"\{.*?\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in response")
    return json.loads(match.group(0))


def _build_user_text(gender: str, categories: list[CategoryOption]) -> str:
    lines = [f"Target gender: {gender}", "", "Allowed categories (slug - display name):"]
    for cat in categories:
        lines.append(f"- {cat.slug} - {cat.name}")
    lines.append("")
    lines.append("Return the JSON now.")
    return "\n".join(lines)


async def _call_describe(
    images: list[str],
    user_text: str,
    extra_suffix: str = "",
) -> dict:
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    prompt_text = DESCRIBE_PRODUCT_PROMPT + (f"\n\n{extra_suffix}" if extra_suffix else "")
    parts: list[types.Part] = [
        types.Part(text=prompt_text),
        types.Part(text=user_text),
    ]
    for img in images:
        parts.append(b64_to_part(img))

    try:
        response = await _generator.client.aio.models.generate_content(
            model=_DESCRIBE_MODEL,
            contents=[types.Content(parts=parts)],
        )
    except Exception as e:
        logger.error(f"describe-product: Gemini API error: {e}")
        raise HTTPException(status_code=502, detail=f"Describe request failed: {e}")

    if not response.candidates:
        raise HTTPException(status_code=502, detail="No response from describe model")

    text = response.candidates[0].content.parts[0].text
    logger.info(f"describe-product: raw response: {text}")

    try:
        return _parse_describe_response(text)
    except (json.JSONDecodeError, ValueError, IndexError) as e:
        logger.error(f"describe-product: failed to parse response: {e} | text={text!r}")
        raise HTTPException(status_code=502, detail="Could not parse describe result")


@router.post("/describe-product", response_model=DescribeProductResponse)
async def describe_product(request: DescribeProductRequest):
    """Generate a product name and pick one category slug from the allowed list."""
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    gender = request.gender.strip().lower()
    if gender not in {"men", "women", "children"}:
        raise HTTPException(status_code=400, detail="gender must be men, women, or children")

    allowed_slugs = {c.slug for c in request.categories}
    user_text = _build_user_text(gender, request.categories)

    result = await _call_describe(request.images, user_text)
    name = str(result.get("name", "")).strip()
    category = str(result.get("category", "")).strip()

    if category not in allowed_slugs:
        logger.warning(f"describe-product: invalid category {category!r}, retrying once")
        result = await _call_describe(
            request.images,
            user_text,
            extra_suffix="INVALID CATEGORY - pick exactly one slug from the list above.",
        )
        name = str(result.get("name", name)).strip()
        category = str(result.get("category", "")).strip()

    if not name or category not in allowed_slugs:
        raise HTTPException(
            status_code=422,
            detail=f"Model returned invalid result (name={name!r}, category={category!r})",
        )

    dataset.record(
        flow="describe_product",
        model=_DESCRIBE_MODEL,
        prompt_version=DESCRIBE_PRODUCT_PROMPT_VERSION,
        prompt_text=DESCRIBE_PRODUCT_PROMPT,
        inputs={f"photo_{i}": img for i, img in enumerate(request.images)},
        outputs={},
        extra={"gender": gender, "name": name, "category": category},
    )

    return DescribeProductResponse(name=name, category=category)
