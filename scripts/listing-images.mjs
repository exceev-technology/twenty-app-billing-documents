// Draws the images of the marketplace listing from sources in this repository:
//
//   assets/logo.svg           -> public/logo.png            512 x 512
//   docs/templates/*.pdf      -> public/gallery/layouts.png the five PDF layouts side by side
//
// The PNGs are committed, so CI never runs this. It needs two programs that are
// not npm packages: rsvg-convert (librsvg) and pdftoppm (poppler), both in
// Homebrew: `brew install librsvg poppler`. The layouts come from
// `npm run render:samples`, which writes docs/templates/*.pdf from made-up
// data: run it first. Run: npm run listing:images
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = (...parts) => join(root, ...parts);

/** The layouts, in the order docs/templates.md lists them, with their page width in points. */
const LAYOUTS = [
  { name: 'classic', note: 'most businesses', width: 595.28 },
  { name: 'modern', note: 'agencies and studios', width: 595.28 },
  { name: 'compact', note: 'long itemised invoices', width: 595.28 },
  { name: 'letterhead', note: 'pre-printed stationery', width: 595.28 },
  { name: 'receipt', note: 'retail, 80 mm roll', width: 226.77 },
];

// The marketplace shows a gallery image in an 8:5 frame, so the picture is drawn on a
// 1600 x 1000 canvas and written at twice that size, 3200 x 2000 (test/application.test.ts
// holds every gallery image to 8:5). The pages' width is what limits their size.
const CANVAS = { width: 1600, height: 1000, scale: 2 };
const PAGE_A4 = { width: 318, height: 450 };
const GAP = 24;
// The title block above the pages and the captions under them, centred in the canvas.
const TITLE_Y = 190;
const TOP = 282;

/** Runs a program; what goes wrong is thrown, so that the caller's `finally` still runs (process.exit would skip it). */
function run(program, args) {
  try {
    return execFileSync(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${program} is not installed. Install it with: brew install ${program === 'pdftoppm' ? 'poppler' : 'librsvg'}`);
    }
    throw new Error(`${program} failed:\n${error.stderr?.toString() ?? error.message}`);
  }
}

const logo = () => {
  mkdirSync(at('public'), { recursive: true });
  run('rsvg-convert', ['-w', '512', '-h', '512', '-f', 'png', '-o', at('public', 'logo.png'), at('assets', 'logo.svg')]);
  console.log('public/logo.png: 512 x 512');
};

const layouts = () => {
  const work = mkdtempSync(join(tmpdir(), 'billing-listing-'));
  try {
    const scale = PAGE_A4.width / 595.28;
    const cards = LAYOUTS.map((layout) => {
      const pdf = at('docs', 'templates', `${layout.name}.pdf`);
      if (!existsSync(pdf)) throw new Error(`${pdf} is missing: run \`npm run render:samples\` first.`);
      run('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', '-singlefile', pdf, join(work, layout.name)]);
      const png = readFileSync(join(work, `${layout.name}.png`));
      return { ...layout, uri: `data:image/png;base64,${png.toString('base64')}`, drawn: layout.width * scale };
    });

    const total = cards.reduce((sum, card) => sum + card.drawn, 0) + GAP * (cards.length - 1);
    let x = (CANVAS.width - total) / 2;
    const pages = cards.map((card) => {
      const height = card.name === 'receipt' ? (512.344 / 226.77) * card.drawn : PAGE_A4.height;
      const out = `
    <g transform="translate(${x.toFixed(1)} ${TOP})">
      <rect x="2" y="6" width="${card.drawn.toFixed(1)}" height="${height.toFixed(1)}" fill="#1f2933" fill-opacity=".22" filter="url(#soft)"/>
      <image href="${card.uri}" width="${card.drawn.toFixed(1)}" height="${height.toFixed(1)}"/>
      <rect width="${card.drawn.toFixed(1)}" height="${height.toFixed(1)}" fill="none" stroke="#d8dde3" stroke-width="1"/>
      <text x="${(card.drawn / 2).toFixed(1)}" y="${(PAGE_A4.height + 44).toFixed(1)}" text-anchor="middle" class="name">${card.name}</text>
      <text x="${(card.drawn / 2).toFixed(1)}" y="${(PAGE_A4.height + 68).toFixed(1)}" text-anchor="middle" class="note">${card.note}</text>
    </g>`;
      x += card.drawn + GAP;
      return out;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
  <defs>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>
    <style>
      .title { font: 700 44px Helvetica, Arial, sans-serif; fill: #1f2933; }
      .sub { font: 400 24px Helvetica, Arial, sans-serif; fill: #52606d; }
      .name { font: 700 22px Helvetica, Arial, sans-serif; fill: #2f6f4e; }
      .note { font: 400 18px Helvetica, Arial, sans-serif; fill: #52606d; }
      .foot { font: 400 16px Helvetica, Arial, sans-serif; fill: #7b8794; }
    </style>
  </defs>
  <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="#f4f6f8"/>
  <text x="80" y="${TITLE_Y}" class="title">Five PDF layouts, one invoice</text>
  <text x="80" y="${TITLE_Y + 40}" class="sub">Pick one for each issuer: the content is the same, only the look changes.</text>${pages.join('')}
  <text x="${CANVAS.width - 80}" y="${CANVAS.height - 48}" text-anchor="end" class="foot">Sample documents from a fictitious company.</text>
</svg>
`;
    const source = join(work, 'layouts.svg');
    writeFileSync(source, svg);
    mkdirSync(at('public', 'gallery'), { recursive: true });
    const width = CANVAS.width * CANVAS.scale;
    const height = CANVAS.height * CANVAS.scale;
    run('rsvg-convert', ['-w', String(width), '-h', String(height), '-f', 'png', '-o', at('public', 'gallery', 'layouts.png'), source]);
    console.log(`public/gallery/layouts.png: ${width} x ${height}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

try {
  logo();
  layouts();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
