import type { DocumentKind, FieldKey } from './lang/pack.ts';
import type { Row, Store } from './store.ts';

export type DocumentObject = 'billingQuote' | 'billingInvoice' | 'billingCreditNote';

export type Kind = {
  kind: DocumentKind;
  object: DocumentObject;
  plural: string;
  lineObject: string;
  linePlural: string;
  /** The line's key to its document: `quoteId`, `invoiceId`, `creditNoteId`. */
  parentKey: string;
  /** The profile fields that apply to this kind. */
  patternField: 'quoteNumberPattern' | 'invoiceNumberPattern' | 'creditNoteNumberPattern';
  mentionsField: 'quoteMentions' | 'invoiceMentions' | 'creditNoteMentions';
  titleField: 'invoiceTitle' | 'creditNoteTitle' | null;
  /** What an issued document depends on (spec §7): a guard puts back any change. Quotes lock nothing. */
  lockedFields: readonly FieldKey[];
  /** The line fields an issued document's snapshot keeps, and a guard puts back. */
  lineFields: readonly string[];
};

/** A line's fields a person edits: the snapshot keeps them, and a guard puts them back. */
export const LINE_FIELDS = [
  'description', 'sortOrder', 'catalogItemId', 'quantity', 'unit', 'unitPrice', 'discountPercent', 'taxCodeId',
  'periodStart', 'periodEnd',
] as const;

/** A credit note's lines also keep the invoice line each one credits (flows spec §3). */
export const CREDIT_LINE_FIELDS = [...LINE_FIELDS, 'invoiceLineId'] as const;

const SHARED_LOCKS = ['subject', 'issuerId', 'companyId', 'personId', 'issueDate', 'currencyCode', 'pricesIncludeTax', 'language', 'notes'] as const;

export const KINDS: Record<DocumentObject, Kind> = {
  billingQuote: {
    kind: 'QUOTE', object: 'billingQuote', plural: 'billingQuotes', lineObject: 'billingQuoteLine',
    linePlural: 'billingQuoteLines', parentKey: 'quoteId', patternField: 'quoteNumberPattern',
    mentionsField: 'quoteMentions', titleField: null, lockedFields: [], lineFields: LINE_FIELDS,
  },
  billingInvoice: {
    kind: 'INVOICE', object: 'billingInvoice', plural: 'billingInvoices', lineObject: 'billingInvoiceLine',
    linePlural: 'billingInvoiceLines', parentKey: 'invoiceId', patternField: 'invoiceNumberPattern',
    mentionsField: 'invoiceMentions', titleField: 'invoiceTitle', lockedFields: [...SHARED_LOCKS, 'dueDate', 'buyerReference'], lineFields: LINE_FIELDS,
  },
  billingCreditNote: {
    kind: 'CREDIT_NOTE', object: 'billingCreditNote', plural: 'billingCreditNotes', lineObject: 'billingCreditNoteLine',
    linePlural: 'billingCreditNoteLines', parentKey: 'creditNoteId', patternField: 'creditNoteNumberPattern',
    mentionsField: 'creditNoteMentions', titleField: 'creditNoteTitle', lockedFields: [...SHARED_LOCKS, 'invoiceId', 'reason'], lineFields: CREDIT_LINE_FIELDS,
  },
};

export const kindOf = (object: string): Kind | undefined => KINDS[object as DocumentObject];
export const kindOfLine = (lineObject: string): Kind | undefined =>
  Object.values(KINDS).find((kind) => kind.lineObject === lineObject);

/** An invoice or credit note is issued once it holds a snapshot (spec §7). */
export const isIssued = (kind: Kind, document: Row): boolean => kind.kind !== 'QUOTE' && Boolean(document.snapshot);

export type TaxCode = { row: Row; components: Row[] };

export type Figures = {
  kind: Kind;
  document: Row;
  lines: Row[];
  /** Each tax code the lines use, by id, with its live components. A deleted code is left out. */
  taxCodes: ReadonlyMap<string, TaxCode>;
  issuer: Row | null;
  profile: Row | null;
};

export type Loaded = Figures & {
  company: Row | null;
  person: Row | null;
  /** A credit note's invoice. */
  invoice: Row | null;
  /** A credit note's invoice's issued credit notes, this one left out (flows spec §6). */
  credits: Row[];
  sellerIdentifiers: Row[];
  /** The printed buyer's: the company's when one is billed, else the person's. */
  buyerIdentifiers: Row[];
  /** Every identifier type involved, the profile's and those the identifiers use, by id. */
  identifierTypes: ReadonlyMap<string, Row>;
  /** The profile's own types, whose requirements the gate checks. */
  profileTypes: Row[];
};

const idOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

async function getLive(store: Store, plural: string, id: unknown): Promise<Row | null> {
  const key = idOf(id);
  return key ? store.get(plural, key) : null;
}

/** By `sortOrder`, empty last, then by creation. */
function byOrder(a: Row, b: Row): number {
  const [x, y] = [a.sortOrder, b.sortOrder].map((value) => (typeof value === 'number' ? value : Number.POSITIVE_INFINITY));
  if (x !== y) return x! < y! ? -1 : 1;
  return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
}

/** The document, its live lines in order, their tax codes, the issuer and its profile: what totals need. */
export async function loadFigures(store: Store, kind: Kind, id: string, options: { deleted?: boolean } = {}): Promise<Figures | null> {
  const document = await store.get(kind.plural, id, options);
  if (!document) return null;
  const lines = (await store.list(kind.linePlural, { [kind.parentKey]: id })).sort(byOrder);
  const taxCodes = new Map<string, TaxCode>();
  for (const codeId of new Set(lines.map((line) => idOf(line.taxCodeId)).filter((key): key is string => key !== null))) {
    const row = await store.get('billingTaxCodes', codeId);
    if (!row) continue;
    const components = (await store.list('billingTaxComponents', { taxCodeId: codeId })).sort(byOrder);
    taxCodes.set(codeId, { row, components });
  }
  const issuer = await getLive(store, 'billingIssuers', document.issuerId);
  const profile = issuer ? await getLive(store, 'billingProfiles', issuer.profileId) : null;
  return { kind, document, lines, taxCodes, issuer, profile };
}

/** The issued credit notes of an invoice, one left out when named (flows spec §6). */
export async function issuedCreditNotes(store: Store, invoiceId: string, exceptId?: string): Promise<Row[]> {
  const notes = await store.list('billingCreditNotes', { invoiceId });
  return notes.filter((note) => note.id !== exceptId && isIssued(KINDS.billingCreditNote, note));
}

/** Everything an action needs: the figures, the parties, their identifiers and the identifier types. */
export async function loadDocument(store: Store, kind: Kind, id: string): Promise<Loaded | null> {
  const figures = await loadFigures(store, kind, id);
  if (!figures) return null;
  const { document, issuer, profile } = figures;
  const company = await getLive(store, 'companies', document.companyId);
  const person = await getLive(store, 'people', document.personId);
  const invoice = kind.kind === 'CREDIT_NOTE' ? await getLive(store, 'billingInvoices', document.invoiceId) : null;
  const credits = invoice ? await issuedCreditNotes(store, invoice.id, document.id) : [];
  const sellerIdentifiers = issuer ? await store.list('billingIdentifiers', { issuerId: issuer.id }) : [];
  const buyerIdentifiers = company
    ? await store.list('billingIdentifiers', { companyId: company.id })
    : person ? await store.list('billingIdentifiers', { personId: person.id }) : [];
  const profileTypes = profile ? await store.list('billingIdentifierTypes', { profileId: profile.id }) : [];
  const identifierTypes = new Map(profileTypes.map((type) => [type.id, type]));
  for (const identifier of [...sellerIdentifiers, ...buyerIdentifiers]) {
    const typeId = idOf(identifier.identifierTypeId);
    if (!typeId || identifierTypes.has(typeId)) continue;
    const type = await store.get('billingIdentifierTypes', typeId);
    if (type) identifierTypes.set(typeId, type);
  }
  return { ...figures, company, person, invoice, credits, sellerIdentifiers, buyerIdentifiers, identifierTypes, profileTypes };
}

/** The issuer's logo: its first file's bytes, with the type the Renderer knows ('image/jpg' read as 'image/jpeg'). */
export async function loadLogo(store: Store, issuer: Row | null): Promise<{ bytes: Uint8Array; type: string } | null> {
  const first = Array.isArray(issuer?.logo) ? issuer.logo[0] : undefined;
  if (!first) return null;
  const file = await store.download(first);
  if (!file) return null;
  return { bytes: file.bytes, type: file.type === 'image/jpg' ? 'image/jpeg' : file.type };
}
