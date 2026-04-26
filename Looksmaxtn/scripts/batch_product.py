#!/usr/bin/env python3
"""Batch-enhance product images with Gemini.

This script processes a hardcoded input folder that contains subfolders,
where each subfolder contains at least two product images.

For each subfolder:
- the first two images are sent to Gemini one by one
- the product is kept as close as possible to the original
- wrinkles are reduced so the item looks ironed and studio-ready
- the background is replaced with a simple seamless tone that matches the site
- the results are saved under ``<subfolder>/result-<subfolder>/``
- each generated file is named ``result-<source-image-name>.<ext>``
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from google import genai
from google.genai import types

ROOT_DIR = Path(__file__).resolve().parent.parent
INPUT_ROOT = ROOT_DIR / "scripts/batch_products"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
GEMINI_MODEL = "gemini-3.1-flash-image-preview"
RESULT_PREFIX = "result-"

PROMPT = f"""
You are a professional e-commerce product retouching assistant.

Task:

* Transform the provided product image into a clean, mannequin-free product image suitable for a professional catalog.

Main Actions:

* Remove the mannequin completely
* Keep only the garment visible
* Reconstruct missing parts naturally if needed

View & Layout:

* The final image must be a top-down view (flat lay)
* The garment must be laid flat on a surface
* Ensure a natural and symmetrical flat presentation
* Keep proportions accurate and realistic

Fabric Preparation:

* Ironing clothes removes wrinkles — remove all wrinkles and creases
* Make the garment look freshly ironed or professionally steamed
* Keep natural fabric texture (do NOT over-smooth or make it look artificial)

Strict Preservation Rules:

* Preserve the product EXACTLY:

  * shape and proportions
  * color
  * fabric and texture
  * stitching and details
  * logos and branding
* Do NOT redesign or alter the garment

Background:
- Minimalist studio backdrop
- Warm off-white seamless background (#F2EFEA)
- Floor blends seamlessly into backdrop
- No visible horizon line, no texture

Lighting:

* Soft, even studio lighting
* Minimal shadows
* Clean, catalog-style illumination

Constraints:

* No mannequin
* No human model
* No props
* No text or graphics
* No added elements

Output:

* High-resolution image
* Clean, ironed, flat-lay garment
* Professional e-commerce ready (Instagram & catalog quality)
""".strip()


def iter_image_files(folder: Path) -> list[Path]:
    return sorted(
        [path for path in folder.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS]
    )


def detect_output_extension(mime_type: str | None) -> str:
    mime_type = (mime_type or "").lower()
    if mime_type in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if mime_type == "image/webp":
        return ".webp"
    if mime_type == "image/gif":
        return ".gif"
    return ".png"


def read_image_bytes(path: Path) -> tuple[bytes, str]:
    data = path.read_bytes()
    if not data:
        raise ValueError(f"Empty image file: {path}")

    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        mime_type = "image/jpeg"
    elif suffix == ".webp":
        mime_type = "image/webp"
    elif suffix == ".gif":
        mime_type = "image/gif"
    elif suffix == ".bmp":
        mime_type = "image/bmp"
    else:
        mime_type = "image/png"

    return data, mime_type


async def edit_image(
    client: genai.Client,
    model: str,
    image_path: Path,
    prompt: str,
) -> tuple[bytes, str]:
    image_bytes, mime_type = read_image_bytes(image_path)
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    response = await client.aio.models.generate_content(
        model=model,
        contents=[
            types.Content(
                parts=[
                    types.Part(text=prompt),
                    image_part,
                ]
            )
        ],
    )

    if not response.candidates:
        raise RuntimeError(f"No candidates returned for {image_path}")

    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            output_bytes = part.inline_data.data
            output_mime = getattr(part.inline_data, "mime_type", None) or "image/png"
            return output_bytes, output_mime

    raise RuntimeError(f"No image returned for {image_path}")


async def process_folder(
    client: genai.Client,
    model: str,
    folder: Path,
    prompt: str,
) -> None:
    images = iter_image_files(folder)
    if len(images) < 2:
        logging.warning("Skipping %s: expected at least 2 images, found %d", folder, len(images))
        return

    target_dir = folder / f"{RESULT_PREFIX}{folder.name}"
    target_dir.mkdir(parents=True, exist_ok=True)

    for index, image_path in enumerate(images[:2], start=1):
        try:
            logging.info("Processing %s (%d/2)", image_path, index)
            output_bytes, output_mime = await edit_image(client, model, image_path, prompt)
            output_ext = detect_output_extension(output_mime)
            output_name = f"result-{image_path.stem}{output_ext}"
            output_path = target_dir / output_name
            output_path.write_bytes(output_bytes)
            logging.info("Saved %s", output_path)
        except Exception:
            logging.exception("Failed to process %s", image_path)


async def run() -> None:
    api_key = os.getenv("GOOGLE_API_KEY", "AIzaSyAZncXialAKd7lUfitMmJ7Y1Aodon8VIJ0")
    if not api_key:
        raise SystemExit("Missing GOOGLE_API_KEY environment variable.")

    if not INPUT_ROOT.exists() or not INPUT_ROOT.is_dir():
        raise SystemExit(f"Input folder does not exist or is not a directory: {INPUT_ROOT}")

    client = genai.Client(api_key=api_key)
    folders = [path for path in sorted(INPUT_ROOT.iterdir()) if path.is_dir()]

    if not folders:
        logging.warning("No subfolders found inside %s", INPUT_ROOT)
        return

    for folder in folders:
        try:
            logging.info("Processing folder %s", folder.name)
            await process_folder(client, GEMINI_MODEL, folder, PROMPT)
        except Exception:
            logging.exception("Failed to process folder %s", folder)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(run())


if __name__ == "__main__":
    main()
