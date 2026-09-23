// Generates the sample product photos with Pollinations (free, no key).
// Run from the project root: node client-assets/generated/generate-products.mjs
import fs from 'node:fs/promises';

const STYLE =
  'premium studio product photograph, luxury mens ayurvedic wellness brand, matte black packaging with a thin rust copper accent band, ' +
  'minimal blank label with no text and no letters, standing on a dark charcoal stone slab, soft directional side light, deep shadows, ' +
  'subtle film grain, one small dried botanical element beside it, modern botanical science aesthetic, clean composition, high detail, 85mm';

export const ITEMS = [
  ['shilajit-resin', 'a small matte black glass jar of dark shilajit resin with the lid off beside it, a tiny copper spoon'],
  ['ashwagandha-capsules', 'a matte black supplement bottle with capsules spilling beside it, a few ashwagandha roots'],
  ['bhringraj-hair-oil', 'a tall matte black glass bottle of hair oil with a copper dropper cap, a drop of golden oil'],
  ['rosemary-scalp-serum', 'a slim matte black serum bottle with a pipette, a single rosemary sprig'],
  ['charcoal-face-wash', 'a matte black squeeze tube of face wash lying on its side, a smear of black charcoal gel'],
  ['saffron-face-serum', 'a small matte black dropper bottle of face serum, a few saffron threads'],
  ['vetiver-body-wash', 'a matte black pump bottle of body wash, a bundle of dried vetiver roots'],
  ['cedarwood-beard-oil', 'a small matte black beard oil bottle with a copper dropper, a wooden beard comb'],
  ['triphala-churna', 'a matte black tin container of herbal powder with the lid open showing brown powder, a copper scoop'],
  ['tulsi-ginger-tea', 'a matte black tea tin with loose herbal tea leaves and a slice of dried ginger, a black ceramic cup'],
];

const OUT = 'client-assets/generated/products';
for (const [i, [slug, subject]] of ITEMS.entries()) {
  const file = `${OUT}/${slug}.jpg`;
  try { await fs.access(file); console.log('skip', slug); continue; } catch {}
  const prompt = encodeURIComponent(`${subject}, ${STYLE}`);
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true&seed=${4100 + i}&model=flux`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const resp = await fetch(url);
    if (resp.ok && (resp.headers.get('content-type') || '').startsWith('image/')) {
      await fs.writeFile(file, Buffer.from(await resp.arrayBuffer()));
      console.log('saved', slug);
      break;
    }
    console.log(`retry ${slug} (HTTP ${resp.status})`);
    await new Promise((r) => setTimeout(r, 8000 * attempt));
  }
  await new Promise((r) => setTimeout(r, 4000));
}
