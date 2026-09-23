import { auth } from "@/config/firebase";

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export type HeroOutputFormat = 'desktop-16:9' | 'mobile-4:5' | 'both';
export type LogoMode = 'auto-contrast' | 'black' | 'white' | 'custom';

type GeminiPart =
  | { inlineData: { mimeType: string; data: string } }
  | { text: string };

function buildContents(text: string, images: ImageInput[]) {
  const parts: GeminiPart[] = [];

  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }

  parts.push({ text });

  return [{ role: "user" as const, parts }];
}

async function generateWithFallback(
  contents: string | ReturnType<typeof buildContents>,
  generationConfig?: Record<string, unknown>
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in again before generating prompts.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/gemini-generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ contents, generationConfig }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
    detail?: string;
  };

  if (!response.ok || !payload.text) {
    throw new Error(payload.detail || payload.error || 'Failed to generate prompt with Gemini');
  }

  return payload.text;
}

function hasLogos(logoImages?: ImageInput[]) {
  return !!logoImages && logoImages.length > 0;
}

function logoModeLabel(mode: LogoMode) {
  if (mode === 'black') return 'black logo variant';
  if (mode === 'white') return 'white logo variant';
  if (mode === 'custom') return 'custom uploaded logo';
  return 'black and white logo variants for automatic contrast selection';
}

function logoInstruction(logoImages?: ImageInput[], logoMode: LogoMode = 'auto-contrast') {
  if (!hasLogos(logoImages)) {
    return 'LOGO: Reserve a clean, premium space for the Sreerasthu Silvers brand mark, but do not invent or render a fake logo.';
  }

  return `LOGO RULE - CONTRAST-AWARE AND ABSOLUTE:
Attached logo image file(s) are provided as ${logoModeLabel(logoMode)}. Use the attached logo artwork directly; do NOT redraw it, retype it, convert it into random text, or place it on an opaque block.
- If both black and white logo variants are attached, choose the variant that is most readable against the final background: white logo on dark/rich backgrounds, black logo on light/bright backgrounds.
- Preserve the transparent PNG edges. No black box, white box, rectangle, glow blob, or muddy background behind the logo.
- Size: 12-18% of image width for product images; 10-16% for hero banners. It must be readable but never overpower the jewellery or offer.
- Position: choose the cleanest safe area with strong contrast, usually top-left or top-center for banners and a corner for product images.
- Opacity: 100% unless the background is extremely simple; never make the logo faded or hard to read.
- State exactly in the final prompt: "Place the attached logo image directly; choose black or white version based on background contrast; do not recreate it as text."`;
}

const NANO_BANANA_PRO_HANDOFF = `NANO BANANA PRO WORKFLOW:
This prompt is meant for Nano Banana Pro with attached reference images. The generated image must use those attached references as source assets, not as loose inspiration. The prompt must tell Nano Banana Pro exactly what to preserve, what to enhance, and what final ratio/quality to output.`;

const PRODUCT_FIDELITY_RULE = `PRODUCT FIDELITY - THE NON-NEGOTIABLE CORE:
Use the attached jewellery/product image exactly as provided. Preserve the exact design, shape, proportions, chain/setting, stone positions, engraving, polish, metal color, scale, silhouette, clasp details, defects, and craftsmanship. Do not redesign it, simplify it, add extra stones, remove parts, change the metal tone, change gemstones, invent a matching set, or replace it with a similar-looking piece. Only improve the scene around it: lighting, camera, model, styling, environment, reflections, shadows, and composition.`;

const REFERENCE_LOCKED_PROMPT_STYLE = `REFERENCE-LOCKED PROMPT STYLE:
The generated prompt must treat the uploaded jewellery image as a locked visual asset, not as an object to describe from memory. Do not describe the product motif, stones, beads, color, or material in the generated prompt. Instead, instruct Nano Banana Pro to use the attached jewellery reference directly as the product layer/source asset. Product words create hallucinated replacements; asset-lock language preserves the real product.`;

const PRODUCT_TRANSFER_RULE = `PRODUCT TRANSFER RULE:
If the uploaded jewellery is photographed on a display bust, tray, hand, table, or rough store background, remove or replace only the support/background. Transfer the exact jewellery itself onto the model or studio setup without redrawing it. Keep every pendant, chain link, bead, pearl, stone, engraving, oxidized area, plating tone, and spacing identical to the uploaded photo. If a part must curve naturally on a model, adapt only perspective and contact shadow while preserving the visible design exactly.`;

const REFERENCE_DISCIPLINE_RULE = `REFERENCE DISCIPLINE:
Study every attached reference carefully. Keep the uploaded product/reference subject real and unchanged, like a professional retouching brief: preserve identity, geometry, materials, and proportions while upgrading the scene to a premium photographed result. If a reference is low quality, use it to preserve the product accurately, then rebuild only the lighting, surroundings, and photographic quality around it.`;

const PHOTOREALISM_RULE = `PHOTOREALISM - MUST LOOK LIKE A REAL CAMERA CAPTURE:
- Real skin texture if a model appears: visible pores, tiny facial hair, natural moles/freckles, slight skin tone variation, real lip lines, non-perfect symmetry, natural under-eye and cheek texture.
- Real eyes and hair: believable catchlights from softboxes/windows, individual hair strands, flyaways, imperfect hairline, no CG helmet hair.
- Real material response: the metal color and finish follow the uploaded product exactly; silver stays cool, gold plating stays warm, oxidized areas stay dark, beads/pearls/stones keep their original colors. Fabric weave is visible, stones refract light naturally, shadows contact the surface correctly.
- Real camera behavior: Canon EOS R5 or Hasselblad-style editorial capture, accurate lens compression, natural depth of field, subtle film grain, true light falloff, no overdone HDR.
- Real environment: floors, walls, props, flowers, fabric folds, marble, velvet, and reflections must have scale, texture, depth, and natural imperfections.
- Banned AI tells: plastic skin, wax faces, floating jewellery, impossible shadows, deformed fingers, warped text, random extra jewellery, fake sparkle noise, over-smoothed surfaces, perfect symmetry, digital glow.`;

const ATTIRE_AND_STYLING_RULE = `DYNAMIC ATTIRE AND STYLING - DO NOT DEFAULT TO GREEN SAREE:
Choose attire based on the uploaded jewellery style and campaign mood. Options include Kanjivaram silk saree, Banarasi saree, handloom drape, bridal lehenga, modern structured gown, velvet blouse, minimalist editorial black/ivory outfit, or contemporary festive styling. The outfit must complement the jewellery and never compete with it. Avoid repeating green saree by default; use emerald or green only when it is clearly the best cultural/compositional choice. Prefer rich, varied palettes such as deep wine, ivory, champagne, sapphire, antique rose, charcoal, royal blue, temple red, pearl white, or muted gold accents while keeping the uploaded product's exact color/material unchanged.`;

const LUXURY_ENVIRONMENT_RULE = `WORLD-CLASS ENVIRONMENT:
Create a real, high-budget luxury photography setting rather than a flat backdrop. Choose one setting that fits the product: editorial studio with sculpted light, palace corridor, temple-inspired architectural detail, marble atelier, velvet/silk styling table, premium boutique interior, garden at golden hour, or cinematic festive set. The environment must have foreground/midground/background depth, natural shadows, physically plausible reflections, and professional art direction.`;

const SILVER_COLOR_RULE = `SILVER JEWELLERY COLOR ANCHOR:
Sreerasthu Silvers sells 92.5% silver jewellery. Silver must remain cool, luminous, and premium. Do not warm it into yellow gold or bronze. Any gold, maroon, green, or festive colors belong to the set, props, text, or attire only - never to the silver product unless the uploaded reference itself contains those tones.`;

const MATERIAL_FIDELITY_RULE = `MATERIAL AND COLOR FIDELITY - ABSOLUTE COLOR LOCK:
The uploaded jewellery reference is the single source of truth for color. NEVER convert gold to silver or silver to gold — this is the most common failure and it is forbidden. If the uploaded piece is gold-polished it stays gold in every pixel; if it is silver it stays silver; the same applies to oxidized, rose-toned, rhodium, two-tone, coral-beaded, pearl-accented, or gemstone-set pieces. Preserve the exact metal tone, bead color, pearl color, stone color, polish, oxidation, patina, and contrast from the reference. Lighting, mood, and brand context must NEVER shift the metal color — light the scene around the product, never re-tint the product. The final prompt must include this sentence verbatim: "Keep the exact metal color and stone colors from the attached reference photo; do not shift gold to silver or silver to gold under any lighting."`;

const PRODUCT_PAGE_MODEL_SHOT_RULE = `PRODUCT PAGE MODEL SHOT:
This is for a website product page primary image, not a poster, not a social ad, and not a loose fashion portrait. The jewellery must be the clearest hero: large, centered, sharply focused, fully visible, correctly scaled on the model, and suitable for a customer to inspect before buying. The model should look premium and real, but her face, outfit, and background must support the product rather than steal attention. Use a clean luxury crop with minimal distractions, natural skin, believable neck/collarbone anatomy, and a background that adds class without hiding or competing with the jewellery.`;

const MODEL_BEAUTY_RULE = `MODEL BEAUTY - YOUNG, GORGEOUS, CELEBRITY-LEVEL:
The model must be a YOUNG (early-to-mid 20s), strikingly beautiful Indian woman with celebrity/leading-actress looks (think Tanishq/Kalyan campaign face). Requirements:
- Youthful, radiant, flawless-yet-real skin with a healthy glow, fine natural texture and pores; absolutely NOT old, aged, grey-haired, tired, or plain.
- Gorgeous, camera-attractive features: bright expressive eyes with true catchlights, defined brows, sculpted cheekbones, soft full lips.
- Professional glam makeup that flatters: dewy base, subtly smoky or warm eyes, defined lashes, blush, a refined lip — polished and aspirational, never heavy or muddy.
- Dark, healthy, beautifully styled hair (sleek bun, soft waves, or bridal updo) unless the concept specifies otherwise.
- A WARM, GENUINE, JOYFUL SMILE is the default expression (gentle teeth-showing or a soft radiant smile) — she should look happy, confident, and inviting, like the reference celebrity portraits.
- Hyper-realistic editorial photography quality - never CGI, doll-like, plastic, waxy, over-smoothed, or uncanny, but always youthful and beautiful.`;

const NATURAL_WEAR_RULE = `NATURAL, ANATOMICALLY-CORRECT WEARING:
The attached jewellery must sit on the body exactly the way that specific piece is genuinely worn, with real physics: a necklace/choker resting on the collarbone with correct drape, weight, and gravity; earrings hanging correctly from the earlobe with hair swept to reveal them; a ring on the correct finger and a bangle/bracelet on the wrist with believable, relaxed hand choreography; an anklet at the ankle; a maang-tikka/nose-ring/haram placed in its correct anatomical position. Render real contact points, gentle skin compression under weight, and soft accurate contact shadows where metal meets skin. The jewellery must never float, sit at the wrong scale, hover off the skin, clip through skin/fabric/hair, or appear pasted on.`;

const JEWELLERY_VISIBILITY_RULE = `JEWELLERY MUST BE FULLY AND CLEARLY VISIBLE:
The attached jewellery is the product the customer is buying, so the ENTIRE piece must be shown completely, unobstructed, sharp, and well-lit. The model faces the camera (straight-on or a gentle three-quarter turn) so the whole piece reads end to end. NEVER use a full side profile, a back view, a strong downward gaze, crossed arms, or hands/hair/chin/saree pallu that cover or crop any part of the jewellery. For a necklace/haram, keep the neckline and full drape open and visible on the chest; for earrings, sweep the hair back and angle slightly so both the ear and the earring show; for a maang-tikka/nose-ring keep the forehead/face clear. The jewellery must be large in frame, centered, in crisp focus, and never tiny, blurred, half-hidden, or turned away.`;

const PRODUCT_COMPLETE_VISIBILITY_RULE = `PRODUCT MUST BE SHOWN COMPLETELY (STUDIO):
Lay/present the attached jewellery so the ENTIRE design is fully open, spread out, and readable - every motif, the full chain/band, the centerpiece, and all drops/beads visible at once. Do NOT coil it, fold it, stand it on its edge, prop it vertically, overlap parts, or curl it in a way that hides or compresses any portion (the necklace should read as a full, gently opened U/arc, not a tight curve or a standing loop). The complete piece is sharp, correctly proportioned, evenly lit, and large in frame so a customer can inspect the whole design before buying. Nothing crops or covers it.`;

// ────────────────────────────────────────────────────────────────────────────
// CREATIVE CONCEPT ROTATION
// The prompt-writing model used to converge to one "look" every time. We now
// pick a fresh, distinct concept on every generation from curated luxury pools,
// so each click produces a genuinely different, professional photoshoot idea
// while the attached product stays locked and unchanged.
// ────────────────────────────────────────────────────────────────────────────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const MODEL_BACKDROPS = [
  'minimal seamless studio sweep in warm ivory with a soft sculpted gradient and clean negative space',
  'opulent palace interior with carved sandstone arches, brass diyas, and creamy window light bokeh',
  'modern concrete-and-glass editorial studio with directional sunlight and long architectural shadows',
  'South-Indian temple corridor of granite pillars with marigold garlands and warm golden-hour rim light',
  'champagne silk drapery backdrop lit by a large beauty dish for soft luxury falloff',
  'contemporary art-gallery white wall with a single crisp accent spotlight and clean shadow',
  'marble haveli courtyard at sunset with a shallow reflecting pool and warm amber glow',
  'painterly deep-charcoal canvas backdrop with classic Vogue-beauty chiaroscuro lighting',
  'festive Diwali set with warm fairy-light bokeh and rich out-of-focus textiles',
  'serene monsoon veranda with brass accents, jasmine vines, and soft diffused overcast light',
  'jewel-toned velvet backdrop (sapphire / wine / emerald chosen to flatter the piece) with spotlit drama',
  'sunlit ivory linen interior with sheer curtains and gentle wind-blown movement',
];

const MODEL_ARCHETYPES = [
  'radiant young South-Indian bride in her early 20s, flawless dewy skin, soft glam with warm eyes, jasmine flowers in a neat bun, glowing happy smile',
  'stunning young Indian actress-type in her mid 20s, luminous complexion, defined brows, expressive eyes, sleek low bun, bright joyful smile',
  'beautiful youthful model in her early 20s with fresh natural glam, soft loose waves, rosy cheeks, gentle teeth-showing smile',
  'gorgeous young festive-glam woman in her mid 20s, dewy base, subtly smoky eyes, statement bindi, polished bun, warm confident smile',
  'elegant young bride in her early 20s with traditional gold-toned bridal makeup, kohl-lined bright eyes, fresh flowers in hair, radiant smile',
  'charming young woman in her mid 20s, modern soft-glam, healthy dark hair in a graceful updo, sparkling eyes, cheerful inviting smile',
];

const MODEL_POSE_MOODS = [
  'warm front-facing beauty portrait, shoulders square to camera, bright genuine smile, the full necklace open and visible on the neckline',
  'gentle three-quarter turn toward camera with a joyful smile, eyes to lens, jewellery fully in view and unobstructed',
  'elegant soft head-tilt with a radiant teeth-showing smile, chin level, the complete piece centered and clear',
  'graceful straight-on portrait, lips in a happy natural smile, hands relaxed and away from the jewellery so nothing is covered',
  'poised seated pose facing camera, confident warm smile, neckline open so the entire necklace reads end to end',
  'fresh candid laugh toward camera, hair swept back to reveal earrings, full jewellery sharp and visible',
];

const MODEL_LIGHTING = [
  '85mm beauty portrait, large softbox key with silver reflector fill, creamy shallow bokeh',
  '100mm macro-leaning beauty, butterfly lighting, crisp eye catchlights, fine detail',
  '70mm editorial, soft window light with negative fill for dimensional shaping',
  'low-key Rembrandt lighting from a single gridded softbox, rich shadow depth',
  'bright high-key clamshell beauty lighting for clean, luminous e-commerce clarity',
  'warm golden-hour directional sun with a subtle haze and gentle lens flare control',
];

const MODEL_PALETTES = [
  'ivory and champagne handloom drape',
  'deep wine Banarasi silk',
  'royal sapphire-blue silk with subtle gold zari',
  'antique-rose pastel drape',
  'charcoal and gold structured blouse with a minimalist drape',
  'temple-red Kanjivaram with gold border',
  'pearl-white minimalist modern gown',
  'muted plum and old-gold festive ensemble',
];

const STUDIO_SURFACES = [
  'jet-black plush velvet that makes highlights glow',
  'pooled ivory silk with soft natural folds',
  'polished white Carrara marble slab with subtle veining',
  'smoked grey acrylic riser with a clean reflection',
  'warm brushed travertine stone with fine texture',
  'museum-grade matte plinth in bone white',
  'dark walnut wood with brushed-brass accents',
  'frosted glass surface with gentle underlight glow',
  'raw concrete with a single dramatic shaft of light',
  'soft mirror base producing an elegant inverted reflection',
];

const STUDIO_ANGLES = [
  'clean top-down flat-lay with the piece fully opened and spread flat so the entire design reads at once',
  'eye-level hero shot with the necklace gently opened into a wide U on a low support, the whole piece visible and filling the frame',
  'subtle 30-45 degree angle on a flat surface, piece fully laid open and spread (never curled or standing) for depth while showing every detail',
  'softly elevated three-quarter view with the complete piece opened flat and centered, full design sharp and readable',
  'gentle glossy-base composition with the piece laid fully open and a soft mirrored reflection beneath, whole design visible',
];

const STUDIO_LIGHTING = [
  'single dramatic softbox with deep controlled shadow (chiaroscuro luxury)',
  'bright high-key catalogue lighting with clean white falloff',
  'smooth gradient sweep light from bright to soft shadow',
  'dual rim "jewellery-box" lighting that traces every edge',
  'neutral calibrated white-balanced key so the metal reads exactly as in the reference photo',
  'soft directional key with gentle specular highlights, white-balanced so the metal tone never shifts',
];

const STUDIO_MOODS = [
  'minimalist museum elegance',
  'opulent festive richness',
  'editorial luxe magazine feel',
  'clean premium catalogue clarity',
  'moody cinematic still-life',
  'fresh natural-light freshness',
];

const STUDIO_PROPS = [
  'a single fresh orchid placed subtly out of focus',
  'a raw uncut gemstone cluster as a quiet accent',
  'a length of silk ribbon trailing softly in the background',
  'a few scattered rose petals, sparse and tasteful',
  'a blurred brass incense holder far in the background',
  'fine water droplets for a fresh, just-polished feel',
  'no props at all - pure minimalist focus on the jewellery',
];

function buildModelConcept(): string {
  return `CREATIVE CONCEPT FOR THIS GENERATION (commit to it fully - this is freshly chosen and changes every time, so the result must be unique and NOT a generic default):
- Setting / background: ${pick(MODEL_BACKDROPS)}
- Model look: ${pick(MODEL_ARCHETYPES)}
- Pose & mood: ${pick(MODEL_POSE_MOODS)}
- Lighting & camera: ${pick(MODEL_LIGHTING)}
- Wardrobe & palette: ${pick(MODEL_PALETTES)}
Translate every line above into the final prompt. Do NOT collapse into a plain neutral studio or a default green saree. This concept defines THIS specific photoshoot.`;
}

function buildStudioConcept(): string {
  return `CREATIVE CONCEPT FOR THIS GENERATION (commit to it fully - freshly chosen and unique each time, never a generic default):
- Surface / set: ${pick(STUDIO_SURFACES)}
- Camera angle / composition: ${pick(STUDIO_ANGLES)}
- Lighting design: ${pick(STUDIO_LIGHTING)}
- Mood: ${pick(STUDIO_MOODS)}
- Prop accent (keep subtle, never competing with the product): ${pick(STUDIO_PROPS)}
Build the entire still-life around this exact concept so it looks distinct from previous generations while keeping the attached jewellery locked and unchanged.`;
}

// Slightly higher temperature for the creative prompt writer so wording and
// ideas vary run-to-run (the API also applies a sensible default).
const CREATIVE_CONFIG = { temperature: 1.2, topP: 0.97 } as const;

const PROSE_FORMAT_RULE = `OUTPUT FORMAT OF THE PROMPT ITSELF - STRICT:
Write the final prompt as ONE flowing, vivid, richly detailed prose paragraph (or at most two), the way a film director briefs a cinematographer. Absolutely NO JSON, no key-value pairs, no curly braces, no bullet lists, no numbered lists, no markdown, no section headers, no quotation wrappers. Image models follow evocative natural language far better than structured data — a JSON prompt produces flat, lifeless renders. Every rule above must be woven into the prose naturally.`;

const REALISM_FIRST_ANCHOR = `REALISM IS THE #1 PRIORITY:
Open the final prompt by declaring it is "an ultra-photorealistic RAW photograph, shot on a real camera" and keep reinforcing photographic language throughout (lens, aperture, film grain, true light falloff, natural skin micro-texture). The single biggest failure to avoid is a render that looks AI-generated: smooth CG skin, painted hair, fake bokeh, plastic highlights. If a viewer could not mistake the result for a genuine editorial photograph from a Vogue India jewellery campaign, it has failed.`;

function heroFormatInstruction(format: HeroOutputFormat) {
  if (format === 'desktop-16:9') {
    return `OUTPUT FORMAT: Generate one desktop hero banner, 16:9 ratio, 3840x2160 or 4096x2304. Use horizontal composition, generous side safe zones, readable typography, and no cropped product/model face.`;
  }

  if (format === 'mobile-4:5') {
    return `OUTPUT FORMAT: Generate one mobile hero banner, 4:5 ratio, 3200x4000 or 4096x5120. Use vertical composition for phone screens, keep all text inside central safe zones, keep the jewellery and model face fully visible, and leave enough breathing room near top/bottom UI crop areas.`;
  }

  return `OUTPUT FORMAT: Generate TWO separate final banner images from the same premium campaign concept:
1. Desktop version: 16:9 ratio, 3840x2160 or 4096x2304, horizontal composition with readable text and logo safe zones.
2. Mobile version: 4:5 ratio, 3200x4000 or 4096x5120, vertical composition with all text, offer, jewellery, model face, and logo inside safe zones.
Both images must feel like the same campaign, but each must be composed natively for its ratio. Do not simply crop the desktop into mobile.`;
}

function modelInstruction(includeModel: 'auto' | 'yes' | 'no', festivalOrEvent: string) {
  if (includeModel === 'yes') {
    return `MODEL DIRECTION: Include a real-looking Indian model styled for "${festivalOrEvent}". She must look photographed, not generated. Choose pose, expression, attire, makeup, and camera angle based on the jewellery type. The model supports the jewellery; the product remains the hero.`;
  }

  if (includeModel === 'no') {
    return `MODEL DIRECTION: No model. Create a breathtaking product-and-design composition using the exact attached jewellery, premium props, typography, fabric, light, and festival elements.`;
  }

  return `MODEL DECISION: Decide whether model or product-only gives the strongest luxury banner for "${festivalOrEvent}". Do not include a model automatically. Use a model for bridal/emotional/lifestyle scale; choose product-only for collections, offer-led banners, intricate jewellery, or clean premium layouts. Either choice must feel like a real Tanishq/Kalyan/Malabar-level campaign.`;
}

export async function generateProductModelPrompt(
  productImage: ImageInput,
  logoImages: ImageInput[] = [],
  logoMode: LogoMode = 'auto-contrast'
): Promise<string> {
  const systemPrompt = `You are a world-class AI image prompt engineer and luxury jewellery creative director for Sreerasthu Silvers, a premium 92.5% silver jewellery brand.

${NANO_BANANA_PRO_HANDOFF}

ATTACHED IMAGES:
- Jewellery/product reference: attached first. Preserve it exactly.
${hasLogos(logoImages) ? `- Logo reference(s): ${logoImages.length} attached logo image(s). ${logoInstruction(logoImages, logoMode)}` : '- No usable logo image may be attached. Do not invent a fake logo.'}

Create the final prompt for a WORLD-CLASS product + model jewellery photoshoot.

${REALISM_FIRST_ANCHOR}
${PHOTOREALISM_RULE}
${PRODUCT_FIDELITY_RULE}
${REFERENCE_LOCKED_PROMPT_STYLE}
${PRODUCT_TRANSFER_RULE}
${REFERENCE_DISCIPLINE_RULE}
${MATERIAL_FIDELITY_RULE}
${PRODUCT_PAGE_MODEL_SHOT_RULE}
${MODEL_BEAUTY_RULE}
${NATURAL_WEAR_RULE}
${JEWELLERY_VISIBILITY_RULE}
${ATTIRE_AND_STYLING_RULE}
${LUXURY_ENVIRONMENT_RULE}
${PROSE_FORMAT_RULE}

${buildModelConcept()}

CAMPAIGN REQUIREMENTS:
- Output ratio: 1:1 square, 4096x4096, 4K.
- The model must be young, beautiful, and smiling, and the entire jewellery piece must be fully visible and sharp.
- The image must feel like a real luxury e-commerce photoshoot by a top photographer, not a generated composite or fashion poster.
- Select the crop dynamically from the jewellery type only for framing: necklace/choker gets collarbone/neck framing; earrings get hair swept aside and side profile; bangles/rings get elegant hand choreography; anklets get graceful foot/hem composition; sets get balanced 3/4 body framing. Do not describe the product's motif, stones, beads, color, or material in the final prompt.
- Use a composed product-page pose with real gesture and body language. Avoid passport-photo frontality, over-dramatic fashion poses, or distant crops where the jewellery is too small.
- Use camera/lens choices that match the product: 85mm beauty portrait, 100mm macro detail, 70mm 3/4 editorial, or low-angle glamour. Include physically plausible depth of field and lighting.
- The attached jewellery must be sharp, correctly scaled, and naturally worn or placed with believable contact shadows while remaining the exact uploaded product asset.
- The final prompt must say: "Do not generate a similar jewellery design. Use the attached product image directly and keep the jewellery unchanged."
- The final prompt must explicitly say to upload and use the attached product reference in Nano Banana Pro.
${logoInstruction(logoImages, logoMode)}

Generate ONLY the final Nano Banana Pro prompt text as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create one premium 1:1 4K product-page model prompt for Nano Banana Pro, built around the specific creative concept above so it is clearly different from previous generations. The uploaded jewellery must remain exactly unchanged as a locked visual asset. Do not describe or reinterpret the jewellery; build a hyper-realistic, beautiful model photo around the exact product, with the jewellery worn naturally and correctly, full material/color fidelity to the reference, and no repetitive green-saree default.`;

  return generateWithFallback(
    buildContents(`${systemPrompt}\n\n${userMessage}`, [productImage, ...logoImages]),
    CREATIVE_CONFIG
  );
}

export async function generateProductStudioPrompt(
  productImage: ImageInput,
  logoImages: ImageInput[] = [],
  logoMode: LogoMode = 'auto-contrast'
): Promise<string> {
  const systemPrompt = `You are a world-class prompt engineer for luxury jewellery studio photography: Cartier/Tiffany-level macro product imagery adapted for Sreerasthu Silvers.

${NANO_BANANA_PRO_HANDOFF}

ATTACHED IMAGES:
- Jewellery/product reference: attached first. Preserve it exactly.
${hasLogos(logoImages) ? `- Logo reference(s): ${logoImages.length} attached logo image(s). ${logoInstruction(logoImages, logoMode)}` : '- No usable logo image may be attached. Do not invent a fake logo.'}

Create the final prompt for a PRODUCT-ONLY world-class studio photoshoot.

${REALISM_FIRST_ANCHOR}
${PRODUCT_FIDELITY_RULE}
${REFERENCE_LOCKED_PROMPT_STYLE}
${PRODUCT_TRANSFER_RULE}
${REFERENCE_DISCIPLINE_RULE}
${MATERIAL_FIDELITY_RULE}
${PRODUCT_COMPLETE_VISIBILITY_RULE}
${PHOTOREALISM_RULE}
${PROSE_FORMAT_RULE}

${buildStudioConcept()}

STUDIO REQUIREMENTS:
- No model, no hands, no human body, no mannequin unless explicitly needed for scale. Product-only.
- Output ratio: 1:1 square, 4096x4096, 4K.
- The complete jewellery design must be fully open, spread, and visible - never curled, folded, or standing on edge.
- Use a premium still-life setup chosen to flatter the uploaded jewellery: black velvet, ivory silk, white/grey marble, smoked acrylic riser, museum plinth, jewellery box, satin folds, brushed stone, or subtle flower petals.
- Use Canon EOS R5 / Hasselblad-style macro product photography, 100mm macro lens, ISO 100, focus stacking, calibrated white balance, softbox key light, rim light, flags, reflectors, and controlled specular highlights.
- Preserve every product detail from the uploaded asset: metal grain, stone facets, engravings, clasps, chain links, bends, surface wear, color tone, and exact proportions. Do not describe or recreate a similar design from words.
- Do not add matching pieces, extra gemstones, fake chains, fake sparkle overlays, or text unless logo placement is requested.
- Make the image look like a real high-end e-commerce/still-life photograph with natural shadows and contact reflections.
${logoInstruction(logoImages, logoMode)}

Generate ONLY the final Nano Banana Pro prompt text as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create one premium 1:1 4K studio product prompt for Nano Banana Pro, built around the specific creative concept above so it is clearly different from previous generations. Use the uploaded jewellery exactly as a locked visual asset, no model, no redesigned product, no descriptive replacement, and produce a world-class macro luxury still-life shot.`;

  return generateWithFallback(
    buildContents(`${systemPrompt}\n\n${userMessage}`, [productImage, ...logoImages]),
    CREATIVE_CONFIG
  );
}

export async function generateHeroSectionPrompt(
  festivalOrEvent: string,
  offerTitle: string,
  offerInfo: string,
  bannerHeadline: string,
  includeModel: 'auto' | 'yes' | 'no',
  outputFormat: HeroOutputFormat = 'both',
  referenceImages?: ImageInput[],
  logoImages: ImageInput[] = [],
  logoMode: LogoMode = 'auto-contrast'
): Promise<string> {
  const hasRef = !!referenceImages && referenceImages.length > 0;
  const refCount = referenceImages?.length || 0;

  const systemPrompt = `You are the creative director at India's #1 luxury jewellery advertising agency. You create homepage campaigns for premium jewellery brands and now you are creating a Sreerasthu Silvers hero banner for Nano Banana Pro.

${NANO_BANANA_PRO_HANDOFF}

CREATIVE BRIEF:
- Festival/Event/Offer Type: "${festivalOrEvent}"
- Banner Headline: ${bannerHeadline ? `Use exactly "${bannerHeadline}"` : `Create a refined 3-7 word headline that includes or clearly references "${festivalOrEvent}"`}
- Offer Title: "${offerTitle}"
${offerInfo ? `- Offer Details: "${offerInfo}"` : '- Offer Details: none provided; keep the offer design clean and not cluttered.'}
- Model Preference: ${includeModel}
- Output Selection: ${outputFormat}

ATTACHED IMAGES:
${hasRef ? `- ${refCount} product/reference image(s) are attached. Use the exact jewellery/product assets from these images unchanged. If multiple products are attached, include them cohesively without redesigning any piece.` : '- No product image may be attached; create premium 92.5 silver jewellery suitable for the campaign, but do not invent a fake brand logo.'}
${hasLogos(logoImages) ? `- ${logoImages.length} logo image(s) are attached. ${logoInstruction(logoImages, logoMode)}` : '- No usable logo image may be attached. Reserve a clean brand area but do not invent a fake logo.'}

${hasRef ? `${PRODUCT_FIDELITY_RULE}\n${REFERENCE_LOCKED_PROMPT_STYLE}\n${PRODUCT_TRANSFER_RULE}\n${MATERIAL_FIDELITY_RULE}` : SILVER_COLOR_RULE}
${REFERENCE_DISCIPLINE_RULE}
${ATTIRE_AND_STYLING_RULE}
${PHOTOREALISM_RULE}

${heroFormatInstruction(outputFormat)}

CAMPAIGN ART DIRECTION:
- Make this a complete publish-ready homepage banner, not a plain product photo with empty space.
- Use the festival/event as the real visual language: culturally accurate colors, props, flowers, fabric, motifs, and emotional mood.
- Avoid one-note color defaults. Do not let green dominate every campaign; use green only when culturally/compositionally needed and balance it with silver, ivory, wine, amber, maroon, blue, or neutral luxury tones.
- Jewellery color and material must follow the uploaded reference exactly. If no product reference is attached, keep created Sreerasthu jewellery cool-toned silver.
- Text must be rendered inside the image with luxury typography: headline, offer title, optional offer details, and a premium CTA such as "SHOP NOW" or "EXPLORE NOW".
- The offer badge must look premium, not like a cheap sticker. Use refined spacing, strong contrast, and clean hierarchy.
- Keep all text readable and inside safe zones for the selected ratio. No cropped words, warped letters, or unreadable decorative text.
- Include logo using the contrast-aware rule above.

${modelInstruction(includeModel, festivalOrEvent)}
${LUXURY_ENVIRONMENT_RULE}

FINAL PROMPT MUST INCLUDE:
1. A clear instruction to attach and use the product/reference images exactly as provided.
2. A clear instruction to generate the selected ratio(s): ${outputFormat}.
3. The exact headline/offer requirements.
4. Product fidelity and material/color fidelity from the uploaded reference.
5. Realism rules for model, product, materials, and environment.
6. Contrast-aware black/white logo placement when logo references are attached.

Generate ONLY the final Nano Banana Pro prompt text as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create the ultimate Sreerasthu Silvers hero banner prompt for Nano Banana Pro. Theme: ${festivalOrEvent}. Headline: ${bannerHeadline || 'AI creates one'}. Offer: ${offerTitle}${offerInfo ? ` - ${offerInfo}` : ''}. Output: ${outputFormat}. Use all attached product/reference images exactly as-is and create a world-class luxury advertisement with realistic photography, premium typography, safe zones, and contrast-aware logo handling.`;

  const images: ImageInput[] = [];
  if (referenceImages) images.push(...referenceImages);
  images.push(...logoImages);

  return generateWithFallback(
    images.length > 0
      ? buildContents(`${systemPrompt}\n\n${userMessage}`, images)
      : `${systemPrompt}\n\n${userMessage}`
  );
}

export async function generateCustomImagePrompt(
  customRequirement: string,
  imageType: string,
  referenceImage?: ImageInput,
  logoImages: ImageInput[] = [],
  logoMode: LogoMode = 'auto-contrast'
): Promise<string> {
  const systemPrompt = `You are an expert AI image prompt engineer for Sreerasthu Silvers, a premium 92.5% silver jewellery brand.

${NANO_BANANA_PRO_HANDOFF}

CUSTOM REQUEST:
- Image type: ${imageType}
- User requirement: "${customRequirement}"

ATTACHED IMAGES:
${referenceImage ? '- A product/reference image is attached. Use it exactly as provided and preserve the subject/product without redesigning it.' : '- No product/reference image is attached.'}
${hasLogos(logoImages) ? `- Logo reference(s): ${logoImages.length} attached image(s). ${logoInstruction(logoImages, logoMode)}` : '- No usable logo image may be attached. Do not invent a fake logo.'}

${referenceImage ? PRODUCT_FIDELITY_RULE : SILVER_COLOR_RULE}
${referenceImage ? `${REFERENCE_LOCKED_PROMPT_STYLE}\n${PRODUCT_TRANSFER_RULE}\n${MATERIAL_FIDELITY_RULE}` : ''}
${REFERENCE_DISCIPLINE_RULE}
${PHOTOREALISM_RULE}
${LUXURY_ENVIRONMENT_RULE}
${logoInstruction(logoImages, logoMode)}

Rules:
- The user's custom requirement is the creative direction, but product/reference fidelity and photorealism are mandatory.
- Use real camera, real materials, real lighting, believable scale, and premium jewellery art direction.
- If this is a banner/hero/social post, include safe text areas, readable typography, and premium layout.
- If this is product photography, keep jewellery/product as the hero and avoid distracting props.

Generate ONLY the final Nano Banana Pro prompt text as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const images: ImageInput[] = [];
  if (referenceImage) images.push(referenceImage);
  images.push(...logoImages);

  return generateWithFallback(
    images.length > 0
      ? buildContents(systemPrompt, images)
      : systemPrompt
  );
}

export async function generateVariationPrompt(
  originalPrompt: string,
  productImage: ImageInput,
  logoImages: ImageInput[] = [],
  logoMode: LogoMode = 'auto-contrast'
): Promise<string> {
  const systemPrompt = `You are a world-class AI image prompt engineer for Nano Banana Pro. Create a new standalone variation of the existing product + model jewellery photoshoot prompt.

ORIGINAL PROMPT:
"""
${originalPrompt}
"""

VARIATION REQUIREMENTS:
- Keep the exact uploaded jewellery unchanged.
- Keep the same luxury campaign quality and product fidelity.
- Keep the same product-page usefulness: jewellery large, sharp, inspectable, and true to the uploaded asset.
- Change the camera angle, crop, model pose, expression, hand placement, and composition enough to feel like a genuinely different shot from the same world-class session.
- Re-style the shoot using the fresh creative concept below so the variation looks distinctly different from the original.
- Do not default to green saree. Choose attire and palette dynamically based on the jewellery and the concept.
- Improve realism and premium art direction wherever the original was weak.
${REALISM_FIRST_ANCHOR}
${PRODUCT_FIDELITY_RULE}
${REFERENCE_LOCKED_PROMPT_STYLE}
${PRODUCT_TRANSFER_RULE}
${MATERIAL_FIDELITY_RULE}
${PRODUCT_PAGE_MODEL_SHOT_RULE}
${MODEL_BEAUTY_RULE}
${NATURAL_WEAR_RULE}
${JEWELLERY_VISIBILITY_RULE}
${PHOTOREALISM_RULE}
${PROSE_FORMAT_RULE}

${buildModelConcept()}
${logoInstruction(logoImages, logoMode)}

Generate ONLY the complete replacement Nano Banana Pro prompt as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create a different angle/pose variation for the uploaded jewellery, restyled around the fresh creative concept above. Product must remain exactly unchanged as a locked visual asset. The model must look hyper-realistic and beautiful with the jewellery worn naturally. Output should still be 1:1 4K world-class realistic website product-page model photography.`;

  return generateWithFallback(
    buildContents(`${systemPrompt}\n\n${userMessage}`, [productImage, ...logoImages]),
    CREATIVE_CONFIG
  );
}

export async function refinePrompt(
  currentPrompt: string,
  refinementInstruction: string
): Promise<string> {
  const systemPrompt = `You are a world-class AI image prompt engineer. A Nano Banana Pro prompt has already been generated, and the user wants to modify it.

CURRENT PROMPT:
"""
${currentPrompt}
"""

USER'S REFINEMENT REQUEST:
"${refinementInstruction}"

Apply the requested change while preserving all product/reference fidelity, locked visual asset instructions, Nano Banana Pro attachment instructions, ratio instructions, realism rules, material/color accuracy from the uploaded reference, product-page suitability, and logo contrast rules. Output the complete updated prompt, not a patch note.

Generate ONLY the refined prompt text. No explanations, no markdown.`;

  return generateWithFallback(systemPrompt);
}