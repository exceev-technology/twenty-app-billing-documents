import { PACKS } from './lang/pack.ts';
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

/** What Roboto can draw: Latin, its extensions, the punctuation and currency we emit. */
const DRAWABLE = /^[\u0009\u000a -~ -ɏʰ-˿‐-‧‰-⁞₠-₿™←-⇿−]*$/;

const MAX_QR_CHARACTERS = 300;

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

/** The problems that stop a render. Nothing is drawn while any remains. */
export function checkRender(input: RenderInput): RenderProblem[] {
  const problems: RenderProblem[] = [];
  if (!LAYOUTS[input.template]) problems.push({ code: 'UNKNOWN_TEMPLATE', field: 'template', value: String(input.template) });
  if (!PACKS[input.language]) problems.push({ code: 'UNKNOWN_LANGUAGE', field: 'language', value: String(input.language) });
  const logo = input.brand.logo;
  if (logo && logo.type !== 'image/png' && logo.type !== 'image/jpeg') {
    problems.push({ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo', value: String(logo.type) });
  }
  // The recap would otherwise print the code, which is a record id.
  for (const code of new Set(input.totals.recap.map((row) => row.taxCode))) {
    if (!input.taxNames[code]?.trim()) problems.push({ code: 'MISSING_TAX_NAME', field: 'taxNames', value: code });
  }
  for (const [field, value] of printableFields(input)) {
    if (!DRAWABLE.test(value)) {
      const offending = [...value].filter((character) => !DRAWABLE.test(character)).join('');
      problems.push({ code: 'UNSUPPORTED_SCRIPT', field, value: offending });
    }
  }
  if (input.qr && input.qr.payload.length > MAX_QR_CHARACTERS) {
    problems.push({ code: 'QR_PAYLOAD_TOO_LONG', field: 'qr.payload', value: `${input.qr.payload.length} characters` });
  }
  return problems;
}

/** The page's definition. Exported for the tests; bytes come from renderDocument. */
export function definitionFor(input: RenderInput): PdfDefinition {
  const problems = checkRender(input);
  if (problems.length > 0) throw new RenderError(problems);
  return LAYOUTS[input.template](input, PACKS[input.language]);
}

/** A document, rendered. Asynchronous because pdfmake delivers its bytes that way. */
export async function renderDocument(input: RenderInput): Promise<RenderResult> {
  const definition = definitionFor(input);
  const bytes = await toPdf(definition, input.issueDate);
  return { bytes, pages: countPages(bytes) };
}
