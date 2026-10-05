// Writes render/glyphs.ts: the characters every Roboto face pdfmake embeds can
// draw, read from the fonts' own character maps, and the same for Tajawal, the
// Arabic face in assets/fonts/tajawal, with the widths of its letters in each
// form the shaper gives them. Also writes render/fonts/tajawal.ts, the Tajawal
// faces as base64 for pdfmake. A hand-written list drifts from the font; this
// one cannot. Run: npm run glyphs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const FACES = ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf'];

function faces() {
  const fontkit = require('fontkit');
  const vfs = require('pdfmake/build/vfs_fonts.js');
  return FACES.map((face) => fontkit.create(Buffer.from(vfs[face], 'base64')));
}

function common(fonts) {
  const sets = fonts.map((font) => new Set(font.characterSet));
  return [...sets[0]].filter((point) => point >= 0x20 && sets.every((set) => set.has(point))).sort((a, b) => a - b);
}

/** Inclusive [first, last] code point ranges that all four faces draw. */
export function robotoRanges() {
  const ranges = [];
  for (const point of common(faces())) {
    const last = ranges.at(-1);
    if (last && point === last[1] + 1) last[1] = point;
    else ranges.push([point, point]);
  }
  return ranges;
}

/** Each drawable code point's advance, in thousandths of an em: the widest of the four faces, rounded up. */
export function robotoAdvances() {
  const fonts = faces();
  return common(fonts).map((point) =>
    Math.max(...fonts.map((font) => Math.ceil((font.glyphForCodePoint(point).advanceWidth * 1000) / font.unitsPerEm))));
}

/** The Tajawal faces the renderer embeds: regular and bold (Tajawal has no italic). */
const TAJAWAL_FACES = ['Tajawal-Regular.ttf', 'Tajawal-Bold.ttf'];
const tajawalFile = (face) => fileURLToPath(new URL(`../assets/fonts/tajawal/${face}`, import.meta.url));

function tajawalFaces() {
  const fontkit = require('fontkit');
  return TAJAWAL_FACES.map((face) => fontkit.create(readFileSync(tajawalFile(face))));
}

/** A combining mark sits on its letter: it adds no width. */
const MARK = /\p{Mn}/u;
const TATWEEL = 0x0640;

const ranges = (points) => {
  const found = [];
  for (const point of points) {
    const last = found.at(-1);
    if (last && point === last[1] + 1) last[1] = point;
    else found.push([point, point]);
  }
  return found;
};

/** Inclusive [first, last] code point ranges that both Tajawal faces draw. */
export function tajawalRanges() {
  return ranges(common(tajawalFaces()));
}

/** Each code point both faces draw, its advance in thousandths of an em: the wider face's, rounded up; a mark is 0. */
export function tajawalAdvances() {
  const fonts = tajawalFaces();
  return common(fonts).map((point) => (MARK.test(String.fromCodePoint(point))
    ? 0
    : Math.max(...fonts.map((font) => Math.ceil((font.glyphForCodePoint(point).advanceWidth * 1000) / font.unitsPerEm)))));
}

/** The width of `text` as the font shapes it, in thousandths of an em. */
const shaped = (font, text) => (font.layout(text).positions.reduce((sum, position) => sum + position.xAdvance, 0) * 1000) / font.unitsPerEm;

/** The Arabic letters both faces draw (the marks and digits take no forms). */
const letters = (fonts) => common(fonts).filter((point) => point >= 0x0621 && point <= 0x06ff && /\p{L}/u.test(String.fromCodePoint(point)));

/**
 * Each Arabic letter's advance in its four forms [isolated, final, initial, medial], as the font's
 * own shaper sets it: the letter alone, after a tatweel, before one and between two, less the
 * tatweels. The wider face's, rounded up.
 */
export function tajawalForms() {
  const fonts = tajawalFaces();
  const tatweel = String.fromCodePoint(TATWEEL);
  return letters(fonts).map((point) => {
    const letter = String.fromCodePoint(point);
    const forms = [letter, tatweel + letter, letter + tatweel, tatweel + letter + tatweel].map((text, form) =>
      Math.max(...fonts.map((font) => Math.ceil(shaped(font, text) - [0, 1, 1, 2][form] * shaped(font, tatweel)))));
    return [point, forms];
  });
}

/** The letters that join to the letter after them: the shaper gives them another glyph before a tatweel. */
export function tajawalDual() {
  const [font] = tajawalFaces();
  const tatweel = String.fromCodePoint(TATWEEL);
  const glyph = (text, point) => font.layout(text).glyphs.find((one) => one.codePoints.includes(point)).id;
  return letters([font]).filter((point) => glyph(String.fromCodePoint(point), point) !== glyph(String.fromCodePoint(point) + tatweel, point));
}

const hex = (point) => `0x${point.toString(16).padStart(4, '0')}`;
const table = (items, perRow, format) => {
  const rows = [];
  for (let index = 0; index < items.length; index += perRow) rows.push(`  ${items.slice(index, index + perRow).map(format).join(', ')},`);
  return rows.join('\n');
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const robotoTable = robotoRanges();
  const tajawalTable = tajawalRanges();
  const source = `// Generated by scripts/glyphs.mjs from the Roboto faces pdfmake embeds and the Tajawal faces in
// assets/fonts/tajawal: run npm run glyphs, never edit by hand. test/render/glyphs.test.ts fails
// when these tables and the fonts disagree.

/** The code points every embedded Roboto face draws, as inclusive ranges. */
export const RANGES: readonly (readonly [number, number])[] = [
${table(robotoTable, 6, ([first, last]) => `[${hex(first)}, ${hex(last)}]`)}
];

function covered(point: number): boolean {
  let low = 0;
  let high = RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last] = RANGES[middle]!;
    if (point < first) high = middle - 1;
    else if (point > last) low = middle + 1;
    else return true;
  }
  return false;
}

// Arabic text prints in Tajawal (render/fonts/tajawal.ts); a run without Arabic prints in Roboto,
// or in Tajawal on an Arabic page when Tajawal draws it (render/pdf.ts forScript).

/** The Unicode Arabic blocks: what makes a run Arabic, whether or not Tajawal draws every character of it. */
const ARABIC_BLOCKS: readonly (readonly [number, number])[] = [
  [0x0600, 0x06ff], [0x0750, 0x077f], [0x08a0, 0x08ff], [0xfb50, 0xfdff], [0xfe70, 0xfeff],
];

/** The code points both Tajawal faces draw, as inclusive ranges. */
export const TAJAWAL_RANGES: readonly (readonly [number, number])[] = [
${table(tajawalTable, 6, ([first, last]) => `[${hex(first)}, ${hex(last)}]`)}
];

const within = (point: number, ranges: readonly (readonly [number, number])[]): boolean => {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last] = ranges[middle]!;
    if (point < first) high = middle - 1;
    else if (point > last) low = middle + 1;
    else return true;
  }
  return false;
};

export function isArabic(point: number): boolean {
  return within(point, ARABIC_BLOCKS);
}

/** True when \`text\` holds at least one Arabic character. */
export function hasArabic(text: string): boolean {
  for (const character of text) if (isArabic(character.codePointAt(0)!)) return true;
  return false;
}

/** True when Tajawal, the face of every Arabic run, draws this code point. */
export function inTajawal(point: number): boolean {
  return within(point, TAJAWAL_RANGES);
}

/** Each Tajawal code point's advance in thousandths of an em, in TAJAWAL_RANGES order: the wider face's; a mark is 0. */
export const TAJAWAL_ADVANCES: readonly number[] = [
${table(tajawalAdvances(), 20, String)}
];

/** Each Arabic letter's advance in its forms [isolated, final, initial, medial], as Tajawal's shaper sets it. */
export const FORMS: ReadonlyMap<number, readonly number[]> = new Map([
${table(tajawalForms(), 4, ([point, forms]) => `[${hex(point)}, [${forms.join(', ')}]]`)}
]);

/** The letters that join to the letter after them. */
export const DUAL: ReadonlySet<number> = new Set([
${table(tajawalDual(), 12, hex)}
]);

const TAJAWAL_STARTS: number[] = [];
for (let index = 0, total = 0; index < TAJAWAL_RANGES.length; index++) {
  TAJAWAL_STARTS.push(total);
  total += TAJAWAL_RANGES[index]![1] - TAJAWAL_RANGES[index]![0] + 1;
}

function tajawalAdvance(point: number): number {
  let low = 0;
  let high = TAJAWAL_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last] = TAJAWAL_RANGES[middle]!;
    if (point < first) high = middle - 1;
    else if (point > last) low = middle + 1;
    else return TAJAWAL_ADVANCES[TAJAWAL_STARTS[middle]! + point - first]!;
  }
  return 1000;
}

/** The tatweel stretches a join: it joins on both sides. */
const TATWEEL = ${hex(TATWEEL)};

/**
 * A run's width in Tajawal, in thousandths of an em: each letter in the form its neighbours give it,
 * as the shaper picks it. A mark sits on its letter and does not break the join. Ligatures (lam-alef)
 * and kerning are ignored, so the result errs wide.
 */
function tajawalWidth(text: string): number {
  const points = [...text].map((character) => character.codePointAt(0)!);
  const isMark = (point: number): boolean => isArabic(point) && tajawalAdvance(point) === 0;
  const neighbour = (from: number, step: number): number | undefined => {
    for (let at = from + step; at >= 0 && at < points.length; at += step) if (!isMark(points[at]!)) return points[at];
    return undefined;
  };
  const joinsNext = (point: number): boolean => DUAL.has(point) || point === TATWEEL;
  let total = 0;
  points.forEach((point, index) => {
    const forms = FORMS.get(point);
    if (!forms) {
      total += tajawalAdvance(point);
      return;
    }
    const previous = neighbour(index, -1);
    const next = neighbour(index, 1);
    const fromPrevious = previous !== undefined && joinsNext(previous);
    const toNext = DUAL.has(point) && next !== undefined && (FORMS.has(next) || next === TATWEEL);
    total += forms[fromPrevious ? (toNext ? 3 : 1) : toNext ? 2 : 0]!;
  });
  return total;
}

/**
 * The characters of \`text\` no embedded face can draw, in order; a line break is layout, not a glyph.
 * A run with Arabic in it prints in Tajawal, so every character of it must be one Tajawal draws.
 */
export function undrawable(text: string): string {
  const drawable = hasArabic(text) ? inTajawal : covered;
  let found = '';
  for (const character of text) {
    if (character !== '\\n' && !drawable(character.codePointAt(0)!)) found += character;
  }
  return found;
}

/** Each drawable code point's advance in thousandths of an em, in RANGES order: the widest face's. */
export const ADVANCES: readonly number[] = [
${table(robotoAdvances(), 20, String)}
];

/** Where each range's advances start in ADVANCES. */
const STARTS: number[] = [];
for (let index = 0, total = 0; index < RANGES.length; index++) {
  STARTS.push(total);
  total += RANGES[index]![1] - RANGES[index]![0] + 1;
}

function advance(point: number): number {
  let low = 0;
  let high = RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last] = RANGES[middle]!;
    if (point < first) high = middle - 1;
    else if (point > last) low = middle + 1;
    else return ADVANCES[STARTS[middle]! + point - first]!;
  }
  return 1000;
}

/**
 * How wide \`text\` sets at \`size\` points, ignoring kerning: never narrower than any face draws it.
 * A run with Arabic in it prints in Tajawal (render/pdf.ts), so it is measured in Tajawal.
 */
export function textWidth(text: string, size: number): number {
  if (hasArabic(text)) return (tajawalWidth(text) * size) / 1000;
  let thousandths = 0;
  for (const character of text) thousandths += advance(character.codePointAt(0)!);
  return (thousandths * size) / 1000;
}
`;
  const target = fileURLToPath(new URL('../render/glyphs.ts', import.meta.url));
  writeFileSync(target, source);
  const [regular, bold] = TAJAWAL_FACES.map((face) => readFileSync(tajawalFile(face)).toString('base64'));
  const fonts = fileURLToPath(new URL('../render/fonts/tajawal.ts', import.meta.url));
  writeFileSync(fonts, `// Generated by scripts/glyphs.mjs from assets/fonts/tajawal (Tajawal, SIL Open Font License 1.1,
// see assets/fonts/tajawal/OFL.txt): run npm run glyphs, never edit by hand. Base64, like
// pdfmake's Roboto, so a bundled logic function needs no disk.
export const TAJAWAL_REGULAR = '${regular}';
export const TAJAWAL_BOLD = '${bold}';
`);
  console.log(`wrote ${target}: ${robotoTable.length} Roboto ranges, ${tajawalTable.length} Tajawal ranges; wrote ${fonts}`);
}
