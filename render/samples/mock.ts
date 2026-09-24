/**
 * One fictitious business, for the samples and the tests. Nothing here names a
 * real company, person, address, bank or tax identifier.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeDocument, type TaxCodeInput } from '../../engine/index.ts';
import type { RenderInput, RenderLine } from '../types.ts';

const LOGO = fileURLToPath(new URL('./logo.png', import.meta.url));

/** The generated mock logo, or null when it has not been generated yet. */
export function mockLogo(): { bytes: Uint8Array; type: 'image/png' } | null {
  if (!existsSync(LOGO)) return null;
  return { bytes: new Uint8Array(readFileSync(LOGO)), type: 'image/png' };
}

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

/** A tax code's identity is its record id, as Lifecycle passes it; these are made up. */
const VAT_20: TaxCodeInput = {
  code: '0000c0de-0000-4000-8000-000000000020',
  name: 'VAT 20%',
  category: 'STANDARD',
  components: [{ name: 'VAT', rate: 20, compound: false, sortOrder: 0 }],
};
const VAT_10: TaxCodeInput = {
  code: '0000c0de-0000-4000-8000-000000000010',
  name: 'VAT 10%',
  category: 'REDUCED',
  components: [{ name: 'VAT', rate: 10, compound: false, sortOrder: 0 }],
};

/** A line before the Engine has run: its tax code instead of its printed label and total. */
type MockLine = Omit<RenderLine, 'taxLabel' | 'lineTotalMicros'> & { tax: TaxCodeInput };

const line = (key: string, description: string, quantity: number, unitPriceMicros: number, over: Partial<MockLine> = {}): MockLine => ({
  key,
  description,
  quantity,
  unit: 'day',
  unitPriceMicros,
  discountPercent: null,
  tax: VAT_20,
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
  taxNames: {},
  taxNotes: ['VAT on debits.'],
  mentions: 'Late payment carries interest at three times the legal rate, plus a 40 € recovery fee.',
  amountInWords: true,
  brand: {
    accentColor: '#2f6f4e',
    footerNote: 'Verdal Studio SARL - SIREN 000 000 000 - Paris',
    paymentDetails: 'Bank: Banque Exemple - IBAN FR00 0000 0000 0000 0000 0000 000',
    logo: mockLogo(),
  },
  qr: null,
});

/** The Engine computes every figure, so a sample prints exactly what a real document would. */
function computed(input: RenderInput, lines: MockLine[]): RenderInput {
  const totals = computeDocument({
    currencyCode: input.currencyCode,
    pricesIncludeTax: input.pricesIncludeTax,
    roundingMode: 'PER_RATE_ON_TOTAL',
    lines: lines.map((current) => ({
      key: current.key,
      quantity: current.quantity,
      unitPrice: { amountMicros: current.unitPriceMicros, currencyCode: input.currencyCode },
      discountPercent: current.discountPercent,
      tax: current.tax,
    })),
  });
  return {
    ...input,
    lines: lines.map(({ tax, ...current }, index) => ({ ...current, taxLabel: tax.name, lineTotalMicros: totals.lines[index]!.lineTotalMicros })),
    totals,
    taxNames: Object.fromEntries(lines.map((current) => [current.tax.code, current.tax.name])),
  };
}

export const mockInvoice = (): RenderInput => computed(base(), [
  line('l1', 'Art direction', 4, 780_000_000),
  line('l2', 'Design system, components', 6, 640_000_000),
  line('l3', 'Workshop facilitation', 1, 1_200_000_000),
]);

export const mockLongInvoice = (): RenderInput => computed(
  { ...base(), number: 'INV-2026-0043', subject: 'Retainer, third quarter' },
  Array.from({ length: 24 }, (_, index) =>
    line(`l${index + 1}`, `Sprint ${index + 1}: design, review and handover of the agreed scope`, 2, 560_000_000, {
      discountPercent: index % 6 === 0 ? 10 : null,
      tax: index % 4 === 3 ? VAT_10 : VAT_20,
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
    })),
);

export const mockQuote = (): RenderInput => computed(
  {
    ...base(),
    kind: 'QUOTE',
    number: 'Q-2026-0009',
    version: 2,
    dueDate: null,
    validUntil: '2026-10-24',
    subject: 'Brand identity, proposal',
  },
  [line('l1', 'Discovery and research', 5, 720_000_000), line('l2', 'Concepts, three routes', 8, 680_000_000)],
);

/** A credit note cancelling the workshop of the three-line invoice. */
export const mockCreditNote = (): RenderInput => computed(
  {
    ...base(),
    kind: 'CREDIT_NOTE',
    number: 'CN-2026-0003',
    corrects: { number: 'INV-2026-0042', issueDate: '2026-09-24' },
    issueDate: '2026-09-30',
    dueDate: null,
    subject: 'Workshop cancelled',
  },
  [line('l1', 'Workshop facilitation, cancelled', 1, 1_200_000_000)],
);

export const mockReceipt = (): RenderInput => computed(
  {
    ...base(),
    template: 'receipt',
    kind: 'INVOICE',
    number: 'INV-2026-0044',
    pricesIncludeTax: true,
    amountInWords: false,
    buyerReference: null,
    subject: null,
    notes: null,
  },
  [line('l1', 'Print, A2 poster', 2, 24_000_000, { unit: 'item' }), line('l2', 'Frame', 1, 45_000_000, { unit: 'item' })],
);
