/**
 * Build every logo/icon file the site uses from the client's transparent logo.
 *
 *   node scripts/build-logo-assets.mjs
 *
 * Client-specific: the crop boxes below are measured on
 * client-assets/logo-transparent.png (1975 x 796). For a new client, measure
 * their logo (the wordmark rows, the tagline rows, the monogram columns) and
 * update LOGO, CROPS and the colours; everything else stays.
 *
 * Outputs (see "Logo and image files" in CLAUDE.md):
 *   public/black_logo.png   wordmark, deep bronze - light backgrounds
 *   public/white_logo.png   wordmark, original    - dark backgrounds
 *   public/logo-new.png     full logo + tagline, deep bronze - invoice PDF, white paper
 *   src/assets/dark.png     full logo + tagline, original - auth pages
 *   public/loading_black.png / loading_white.png   monogram for the loading screen
 *   public/favicon.png, public/favicon.ico, public/icon-192.png, public/apple-touch-icon.png
 *   public/og-image.jpg     1200 x 630 link-preview card
 *   src/assets/login-cart.png, shopping-bags.png  empty-cart illustration
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const LOGO = 'client-assets/logo-transparent.png';
const CROPS = {
  wordmark: { left: 85, top: 95, width: 1825, height: 534 }, // ISHAPUTRA without the tagline
  full: { left: 85, top: 95, width: 1825, height: 592 }, // wordmark + tagline
  monogram: { left: 85, top: 95, width: 325, height: 534 }, // the I/S with the face
};
const DEEPEN = { brightness: 0.72, saturation: 1.1 }; // for light backgrounds
const CHARCOAL = '#1B1A18';
const CREAM = '#F6F2EB';

const crop = (box) => sharp(LOGO).extract(box);
const deep = (box) => crop(box).modulate(DEEPEN);

/** Fit a transparent image into a square canvas with padding. */
async function square(input, size, pad, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  const inner = await sharp(input).resize(size - pad * 2, size - pad * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: inner, gravity: 'center' }]).png().toBuffer();
}

/** ICO container holding PNG images (supported by every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

// Wordmarks (header, footer, cart, admin): 900px wide for sharp retina rendering.
await deep(CROPS.wordmark).resize(900).png({ compressionLevel: 9 }).toFile('public/black_logo.png');
await crop(CROPS.wordmark).resize(900).png({ compressionLevel: 9 }).toFile('public/white_logo.png');

// Full logos with tagline.
await deep(CROPS.full).resize(900).png({ compressionLevel: 9 }).toFile('public/logo-new.png');
await crop(CROPS.full).resize(1000).png({ compressionLevel: 9 }).toFile('src/assets/dark.png');

// Loading screen monogram (portrait, like the files it replaces).
await deep(CROPS.monogram).resize({ height: 500 }).png({ compressionLevel: 9 }).toFile('public/loading_black.png');
await crop(CROPS.monogram).resize({ height: 500 }).png({ compressionLevel: 9 }).toFile('public/loading_white.png');

// Favicons: the monogram alone. Deep bronze reads on light and dark tab bars alike.
const mono = await deep(CROPS.monogram).png().toBuffer();
const monoBright = await crop(CROPS.monogram).png().toBuffer();
await writeFile('public/favicon.png', await square(mono, 256, 12));
const icoPngs = [];
for (const size of [16, 32, 48]) icoPngs.push({ size, data: await square(mono, size, size >= 32 ? 2 : 1) });
await writeFile('public/favicon.ico', ico(icoPngs));

// App / push icons: bright monogram on charcoal.
const charcoalBg = { r: 0x1b, g: 0x1a, b: 0x18, alpha: 1 };
await writeFile('public/icon-192.png', await square(monoBright, 192, 26, charcoalBg));
await writeFile('public/apple-touch-icon.png', await square(monoBright, 180, 24, charcoalBg));

// Link-preview card: full logo on charcoal.
const fullBright = await crop(CROPS.full).resize(820).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: CHARCOAL } })
  .composite([{ input: fullBright, gravity: 'center' }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile('public/og-image.jpg');

// Empty-cart illustration: two paper bags (charcoal and cream) with copper handles and the monogram.
const bagSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="319" viewBox="0 0 320 319">
  <g fill="none" stroke-width="7" stroke-linecap="round">
    <path d="M78 96 C78 40 150 40 150 96" stroke="#A4532C"/>
    <path d="M186 150 C186 106 246 106 246 150" stroke="#C97542"/>
  </g>
  <path d="M40 92 H190 L200 292 H30 Z" fill="${CHARCOAL}"/>
  <path d="M40 92 H190 L193 118 H37 Z" fill="#2A2825"/>
  <path d="M160 146 H274 L284 300 H150 Z" fill="${CREAM}" stroke="#D9CFBF" stroke-width="2"/>
</svg>`);
const monoOnBag = await sharp(monoBright).resize({ height: 110 }).png().toBuffer();
const monoOnCream = await sharp(mono).resize({ height: 84 }).png().toBuffer();
await sharp(bagSvg)
  .composite([
    { input: monoOnBag, left: 82, top: 150 },
    { input: monoOnCream, left: 192, top: 190 },
  ])
  .png({ compressionLevel: 9 })
  .toFile('src/assets/login-cart.png');
// Same illustration for the empty-cart / empty-orders states.
await sharp('src/assets/login-cart.png').toFile('src/assets/shopping-bags.png');

console.log('Logo assets written.');
