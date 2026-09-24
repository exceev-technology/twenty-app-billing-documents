import { formatDate, formatMoney, formatPercent, formatQuantity, formatUnitPrice } from './format.ts';
import { undrawable } from './glyphs.ts';
import { PACKS } from './lang/pack.ts';
import { qrBox, qrBytes, qrText } from './qr.ts';
import { classic } from './layouts/classic.ts';
import { compact } from './layouts/compact.ts';
import { letterhead } from './layouts/letterhead.ts';
import { modern } from './layouts/modern.ts';
import { receipt } from './layouts/receipt.ts';
import { countPages, toPdf } from './pdf.ts';
import {
  RenderError,
  type Layout, type PdfDefinition, type Party, type RenderInput, type RenderProblem, type RenderResult, type TemplateKey,
} from './types.ts';

const LAYOUTS: Record<TemplateKey, Layout> = { classic, modern, compact, letterhead, receipt };

/**
 * Pasted text, made drawable without changing what it says: accents composed
 * (e + U+0301 becomes one glyph), Windows line breaks made Unix, tabs made
 * spaces. The QR payload and the logo's bytes are left exactly as given.
 */
function tidy<T>(value: T): T {
  if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ') as T;
  if (Array.isArray(value)) return value.map(tidy) as T;
  if (value instanceof Uint8Array || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, key === 'qr' || key === 'logo' ? inner : tidy(inner)])) as T;
}

/** Every string that would be printed, with the field it came from. */
function printableFields(input: RenderInput): [string, string][] {
  const party = (name: string, who: Party): [string, string][] => [
    [`${name}.name`, who.name],
    [`${name}.legalName`, who.legalName ?? ''],
    [`${name}.legalForm`, who.legalForm ?? ''],
    ...who.addressLines.map((value, index) => [`${name}.addressLines[${index}]`, value] as [string, string]),
    [`${name}.email`, who.email ?? ''],
    [`${name}.phone`, who.phone ?? ''],
    [`${name}.website`, who.website ?? ''],
  ];
  return [
    ['title', input.title ?? ''],
    ['number', input.number ?? ''],
    ['corrects.number', input.corrects?.number ?? ''],
    ['subject', input.subject ?? ''],
    ['notes', input.notes ?? ''],
    ['buyerReference', input.buyerReference ?? ''],
    ...party('seller', input.seller),
    ...party('buyer', input.buyer),
    ...input.identifiers.flatMap((identifier, index): [string, string][] => [
      [`identifiers[${index}].label`, identifier.label],
      [`identifiers[${index}].value`, identifier.value],
    ]),
    ...input.lines.flatMap((line, index): [string, string][] => [
      [`lines[${index}].description`, line.description],
      [`lines[${index}].unit`, line.unit],
      [`lines[${index}].taxLabel`, line.taxLabel],
    ]),
    ...Object.entries(input.taxNames).map(([code, name]) => [`taxNames.${code}`, name] as [string, string]),
    ...input.totals.recap.map((row, index) => [`totals.recap[${index}].component`, row.component ?? ''] as [string, string]),
    ...input.taxNotes.map((note, index) => [`taxNotes[${index}]`, note] as [string, string]),
    ['mentions', input.mentions ?? ''],
    ['brand.footerNote', input.brand.footerNote ?? ''],
    ['brand.paymentDetails', input.brand.paymentDetails ?? ''],
  ];
}

/** Intl throws a RangeError on a malformed tag (fr_FR, ''); the render must refuse it instead. */
function isLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD, and a day that exists: 2026-02-30 is not one. */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateFields(input: RenderInput): [string, string | null | undefined][] {
  return [
    ['issueDate', input.issueDate],
    ['corrects.issueDate', input.corrects?.issueDate],
    ['dueDate', input.dueDate],
    ['validUntil', input.validUntil],
    ...input.lines.flatMap((line, index): [string, string | null | undefined][] => [
      [`lines[${index}].periodStart`, line.periodStart],
      [`lines[${index}].periodEnd`, line.periodEnd],
    ]),
  ];
}

/** The first bytes each image type must start with: a declared type is a claim, the bytes are the proof. */
const SIGNATURES: Record<'image/png' | 'image/jpeg', number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

/**
 * What the locale prints for a number, a price, a percentage and a date. Intl is
 * asked for Western digits, but a locale can still carry a sign Roboto lacks.
 */
const localeSamples = (input: RenderInput): string =>
  [
    formatMoney(-1_234_567_890, input.currencyCode, input.locale), formatUnitPrice(12_500, input.currencyCode, input.locale),
    formatQuantity(1234.5, input.locale), formatPercent(12.5, input.locale), formatDate('2026-12-31', input.locale),
  ].join('');

/** The problems that stop a render. Nothing is drawn while any remains. */
export function checkRender(raw: RenderInput): RenderProblem[] {
  const input = tidy(raw);
  const problems: RenderProblem[] = [];
  if (!LAYOUTS[input.template]) problems.push({ code: 'UNKNOWN_TEMPLATE', field: 'template', value: String(input.template) });
  if (!PACKS[input.language]) problems.push({ code: 'UNKNOWN_LANGUAGE', field: 'language', value: String(input.language) });
  if (!isLocale(input.locale)) problems.push({ code: 'INVALID_LOCALE', field: 'locale', value: String(input.locale) });
  // Intl throws on a malformed code; the Engine refuses one too, but this field is the renderer's own.
  const currencyIsCode = /^[A-Z]{3}$/.test(input.currencyCode);
  if (!currencyIsCode) problems.push({ code: 'INVALID_CURRENCY', field: 'currencyCode', value: String(input.currencyCode) });
  for (const [field, value] of dateFields(input)) {
    if (value !== null && value !== undefined && !isCalendarDate(value)) problems.push({ code: 'INVALID_DATE', field, value: String(value) });
  }
  const logo = input.brand.logo;
  if (logo && logo.type !== 'image/png' && logo.type !== 'image/jpeg') {
    problems.push({ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo', value: String(logo.type) });
  } else if (logo && !SIGNATURES[logo.type].every((byte, index) => logo.bytes[index] === byte)) {
    problems.push({ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo.bytes', value: logo.type });
  }
  // The recap would otherwise print the code, which is a record id.
  for (const code of new Set(input.totals.recap.map((row) => row.taxCode))) {
    if (!input.taxNames[code]?.trim()) problems.push({ code: 'MISSING_TAX_NAME', field: 'taxNames', value: code });
  }
  for (const [field, value] of printableFields(input)) {
    const offending = undrawable(value);
    if (offending) problems.push({ code: 'UNSUPPORTED_SCRIPT', field, value: offending });
  }
  if (isLocale(input.locale) && currencyIsCode) {
    const offending = undrawable(localeSamples(input));
    if (offending) problems.push({ code: 'UNSUPPORTED_SCRIPT', field: 'locale', value: offending });
  }
  const qr = input.qr ? qrText(input.qr) : undefined;
  if (qr === null) problems.push({ code: 'QR_BASE_URL_MISSING', field: 'qr.baseUrl' });
  else if (qr !== undefined && LAYOUTS[input.template] && !qrBox(qr, input.template)) {
    problems.push({ code: 'QR_PAYLOAD_TOO_LONG', field: 'qr.payload', value: `${qrBytes(qr)} bytes` });
  }
  return problems;
}

/** The page's definition. Exported for the tests; bytes come from renderDocument. */
export function definitionFor(input: RenderInput): PdfDefinition {
  const problems = checkRender(input);
  if (problems.length > 0) throw new RenderError(problems);
  return LAYOUTS[input.template](tidy(input), PACKS[input.language]);
}

/** A document, rendered. Asynchronous because pdfmake delivers its bytes that way. */
export async function renderDocument(input: RenderInput): Promise<RenderResult> {
  const definition = definitionFor(input);
  const bytes = await toPdf(definition, input.issueDate);
  return { bytes, pages: countPages(bytes) };
}
