/**
 * One fictitious business, for the samples and the tests. Nothing here names a
 * real company, person, address, bank or tax identifier.
 */
import type { RenderInput, RenderLine } from '../types.ts';

const SELLER = {
  name: 'Verdal Studio',
  legalName: 'Verdal Studio SARL',
  legalForm: 'SARL au capital de 10 000 €',
  addressLines: ['12 rue des Peupliers', '75013 Paris', 'France'],
  email: 'hello@verdal.example',
  phone: '+33 1 23 45 67 89',
  website: 'verdal.example',
};

const BUYER = {
  name: 'Maison Calibre',
  legalName: 'Maison Calibre SAS',
  addressLines: ['48 avenue du Port', '33000 Bordeaux', 'France'],
  email: 'compta@calibre.example',
};

const IDENTIFIERS = [
  { label: 'SIREN', value: '000 000 000', side: 'SELLER' as const },
  { label: 'VAT number', value: 'FR00000000000', side: 'SELLER' as const },
  { label: 'VAT number', value: 'FR11111111111', side: 'BUYER' as const },
];

const line = (key: string, description: string, quantity: number, unitPriceMicros: number, over: Partial<RenderLine> = {}): RenderLine => ({
  key,
  description,
  quantity,
  unit: 'day',
  unitPriceMicros,
  discountPercent: null,
  taxLabel: 'VAT 20%',
  lineTotalMicros: Math.round(quantity * unitPriceMicros),
  ...over,
});

const base = (): RenderInput => ({
  template: 'classic',
  language: 'EN',
  locale: 'en-GB',
  kind: 'INVOICE',
  number: 'INV-2026-0042',
  issueDate: '2026-09-24',
  dueDate: '2026-10-24',
  subject: 'Brand identity, phase two',
  notes: 'Thank you for your business.',
  currencyCode: 'EUR',
  pricesIncludeTax: false,
  seller: SELLER,
  buyer: BUYER,
  buyerReference: 'PO-7781',
  identifiers: IDENTIFIERS,
  lines: [],
  totals: { lines: [], recap: [], taxCodesUsed: [], subtotalMicros: 0, discountTotalMicros: 0, taxTotalMicros: 0, totalMicros: 0 },
  taxNotes: ['VAT on debits.'],
  mentions: 'Late payment carries interest at three times the legal rate, plus a 40 € recovery fee.',
  amountInWords: true,
  brand: {
    accentColor: '#2f6f4e',
    footerNote: 'Verdal Studio SARL - SIREN 000 000 000 - Paris',
    paymentDetails: 'Bank: Banque Exemple - IBAN FR00 0000 0000 0000 0000 0000 000',
    logo: null,
  },
  qr: null,
});

/** Totals that match the lines, so a sample never shows figures that disagree. */
function withTotals(input: RenderInput, rate = 20): RenderInput {
  const subtotal = input.lines.reduce((total, current) => total + current.lineTotalMicros, 0);
  const discounts = input.lines.reduce((total, current) => total + Math.round((current.quantity * current.unitPriceMicros) - current.lineTotalMicros), 0);
  const tax = Math.round((subtotal * rate) / 100 / 10_000) * 10_000;
  return {
    ...input,
    totals: {
      lines: input.lines.map((current) => ({
        key: current.key,
        amountMicros: Math.round(current.quantity * current.unitPriceMicros),
        discountMicros: Math.round((current.quantity * current.unitPriceMicros) - current.lineTotalMicros),
        lineTotalMicros: current.lineTotalMicros,
      })),
      recap: [{ taxCode: 'fr.vat.20', component: 'VAT', rate, baseMicros: subtotal, taxMicros: tax }],
      taxCodesUsed: ['fr.vat.20'],
      subtotalMicros: subtotal,
      discountTotalMicros: discounts,
      taxTotalMicros: tax,
      totalMicros: subtotal + tax,
    },
  };
}

export const mockInvoice = (): RenderInput => withTotals({
  ...base(),
  lines: [
    line('l1', 'Art direction', 4, 780_000_000),
    line('l2', 'Design system, components', 6, 640_000_000),
    line('l3', 'Workshop facilitation', 1, 1_200_000_000),
  ],
});

export const mockLongInvoice = (): RenderInput => withTotals({
  ...base(),
  number: 'INV-2026-0043',
  subject: 'Retainer, third quarter',
  lines: Array.from({ length: 24 }, (_, index) =>
    line(`l${index + 1}`, `Sprint ${index + 1}: design, review and handover of the agreed scope`, 2, 560_000_000, {
      discountPercent: index % 6 === 0 ? 10 : null,
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      lineTotalMicros: index % 6 === 0 ? 1_008_000_000 : 1_120_000_000,
    })),
});

export const mockQuote = (): RenderInput => withTotals({
  ...base(),
  kind: 'QUOTE',
  number: 'Q-2026-0009',
  version: 2,
  dueDate: null,
  validUntil: '2026-10-24',
  subject: 'Brand identity, proposal',
  lines: [line('l1', 'Discovery and research', 5, 720_000_000), line('l2', 'Concepts, three routes', 8, 680_000_000)],
});

export const mockReceipt = (): RenderInput => withTotals({
  ...base(),
  template: 'receipt',
  kind: 'INVOICE',
  number: 'INV-2026-0044',
  pricesIncludeTax: true,
  amountInWords: false,
  buyerReference: null,
  subject: null,
  notes: null,
  lines: [line('l1', 'Print, A2 poster', 2, 24_000_000, { unit: 'item' }), line('l2', 'Frame', 1, 45_000_000, { unit: 'item' })],
});
