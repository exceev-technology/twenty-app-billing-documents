import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDocument } from '../../engine/index.ts';
import { checkRender } from '../../render/document.ts';
import { PACKS } from '../../lifecycle/lang/pack.ts';
import { KINDS, loadDocument, type Loaded } from '../../lifecycle/load.ts';
import {
  addressLines, countryCode, decimalAmount, effectiveCurrency, fileInputs, microsOf, plainText, toDocumentInput, toRenderInput,
  unitName,
} from '../../lifecycle/map.ts';
import { TODAY, address, markdown, money, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;

async function loaded(w: Workspace, id = w.invoice.id, kind = INVOICE): Promise<Loaded> {
  const result = await loadDocument(w.app, kind, id);
  assert.ok(result);
  return result;
}

const render = (l: Loaded, number: string | null = 'F2026-0001') =>
  toRenderInput(l, computeDocument(toDocumentInput(l)), { number, issueDate: TODAY, logo: null });

test('the Engine’s input carries each line in order, with its tax code by record id and its live components', async () => {
  const w = workspace();
  const input = toDocumentInput(await loaded(w));
  assert.deepEqual({ ...input, lines: input.lines.length }, { currencyCode: 'EUR', pricesIncludeTax: false, roundingMode: 'PER_RATE_ON_TOTAL', lines: 3 });
  assert.deepEqual(input.lines[0], {
    key: w.lines[0]!.id, quantity: 4, unitPrice: { amountMicros: 780_000_000, currencyCode: 'EUR' }, discountPercent: null,
    tax: { code: w.vat20.id, name: 'TVA 20 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 20, compound: false, sortOrder: 0 }] },
  });
});

test('empty values reach the Engine as the problems they are, and an amount given as text is read as a number', async () => {
  const w = workspace();
  const invoice = w.addInvoice();
  w.addLine(INVOICE, invoice.id, { quantity: null, unitPrice: money(null, ''), taxCodeId: null, discountPercent: '' });
  w.addLine(INVOICE, invoice.id, { sortOrder: 2, unitPrice: { amountMicros: '1500000', currencyCode: 'EUR' } });
  const [empty, text] = toDocumentInput(await loaded(w, invoice.id)).lines;
  assert.ok(Number.isNaN(empty!.quantity));
  assert.ok(Number.isNaN(empty!.unitPrice.amountMicros));
  assert.equal(empty!.tax, null);
  assert.equal(empty!.discountPercent, null);
  assert.equal(text!.unitPrice.amountMicros, 1_500_000);
});

test('a profile rounding per line is passed on, and the currency can be given for a document that has none yet', async () => {
  const w = workspace();
  const l = await loaded(w);
  const input = toDocumentInput({ ...l, profile: { ...l.profile!, roundingMode: 'PER_LINE' } }, 'CHF');
  assert.equal(input.roundingMode, 'PER_LINE');
  assert.equal(input.currencyCode, 'CHF');
});

test('the currency a document will carry: its own, else the issuer’s, else the profile’s', () => {
  const profile = { id: 'p', defaultCurrency: 'EUR' };
  assert.equal(effectiveCurrency({ document: { id: 'd', currencyCode: 'USD' }, issuer: { id: 'i', defaultCurrency: 'GBP' }, profile }), 'USD');
  assert.equal(effectiveCurrency({ document: { id: 'd', currencyCode: '' }, issuer: { id: 'i', defaultCurrency: 'GBP' }, profile }), 'GBP');
  assert.equal(effectiveCurrency({ document: { id: 'd', currencyCode: '' }, issuer: { id: 'i', defaultCurrency: '' }, profile }), 'EUR');
  assert.equal(effectiveCurrency({ document: { id: 'd' }, issuer: null, profile: null }), '');
});

test('the Renderer’s input for an invoice, field by field', async () => {
  const w = workspace();
  const input = render(await loaded(w));
  assert.equal(input.template, 'classic');
  assert.equal(input.language, 'FR');
  assert.equal(input.locale, 'fr-FR');
  assert.equal(input.kind, 'INVOICE');
  assert.equal(input.title, null);
  assert.equal(input.number, 'F2026-0001');
  assert.equal(input.version, null);
  assert.equal(input.issueDate, TODAY);
  assert.equal(input.corrects, null);
  assert.equal(input.subject, 'Identité visuelle');
  assert.equal(input.notes, null);
  assert.equal(input.buyerReference, 'BC-7781');
  assert.deepEqual(input.seller, {
    name: 'Verdal Studio', legalName: 'Verdal Studio SARL', legalForm: 'SARL au capital de 10 000 €',
    addressLines: ['12 rue des Peupliers', '75013 Paris'], email: 'bonjour@verdal.example', phone: '+33 123456789',
    website: 'verdal.example',
  });
  assert.deepEqual(input.buyer, {
    name: 'Maison Calibre', legalName: null, legalForm: null, addressLines: ['48 avenue du Port', '33000 Bordeaux'],
    email: null, phone: null, website: null,
  });
  assert.deepEqual(input.identifiers, [
    { label: 'SIREN', value: '000000000', side: 'SELLER' },
    { label: 'N° TVA intracommunautaire', value: 'FR12000000000', side: 'SELLER' },
    { label: 'SIREN', value: '111111111', side: 'BUYER' },
  ]);
  assert.deepEqual(input.lines[0], {
    key: w.lines[0]!.id, description: 'Direction artistique', quantity: 4, unit: 'jour', unitPriceMicros: 780_000_000,
    discountPercent: null, taxLabel: 'TVA 20 %', lineTotalMicros: 3_120_000_000, periodStart: null, periodEnd: null,
  });
  assert.deepEqual(input.taxNames, { [w.vat20.id]: 'TVA 20 %' });
  assert.deepEqual(input.taxNotes, []);
  assert.equal(input.mentions, 'Pénalités de retard : trois fois le taux d’intérêt légal.');
  assert.equal(input.amountInWords, false);
  assert.deepEqual(input.brand, { accentColor: '#2f6f4e', footerNote: 'Verdal Studio SARL, Paris', paymentDetails: 'IBAN FR76 0000 0000 0000 0000 0000 000', logo: null });
  assert.equal(input.qr, null);
  assert.equal(input.totals.totalMicros, 9_792_000_000);
  assert.deepEqual(checkRender(input), []);
});

test('the document’s own language wins over the profile’s, and a profile title replaces the default one', async () => {
  const w = workspace();
  const l = await loaded(w, w.addInvoice({ language: 'EN' }).id);
  w.addLine(INVOICE, l.document.id);
  const input = render({ ...(await loaded(w, l.document.id)), profile: { ...l.profile!, invoiceTitle: 'Facture acquittée' } });
  assert.equal(input.language, 'EN');
  assert.equal(input.lines[0]?.unit, 'day');
  assert.equal(input.title, 'Facture acquittée');
});

test('an issuer’s template is read in lower case, the Renderer’s keys', async () => {
  const w = workspace();
  const l = await loaded(w);
  assert.equal(render({ ...l, issuer: { ...l.issuer!, template: 'RECEIPT' } }).template, 'receipt');
  assert.equal(render({ ...l, issuer: { ...l.issuer!, template: null } }).template, 'classic');
});

test('a credit note names the invoice it corrects; a quote carries its validity and version', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ number: 'F2026-0001', numberKey: `${w.issuer.id}:F2026-0001`, issueDate: '2026-09-01', snapshot: { printed: {}, record: {} } });
  const note = w.addCreditNote({ invoiceId: invoice.id });
  w.addLine(KINDS.billingCreditNote, note.id);
  const noteInput = render(await loaded(w, note.id, KINDS.billingCreditNote), 'AV2026-0001');
  assert.deepEqual(noteInput.corrects, { number: 'F2026-0001', issueDate: '2026-09-01' });
  assert.equal(noteInput.kind, 'CREDIT_NOTE');
  const quote = w.addQuote({ validUntil: '2026-10-26' });
  w.addLine(KINDS.billingQuote, quote.id);
  const l = await loaded(w, quote.id, KINDS.billingQuote);
  const quoteInput = toRenderInput(l, computeDocument(toDocumentInput(l)), { number: 'D2026-0001', version: 2, issueDate: TODAY, logo: null });
  assert.equal(quoteInput.validUntil, '2026-10-26');
  assert.equal(quoteInput.version, 2);
  assert.equal(quoteInput.dueDate, null);
});

test('a person billed alone prints a name and contacts; with a company, the person is its contact', async () => {
  const w = workspace();
  const alone = w.addInvoice({ companyId: null, personId: w.person.id });
  w.addLine(INVOICE, alone.id);
  assert.deepEqual(render(await loaded(w, alone.id)).buyer, {
    name: 'Camille Durand', legalName: null, legalForm: null, addressLines: [], email: 'camille@calibre.example',
    phone: '+33 612345678', website: null,
  });
  const both = w.addInvoice({ personId: w.person.id });
  w.addLine(INVOICE, both.id);
  const buyer = render(await loaded(w, both.id)).buyer;
  assert.equal(buyer.name, 'Maison Calibre');
  assert.equal(buyer.email, 'camille@calibre.example');
});

test('a buyer abroad gets its country printed, in its own address order', async () => {
  const w = workspace();
  const us = w.db.seed('companies', { name: 'Harbor Goods', address: { ...address('1600 Main Street', 'Springfield', '62704', 'United States'), addressState: 'IL' } });
  const invoice = w.addInvoice({ companyId: us.id });
  w.addLine(INVOICE, invoice.id);
  assert.deepEqual(render(await loaded(w, invoice.id)).buyer.addressLines, ['1600 Main Street', 'Springfield, IL 62704', 'United States']);
});

test('addresses follow their country’s order', () => {
  const lines = (country: string, over: Record<string, string> = {}) => addressLines({ ...address('1 High Street', 'Town', '12345', country), ...over }, false);
  assert.deepEqual(lines('France'), ['1 High Street', '12345 Town']);
  assert.deepEqual(lines('Morocco'), ['1 High Street', '12345 Town']);
  assert.deepEqual(lines('Germany'), ['1 High Street', '12345 Town']);
  assert.deepEqual(lines('United States', { addressState: 'NY' }), ['1 High Street', 'Town, NY 12345']);
  assert.deepEqual(lines('Canada', { addressState: 'QC' }), ['1 High Street', 'Town, QC 12345']);
  assert.deepEqual(lines('India', { addressState: 'KA' }), ['1 High Street', 'Town, KA 12345']);
  assert.deepEqual(lines('United Kingdom', { addressPostcode: 'SW1A 1AA' }), ['1 High Street', 'Town', 'SW1A 1AA']);
  assert.deepEqual(lines(''), ['1 High Street', '12345 Town']);
  assert.deepEqual(addressLines({ ...address('1 High Street', 'Town', '12345', 'France'), addressStreet2: 'Bât. B' }, true), ['1 High Street', 'Bât. B', '12345 Town', 'France']);
  assert.deepEqual(addressLines(null, true), []);
});

test('a country is known by its English name, as Twenty stores it, or by its code', () => {
  assert.equal(countryCode('France'), 'FR');
  assert.equal(countryCode('united kingdom'), 'GB');
  assert.equal(countryCode('Côte d’Ivoire'), 'CI');
  assert.equal(countryCode('ma'), 'MA');
  assert.equal(countryCode('Atlantis'), null);
  assert.equal(countryCode(''), null);
  assert.equal(countryCode(null), null);
});

test('units are named in the document’s language, and an unknown unit is printed as it is', () => {
  assert.equal(unitName(PACKS.FR, 'FLAT_FEE'), 'forfait');
  assert.equal(unitName(PACKS.EN, 'M2'), 'm²');
  assert.equal(unitName(PACKS.EN, 'CRATE'), 'crate');
  assert.equal(unitName(PACKS.EN, null), '');
});

test('rich text is printed as plain text: the markdown Twenty stores, markup removed', () => {
  assert.equal(plainText(markdown('# Terms\n\nSome **bold**, *italic* and _underlined_ text.')), 'Terms\n\nSome bold, italic and underlined text.');
  assert.equal(plainText(markdown('- one\n* two\n+ three\n- [x] done')), '- one\n- two\n- three\n- done');
  assert.equal(plainText(markdown('See [the site](https://x.example) and ![logo](a.png).')), 'See the site and logo.');
  assert.equal(plainText(markdown('snake_case_name and 2 * 3 * 4')), 'snake_case_name and 2 * 3 * 4');
  assert.equal(plainText(markdown('> quoted\n`code` ~~gone~~ 1\\. not a list')), 'quoted\ncode gone 1. not a list');
  assert.equal(plainText({ markdown: null, blocknote: JSON.stringify([
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }, { type: 'link', content: [{ type: 'text', text: ' world' }] }], children: [] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Again' }], children: [] },
  ]) }), 'Hello world\nAgain');
  assert.equal(plainText({ markdown: null, blocknote: 'not json' }), '');
  assert.equal(plainText(null), '');
});

test('the QR code carries the number, the date, the total, the currency and the seller’s first printed identifier', async () => {
  const w = workspace();
  const l = await loaded(w);
  const withQr = (mode: string, url = '') => ({ ...l, profile: { ...l.profile!, qrMode: mode }, issuer: { ...l.issuer!, verificationBaseUrl: { primaryLinkUrl: url } } });
  assert.deepEqual(render(withQr('PAYLOAD')).qr, { mode: 'PAYLOAD', payload: 'F2026-0001;2026-09-26;9792.00;EUR;000000000' });
  assert.deepEqual(render(withQr('URL_WITH_PAYLOAD', 'https://verify.example/check')).qr, {
    mode: 'URL_WITH_PAYLOAD', payload: 'F2026-0001;2026-09-26;9792.00;EUR;000000000', baseUrl: 'https://verify.example/check',
  });
  assert.equal(render(withQr('URL_WITH_PAYLOAD')).qr?.baseUrl, null);
  assert.equal(render(withQr('PAYLOAD'), null).qr, null, 'a preview has no number, so no QR code');
  assert.equal(render(withQr('NONE')).qr, null);
});

test('an amount in the QR code keeps its currency’s decimals', () => {
  assert.equal(decimalAmount(9_792_000_000, 'EUR'), '9792.00');
  assert.equal(decimalAmount(1_500_000_000, 'JPY'), '1500');
  assert.equal(decimalAmount(1_234_567_000, 'KWD'), '1234.567');
  assert.equal(decimalAmount(-1_000_000, 'EUR'), '-1.00');
});

test('a FILES value keeps only what Twenty accepts on write', () => {
  assert.deepEqual(fileInputs([{ fileId: 'a', label: 'A.pdf', extension: '.pdf', url: 'https://x/file/a?token=t' }, { label: 'no id' }]), [{ fileId: 'a', label: 'A.pdf' }]);
  assert.deepEqual(fileInputs(null), []);
});

test('an amount is read from a CURRENCY value, as a number or as digits', () => {
  assert.equal(microsOf(money(12_000_000)), 12_000_000);
  assert.equal(microsOf({ amountMicros: '-3000000', currencyCode: 'EUR' }), -3_000_000);
  assert.ok(Number.isNaN(microsOf({ amountMicros: '1.5', currencyCode: 'EUR' })));
  assert.ok(Number.isNaN(microsOf(null)));
});
