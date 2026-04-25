"""Prompt templates for image generation."""

CLOTHES_TOP_PROMPT_TEMPLATE = """
You are a professional fashion photography generator.

Your task is to generate a high-end, photorealistic image of a model wearing the provided TOP garment.

--------------------------------
MODEL REFERENCE:
Two images of the same model are provided (front and back views).

- Preserve identity exactly:
  - Face
  - Skin tone
  - Body shape
- The person must remain identical across generations

--------------------------------
GARMENT PRIORITY (TOP = HERO):
The TOP garment is the primary focus.

REQUIREMENTS:
- Must match EXACTLY:
  - Color
  - Fabric
  - Fit
  - Details (logos, stitching, patterns)

- Reconstruct using front & back views
- Ensure realistic fabric behavior (folds, tension)

--------------------------------
SECONDARY GARMENT (BOTTOM = FIXED):
The bottom MUST be identical across all generations.

STRICT RULES:
- Plain black pants ONLY
- Color: deep black (#111111 to #000000)
- No patterns, no logos, no distressing
- Straight or slightly relaxed fit
- Matte fabric (no shine, no texture emphasis)
- Must not attract attention

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
- Natural fashion pose
- Slight 3/4 angle
- Upper body subtly emphasized
- Arms positioned to not block the garment

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
- Do NOT modify the black pants in any way
- Do NOT add patterns/logos anywhere
- Do NOT distort proportions
- Face must remain clean and undistorted

--------------------------------
FINAL REQUIREMENT:
portrait orientation, 2:3 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
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
SECONDARY GARMENT (TOP = FIXED):
The top MUST be identical across all generations.

STRICT RULES:
- Plain white t-shirt ONLY
- Color: pure white (#FFFFFF)
- No logos, no graphics, no texture
- Crew neck
- Short sleeves
- Relaxed fit
- Matte cotton appearance

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
- Natural stance
- Slight 3/4 angle
- One foot slightly forward to show structure
- Ensure full visibility of garment

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
- Do NOT modify the white t-shirt in any way
- Do NOT add patterns/logos
- Do NOT distort proportions
- Avoid hiding key garment areas

--------------------------------
FINAL REQUIREMENT:
portrait orientation, 2:3 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
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
portrait orientation, 2:3 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
"""

SHOES_PROMPT_TEMPLATE = """
You are a professional product photography generator specialized in high-end fashion e-commerce.

Your task is to generate a photorealistic image of the provided shoe.

--------------------------------
PRODUCT REFERENCE:
The shoe is provided as input image(s).

REQUIREMENTS:
- The product must match EXACTLY in:
  - Color
  - Shape
  - Material
  - Texture
  - Stitching and details

- Do NOT modify or redesign the shoe
- Do NOT add logos, patterns, or elements not present in the reference
- Maintain absolute fidelity to the original product

--------------------------------
BACKGROUND (STRICT):
- Use a minimalist studio background
- EXACT color: soft light gray (similar to RGB ~240,240,240)
- The background MUST remain identical across all generated images
- No gradients, no texture, no shadows on the wall
- Clean, uniform, and consistent

--------------------------------
SURFACE:
- Neutral studio floor matching the background tone
- Subtle natural shadow under the shoe (soft and diffused)

--------------------------------
LIGHTING:
- Soft, diffused studio lighting
- Even illumination across the product
- No harsh shadows or strong highlights
- Maintain consistent lighting across all outputs

--------------------------------
COMPOSITION:
- Center the shoe in the frame
- Keep consistent framing and scale across all images
- Ensure the product size remains the same between generations

--------------------------------
CAMERA:
- Professional product photography
- Sharp focus, high resolution
- Natural perspective (no distortion)

--------------------------------
STYLE:
- Premium e-commerce aesthetic (Zara / COS / Nike product style)

--------------------------------
CONSISTENCY (VERY IMPORTANT):
If multiple images are generated:

- Maintain EXACT SAME:
  - Background color and lighting
  - Camera angle and distance
  - Product scale and positioning

--------------------------------
STRICT CONSTRAINTS:
- No background changes
- No color shifts
- No added props
- No reflections unless explicitly present
- No artifacts or distortions
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

TOP:
- Status: {top_status}
- Size: {top_piece_size}
- If true: use FRONT view image and reconstruct faithfully
- If false: generate a neutral minimal top (plain, solid color)

BOTTOM:
- Status: {bottom_status}
- Size: {bottom_piece_size}
- If true: use FRONT view image and reconstruct faithfully
- If false: generate neutral pants (clean, no patterns)

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

portrait orientation, 2:3 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition

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
portrait orientation, 2:3 aspect ratio, full-body framing, model centered, feet visible, consistent margins, studio composition
The result must look like the back view of the SAME photoshoot as the front image.
"""
