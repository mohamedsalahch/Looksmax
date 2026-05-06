"""Prompt templates for image generation."""

CLOTHES_TOP_PROMPT_TEMPLATE = """
You are a professional fashion photography generator.

Your task is to generate a high-end, photorealistic image of a model wearing the provided {GENERATION_TARGET} garment.

--------------------------------
MODEL REFERENCE:
Two images of the same model are provided (front and back views).

- Preserve identity exactly:
  - Face
  - Skin tone
  - Body shape
- The person must remain identical across generations

--------------------------------
GARMENT PRIORITY ({GENERATION_TARGET} = HERO):
The provided {GENERATION_TARGET} garment is the primary focus.

REQUIREMENTS:
- Must match EXACTLY:
  - Color
  - Fabric
  - Fit
  - Details (logos, stitching, patterns)

- Reconstruct using front & back views
- Ensure realistic fabric behavior (folds, tension)

--------------------------------
{COMPANION_GARMENTS_SECTION}

--------------------------------
FOOTWEAR (FIXED):
The shoes MUST be identical across all generations.

STRICT RULES:
- Plain {SHOES_COLOR_NAME} {FOOTWEAR_TYPE} ONLY
- Color: exactly {SHOES_COLOR_HEX} ({SHOES_COLOR_NAME})
- The visible footwear color must match {SHOES_COLOR_HEX}; do not use black, white, or gray unless that exact color was selected.
- Minimalist, low-profile silhouette
- No logos, no patterns, no contrasting accents
- Keep the silhouette simple, but keep the selected color clearly visible.

--------------------------------
BACKGROUND:
- Minimalist studio backdrop
- Warm off-white seamless background (#F2EFEA)
- Floor blends seamlessly into backdrop
- No visible horizon line, no texture

--------------------------------
LIGHTING:
- Soft diffused studio lighting
- Slight emphasis on upper body
- Very soft shadows
- No harsh contrast

--------------------------------
POSE:
- Choose a natural fashion pose that looks suitable for the model (gender, build, body language) — do NOT replicate the pose from the reference images
- Vary the stance, weight distribution, hip angle, head tilt, and arm position so generated images don't look repetitive across runs
- Keep the upper body subtly emphasized and arms positioned to never block or distort the garment
- Pose must remain plausible for premium e-commerce (no exaggerated or unnatural posing)

--------------------------------
CAMERA:
- Mid-body to full-body framing
- Eye-level camera
- 50mm lens look
- Sharp focus on upper body

--------------------------------
STYLE:
- Premium e-commerce aesthetic (Zara / COS style)

--------------------------------
TARGET VIEW:
{VIEW}

--------------------------------
STRICT CONSTRAINTS:
- Do NOT alter garment color or design
- Do NOT replace selected companion colors with black, white, gray, denim, beige, or another neutral unless that exact color was selected
- Do NOT modify selected companion garments in any way
- Do NOT modify the {SHOES_COLOR_NAME} {FOOTWEAR_TYPE} in any way
- Do NOT add patterns/logos anywhere
- Do NOT distort proportions
- Face must remain clean and undistorted

--------------------------------
FINAL REQUIREMENT:
portrait orientation, exact 9:16 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
"""

CLOTHES_BOTTOM_PROMPT_TEMPLATE = """
You are a professional fashion photography generator.

Your task is to generate a high-end, photorealistic image of a model wearing the provided BOTTOM garment.

--------------------------------
MODEL REFERENCE:
Two images of the same model are provided (front and back views).

- Preserve identity exactly:
  - Face
  - Skin tone
  - Body shape
- The person must remain identical across generations

--------------------------------
GARMENT PRIORITY (BOTTOM = HERO):
The BOTTOM garment is the primary focus.

REQUIREMENTS:
- Must match EXACTLY:
  - Color
  - Fabric
  - Fit
  - Details (pockets, stitching, patterns)

- Reconstruct using front & back views
- Ensure realistic fabric behavior (folds, drape, tension)

--------------------------------
{COMPANION_GARMENTS_SECTION}

--------------------------------
FOOTWEAR (FIXED):
The shoes MUST be identical across all generations.

STRICT RULES:
- Plain {SHOES_COLOR_NAME} {FOOTWEAR_TYPE} ONLY
- Color: exactly {SHOES_COLOR_HEX} ({SHOES_COLOR_NAME})
- The visible footwear color must match {SHOES_COLOR_HEX}; do not use black, white, or gray unless that exact color was selected.
- Minimalist, low-profile silhouette
- No logos, no patterns, no contrasting accents
- Keep the silhouette simple, but keep the selected color clearly visible.

--------------------------------
BACKGROUND:
- Minimalist studio backdrop
- Warm off-white seamless background (#F2EFEA)
- Floor blends seamlessly into backdrop
- No visible horizon line

--------------------------------
LIGHTING:
- Soft diffused studio lighting
- Slight emphasis on lower body
- Soft shadows under feet

--------------------------------
POSE:
- Choose a natural standing pose that fits the model (gender, build, body language) — do NOT replicate the pose from the reference images
- Vary the stance, weight-bearing leg, hip angle, foot placement, and arm position so generated images don't look repetitive across runs
- Ensure the bottom garment remains fully visible (avoid crossing legs, hands in front pockets blocking detail, etc.)
- Pose must remain plausible for premium e-commerce (no exaggerated or unnatural posing)

--------------------------------
CAMERA:
- Full-body framing REQUIRED
- Slight lower-body emphasis
- Eye-level or slightly lowered camera
- 50mm lens look

--------------------------------
STYLE:
- Premium e-commerce aesthetic (Zara / COS style)

--------------------------------
TARGET VIEW:
{VIEW}

--------------------------------
STRICT CONSTRAINTS:
- Do NOT alter garment color or structure
- Do NOT replace selected companion colors with black, white, gray, denim, beige, or another neutral unless that exact color was selected
- Do NOT modify selected companion garments in any way
- Do NOT modify the {SHOES_COLOR_NAME} {FOOTWEAR_TYPE} in any way
- Do NOT add patterns/logos
- Do NOT distort proportions
- Avoid hiding key garment areas

--------------------------------
FINAL REQUIREMENT:
portrait orientation, exact 9:16 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
"""

CLOTHES_PROMPT_TEMPLATE = """
You are a professional fashion photography generator.

Your task is to generate a high-end, photorealistic image of a model wearing the provided clothing item.

--------------------------------
MODEL REFERENCE:
Two images of the same model are provided (front and back views).

- Use them to preserve:
  - Identity (face, skin tone, body shape)
  - Natural proportions
  - Realistic appearance

- The generated model MUST be the same person across all outputs.
- Facial features must remain identical.

- You may slightly adjust the pose, but the model must remain consistent with both references.

--------------------------------
GARMENT REFERENCE:
The clothing item is provided in:
- Front view
- Back view

REQUIREMENTS:
- The garment must match EXACTLY in:
  - Color
  - Shape
  - Fabric
  - Details (logos, stitching, patterns)

- Reconstruct the full garment by:
  - Using the front and back views
  - Inferring the sides logically and symmetrically
  - Ensuring continuity between front and back

- Do NOT invent new design elements.

--------------------------------
FIT & REALISM:
- The clothing must fit naturally on the model's body
- Respect fabric behavior (folds, tension, gravity)
- Ensure proper alignment (shoulders, sleeves, waist)

--------------------------------
SCENE:
- Minimalist studio background (white, beige, or light gray)
- Clean and distraction-free

--------------------------------
LIGHTING:
- Soft, diffused studio lighting
- Natural shadows
- No harsh contrast

--------------------------------
POSE:
- Natural fashion pose
- Standing, slightly angled (3/4 view preferred to show depth)

--------------------------------
CAMERA:
- Full-body or mid-body framing depending on product type
- Professional fashion photography look
- Sharp focus, high resolution

--------------------------------
STYLE:
- Premium e-commerce aesthetic (Zara / COS style)

--------------------------------
TARGET VIEW:
{VIEW}

- FRONT: clearly show the front of the garment
- BACK: clearly show the back of the garment

--------------------------------
STRICT CONSTRAINTS:
- Do NOT change garment color
- Do NOT add patterns or logos
- Do NOT distort garment shape
- Do NOT generate unrealistic fabric
- Avoid artifacts or deformities
- Ensure the face is clearly visible and not distorted

--------------------------------
FINAL REQUIREMENT:
portrait orientation, exact 9:16 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
"""

SHOES_PROMPT_TEMPLATE = """
Here’s a clean, fully rewritten version of your prompt with the background fix integrated and no internal contradictions:

You are a professional product photography generator specialized in high-end fashion e-commerce.

Your task is to generate a photorealistic image of the provided shoe.

PRODUCT REFERENCE:
The shoe is provided as input image(s).

FIDELITY REQUIREMENTS (STRICT):

The product must match EXACTLY in:
Color
Shape
Material
Texture
Stitching and all fine details
Do NOT modify, redesign, or reinterpret the product in any way
Do NOT add logos, patterns, or elements not present in the reference
Preserve absolute visual accuracy to the original product

BACKGROUND (LOCKED):

Use a minimalist studio background
EXACT color: warm off-white (#F2EFEA)
Background must remain perfectly uniform and flat
No gradients, textures, noise, or wall shadows
Background color must remain IDENTICAL across all generated images (no variation or reinterpretation)

SURFACE:

Studio floor must match the background tone (#F2EFEA)
Clean, seamless transition between floor and background
Add a subtle, soft, diffused natural shadow under the shoe only

LIGHTING:

Soft, diffused studio lighting
Even illumination across the entire product
No harsh shadows, hotspots, or strong reflections
Lighting setup must remain consistent across all outputs

COMPOSITION:

Center the shoe in the frame
Maintain consistent framing, spacing, and margins
Product scale must remain identical across all generated images

CAMERA:

Professional product photography setup
Sharp focus, high resolution
Natural perspective (no distortion, no wide-angle effects)

STYLE:

Premium fashion e-commerce aesthetic (clean, minimal, high-end)

CONSISTENCY (CRITICAL):
If generating multiple images, maintain EXACT SAME:

Background color (#F2EFEA)
Lighting setup
Camera angle and distance
Product scale and positioning

STRICT CONSTRAINTS:

Do NOT change or reinterpret the background color (#F2EFEA)
No color shifts or white balance drift
No props or additional elements
No reflections unless explicitly present in the reference
No visual artifacts, distortions, or inconsistencies

FINAL OUTPUT REQUIREMENTS:

Portrait orientation
Exact 9:16 aspect ratio
Product perfectly centered
Clean, balanced, studio composition
"""

FRONT_VIEW_PROMPT_TEMPLATE = """
You are a professional fashion photography generator.

Your task is to generate a high-end, photorealistic FRONT VIEW image of a person wearing a complete outfit.

The result must look like a real e-commerce clothing photo.

--------------------------------
MODEL IDENTITY:

Use the provided profile image as the identity reference.

- Preserve facial features, skin tone, hairstyle, and body shape
- The person must look like the same individual
- Do NOT change identity

--------------------------------
BODY PROPORTIONS:

- Height: {height} cm
- Weight: {weight} kg
- Top size (body): {top_size}
- Bottom size (body): {bottom_size}
- Shoe size (body): {shoe_size}

--------------------------------
OUTFIT (FRONT VIEW ONLY):

HEADWEAR:
- Status: {headwear_status}
- Size: {headwear_piece_size}
- If false: do NOT generate anything

OUTERWEAR:
- Status: {outerwear_status}
- Size: {outerwear_piece_size}
- If true: use FRONT view image and reconstruct faithfully
- If false: do NOT generate anything

DRESS:
- Status: {dress_status}
- Size: {dress_piece_size}
- If true: use FRONT view image and reconstruct faithfully as a one-piece dress covering the torso and lower body
- If true: do NOT generate separate top or bottom garments unless they are physically visible in the dress reference image
- If false: continue with TOP and BOTTOM rules

TOP:
- Status: {top_status}
- Size: {top_piece_size}
- If true: use FRONT view image and reconstruct faithfully
- If false and DRESS is false: generate a neutral minimal top (plain, solid color)
- If DRESS is true: ignore this section

BOTTOM:
- Status: {bottom_status}
- Size: {bottom_piece_size}
- If true: use FRONT view image and reconstruct faithfully
- If false and DRESS is false: generate neutral pants (clean, no patterns)
- If DRESS is true: ignore this section

FOOTWEAR:
- Status: {footwear_status}
- Size: {footwear_piece_size}
- If true: use FRONT view image and match exactly
- If false: generate plain white shoes (minimalist)

--------------------------------
FIT SIMULATION (CRITICAL):

You MUST simulate realistic garment fit based on the difference between BODY SIZE and GARMENT SIZE.

- If garment size == body size → perfect fit
- If garment size is smaller than body size:
  - Tight fit
  - Visible pulling, stretching, tension lines
  - Fabric strain around chest, shoulders, waist, or thighs
- If garment size is larger than body size:
  - Loose / oversized fit
  - Extra fabric, draping, folds
  - Dropped shoulders, longer sleeves, baggy silhouette

Fit must be visually obvious and physically realistic.

Do NOT ignore size differences.

--------------------------------
GARMENT RULES:

- Only use FRONT images in this step
- Do NOT guess back details
- Focus on accurate front appearance
- Do NOT invent patterns or logos

--------------------------------
FIT & REALISM:

- Clothing must interact naturally with the body
- Add realistic folds, wrinkles, and fabric physics
- Avoid pasted or artificial look

--------------------------------
POSE:

- Natural standing pose
- Facing camera (front view)
- Slightly relaxed posture
- Arms positioned to clearly show outfit

--------------------------------
SCENE:

- Minimalist studio background (light gray)

--------------------------------
LIGHTING:

- Soft, diffused studio lighting
- Natural shadows

--------------------------------
CAMERA:

- Full-body shot
- Straight-on front angle
- Sharp focus, high resolution

--------------------------------
STYLE:

- Premium fashion e-commerce (Zara / COS style)

--------------------------------
STRICT CONSTRAINTS:

- Do NOT change garment colors
- Do NOT add logos or patterns
- Do NOT distort shapes (except natural fit effects)
- Avoid artifacts and unrealistic textures

--------------------------------
FINAL REQUIREMENT:

portrait orientation, exact 9:16 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition

The output must be a clean, realistic FRONT VIEW product image with accurate garment fit representation.
"""

BACK_VIEW_PROMPT_TEMPLATE = """
You are a professional fashion photography generator.

Your task is to generate a photorealistic BACK VIEW of the SAME person wearing the SAME outfit.

You are given:
1. A generated FRONT VIEW image (reference)
2. BACK VIEW garment images

The goal is to produce a consistent back view that matches both identity and clothing.

--------------------------------
IDENTITY CONSISTENCY:

- The person must be EXACTLY the same as in the provided front image
- Preserve:
  - Body shape
  - Height and proportions
  - Skin tone
  - (very important) the fitting of the clothes

- The face is not visible, but head shape and hairstyle must remain consistent

--------------------------------
OUTFIT CONSISTENCY:

- The outfit must be EXACTLY the same as in the front image
- Do NOT change:
  - Garment type
  - Fit
  - Colors

--------------------------------
GARMENT CORRECTION USING BACK VIEWS:

For each garment:

OUTERWEAR / TOP / BOTTOM / FOOTWEAR:

- Use BACK images to correct and complete the garment
- Ensure:
  - Back design matches the real product
  - Continuity between front and back
  - No mismatches between views

- If no back image exists:
  - Infer back logically from front
  - Keep symmetry and consistency

--------------------------------
CRITICAL RULE:

This is NOT a new outfit generation.

This is a transformation of the SAME outfit into a BACK VIEW.

--------------------------------
POSE:

- Same person, now facing away from the camera
- Natural standing pose
- Back fully visible
- Maintain similar posture and proportions as front image

--------------------------------
FIT & PHYSICS:

- Preserve how clothing fits from the front image
- Maintain folds, tension, and realism
- Avoid distortions

--------------------------------
SCENE:

- Same studio setup as front image
- Same background and lighting

--------------------------------
LIGHTING:

- Consistent with front image
- Soft, diffused studio lighting

--------------------------------
CAMERA:

- Full-body shot
- Straight back view
- Same framing as front image

--------------------------------
STRICT CONSTRAINTS:

- Do NOT change identity
- Do NOT change outfit structure
- Do NOT alter garment colors
- Do NOT hallucinate new elements
- Avoid artifacts and inconsistencies

--------------------------------
FINAL REQUIREMENT:
portrait orientation, exact 9:16 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
The result must look like the back view of the SAME photoshoot as the front image.
"""
