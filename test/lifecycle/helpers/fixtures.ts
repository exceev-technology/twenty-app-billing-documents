import { APP_ONLY_FIELDS } from '../../../src/schema/app-only.ts';
import type { Kind } from '../../../lifecycle/load.ts';
import type { Row } from '../../../lifecycle/store.ts';
import { memoryDb } from './memory-store.ts';

/** The day every test runs on, as the clicking user's browser gives it. */
export const TODAY = '2026-09-26';
export const now = (): Date => new Date('2026-09-26T09:30:00.000Z');

const PLURAL: Record<string, string> = {
  billingQuote: 'billingQuotes', billingInvoice: 'billingInvoices', billingCreditNote: 'billingCreditNotes',
  billingQuoteLine: 'billingQuoteLines', billingInvoiceLine: 'billingInvoiceLines', billingCreditNoteLine: 'billingCreditNoteLines',
  billingSequence: 'billingSequences',
};

export const UNIQUE = {
  billingQuotes: ['numberKey'], billingInvoices: ['numberKey'], billingCreditNotes: ['numberKey'], billingSequences: ['scopeKey'],
};
export const APP_ONLY = Object.fromEntries(Object.entries(APP_ONLY_FIELDS).map(([object, fields]) => [PLURAL[object]!, fields]));

export const money = (amountMicros: number | null, currencyCode = 'EUR') => ({ amountMicros, currencyCode });
export const markdown = (text: string) => ({ blocknote: null, markdown: text });
export const address = (street: string, city: string, postcode: string, country: string) => ({
  addressStreet1: street, addressStreet2: '', addressCity: city, addressPostcode: postcode, addressState: '', addressCountry: country,
  addressLat: null, addressLng: null,
});

const EMPTY_MONEY = { amountMicros: null, currencyCode: '' };

const DOCUMENT = {
  subject: '', number: '', numberKey: '', status: 'DRAFT', issuerId: null, companyId: null, personId: null, issueDate: null,
  currencyCode: 'EUR', pricesIncludeTax: false, language: null, notes: markdown(''), subtotal: EMPTY_MONEY,
  discountTotal: EMPTY_MONEY, taxTotal: EMPTY_MONEY, total: EMPTY_MONEY, pdf: [], snapshot: null, documentHash: '',
};

/**
 * A French seller on the fr profile, a French company buyer with its SIREN,
 * VAT at 20 % and a franchise code, and a draft invoice of three lines
 * (spec §11, acceptance step 2). Nothing here names a real business.
 */
export function workspace() {
  const db = memoryDb({ unique: UNIQUE, appOnly: APP_ONLY });
  const profile = db.seed('billingProfiles', {
    name: 'France', presetKey: 'fr', countryCode: 'FR', language: 'FR', locale: 'fr-FR', defaultCurrency: 'EUR',
    roundingMode: 'PER_RATE_ON_TOTAL', amountInWords: false, invoiceTitle: '', creditNoteTitle: '',
    quoteNumberPattern: 'D{YYYY}-{SEQ:4}', invoiceNumberPattern: 'F{YYYY}-{SEQ:4}', creditNoteNumberPattern: 'AV{YYYY}-{SEQ:4}',
    numberingReset: 'YEARLY', defaultPaymentTermDays: 30, defaultQuoteValidityDays: 30,
    quoteMentions: markdown(''), invoiceMentions: markdown('Pénalités de retard : trois fois le taux d’intérêt légal.'),
    creditNoteMentions: markdown(''), qrMode: 'NONE',
  });
  const siren = db.seed('billingIdentifierTypes', {
    name: 'SIREN', key: 'fr.siren', profileId: profile.id, appliesTo: 'BOTH', requiredForSeller: true,
    requiredForBusinessBuyer: true, printOnDocuments: true, includeInQr: false, validationPattern: '^\\d{9}$', sortOrder: 0,
  });
  const tva = db.seed('billingIdentifierTypes', {
    name: 'N° TVA intracommunautaire', key: 'fr.tva', profileId: profile.id, appliesTo: 'BOTH', requiredForSeller: false,
    requiredForBusinessBuyer: false, printOnDocuments: true, includeInQr: false, validationPattern: '^FR[0-9A-Z]{2}\\d{9}$', sortOrder: 3,
  });
  const issuer = db.seed('billingIssuers', {
    name: 'Verdal Studio', legalName: 'Verdal Studio SARL', legalForm: 'SARL au capital de 10 000 €', profileId: profile.id,
    postalAddress: address('12 rue des Peupliers', 'Paris', '75013', 'France'),
    emails: { primaryEmail: 'bonjour@verdal.example', additionalEmails: null },
    phones: { primaryPhoneNumber: '123456789', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: null },
    website: { primaryLinkUrl: 'https://verdal.example', primaryLinkLabel: '', secondaryLinks: null },
    logo: [], defaultCurrency: '', paymentDetails: markdown('IBAN FR76 0000 0000 0000 0000 0000 000'), accentColor: '#2f6f4e',
    footerNote: 'Verdal Studio SARL, Paris', verificationBaseUrl: { primaryLinkUrl: '', primaryLinkLabel: '', secondaryLinks: null },
    isDefault: true, template: 'CLASSIC',
  });
  db.seed('billingIdentifiers', { value: '000000000', identifierTypeId: siren.id, issuerId: issuer.id, companyId: null, personId: null });
  db.seed('billingIdentifiers', { value: 'FR12000000000', identifierTypeId: tva.id, issuerId: issuer.id, companyId: null, personId: null });
  const company = db.seed('companies', { name: 'Maison Calibre', address: address('48 avenue du Port', 'Bordeaux', '33000', 'France') });
  db.seed('billingIdentifiers', { value: '111111111', identifierTypeId: siren.id, issuerId: null, companyId: company.id, personId: null });
  const person = db.seed('people', {
    name: { firstName: 'Camille', lastName: 'Durand' }, emails: { primaryEmail: 'camille@calibre.example', additionalEmails: null },
    phones: { primaryPhoneNumber: '612345678', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: null },
  });
  const vat20 = db.seed('billingTaxCodes', { name: 'TVA 20 %', code: 'fr.tva.20', countryCode: 'FR', category: 'STANDARD', printNote: '', isActive: true });
  db.seed('billingTaxComponents', { name: 'TVA', taxCodeId: vat20.id, rate: 20, compound: false, sortOrder: 0 });
  const franchise = db.seed('billingTaxCodes', {
    name: 'Franchise en base de TVA', code: 'fr.franchise', countryCode: 'FR', category: 'EXEMPT',
    printNote: 'TVA non applicable, article 293 B du CGI.', isActive: true,
  });
  db.seed('billingTaxComponents', { name: 'TVA', taxCodeId: franchise.id, rate: 0, compound: false, sortOrder: 0 });

  const addLine = (kind: Kind, documentId: string, over: Record<string, unknown> = {}): Row => db.seed(kind.linePlural, {
    [kind.parentKey]: documentId, sortOrder: 1, description: 'Prestation', quantity: 1, unit: 'DAY', unitPrice: money(100_000_000),
    discountPercent: null, taxCodeId: vat20.id, catalogItemId: null, periodStart: null, periodEnd: null, lineTotal: EMPTY_MONEY, ...over,
  });
  const addInvoice = (over: Record<string, unknown> = {}): Row => db.seed('billingInvoices', {
    ...DOCUMENT, subject: 'Identité visuelle', issuerId: issuer.id, companyId: company.id, dueDate: null, buyerReference: 'BC-7781',
    opportunityId: null, quoteId: null, issuedAt: null, sentAt: null, paidAt: null, ...over,
  });
  const addCreditNote = (over: Record<string, unknown> = {}): Row => db.seed('billingCreditNotes', {
    ...DOCUMENT, subject: 'Atelier annulé', issuerId: issuer.id, companyId: company.id, invoiceId: null, reason: 'Atelier annulé', issuedAt: null, ...over,
  });
  const addQuote = (over: Record<string, unknown> = {}): Row => db.seed('billingQuotes', {
    ...DOCUMENT, subject: 'Identité visuelle, proposition', issuerId: issuer.id, companyId: company.id, validUntil: null,
    acceptedAt: null, opportunityId: null, version: null, ...over,
  });

  const invoice = addInvoice();
  const invoiceKind = { linePlural: 'billingInvoiceLines', parentKey: 'invoiceId' } as Kind;
  const lines = [
    addLine(invoiceKind, invoice.id, { sortOrder: 1, description: 'Direction artistique', quantity: 4, unitPrice: money(780_000_000) }),
    addLine(invoiceKind, invoice.id, { sortOrder: 2, description: 'Système de design', quantity: 6, unitPrice: money(640_000_000) }),
    addLine(invoiceKind, invoice.id, { sortOrder: 3, description: 'Atelier', quantity: 1, unitPrice: money(1_200_000_000) }),
  ];

  return {
    db, app: db.store('APPLICATION'), user: db.store('MANUAL'),
    profile, siren, tva, issuer, company, person, vat20, franchise, invoice, lines,
    addInvoice, addCreditNote, addQuote, addLine,
  };
}

export type Workspace = ReturnType<typeof workspace>;
