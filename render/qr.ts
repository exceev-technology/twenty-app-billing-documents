import type { RenderInput, TemplateKey } from './types.ts';

/** Bytes a QR code holds in byte mode at error correction M, by version 1 to 40 (ISO/IEC 18004). */
const CAPACITY_M = [
  14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666,
  711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331,
];

/** The largest square each layout gives a QR code, in points. */
const ALLOWANCE: Record<TemplateKey, number> = { classic: 140, modern: 140, compact: 140, letterhead: 140, receipt: 190 };

/** pdfmake rounds a module down to whole points, and a 1 pt module (0.35 mm) is too small to scan reliably. */
const SMALLEST_MODULE = 2;

/** About 32 mm, a usual size for a payment QR code: a short payload is not blown up to the whole allowance. */
const TARGET = 90;

/**
 * What the code encodes: the payload, or the base URL with the payload as its
 * query. Null when a URL is asked for without its base.
 */
export function qrText(qr: NonNullable<RenderInput['qr']>): string | null {
  if (qr.mode === 'PAYLOAD') return qr.payload;
  if (!qr.baseUrl) return null;
  return `${qr.baseUrl}${qr.baseUrl.includes('?') ? '&' : '?'}${qr.payload}`;
}

export const qrBytes = (text: string): number => new TextEncoder().encode(text).length;

/**
 * The version and size that encode `text` at error correction M (what the EPC
 * payment QR asks for): about 32 mm across, with modules of at least 2 pt, and
 * no larger than the layout allows; null when it cannot fit legibly. Byte mode
 * is the worst case, so the version always holds the text.
 */
export function qrBox(text: string, template: TemplateKey): { version: number; fit: number; module: number } | null {
  const version = CAPACITY_M.findIndex((capacity) => capacity >= qrBytes(text)) + 1;
  if (version === 0) return null;
  const modules = 17 + 4 * version;
  const module = Math.max(SMALLEST_MODULE, Math.floor(TARGET / modules));
  return module * modules <= ALLOWANCE[template] ? { version, fit: module * modules, module } : null;
}
