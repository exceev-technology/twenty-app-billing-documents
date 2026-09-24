/**
 * The only module that knows pdfmake. Everything else builds a plain
 * definition object and hands it here.
 *
 * The fonts come from pdfmake's own Roboto container, a JavaScript module of
 * base64 data, and are written into pdfmake's in-memory file system. Nothing
 * is read from disk at import time, so a bundled logic function still renders.
 */
import pdfMake from 'pdfmake';
import fontContainer from 'pdfmake/build/fonts/Roboto.js';
import type { PdfDefinition } from './types.ts';

export type { PdfDefinition };

type FontEntry = string | { data: string; encoding?: string };

let ready = false;

/** Registers Roboto once, and refuses pdfmake any access to the network or the disk. */
function prepare(): void {
  if (ready) return;
  const container = fontContainer as { vfs: Record<string, FontEntry>; fonts: Record<string, unknown> };
  for (const [name, entry] of Object.entries(container.vfs)) {
    const data = typeof entry === 'string' ? entry : entry.data;
    const encoding = typeof entry === 'string' ? 'base64' : entry.encoding ?? 'base64';
    pdfMake.virtualfs.writeFileSync(name, data, encoding);
  }
  pdfMake.addFonts(container.fonts);
  // A document only ever draws what we pass it: no remote images, no local files.
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setLocalAccessPolicy(() => false);
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

/** Renders a definition to bytes, with every date pinned to the issue date. */
export async function toPdf(definition: PdfDefinition, issueDate: string): Promise<Uint8Array> {
  prepare();
  const buffer: Uint8Array = await pdfMake.createPdf(definition).getBuffer();
  return pinIdentifier(pinDates(new Uint8Array(buffer), issueDate));
}

/** How many pages the file has. `/Type /Pages` is the tree, not a page. */
export function countPages(bytes: Uint8Array): number {
  return (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}
