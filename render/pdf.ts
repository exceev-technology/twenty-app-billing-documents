/**
 * The only module that knows pdfmake. Everything else builds a plain
 * definition object and hands it here.
 *
 * pdfmake is imported as its prebuilt bundle, with Roboto as a module of base64
 * data, and Tajawal (Arabic) likewise (render/fonts/tajawal.ts). The package's
 * Node entry reads __dirname when it renders, which a bundled logic function does
 * not define (test/render/bundle.test.ts).
 */
import pdfMake from 'pdfmake/build/pdfmake.js';
import vfs from 'pdfmake/build/vfs_fonts.js';
import { TAJAWAL_BOLD, TAJAWAL_REGULAR } from './fonts/tajawal.ts';
import { hasArabic, inTajawal } from './glyphs.ts';
import type { PdfDefinition } from './types.ts';

export type { PdfDefinition };

let ready = false;

/** Registers the fonts once, and refuses pdfmake any access to the network or the disk. */
function prepare(): void {
  if (ready) return;
  // The bundle's default fonts are Roboto; the files come from memory.
  pdfMake.addVirtualFileSystem({ ...vfs, 'Tajawal-Regular.ttf': TAJAWAL_REGULAR, 'Tajawal-Bold.ttf': TAJAWAL_BOLD });
  // Tajawal draws Arabic and Latin; forScript() decides which runs print in it. It has no italic face.
  pdfMake.addFonts({
    Tajawal: { normal: 'Tajawal-Regular.ttf', bold: 'Tajawal-Bold.ttf', italics: 'Tajawal-Regular.ttf', bolditalics: 'Tajawal-Bold.ttf' },
  });
  // A document only ever draws what we pass it: no remote images, no local files.
  // The bundle has no setter for the local policy, but reads this property.
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.localAccessPolicy = () => false;
  ready = true;
}

// PDFKit writes dates as D:YYYYMMDDHHmmss followed by Z. Pinning them keeps two
// renders byte for byte identical; the replacement must be the same length, or
// every cross-reference offset in the file moves.
const PDF_DATE = /D:\d{14}(?:Z|[+-]\d{2}'\d{2}')?/g;

function pinDates(bytes: Uint8Array, issueDate: string): Uint8Array {
  const stamp = `D:${issueDate.replace(/-/g, '')}000000Z`;
  const text = Buffer.from(bytes).toString('latin1');
  for (const found of text.match(PDF_DATE) ?? []) {
    if (found.length !== stamp.length) throw new Error(`A PDF date has an unexpected format: ${found}`);
  }
  return new Uint8Array(Buffer.from(text.replace(PDF_DATE, stamp), 'latin1'));
}

// PDFKit gives every file a random identifier, which would make two renders of
// the same document differ. The identifier is replaced by one derived from the
// file's own content: still unique per document, and the same every time.
const PDF_ID = /\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/g;
const ZEROED = `/ID [<${'0'.repeat(32)}> <${'0'.repeat(32)}>]`;

function fingerprint(text: string, seed: bigint): string {
  const PRIME = 1099511628211n;
  const MASK = (1n << 64n) - 1n;
  let hash = seed;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash ^ BigInt(text.charCodeAt(index) & 0xff)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

function pinIdentifier(bytes: Uint8Array): Uint8Array {
  const zeroed = Buffer.from(bytes).toString('latin1').replace(PDF_ID, ZEROED);
  const identifier = `${fingerprint(zeroed, 14695981039346656037n)}${fingerprint(zeroed, 1469598103934665603n)}`;
  const pinned = zeroed.replace(PDF_ID, `/ID [<${identifier}> <${identifier}>]`);
  return new Uint8Array(Buffer.from(pinned, 'latin1'));
}

// pdfmake 0.3.11 lays the words of a line out left to right. It shapes and orders the letters of
// each Arabic word, but a right-to-left sentence comes out with its words reversed (word positions
// measured with pdftotext -bbox). So a string
// that holds Arabic is handed over in visual order: its words reversed, while a run of consecutive
// left-to-right words (an invoice number, a Latin name, an amount) keeps its own order. A no-break
// space (Intl puts one between an amount and its sign) separates words too. Spaces at either end
// stay where they are: render/rtl.ts decides which side of a run they belong on.
// Each space between words is a run of its own: the shaper moves the space that ends an Arabic word
// to the word's left, so a space inside the word's run leaves the last pair touching and the others
// doubled (measured at 14 pt: gaps of 6.7, 6.7 and 3.4 pt with double spaces; 3.4 each with separate runs).
// blocks.ts breaks lines itself, so a wrapped Arabic text keeps its reading order (render/rtl.ts).
const GAP = /[  ]+/;

/** A line in visual order, as runs: the word groups, and a separate run for each space between them. */
export function visualRuns(text: string): string[] {
  if (!hasArabic(text)) return [text];
  const lead = /^[  ]*/.exec(text)![0];
  const trail = /[  ]*$/.exec(text)![0];
  const core = text.slice(lead.length, text.length - trail.length);
  const groups: { rtl: boolean; words: string[] }[] = [];
  for (const word of core.split(GAP)) {
    const rtl = hasArabic(word);
    const last = groups.at(-1);
    if (!rtl && last && !last.rtl) last.words.push(word);
    else groups.push({ rtl, words: [word] });
  }
  const runs = groups.reverse().flatMap((group, index) => (index === 0 ? [group.words.join(' ')] : [' ', group.words.join(' ')]));
  return [...(lead ? [lead] : []), ...runs, ...(trail ? [trail] : [])];
}

/** The same line as one string, for reading and tests. */
export const visualOrder = (text: string): string => visualRuns(text).join('');

/** A text with Arabic, line by line, as visual-order runs; a run that starts a new line starts with its break. */
function arabicRuns(text: string): string[] {
  return text.split('\n').flatMap((line, index) => {
    const runs = visualRuns(line);
    return index === 0 ? runs : [`\n${runs[0] ?? ''}`, ...runs.slice(1)];
  });
}

type Node = Record<string, unknown>;
const isPlain = (value: unknown): value is Node =>
  !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/**
 * The font a run needs, or none when the page's default draws it. An Arabic run is always Tajawal.
 * On an Arabic page (render/rtl.ts sets Tajawal as the default, so Latin and Arabic share one
 * baseline), a Latin run with a letter Tajawal lacks falls back to Roboto.
 */
function fontFor(text: string, tajawalPage: boolean): string | undefined {
  if (hasArabic(text)) return 'Tajawal';
  if (tajawalPage && [...text].some((character) => character !== '\n' && !inTajawal(character.codePointAt(0)!))) return 'Roboto';
  return undefined;
}

function toScript(value: unknown, tajawalPage: boolean): unknown {
  if (Array.isArray(value)) return value.map((child) => toScript(child, tajawalPage));
  // Plain objects only: a typed array (a logo's bytes) or a class instance passes through untouched.
  if (!isPlain(value)) return value;
  /** A run inside a text array: a string that needs another font becomes a run of its own. */
  const run = (inner: unknown): unknown => {
    if (typeof inner !== 'string') return toScript(inner, tajawalPage);
    const font = fontFor(inner, tajawalPage);
    if (!font) return inner;
    return { text: font === 'Tajawal' ? arabicRuns(inner) : inner, font };
  };
  const out: Node = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'text' && Array.isArray(inner)) out[key] = inner.map(run);
    else if (key === 'text') out[key] = inner;
    // The footer and the header are drawn per page: their runs need the same treatment.
    else if ((key === 'footer' || key === 'header') && typeof inner === 'function') {
      out[key] = (...args: unknown[]) => toScript((inner as (...a: unknown[]) => unknown)(...args), tajawalPage);
    } else out[key] = toScript(inner, tajawalPage);
  }
  if (typeof value.text === 'string') {
    const font = fontFor(value.text, tajawalPage);
    if (font) out.font = font;
    if (font === 'Tajawal') out.text = arabicRuns(value.text);
  }
  return out;
}

/** Every run that holds Arabic prints in Tajawal, in visual order; a document without Arabic is unchanged. */
export function forScript(definition: PdfDefinition): PdfDefinition {
  // The footer is a function, so JSON skips it; an Arabic footer only comes with an Arabic page.
  if (!hasArabic(JSON.stringify(definition))) return definition;
  const tajawalPage = (definition.defaultStyle as Node | undefined)?.font === 'Tajawal';
  return toScript(definition, tajawalPage) as PdfDefinition;
}

/** Renders a definition to bytes, with every date pinned to the issue date. */
export async function toPdf(definition: PdfDefinition, issueDate: string): Promise<Uint8Array> {
  prepare();
  const buffer: Uint8Array = await pdfMake.createPdf(forScript(definition)).getBuffer();
  return pinIdentifier(pinDates(new Uint8Array(buffer), issueDate));
}

/** How many pages the file has. `/Type /Pages` is the tree, not a page. */
export function countPages(bytes: Uint8Array): number {
  return (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}
