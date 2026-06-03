"""Prompt templates for image generation.

Prompt versions are recorded with every training sample. Bump the version
whenever the corresponding template's text is edited so the dataset stays
groupable by exact prompt revision.
"""

CLOTHES_TOP_PROMPT_VERSION = "clothes_top/v1"
CLOTHES_BOTTOM_PROMPT_VERSION = "clothes_bottom/v1"
CLOTHES_PROMPT_VERSION = "clothes/v1"
SHOES_PROMPT_VERSION = "shoes/v1"
FRONT_VIEW_PROMPT_VERSION = "outfit_front/v1"
BACK_VIEW_PROMPT_VERSION = "outfit_back/v1"
GARMENT_ENHANCE_PROMPT_VERSION = "garment_enhance/v1"
ACCESSORY_ENHANCE_PROMPT_VERSION = "accessory_enhance/v1"
PHOTO_VALIDATION_PROMPT_VERSION = "photo_validation/v1"
COMPARE_FRONT_BACK_PROMPT_VERSION = "compare_front_back/v1"
CLOTHES_AUTO_PROMPT_VERSION = "clothes_auto/v1"

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

{ADDITIONAL_INSTRUCTIONS}
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

{ADDITIONAL_INSTRUCTIONS}
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

CLOTHES_AUTO_PROMPT_TEMPLATE = """
You are a professional fashion photography generator.

Your task is to generate a high-end, photorealistic image of a model wearing the provided clothing item.

The PRODUCT (provided in front and back reference images) is the HERO of the shot. Everything else in the outfit should support and elevate the product while maintaining a premium editorial streetwear aesthetic.

MODEL REFERENCE:
Two images of the same model are provided (front and back views).

STRICT REQUIREMENTS:

Preserve identity exactly:
Face
Hair
Skin tone
Body shape
Height proportions
The person must remain identical across generations.
Do not beautify, stylize, or alter facial structure.
Maintain realistic anatomy and natural proportions.

PRODUCT (HERO):
The clothing item is provided in front and back views.

STRICT REQUIREMENTS:

Match the garment EXACTLY:
Color
Fabric
Texture
Fit
Silhouette
Length
Stitching
Seams
Panels
Wash
Distressing
Logos
Graphics
Hardware
Pocket placement
Hem shape
Sleeve construction
Reconstruct the full garment accurately using the front and back references, logically inferring side construction.
Respect realistic fabric behavior:
drape
folds
tension
compression
thickness
weight
Do NOT redesign or reinterpret the product.
Do NOT add details not visible in the references.

INFER PRODUCT TYPE:
First determine the garment category from the product references:

TOP
(t-shirt, hoodie, sweater, jacket, shirt, knit, coat, etc.)
BOTTOM
(pants, jeans, cargos, shorts, skirt, etc.)
FULL-BODY
(dress, jumpsuit, coordinated set, etc.)

Use this inference to determine:

styling balance
visual hierarchy
framing emphasis
pose direction

The product must always remain the primary visual focus.

COMPANION OUTFIT (EDITORIAL STREETWEAR STYLING)

Style the remaining outfit as elevated contemporary streetwear with believable premium fashion styling.

The outfit should feel professionally styled and editorial while keeping the PRODUCT as the clear focal point.

Visual direction references:

Acne Studios
Fear of God Essentials
Aime Leon Dore
Stüssy
Represent
COS
Arket
Zara premium editorials

STYLING PRINCIPLES

Build a cohesive outfit around the product.
Companion garments should enhance the product through silhouette, proportion, layering, and tonal harmony.
Styling should feel modern, fashion-aware, and realistic.
Avoid sterile “basic mannequin” styling.

You MAY use:

oversized silhouettes
relaxed tailoring
stacked pants
cropped outerwear
utility styling
cargos
tonal layering
premium washed fabrics
subtle texture contrast
heavyweight garments
clean technical wear
monochrome styling
contemporary proportions

Companion garments may include:

subtle seams
garment washes
premium construction details
understated texture variation

BUT:

the product must remain dominant
companion garments must never visually overpower the product

COLOR SYSTEM

The product color must remain the dominant visual color.
Companion garments should support the product using:
neutrals
earth tones
monochromes
muted palettes
washed/desaturated tones

Avoid:

neon colors
loud contrast blocking
competing saturated colors
visually distracting palettes

The overall outfit should feel cohesive and premium.

PRODUCT-TYPE STYLING RULES

IF THE PRODUCT IS A TOP OR OUTERWEAR:

Pair with fashion-forward streetwear bottoms.
Bottoms may be:
relaxed trousers
cargos
clean denim
stacked pants
tailored loose-fit pants
minimalist shorts
Layering is allowed ONLY if the product remains fully visible and dominant.
Additional layers must remain visually secondary.

IF THE PRODUCT IS A BOTTOM:

Pair with elevated streetwear tops such as:
heavyweight tees
hoodies
knits
overshirts
minimalist jackets
Styling should naturally direct attention toward the bottom garment.
Tucking, cropping, layering, and proportion play are encouraged if tasteful.

IF THE PRODUCT IS A FULL-BODY GARMENT:

Keep styling minimal and elegant.
Light layering is allowed only if it enhances realism without covering the product silhouette.

ACCESSORIES

Accessories are OPTIONAL and must remain subtle.

Allowed:

minimal chain
understated rings
simple sunglasses
tonal shoulder bag
clean cap
beanie

Accessories must:

remain secondary
not draw focus away from the product
avoid large logos or loud design

Avoid:

flashy jewelry
luxury flex styling
statement accessories
exaggerated runway styling

FOOTWEAR

Use premium contemporary footwear appropriate to the outfit:

minimalist sneakers
clean leather sneakers
understated boots
loafers
skate-inspired silhouettes
tonal trainers

Footwear must:

support the outfit
remain visually secondary
avoid loud branding
avoid bright colors
avoid distracting design elements

BACKGROUND

Minimalist seamless studio backdrop.
Warm off-white background (#F2EFEA).
Seamless floor transition.
No visible horizon line.
No props.
No environmental objects.
No furniture.
No texture-heavy background elements.

LIGHTING

Soft diffused studio lighting.
Premium e-commerce/editorial lighting quality.
Even exposure.
Gentle emphasis around the product area.
Very soft shadows.
No harsh contrast.
No dramatic spotlighting.
No colored lighting.
No overexposed highlights.

POSE

Choose a natural premium fashion pose.

Requirements:

modern fashion body language
realistic stance
believable editorial energy
relaxed confidence

Vary naturally across generations:

weight distribution
shoulder angle
head tilt
hand placement
hip direction
stance width

STRICT:

hands and arms must NEVER block the product
pose must not distort garment shape
avoid exaggerated runway poses
avoid awkward limb positioning

CAMERA & FRAMING

Portrait orientation
Exact 9:16 aspect ratio
Full-body framing
Feet fully visible
Model centered
Consistent margins
Eye-level camera angle
(slightly lower only for bottom-focused products)
50mm lens look
Premium sharpness around product area
Realistic depth and perspective

IMAGE STYLE

Photorealistic
Premium fashion campaign quality
Luxury e-commerce aesthetic
Editorial streetwear styling
Clean studio composition
Natural skin texture
Realistic textile rendering

TARGET VIEW:
{VIEW}

FRONT:

clearly showcase the front of the product

BACK:

clearly showcase the back of the product
maintain same model and same outfit

STRICT GLOBAL CONSTRAINTS

Do NOT alter the product design in any way.
Do NOT change product color, fit, fabric, or proportions.
Do NOT add fantasy fashion elements.
Do NOT generate extra garments not implied by the styling.
Do NOT use loud graphics or oversized branding.
Do NOT distract from the product.
Do NOT crop the feet.
Do NOT generate unnatural anatomy.
Do NOT generate low-fashion “catalog mannequin” energy.
Do NOT create an over-styled luxury campaign that overwhelms the garment.

FINAL REQUIREMENT

The final image must feel like a premium modern streetwear editorial/e-commerce hybrid.

The outfit should feel genuinely stylish and fashion-aware while keeping the PRODUCT unmistakably as the hero of the image.
"""

SHOES_PROMPT_TEMPLATE = """
You are a professional product photography generator specialized in high-end fashion e-commerce.

Your task is to generate exactly one photorealistic shoe catalog image for the requested target view: {VIEW}.

REFERENCE IMAGES:
Four labeled reference images are provided in this exact order:
1. FRONT VIEW reference
2. BACK VIEW reference
3. LEFT SIDE VIEW reference
4. RIGHT SIDE VIEW reference

VIEW SELECTION RULES (CRITICAL):
- Generate only the {VIEW} view.
- Use the {VIEW} reference as the primary geometry and angle source.
- Use the other three reference images only to preserve the same shoe identity, materials, color, sole shape, stitching, laces, logo placement, and construction details.
- Do not copy the front view for the back, left, or right output.
- Do not invent a different angle. The camera angle must match the requested {VIEW} view.

FIDELITY REQUIREMENTS (STRICT):
- Match the original shoe exactly in color, shape, material, texture, stitching, sole, laces, panels, and all fine details.
- Do not modify, redesign, or reinterpret the shoe.
- Do not add logos, patterns, props, or elements not present in the references.
- Preserve absolute visual accuracy to the original product.

BACKGROUND (LOCKED):
- Use a minimalist studio background.
- Exact color: warm off-white (#F2EFEA).
- The background must remain uniform and flat.
- No gradients, textures, noise, or wall shadows.

SURFACE:
- Studio floor must match the background tone (#F2EFEA).
- Clean, seamless transition between floor and background.
- Add only a subtle, soft, diffused natural shadow under the shoe.

LIGHTING:
- Soft, diffused studio lighting.
- Even illumination across the entire product.
- No harsh shadows, hotspots, or strong reflections.
- Lighting must stay consistent across all generated views.

COMPOSITION:
- Center the shoe in the frame.
- Maintain consistent framing, spacing, margins, product scale, and positioning across views.

CAMERA:
- Professional product photography setup.
- Sharp focus, high resolution.
- Natural perspective with no distortion and no wide-angle effects.

STRICT OUTPUT CONSTRAINTS:
- Output one image only.
- Output the requested {VIEW} view only.
- Do not output a collage or multiple angles in one image.
- Do not include labels, text, annotations, or borders.
- Portrait orientation.
- Exact 9:16 aspect ratio.
- Product perfectly centered.
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


GARMENT_ENHANCE_PROMPT_TEMPLATE = """You are a professional e-commerce product retouching assistant.

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

* Ironing clothes removes wrinkles - remove all wrinkles and creases
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

* Use a clean solid background with color #EAE9E7
* Flat surface, smooth and uniform
* No gradients, no texture, no distractions

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

- Background color must remain exactly #EAE9E7 with no variation"""


ACCESSORY_ENHANCE_PROMPT_TEMPLATE = """You are a professional e-commerce product retouching assistant.

Task:

* Enhance the provided product image for a premium catalog result
* Preserve the item exactly as photographed while improving the presentation

Strict Preservation Rules:

* Keep the product details exactly the same
* Preserve shape, proportions, color, material, texture, stitching, logos, hardware, and branding
* Do NOT redesign, reshape, restyle, or replace any part of the item

Enhancement Goals:

* Clean up the image professionally
* Improve clarity, sharpness, and lighting balance
* Keep natural texture and fine details
* Remove distractions only if they are part of the background
* Do NOT over-smooth or make the product look artificial

Background:

* Replace the background with a clean solid color #EAE9E7
* Keep the background flat, smooth, and uniform
* No gradients, no texture, no props, no text

Composition:

* Keep the full product visible
* Center the item cleanly
* Maintain a natural catalog composition

Output:

* High-resolution image
* Product-only catalog result
* Background color must remain exactly #EAE9E7 with no variation"""
