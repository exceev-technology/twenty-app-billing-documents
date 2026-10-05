import { minorDigits, type DocumentInput, type DocumentResult, type TaxCategory, type TaxCodeInput } from '../engine/index.ts';
import type { Party, PrintedIdentifier, RenderInput, TemplateKey } from '../render/types.ts';
import { PACKS, type Language, type LifecyclePack, type UnitKey } from './lang/pack.ts';
import type { Figures, Loaded, TaxCode } from './load.ts';
import type { FileRef, Row } from './store.ts';

/** Readers for the shapes Twenty's REST API returns. */

export const textOf = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');
export const idOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** A record id as Twenty gives it: a UUID. */
export const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a YYYY-MM-DD text names a day of the calendar: 2026-02-30 does not. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const numberOf = (value: unknown): number =>
  typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
const field = (value: unknown, key: string): unknown => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined);

/** A CURRENCY value's micros; NaN when there are none, which the Engine reports as INVALID_AMOUNT. */
export function microsOf(value: unknown): number {
  const amount = field(value, 'amountMicros');
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string' && /^-?\d+$/.test(amount)) return Number(amount);
  return Number.NaN;
}

export const currencyOf = (value: unknown): string => textOf(field(value, 'currencyCode'));
export const moneyOf = (amountMicros: number | null, currencyCode: string) => ({ amountMicros, currencyCode });

/** The currency the document will carry: its own, else the issuer's default, else the profile's (spec §6). */
export function effectiveCurrency(figures: Pick<Figures, 'document' | 'issuer' | 'profile'>): string {
  return (
    textOf(figures.document.currencyCode).trim() ||
    textOf(figures.issuer?.defaultCurrency).trim() ||
    textOf(figures.profile?.defaultCurrency).trim()
  );
}

/** The document's language, else the profile's. The Renderer refuses one it has no pack for. */
export const languageOf = (document: Row, profile: Row | null): Language =>
  (textOf(document.language) || textOf(profile?.language) || 'EN') as Language;

/** The locale amounts and dates print in: the profile's, else the language's own (spec §9). */
export const localeOf = (language: Language, profile: Row | null): string =>
  textOf(profile?.locale).trim() || ({ FR: 'fr-FR', AR: 'ar-EG' } as Partial<Record<Language, string>>)[language] || 'en-GB';

const packOf = (language: Language): LifecyclePack => PACKS[language] ?? PACKS.EN;

let regionCodes: Map<string, string> | undefined;
const fold = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").trim().toLowerCase();

/**
 * A region subtag's current form: BCP 47 keeps deprecated codes ('FX', 'UK', 'DD'…) as aliases of
 * their replacement ('FR', 'GB', 'DE'…), which `Intl.getCanonicalLocales` resolves. Several such
 * aliases carry the same English name as their replacement, so without this a code seen later in
 * the AA-ZZ scan below (alphabetically, not by relevance) would overwrite the right one.
 */
function canonicalRegion(code: string): string {
  try {
    return Intl.getCanonicalLocales(`und-${code}`)[0]?.split('-')[1] ?? code;
  } catch {
    return code;
  }
}

/** The ISO 3166 code of a country as Twenty stores it (its English name), or as a code. Null when unknown. */
export function countryCode(value: unknown): string | null {
  const text = textOf(value).trim();
  if (text === '') return null;
  if (/^[A-Za-z]{2}$/.test(text)) return canonicalRegion(text.toUpperCase());
  if (!regionCodes) {
    regionCodes = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let first = 65; first <= 90; first++) {
      for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        const name = names.of(code);
        if (name && name !== code) regionCodes.set(fold(name), canonicalRegion(code));
      }
    }
  }
  return regionCodes.get(fold(text)) ?? null;
}

/** "Springfield, IL 62704". */
const CITY_STATE_POSTCODE = new Set(['US', 'CA', 'IN']);
/** City and postcode on lines of their own. */
const CITY_THEN_POSTCODE = new Set(['GB']);

/** An address in the order its country writes it: "75013 Paris" in most of Europe and in Morocco, the default. */
export function addressLines(value: unknown, printCountry: boolean): string[] {
  const part = (key: string): string => textOf(field(value, key)).trim();
  const [city, postcode, state, country] = [part('addressCity'), part('addressPostcode'), part('addressState'), part('addressCountry')];
  const code = countryCode(country);
  let place: string[];
  if (code && CITY_STATE_POSTCODE.has(code)) place = [[city, [state, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')];
  else if (code && CITY_THEN_POSTCODE.has(code)) place = [city, postcode];
  else place = [[postcode, city].filter(Boolean).join(' '), state];
  return [part('addressStreet1'), part('addressStreet2'), ...place, printCountry ? country : ''].filter((line) => line !== '');
}

function blocknoteText(json: string): string {
  let blocks: unknown;
  try {
    blocks = JSON.parse(json);
  } catch {
    return '';
  }
  const inline = (items: unknown): string =>
    Array.isArray(items) ? items.map((item) => (typeof field(item, 'text') === 'string' ? String(field(item, 'text')) : inline(field(item, 'content')))).join('') : '';
  const lines: string[] = [];
  const walk = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const block of list) {
      lines.push(inline(field(block, 'content')));
      walk(field(block, 'children'));
    }
  };
  walk(blocks);
  return lines.join('\n');
}

function markdownOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const markdown = field(value, 'markdown');
  if (typeof markdown === 'string' && markdown.trim() !== '') return markdown;
  const blocknote = field(value, 'blocknote');
  return typeof blocknote === 'string' && blocknote !== '' ? blocknoteText(blocknote) : '';
}

/** Rich text printed as plain text: the markdown Twenty stores, with its markup removed (spec §9). */
export function plainText(value: unknown): string {
  return markdownOf(value)
    .replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    .replace(/^([ \t]*)[-*+][ \t]+(?:\[[ xX]\][ \t]+)?/gm, '$1- ')
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A unit in the document's language; a unit outside the list is printed as it is. */
export function unitName(pack: LifecyclePack, unit: unknown): string {
  const key = textOf(unit);
  return key in pack.units ? pack.units[key as UnitKey] : key.toLowerCase();
}

/** Micros as a plain decimal in the currency's minor unit: 9792.00 EUR, 1500 JPY. */
export function decimalAmount(micros: number, currencyCode: string): string {
  const digits = minorDigits(currencyCode);
  const minor = BigInt(Math.round(micros)) / 10n ** BigInt(6 - digits);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const scale = 10n ** BigInt(digits);
  const fraction = (absolute % scale).toString().padStart(digits, '0');
  return `${negative ? '-' : ''}${absolute / scale}${digits > 0 ? `.${fraction}` : ''}`;
}

/** A FILES value as Twenty accepts it on write: `fileId` and `label` only (a read adds `extension` and `url`). */
export function fileInputs(value: unknown): FileRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof field(item, 'fileId') === 'string' ? [{ fileId: String(field(item, 'fileId')), label: textOf(field(item, 'label')) }] : []));
}

function taxInput(code: TaxCode | undefined): TaxCodeInput | null {
  if (!code) return null;
  return {
    code: code.row.id,
    name: textOf(code.row.name),
    category: (textOf(code.row.category) || 'STANDARD') as TaxCategory,
    components: code.components.map((component) => {
      const order = numberOf(component.sortOrder);
      return { name: textOf(component.name), rate: numberOf(component.rate), compound: component.compound === true, sortOrder: Number.isFinite(order) ? order : 0 };
    }),
  };
}

/** The Engine's input. `currencyCode` is the document's unless given: totals use the currency the document will carry. */
export function toDocumentInput(figures: Figures, currencyCode: string = textOf(figures.document.currencyCode)): DocumentInput {
  return {
    currencyCode,
    pricesIncludeTax: figures.document.pricesIncludeTax === true,
    roundingMode: figures.profile?.roundingMode === 'PER_LINE' ? 'PER_LINE' : 'PER_RATE_ON_TOTAL',
    lines: figures.lines.map((line) => {
      const discount = numberOf(line.discountPercent);
      return {
        key: line.id,
        quantity: numberOf(line.quantity),
        unitPrice: { amountMicros: microsOf(line.unitPrice), currencyCode: currencyOf(line.unitPrice) },
        discountPercent: Number.isNaN(discount) ? null : discount,
        tax: taxInput(figures.taxCodes.get(idOf(line.taxCodeId) ?? '')),
      };
    }),
  };
}

const linkOf = (value: unknown): string => textOf(field(value, 'primaryLinkUrl')).trim();
const emailOf = (value: unknown): string | null => orNull(textOf(field(value, 'primaryEmail')));

function phoneOf(value: unknown): string | null {
  const number = textOf(field(value, 'primaryPhoneNumber')).trim();
  if (number === '') return null;
  const calling = textOf(field(value, 'primaryPhoneCallingCode')).trim();
  return calling !== '' && !number.startsWith('+') ? `${calling} ${number}` : number;
}

const countryOf = (address: unknown): string => {
  const name = textOf(field(address, 'addressCountry')).trim();
  return countryCode(name) ?? name;
};

function sellerParty(issuer: Row | null): Party {
  return {
    name: textOf(issuer?.name).trim() || textOf(issuer?.legalName).trim(),
    legalName: orNull(textOf(issuer?.legalName)),
    legalForm: orNull(textOf(issuer?.legalForm)),
    addressLines: addressLines(issuer?.postalAddress, false),
    email: emailOf(issuer?.emails),
    phone: phoneOf(issuer?.phones),
    website: orNull(linkOf(issuer?.website).replace(/^https?:\/\//i, '').replace(/\/+$/, '')),
  };
}

/** The company when one is billed, with the person as its contact; else the person (spec §9). */
function buyerParty(loaded: Loaded): Party {
  const { company, person } = loaded;
  const contact = { email: emailOf(person?.emails), phone: phoneOf(person?.phones) };
  if (company) {
    const country = countryOf(company.address);
    const printCountry = country !== '' && country !== countryOf(loaded.issuer?.postalAddress);
    return { name: textOf(company.name).trim(), legalName: null, legalForm: null, addressLines: addressLines(company.address, printCountry), ...contact, website: null };
  }
  const name = `${textOf(field(person?.name, 'firstName'))} ${textOf(field(person?.name, 'lastName'))}`.trim();
  return { name, legalName: null, legalForm: null, addressLines: [], ...contact, website: null };
}

/** The identifiers whose type is printed, seller first, each side in its types' order. */
function printedIdentifiers(loaded: Loaded): PrintedIdentifier[] {
  const side = (rows: Row[], which: 'SELLER' | 'BUYER'): PrintedIdentifier[] =>
    rows
      .flatMap((identifier) => {
        const type = loaded.identifierTypes.get(idOf(identifier.identifierTypeId) ?? '');
        const value = textOf(identifier.value).trim();
        if (!type || type.printOnDocuments === false || value === '') return [];
        const order = numberOf(type.sortOrder);
        return [{ order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY, printed: { label: textOf(type.name).trim(), value, side: which } }];
      })
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.printed);
  return [...side(loaded.sellerIdentifiers, 'SELLER'), ...side(loaded.buyerIdentifiers, 'BUYER')];
}

function qrOf(loaded: Loaded, number: string | null, issueDate: string, totals: DocumentResult, identifiers: PrintedIdentifier[]): RenderInput['qr'] {
  const mode = textOf(loaded.profile?.qrMode);
  if (number === null || (mode !== 'PAYLOAD' && mode !== 'URL_WITH_PAYLOAD')) return null;
  const currencyCode = textOf(loaded.document.currencyCode);
  const seller = identifiers.find((identifier) => identifier.side === 'SELLER')?.value ?? '';
  const payload = [number, issueDate, decimalAmount(totals.totalMicros, currencyCode), currencyCode, seller].join(';');
  if (mode === 'PAYLOAD') return { mode: 'PAYLOAD', payload };
  return { mode: 'URL_WITH_PAYLOAD', payload, baseUrl: orNull(linkOf(loaded.issuer?.verificationBaseUrl)) };
}

export type RenderOptions = { number: string | null; version?: number | null; issueDate: string; logo: { bytes: Uint8Array; type: string } | null };

/** The Renderer's input (spec §9). `number` null prints the draft marker. */
export function toRenderInput(loaded: Loaded, totals: DocumentResult, options: RenderOptions): RenderInput {
  const { document, kind, issuer, profile } = loaded;
  const language = languageOf(document, profile);
  const pack = packOf(language);
  const identifiers = printedIdentifiers(loaded);
  const taxName = (code: string): string => textOf(loaded.taxCodes.get(code)?.row.name).trim();
  return {
    template: (textOf(issuer?.template).trim().toLowerCase() || 'classic') as TemplateKey,
    language,
    locale: localeOf(language, profile),
    kind: kind.kind,
    title: kind.titleField ? orNull(textOf(profile?.[kind.titleField])) : null,
    number: options.number,
    version: kind.kind === 'QUOTE' ? (options.version ?? null) : null,
    issueDate: options.issueDate,
    corrects: kind.kind === 'CREDIT_NOTE' && loaded.invoice ? { number: textOf(loaded.invoice.number), issueDate: textOf(loaded.invoice.issueDate) } : null,
    dueDate: kind.kind === 'INVOICE' ? orNull(textOf(document.dueDate)) : null,
    validUntil: kind.kind === 'QUOTE' ? orNull(textOf(document.validUntil)) : null,
    subject: orNull(textOf(document.subject)),
    notes: orNull(plainText(document.notes)),
    currencyCode: textOf(document.currencyCode),
    pricesIncludeTax: document.pricesIncludeTax === true,
    seller: sellerParty(issuer),
    buyer: buyerParty(loaded),
    buyerReference: kind.kind === 'INVOICE' ? orNull(textOf(document.buyerReference)) : null,
    identifiers,
    lines: loaded.lines.map((line) => {
      const discount = numberOf(line.discountPercent);
      return {
        key: line.id,
        description: textOf(line.description),
        quantity: numberOf(line.quantity),
        unit: unitName(pack, line.unit),
        unitPriceMicros: microsOf(line.unitPrice),
        discountPercent: Number.isNaN(discount) ? null : discount,
        taxLabel: taxName(idOf(line.taxCodeId) ?? ''),
        lineTotalMicros: totals.lines.find((result) => result.key === line.id)?.lineTotalMicros ?? 0,
        periodStart: orNull(textOf(line.periodStart)),
        periodEnd: orNull(textOf(line.periodEnd)),
      };
    }),
    totals,
    taxNames: Object.fromEntries(totals.taxCodesUsed.map((code) => [code, taxName(code)])),
    taxNotes: [...new Set(totals.taxCodesUsed.map((code) => textOf(loaded.taxCodes.get(code)?.row.printNote).trim()).filter(Boolean))],
    mentions: orNull(plainText(profile?.[kind.mentionsField])),
    amountInWords: profile?.amountInWords === true,
    brand: {
      accentColor: orNull(textOf(issuer?.accentColor)),
      footerNote: orNull(textOf(issuer?.footerNote)),
      paymentDetails: orNull(plainText(issuer?.paymentDetails)),
      logo: options.logo as RenderInput['brand']['logo'],
    },
    qr: qrOf(loaded, options.number, options.issueDate, totals, identifiers),
  };
}
