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

// ────────────────────────────────────────────────────────────────────────────
// ART DIRECTION - Ishaputra Botanicals
// Premium men's Ayurveda and botanical wellness: energy, hair, skin and
// personal care. Premium, masculine, earthy, contemporary. Palette: black,
// charcoal, rust copper, cream. Avoid: the generic Ayurveda look, excessive
// leaves, mandalas, orange gradients, yoga imagery.
// ────────────────────────────────────────────────────────────────────────────

const BRAND_LINE =
  "Ishaputra Botanicals, a premium men's Ayurveda and botanical wellness brand (energy & vitality, hair care, skin care, personal care, classical Ayurvedic essentials)";

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
    return 'LOGO: Reserve a clean, premium space for the Ishaputra Botanicals brand mark, but do not invent or render a fake logo.';
  }

  return `LOGO RULE - CONTRAST-AWARE AND ABSOLUTE:
Attached logo image file(s) are provided as ${logoModeLabel(logoMode)}. Use the attached logo artwork directly; do NOT redraw it, retype it, convert it into random text, or place it on an opaque block.
- If both black and white logo variants are attached, choose the variant that is most readable against the final background: light/bronze logo on dark/rich backgrounds, dark logo on light/bright backgrounds.
- Preserve the transparent PNG edges. No black box, white box, rectangle, glow blob, or muddy background behind the logo.
- Size: 12-18% of image width for product images; 10-16% for hero banners. It must be readable but never overpower the product or offer.
- Position: choose the cleanest safe area with strong contrast, usually top-left or top-center for banners and a corner for product images.
- Opacity: 100% unless the background is extremely simple; never make the logo faded or hard to read.
- State exactly in the final prompt: "Place the attached logo image directly; choose the light or dark version based on background contrast; do not recreate it as text."`;
}

const NANO_BANANA_PRO_HANDOFF = `NANO BANANA PRO WORKFLOW:
This prompt is meant for Nano Banana Pro with attached reference images. The generated image must use those attached references as source assets, not as loose inspiration. The prompt must tell Nano Banana Pro exactly what to preserve, what to enhance, and what final ratio/quality to output.`;

const PRODUCT_FIDELITY_RULE = `PRODUCT FIDELITY - THE NON-NEGOTIABLE CORE:
Use the attached product image exactly as provided. Preserve the exact pack: bottle, jar, tube, pump, dropper or pouch shape; glass or plastic colour (amber, black, frosted); cap and pump finish; label layout, artwork, typography and colours; fill level and liquid colour; proportions and scale. Do not redesign it, relabel it, invent new text, change the glass colour, add extra products, or replace it with a similar-looking pack. Only improve the scene around it: lighting, camera, model, styling, environment, reflections, shadows, and composition.`;

const REFERENCE_LOCKED_PROMPT_STYLE = `REFERENCE-LOCKED PROMPT STYLE:
The generated prompt must treat the uploaded product image as a locked visual asset, not as an object to describe from memory. Do not describe the label wording, pack colours, or ingredients in the generated prompt. Instead, instruct Nano Banana Pro to use the attached product reference directly as the product layer/source asset. Product words create hallucinated replacements; asset-lock language preserves the real product.`;

const PRODUCT_TRANSFER_RULE = `PRODUCT TRANSFER RULE:
If the uploaded product is photographed on a cluttered table, in a hand, or against a rough background, remove or replace only the support/background. Transfer the exact product itself into the model's hand or the studio set without redrawing it. Keep the label, cap, pump, glass tint and every printed detail identical to the uploaded photo. Adapt only perspective, reflections and contact shadow.`;

const REFERENCE_DISCIPLINE_RULE = `REFERENCE DISCIPLINE:
Study every attached reference carefully. Keep the uploaded product/reference subject real and unchanged, like a professional retouching brief: preserve identity, geometry, materials, and proportions while upgrading the scene to a premium photographed result. If a reference is low quality, use it to preserve the product accurately, then rebuild only the lighting, surroundings, and photographic quality around it.`;

const PHOTOREALISM_RULE = `PHOTOREALISM - MUST LOOK LIKE A REAL CAMERA CAPTURE:
- Real skin texture if a model appears: visible pores, beard and stubble texture with individual hairs, natural skin tone variation, real lip lines, non-perfect symmetry, no airbrushing.
- Real eyes and hair: believable catchlights from softboxes/windows, individual hair strands, natural hairline, no CG helmet hair.
- Real material response: glass refracts and shows true caustics, liquids show a meniscus and the colour of the uploaded product, matte and gloss finishes stay as they are, powders and resins have grain and weight. Wood grain, stone pores and linen weave are visible; shadows contact the surface correctly.
- Real camera behaviour: Canon EOS R5 or Hasselblad-style editorial capture, accurate lens compression, natural depth of field, subtle film grain, true light falloff, no overdone HDR.
- Real environment: stone, slate, walnut, brass, linen and tile must have scale, texture, depth and natural imperfections.
- Banned AI tells: plastic skin, waxy faces, floating products, impossible shadows, deformed fingers, warped or invented label text, extra products, fake sparkle, over-smoothed surfaces, perfect symmetry, digital glow.`;

const STYLING_RULE = `MEN'S STYLING - PREMIUM, MASCULINE, CONTEMPORARY:
Choose wardrobe from the Ishaputra palette of black, charcoal, rust copper and cream: a charcoal linen shirt with rolled sleeves, a black crew-neck tee, a rust-copper or cream kurta with a modern cut, an earthy overshirt, a towel-around-the-neck grooming moment, or a plain dark training vest for energy and vitality shots. Grooming is sharp and real: a well-kept beard or stubble, natural hair. Never use saffron robes, prayer beads, yoga poses, meditation clichés, or costume-like traditional dress. The outfit supports the product and never competes with it.`;

const ENVIRONMENT_RULE = `PREMIUM MEN'S WELLNESS ENVIRONMENT:
Create a real, high-budget set rather than a flat backdrop. Choose one setting that fits the product: dark slate bathroom with brushed-brass fittings; charcoal studio sweep with sculpted light; walnut apothecary shelf with amber glass; black stone vanity at dawn; barber lounge of leather, oak and brass; modern Indian home with lime-plaster walls and teak; quiet gym at first light for energy products. The set must have foreground/midground/background depth, natural shadows, physically plausible reflections, and professional art direction. Keep botanicals minimal and sculptural (a single root, a few dried stems, a small bowl of powder or resin) - never a wall of leaves, a mandala, a temple backdrop, or an orange gradient.`;

const BRAND_PALETTE_RULE = `BRAND PALETTE ANCHOR:
Ishaputra's visual world is black, charcoal, rust copper and cream, with bronze accents from the logo. Grade the scene toward deep neutrals with warm copper light. Products keep their real packaging colours; the palette belongs to the set, light, wardrobe and typography. Avoid orange gradients, neon, and saturated festival colours unless the brief explicitly asks for a festival.`;

const MATERIAL_FIDELITY_RULE = `PACKAGING AND COLOUR FIDELITY - ABSOLUTE COLOUR LOCK:
The uploaded product reference is the single source of truth for colour. Keep the exact glass tint (amber stays amber, black stays black, frosted stays frosted), cap and pump finish, label colours, liquid/powder/resin colour and fill level. Lighting, mood and brand grading must NEVER re-tint the product - light the scene around it. The final prompt must include this sentence verbatim: "Keep the exact packaging, label and product colours from the attached reference photo; do not change or recolour them under any lighting."`;

const PRODUCT_PAGE_MODEL_SHOT_RULE = `PRODUCT PAGE MODEL SHOT:
This is for a website product page primary image, not a poster and not a loose fashion portrait. The product must be the clearest hero: large, sharply focused, label facing the camera, correctly scaled in the model's hand or beside him, and suitable for a customer to inspect before buying. The model looks premium and real, but his face, outfit and background support the product rather than steal attention.`;

const MODEL_RULE = `MODEL - REAL, CONFIDENT, AUTHENTIC INDIAN MAN:
The model is an Indian man aged roughly 25-40 with a well-groomed beard or stubble, healthy natural skin, and a fit but real build. Requirements:
- Natural skin with pores, fine lines and beard texture; never airbrushed, plastic, or doll-like.
- Calm confidence: a composed half-smile, a relaxed direct gaze, or a focused grooming moment - never a cheesy grin or an exaggerated flex.
- Neat, natural hair; grooming consistent with the product (a fuller beard for beard care, healthy hair for hair care, clear skin for skin care).
- Hyper-realistic editorial photography quality - never CGI or uncanny.`;

const NATURAL_USE_RULE = `NATURAL, CORRECT PRODUCT USE:
Show the product the way it is genuinely used: beard oil - a few drops from the dropper into the palm or worked through the beard; hair oil or serum - dropper at the scalp or fingertips massaging the roots; face wash - lather at a stone basin; body wash - a pump into the hand in a dark-tiled shower; capsules - two in the palm beside a glass of water; shilajit - a pea-sized amount on a spoon over a cup of warm water; churna - a spoon of powder over warm water; herbal tea - a steaming cup held in both hands. Real contact points, believable hand anatomy, and accurate contact shadows. The product never floats, never sits at the wrong scale, and never has fingers covering the label.`;

const PRODUCT_VISIBILITY_RULE = `PRODUCT MUST BE FULLY AND CLEARLY VISIBLE:
The attached product is what the customer is buying, so the entire pack must be shown completely, unobstructed, sharp and well-lit, with the label facing the camera and readable. Never crop the cap or base, never let hands, hair, steam or props cover the label, and never turn the pack away. The product is large in frame, in crisp focus, and never tiny, blurred or half-hidden.`;

const PRODUCT_COMPLETE_VISIBILITY_RULE = `PRODUCT MUST BE SHOWN COMPLETELY (STUDIO):
Present the attached product upright (or lying naturally if that is its form) so the whole pack, cap to base, and the full label are visible at once. Do not tilt it into an unreadable angle, stack products over it, or crop any part. The complete pack is sharp, correctly proportioned, evenly lit, and large in frame so a customer can inspect it before buying.`;

// ────────────────────────────────────────────────────────────────────────────
// CREATIVE CONCEPT ROTATION
// The prompt-writing model used to converge to one "look" every time. We pick
// a fresh, distinct concept on every generation from curated pools, so each
// click produces a genuinely different photoshoot idea while the attached
// product stays locked and unchanged.
// ────────────────────────────────────────────────────────────────────────────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const MODEL_BACKDROPS = [
  'dark slate bathroom with a brushed-brass tap and soft steam catching a single window light',
  'charcoal seamless studio sweep with a sculpted copper-toned rim light and clean negative space',
  'walnut apothecary shelf of amber glass bottles, softly out of focus behind him',
  'black stone vanity at dawn with cool daylight from a frosted window and a warm practical lamp',
  'barber lounge of oiled leather, oak and brass, shallow depth of field',
  'modern Indian home interior with lime-plaster walls, teak furniture and late-afternoon light',
  'quiet industrial gym at first light, dust in the air, dark iron and concrete',
  'rooftop terrace in Hyderabad at blue hour, city lights softly out of focus',
  'dark-tiled walk-in shower with water droplets on black stone and a single overhead light',
  'minimal study with a linen curtain, a copper cup and long morning shadows',
];

const MODEL_ARCHETYPES = [
  'Indian man in his early 30s with a full, neatly shaped beard, calm confident gaze, composed half-smile',
  'athletic Indian man in his late 20s with short stubble and cropped hair, focused and energetic',
  'Indian man in his mid 30s with a salt-and-pepper beard, relaxed and self-assured',
  'Indian man in his late 20s with thick wavy hair and a trimmed beard, warm natural expression',
  'lean Indian man in his early 30s with a clean fade and precise beard line, quietly intense',
  'Indian man around 40 with a groomed beard and laugh lines, grounded and approachable',
];

const MODEL_POSE_MOODS = [
  'mid-grooming moment, dropper in hand, product label turned to camera, eyes to lens',
  'three-quarter turn toward camera holding the product at chest height, label clear',
  'leaning on a stone vanity, product in the foreground in sharp focus, face softly behind',
  'morning ritual, product in one hand and a cup of warm water in the other, relaxed posture',
  'post-workout, towel around the neck, product held naturally at shoulder height',
  'seated on a teak bench, forearms on knees, product held out slightly toward camera',
];

const MODEL_LIGHTING = [
  '85mm portrait, large softbox key with negative fill for masculine shaping, creamy shallow bokeh',
  '50mm editorial, soft window light raking across skin and beard texture',
  'low-key Rembrandt lighting from a single gridded softbox with a warm copper rim',
  '100mm detail lens, crisp product focus with the face falling gently soft',
  'clean high-key catalogue light for bright e-commerce clarity',
  'golden-hour directional sun through a window with controlled flare',
];

const MODEL_PALETTES = [
  'charcoal linen shirt with rolled sleeves',
  'black crew-neck tee',
  'rust-copper kurta with a modern cut',
  'cream kurta with a subtle texture',
  'earthy olive overshirt over a black tee',
  'plain dark training vest',
  'white towel around the neck, bare shoulders, grooming moment',
];

const STUDIO_SURFACES = [
  'honed black slate with fine texture',
  'dark walnut with visible grain and a brushed-brass tray',
  'raw grey concrete with a single dramatic shaft of light',
  'black basalt stone slab with a few water droplets',
  'cream travertine with soft natural pores',
  'charcoal linen cloth with loose natural folds',
  'weathered teak board with a small copper bowl',
  'smoked glass riser with a clean, subtle reflection',
];

const STUDIO_ANGLES = [
  'eye-level hero shot, product upright and centred, label square to camera',
  'low three-quarter angle for a strong, monumental product silhouette',
  'clean top-down flat-lay with the product and one or two raw ingredients arranged with generous negative space',
  'close 45-degree angle with a shallow depth of field falling away behind the product',
  'product on a stone riser with a soft reflection beneath, full pack visible',
];

const STUDIO_LIGHTING = [
  'single dramatic softbox with deep controlled shadow (chiaroscuro apothecary)',
  'backlit glass glowing amber with a soft front fill so the label stays readable',
  'warm copper rim light with a cool neutral key',
  'bright high-key catalogue lighting with clean falloff',
  'window light with a hard shadow pattern from blinds',
  'neutral calibrated key so the packaging colours read exactly as in the reference photo',
];

const STUDIO_MOODS = [
  'modern apothecary',
  'quiet morning ritual',
  'dark editorial grooming campaign',
  'clean premium catalogue clarity',
  'moody cinematic still life',
  'earthy botanical science',
];

const STUDIO_PROPS = [
  'a single raw ashwagandha root, sculptural and sparse',
  'a small stone bowl of dark resin or herbal powder',
  'a wooden beard comb resting beside the product',
  'a copper cup of warm water with a thin wisp of steam',
  'a folded charcoal linen towel',
  'a few dried stems, minimal and architectural',
  'fine water droplets on the stone for a fresh feel',
  'no props at all - pure minimalist focus on the product',
];

function buildModelConcept(): string {
  return `CREATIVE CONCEPT FOR THIS GENERATION (commit to it fully - this is freshly chosen and changes every time, so the result must be unique and NOT a generic default):
- Setting / background: ${pick(MODEL_BACKDROPS)}
- Model look: ${pick(MODEL_ARCHETYPES)}
- Pose & moment: ${pick(MODEL_POSE_MOODS)}
- Lighting & camera: ${pick(MODEL_LIGHTING)}
- Wardrobe: ${pick(MODEL_PALETTES)}
Translate every line above into the final prompt. Do NOT collapse into a plain neutral studio or a generic Ayurveda scene. This concept defines THIS specific photoshoot.`;
}

function buildStudioConcept(): string {
  return `CREATIVE CONCEPT FOR THIS GENERATION (commit to it fully - freshly chosen and unique each time, never a generic default):
- Surface / set: ${pick(STUDIO_SURFACES)}
- Camera angle / composition: ${pick(STUDIO_ANGLES)}
- Lighting design: ${pick(STUDIO_LIGHTING)}
- Mood: ${pick(STUDIO_MOODS)}
- Prop accent (keep subtle, never competing with the product): ${pick(STUDIO_PROPS)}
Build the entire still life around this exact concept so it looks distinct from previous generations while keeping the attached product locked and unchanged.`;
}

// Slightly higher temperature for the creative prompt writer so wording and
// ideas vary run-to-run (the API also applies a sensible default).
const CREATIVE_CONFIG = { temperature: 1.2, topP: 0.97 } as const;

const PROSE_FORMAT_RULE = `OUTPUT FORMAT OF THE PROMPT ITSELF - STRICT:
Write the final prompt as ONE flowing, vivid, richly detailed prose paragraph (or at most two), the way a film director briefs a cinematographer. Absolutely NO JSON, no key-value pairs, no curly braces, no bullet lists, no numbered lists, no markdown, no section headers, no quotation wrappers. Image models follow evocative natural language far better than structured data - a JSON prompt produces flat, lifeless renders. Every rule above must be woven into the prose naturally.`;

const REALISM_FIRST_ANCHOR = `REALISM IS THE #1 PRIORITY:
Open the final prompt by declaring it is "an ultra-photorealistic RAW photograph, shot on a real camera" and keep reinforcing photographic language throughout (lens, aperture, film grain, true light falloff, natural skin and beard micro-texture). The single biggest failure to avoid is a render that looks AI-generated: smooth CG skin, painted hair, fake bokeh, plastic highlights, warped label text. If a viewer could not mistake the result for a genuine editorial photograph from a premium men's grooming campaign, it has failed.`;

function heroFormatInstruction(format: HeroOutputFormat) {
  if (format === 'desktop-16:9') {
    return `OUTPUT FORMAT: Generate one desktop hero banner, 16:9 ratio, 3840x2160 or 4096x2304. Use horizontal composition, generous side safe zones, readable typography, and no cropped product or model face.`;
  }

  if (format === 'mobile-4:5') {
    return `OUTPUT FORMAT: Generate one mobile hero banner, 4:5 ratio, 3200x4000 or 4096x5120. Use vertical composition for phone screens, keep all text inside central safe zones, keep the product and model face fully visible, and leave enough breathing room near top/bottom UI crop areas.`;
  }

  return `OUTPUT FORMAT: Generate TWO separate final banner images from the same premium campaign concept:
1. Desktop version: 16:9 ratio, 3840x2160 or 4096x2304, horizontal composition with readable text and logo safe zones.
2. Mobile version: 4:5 ratio, 3200x4000 or 4096x5120, vertical composition with all text, offer, product, model face, and logo inside safe zones.
Both images must feel like the same campaign, but each must be composed natively for its ratio. Do not simply crop the desktop into mobile.`;
}

function modelInstruction(includeModel: 'auto' | 'yes' | 'no', festivalOrEvent: string) {
  if (includeModel === 'yes') {
    return `MODEL DIRECTION: Include a real-looking Indian male model styled for "${festivalOrEvent}". He must look photographed, not generated. Choose pose, moment, wardrobe and camera angle to suit the products. The model supports the product; the product remains the hero.`;
  }

  if (includeModel === 'no') {
    return `MODEL DIRECTION: No model. Create a breathtaking product-and-design composition using the exact attached products, a few sculptural raw ingredients, stone, wood, light, typography and restrained campaign elements.`;
  }

  return `MODEL DECISION: Decide whether a model or product-only gives the strongest premium banner for "${festivalOrEvent}". Do not include a model automatically. Use a model for lifestyle, routine and aspiration; choose product-only for collections, offer-led banners, or clean apothecary layouts. Either choice must feel like a top-tier men's grooming campaign.`;
}

export async function generateProductModelPrompt(
  productImage: ImageInput,
  logoImages: ImageInput[] = [],
  logoMode: LogoMode = 'auto-contrast'
): Promise<string> {
  const systemPrompt = `You are a world-class AI image prompt engineer and creative director for ${BRAND_LINE}.

${NANO_BANANA_PRO_HANDOFF}

ATTACHED IMAGES:
- Product reference: attached first. Preserve it exactly.
${hasLogos(logoImages) ? `- Logo reference(s): ${logoImages.length} attached logo image(s). ${logoInstruction(logoImages, logoMode)}` : '- No usable logo image may be attached. Do not invent a fake logo.'}

Create the final prompt for a WORLD-CLASS product + model photoshoot.

${REALISM_FIRST_ANCHOR}
${PHOTOREALISM_RULE}
${PRODUCT_FIDELITY_RULE}
${REFERENCE_LOCKED_PROMPT_STYLE}
${PRODUCT_TRANSFER_RULE}
${REFERENCE_DISCIPLINE_RULE}
${MATERIAL_FIDELITY_RULE}
${PRODUCT_PAGE_MODEL_SHOT_RULE}
${MODEL_RULE}
${NATURAL_USE_RULE}
${PRODUCT_VISIBILITY_RULE}
${STYLING_RULE}
${ENVIRONMENT_RULE}
${BRAND_PALETTE_RULE}
${PROSE_FORMAT_RULE}

${buildModelConcept()}

CAMPAIGN REQUIREMENTS:
- Output ratio: 1:1 square, 4096x4096, 4K.
- The model must look real and confident, and the entire product must be fully visible, sharp, with the label facing the camera.
- The image must feel like a real premium e-commerce photoshoot by a top photographer, not a generated composite or poster.
- Choose the framing from the product type: dropper bottles and oils get a close grooming moment; capsules, resin and powders get a hands-and-cup ritual; washes get a basin or shower moment; teas get a warm cup held in both hands. Do not describe the label wording or pack colours in the final prompt.
- Use a composed, natural moment with real gesture and body language. Avoid stiff catalogue poses, exaggerated flexing, or distant crops where the product is too small.
- Use camera/lens choices that match the shot: 85mm portrait, 100mm detail, or 50mm editorial. Include physically plausible depth of field and lighting.
- The final prompt must say: "Do not generate a similar product. Use the attached product image directly and keep the pack and label unchanged."
- The final prompt must explicitly say to upload and use the attached product reference in Nano Banana Pro.
${logoInstruction(logoImages, logoMode)}

Generate ONLY the final Nano Banana Pro prompt text as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create one premium 1:1 4K product-page model prompt for Nano Banana Pro, built around the specific creative concept above so it is clearly different from previous generations. The uploaded product must remain exactly unchanged as a locked visual asset. Do not describe or reinterpret the product; build a hyper-realistic photo of a real Indian man using it naturally, with full packaging and colour fidelity to the reference and nothing from the generic Ayurveda cliché list.`;

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
  const systemPrompt = `You are a world-class prompt engineer for premium apothecary and men's grooming still-life photography, working for ${BRAND_LINE}.

${NANO_BANANA_PRO_HANDOFF}

ATTACHED IMAGES:
- Product reference: attached first. Preserve it exactly.
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
${BRAND_PALETTE_RULE}
${PROSE_FORMAT_RULE}

${buildStudioConcept()}

STUDIO REQUIREMENTS:
- No model, no hands, no human body. Product-only.
- Output ratio: 1:1 square, 4096x4096, 4K.
- The complete pack must be fully visible, upright or lying naturally, label facing the camera and readable.
- Use a premium still-life set chosen to flatter the product: black slate, dark walnut, raw concrete, basalt, travertine, charcoal linen, teak, or smoked glass - with at most one or two sculptural raw ingredients.
- Use Canon EOS R5 / Hasselblad-style product photography, 100mm macro lens, ISO 100, focus stacking, calibrated white balance, softbox key, rim light, flags, reflectors, and controlled specular highlights on the glass.
- Preserve every product detail from the uploaded asset: shape, glass tint, cap, pump, label artwork and typography, fill level, and exact proportions. Do not describe or recreate a similar product from words.
- Do not add extra products, fake labels, invented text, or sparkle overlays, and no text unless logo placement is requested.
- Make the image look like a real high-end e-commerce still-life photograph with natural shadows and contact reflections.
${logoInstruction(logoImages, logoMode)}

Generate ONLY the final Nano Banana Pro prompt text as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create one premium 1:1 4K studio product prompt for Nano Banana Pro, built around the specific creative concept above so it is clearly different from previous generations. Use the uploaded product exactly as a locked visual asset - no model, no redesigned pack, no descriptive replacement - and produce a world-class modern apothecary still-life shot.`;

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

  const systemPrompt = `You are the creative director at India's leading premium men's grooming and wellness advertising agency. You are creating a homepage hero banner for ${BRAND_LINE}, for Nano Banana Pro.

${NANO_BANANA_PRO_HANDOFF}

CREATIVE BRIEF:
- Festival/Event/Offer Type: "${festivalOrEvent}"
- Banner Headline: ${bannerHeadline ? `Use exactly "${bannerHeadline}"` : `Create a refined 3-7 word headline that includes or clearly references "${festivalOrEvent}"`}
- Offer Title: "${offerTitle}"
${offerInfo ? `- Offer Details: "${offerInfo}"` : '- Offer Details: none provided; keep the offer design clean and not cluttered.'}
- Model Preference: ${includeModel}
- Output Selection: ${outputFormat}

ATTACHED IMAGES:
${hasRef ? `- ${refCount} product/reference image(s) are attached. Use the exact product assets from these images unchanged. If multiple products are attached, arrange them cohesively without redesigning any pack.` : '- No product image may be attached; show unbranded premium amber or black glass bottles and jars suitable for the campaign, but do not invent a fake brand logo or label text.'}
${hasLogos(logoImages) ? `- ${logoImages.length} logo image(s) are attached. ${logoInstruction(logoImages, logoMode)}` : '- No usable logo image may be attached. Reserve a clean brand area but do not invent a fake logo.'}

${hasRef ? `${PRODUCT_FIDELITY_RULE}\n${REFERENCE_LOCKED_PROMPT_STYLE}\n${PRODUCT_TRANSFER_RULE}\n${MATERIAL_FIDELITY_RULE}` : ''}
${BRAND_PALETTE_RULE}
${REFERENCE_DISCIPLINE_RULE}
${STYLING_RULE}
${PHOTOREALISM_RULE}

${heroFormatInstruction(outputFormat)}

CAMPAIGN ART DIRECTION:
- Make this a complete publish-ready homepage banner, not a plain product photo with empty space.
- Use the festival/event as the mood, expressed through light, restrained props and typography - never through mandalas, temple backdrops, heaps of leaves, or orange gradients.
- Product colours and packaging follow the uploaded reference exactly.
- Text must be rendered inside the image with bold, modern sans-serif typography: headline, offer title, optional offer details, and a premium CTA such as "SHOP NOW" or "EXPLORE THE RANGE".
- The offer badge must look premium, not like a cheap sticker. Use refined spacing, strong contrast, and clean hierarchy.
- Keep all text readable and inside safe zones for the selected ratio. No cropped words, warped letters, or unreadable decorative text.
- Include the logo using the contrast-aware rule above.

${modelInstruction(includeModel, festivalOrEvent)}
${ENVIRONMENT_RULE}

FINAL PROMPT MUST INCLUDE:
1. A clear instruction to attach and use the product/reference images exactly as provided.
2. A clear instruction to generate the selected ratio(s): ${outputFormat}.
3. The exact headline/offer requirements.
4. Product fidelity and packaging/colour fidelity from the uploaded reference.
5. Realism rules for model, product, materials, and environment.
6. Contrast-aware logo placement when logo references are attached.

Generate ONLY the final Nano Banana Pro prompt text as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create the ultimate Ishaputra Botanicals hero banner prompt for Nano Banana Pro. Theme: ${festivalOrEvent}. Headline: ${bannerHeadline || 'AI creates one'}. Offer: ${offerTitle}${offerInfo ? ` - ${offerInfo}` : ''}. Output: ${outputFormat}. Use all attached product/reference images exactly as-is and create a world-class premium men's wellness advertisement with realistic photography, bold modern typography, safe zones, and contrast-aware logo handling.`;

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
  const systemPrompt = `You are an expert AI image prompt engineer for ${BRAND_LINE}.

${NANO_BANANA_PRO_HANDOFF}

CUSTOM REQUEST:
- Image type: ${imageType}
- User requirement: "${customRequirement}"

ATTACHED IMAGES:
${referenceImage ? '- A product/reference image is attached. Use it exactly as provided and preserve the subject/product without redesigning it.' : '- No product/reference image is attached.'}
${hasLogos(logoImages) ? `- Logo reference(s): ${logoImages.length} attached image(s). ${logoInstruction(logoImages, logoMode)}` : '- No usable logo image may be attached. Do not invent a fake logo.'}

${referenceImage ? PRODUCT_FIDELITY_RULE : ''}
${referenceImage ? `${REFERENCE_LOCKED_PROMPT_STYLE}\n${PRODUCT_TRANSFER_RULE}\n${MATERIAL_FIDELITY_RULE}` : ''}
${BRAND_PALETTE_RULE}
${REFERENCE_DISCIPLINE_RULE}
${PHOTOREALISM_RULE}
${ENVIRONMENT_RULE}
${logoInstruction(logoImages, logoMode)}

Rules:
- The user's custom requirement is the creative direction, but product/reference fidelity and photorealism are mandatory.
- Use real camera, real materials, real lighting, believable scale, and premium men's wellness art direction.
- If this is a banner/hero/social post, include safe text areas, readable modern typography, and a premium layout.
- If this is product photography, keep the product as the hero and avoid distracting props.

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
  const systemPrompt = `You are a world-class AI image prompt engineer for Nano Banana Pro. Create a new standalone variation of the existing product + model photoshoot prompt for ${BRAND_LINE}.

ORIGINAL PROMPT:
"""
${originalPrompt}
"""

VARIATION REQUIREMENTS:
- Keep the exact uploaded product unchanged.
- Keep the same premium campaign quality and product fidelity.
- Keep the same product-page usefulness: product large, sharp, label readable, and true to the uploaded asset.
- Change the camera angle, crop, pose, moment, hand placement and composition enough to feel like a genuinely different shot from the same session.
- Re-style the shoot using the fresh creative concept below so the variation looks distinctly different from the original.
- Improve realism and premium art direction wherever the original was weak.
${REALISM_FIRST_ANCHOR}
${PRODUCT_FIDELITY_RULE}
${REFERENCE_LOCKED_PROMPT_STYLE}
${PRODUCT_TRANSFER_RULE}
${MATERIAL_FIDELITY_RULE}
${PRODUCT_PAGE_MODEL_SHOT_RULE}
${MODEL_RULE}
${NATURAL_USE_RULE}
${PRODUCT_VISIBILITY_RULE}
${STYLING_RULE}
${PHOTOREALISM_RULE}
${PROSE_FORMAT_RULE}

${buildModelConcept()}
${logoInstruction(logoImages, logoMode)}

Generate ONLY the complete replacement Nano Banana Pro prompt as flowing prose. Absolutely no JSON, no key-value structure, no markdown, no explanation.`;

  const userMessage = `Create a different angle/pose variation for the uploaded product, restyled around the fresh creative concept above. The product must remain exactly unchanged as a locked visual asset. The model must look hyper-realistic and confident, using the product naturally. Output should still be 1:1 4K world-class realistic website product-page photography.`;

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

Apply the requested change while preserving all product/reference fidelity, locked visual asset instructions, Nano Banana Pro attachment instructions, ratio instructions, realism rules, packaging/colour accuracy from the uploaded reference, product-page suitability, and logo contrast rules. Output the complete updated prompt, not a patch note.

Generate ONLY the refined prompt text. No explanations, no markdown.`;

  return generateWithFallback(systemPrompt);
}
