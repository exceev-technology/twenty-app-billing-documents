import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRender, definitionFor, renderDocument } from '../../render/document.ts';
import { mockInvoice, mockLongInvoice, mockReceipt } from '../../render/samples/mock.ts';
import { countPages } from '../../render/pdf.ts';
import { RenderError, type RenderLine } from '../../render/types.ts';
import { formatMoney } from '../../render/format.ts';
import { shown } from './helpers/pdf-text.ts';
import { printed } from './helpers/printed.ts';

test('the classic layout prints everything the law needs', () => {
  const input = mockInvoice();
  const text = printed(definitionFor(input));
  for (const needed of [
    input.number!, input.seller.name, input.buyer.name, input.subject!,
    ...input.identifiers.map((identifier) => identifier.value),
    ...input.lines.map((line) => line.description),
    input.mentions!, input.brand.footerNote!, input.taxNotes[0]!,
  ]) {
    assert.ok(text.includes(needed), `missing from the page: ${needed}`);
  }
  for (const row of input.totals.recap) assert.match(text, new RegExp(String(row.rate).replace('.', '[.,]')));
});

test('the tax recap names each code, and never prints its identity', () => {
  const input = mockInvoice();
  const text = printed(definitionFor(input));
  for (const code of input.totals.taxCodesUsed) {
    assert.ok(text.includes(input.taxNames[code]!), `the recap lacks the name of ${code}`);
    assert.ok(!text.includes(code), `the recap prints the identity ${code}`);
  }
});

test('a code with several components names each of them in the recap', () => {
  const input = mockInvoice();
  const code = 'c0de0000-0000-4000-8000-00000000c0de';
  const row = { taxCode: code, baseMicros: 100_000_000 };
  const text = printed(definitionFor({
    ...input,
    taxNames: { [code]: 'GST 5% + QST 9.975%' },
    totals: {
      ...input.totals,
      taxCodesUsed: [code],
      recap: [
        { ...row, component: 'GST', rate: 5, taxMicros: 5_000_000 },
        { ...row, component: 'QST', rate: 9.975, taxMicros: 9_980_000 },
      ],
    },
  }));
  assert.ok(text.includes('GST 5% + QST 9.975% - GST'), 'the GST row is not named');
  assert.ok(text.includes('GST 5% + QST 9.975% - QST'), 'the QST row is not named');
});

test('a discount is shown as already deducted, never as a step between subtotal and tax', async () => {
  const input = mockLongInvoice();
  const money = (micros: number): string => formatMoney(micros, 'EUR', 'en-GB');
  const { subtotalMicros, discountTotalMicros, taxTotalMicros, totalMicros } = input.totals;
  assert.ok(discountTotalMicros > 0, 'the long invoice should carry discounts');
  const text = await shown(input);
  assert.ok(text.includes(`Subtotal ${money(subtotalMicros)}\nTax ${money(taxTotalMicros)}\nTotal ${money(totalMicros)}`), 'the totals do not read as a sum');
  assert.ok(text.includes(`Discounts applied: ${money(discountTotalMicros)}`), 'the discount is not shown');
});

test('a document with no number prints the draft marker instead', () => {
  const text = printed(definitionFor({ ...mockInvoice(), number: null }));
  assert.match(text, /DRAFT/);
});

test('the lines table repeats its header and the footer counts the pages', () => {
  const definition = definitionFor(mockLongInvoice()) as Record<string, any>;
  assert.ok(JSON.stringify(definition.content).includes('"headerRows":1'), 'the lines table does not repeat its header');
  assert.equal(typeof definition.footer, 'function');
  assert.match(printed(definition.footer(2, 3)), /Page 2 \/ 3/);
});

test('a long document really does run to more than one page', async () => {
  const { bytes, pages } = await renderDocument(mockLongInvoice());
  assert.ok(pages > 1, `only ${pages} page(s)`);
  assert.equal(countPages(bytes), pages);
});

test('columns that are empty on every line are dropped', () => {
  const withDiscounts = printed(definitionFor(mockLongInvoice()));
  assert.ok(withDiscounts.includes('Discount'), 'the discount column is missing when lines have discounts');
  const plain = mockInvoice();
  const text = printed(definitionFor({ ...plain, lines: plain.lines.map((line) => ({ ...line, discountPercent: null })) }));
  assert.ok(!text.includes('Discount'), 'the discount column is printed with nothing in it');
});

test('text far longer than its box wraps instead of being dropped', () => {
  const long = 'x'.repeat(300);
  const input = mockInvoice();
  const text = printed(definitionFor({
    ...input,
    buyer: { ...input.buyer, name: 'y'.repeat(120) },
    lines: [{ ...input.lines[0]!, description: long }],
  }));
  assert.ok(text.includes(long), 'the long description was dropped');
  assert.ok(text.includes('y'.repeat(120)), 'the long buyer name was dropped');
});

test('a logo far larger than its slot is scaled, never drawn at full size', () => {
  const input = mockInvoice();
  const huge = { bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), type: 'image/png' as const };
  const definition = JSON.stringify(definitionFor({ ...input, brand: { ...input.brand, logo: huge } }));
  assert.match(definition, /"fit":\[\d+,\d+\]/, 'the logo has no fit box');
});

test('an accent colour that is not a hex triplet falls back to the default ink', () => {
  const input = mockInvoice();
  for (const accentColor of ['red', '#GGG', '', null]) {
    const definition = JSON.stringify(definitionFor({ ...input, brand: { ...input.brand, accentColor } }));
    assert.ok(!definition.includes('"color":"red"'), `${accentColor} reached the page`);
    assert.ok(definition.includes('#1f2933'), `${accentColor} did not fall back`);
  }
});

test('a template, a language, a logo type, the tax names and a QR payload are all checked', () => {
  const input = mockInvoice();
  const code = input.totals.taxCodesUsed[0]!;
  assert.deepEqual(checkRender(input), []);
  assert.deepEqual(checkRender({ ...input, taxNames: {} }), [{ code: 'MISSING_TAX_NAME', field: 'taxNames', value: code }]);
  assert.deepEqual(checkRender({ ...input, taxNames: { [code]: '  ' } }), [{ code: 'MISSING_TAX_NAME', field: 'taxNames', value: code }]);
  assert.deepEqual(checkRender({ ...input, template: 'fancy' as never }), [{ code: 'UNKNOWN_TEMPLATE', field: 'template', value: 'fancy' }]);
  assert.deepEqual(checkRender({ ...input, language: 'ES' as never }), [{ code: 'UNKNOWN_LANGUAGE', field: 'language', value: 'ES' }]);
  assert.deepEqual(
    checkRender({ ...input, brand: { ...input.brand, logo: { bytes: new Uint8Array([1]), type: 'image/svg+xml' as never } } }),
    [{ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo', value: 'image/svg+xml' }],
  );
  assert.deepEqual(
    checkRender({ ...input, qr: { mode: 'PAYLOAD', payload: 'x'.repeat(400) } }),
    [{ code: 'QR_PAYLOAD_TOO_LONG', field: 'qr.payload', value: '400 bytes' }],
  );
});

const EPC = 'BCD\n002\n1\nSCT\n\nVerdal Studio\nFR7630006000011234567890189\nEUR9792.00\n\n\nINV-2026-0042\n';

test('a QR code is sized to scan: error correction M, whole modules of at least 2 pt, inside the layout', async () => {
  for (const template of ['classic', 'receipt'] as const) {
    const input = { ...mockInvoice(), template, qr: { mode: 'PAYLOAD' as const, payload: EPC } };
    const qr = JSON.stringify(definitionFor(input)).match(/\{"qr":[^}]*\}/)?.[0];
    assert.ok(qr, `${template}: no QR`);
    const { eccLevel, version, fit } = JSON.parse(qr) as { eccLevel: string; version: number; fit: number };
    const modules = 17 + 4 * version;
    assert.equal(eccLevel, 'M');
    assert.equal(fit % modules, 0, `${template}: ${fit} pt is not a whole number of modules`);
    assert.ok(fit / modules >= 2, `${template}: ${fit / modules} pt modules are too small to scan`);
    const { pages } = await renderDocument(input);
    assert.equal(pages, 1);
  }
});

test('a QR URL counts its base URL, joins its query properly, and needs its base URL', () => {
  const input = mockInvoice();
  const base = 'https://payments.verdal.example/invoice/';
  assert.deepEqual(
    checkRender({ ...input, qr: { mode: 'URL_WITH_PAYLOAD', payload: 'x'.repeat(300), baseUrl: base } }),
    [{ code: 'QR_PAYLOAD_TOO_LONG', field: 'qr.payload', value: '341 bytes' }],
  );
  assert.deepEqual(
    checkRender({ ...input, qr: { mode: 'URL_WITH_PAYLOAD', payload: 'id=42', baseUrl: null } }),
    [{ code: 'QR_BASE_URL_MISSING', field: 'qr.baseUrl' }],
  );
  const joined = JSON.stringify(definitionFor({ ...input, qr: { mode: 'URL_WITH_PAYLOAD', payload: 'id=42', baseUrl: 'https://pay.example/?lang=fr' } }));
  assert.ok(joined.includes('"qr":"https://pay.example/?lang=fr&id=42"'), 'a base URL with a query got a second ?');
});

test('the receipt ends with its QR code, after the legal text', async () => {
  const input = { ...mockReceipt(), qr: { mode: 'PAYLOAD' as const, payload: EPC } };
  const content = JSON.stringify((definitionFor(input) as { content: unknown }).content);
  assert.ok(content.lastIndexOf('"qr"') > content.lastIndexOf(input.brand.footerNote!), 'the QR is not last on the receipt');
});

test('a malformed locale, date or logo is refused with its field, never thrown raw', async () => {
  const input = mockInvoice();
  const one = (patch: Partial<typeof input>) => checkRender({ ...input, ...patch });
  assert.deepEqual(one({ locale: 'fr_FR' }), [{ code: 'INVALID_LOCALE', field: 'locale', value: 'fr_FR' }]);
  assert.deepEqual(one({ locale: '' }), [{ code: 'INVALID_LOCALE', field: 'locale', value: '' }]);
  assert.deepEqual(one({ currencyCode: 'EURO' }), [{ code: 'INVALID_CURRENCY', field: 'currencyCode', value: 'EURO' }]);
  assert.deepEqual(one({ dueDate: '24/10/2026' }), [{ code: 'INVALID_DATE', field: 'dueDate', value: '24/10/2026' }]);
  assert.deepEqual(one({ issueDate: '2026-02-30' }), [{ code: 'INVALID_DATE', field: 'issueDate', value: '2026-02-30' }]);
  assert.deepEqual(
    one({ lines: [{ ...input.lines[0]!, periodStart: '2026-13-01' }, ...input.lines.slice(1)] }),
    [{ code: 'INVALID_DATE', field: 'lines[0].periodStart', value: '2026-13-01' }],
  );
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.deepEqual(
    one({ brand: { ...input.brand, logo: { bytes: svg, type: 'image/png' } } }),
    [{ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo.bytes', value: 'image/png' }],
  );
  await assert.rejects(renderDocument({ ...input, locale: 'fr_FR' }), (error: unknown) => error instanceof RenderError);
});

test('text the font cannot draw is refused, naming the field, wherever it hides', () => {
  const input = mockInvoice();
  const first = (patch: Partial<typeof input>) => checkRender({ ...input, ...patch })[0];
  assert.deepEqual(first({ buyer: { ...input.buyer, name: 'مؤسسة الشرق' } })?.field, 'buyer.name');
  assert.deepEqual(first({ lines: [{ ...input.lines[0]!, description: 'Conseil 相談' } as RenderLine] })?.field, 'lines[0].description');
  assert.deepEqual(first({ mentions: 'Paiement à 30 jours ☕' })?.field, 'mentions');
  assert.deepEqual(first({ brand: { ...input.brand, footerNote: 'शुक्रिया' } })?.field, 'brand.footerNote');
  const code = input.totals.taxCodesUsed[0]!;
  assert.deepEqual(first({ taxNames: { [code]: 'ضريبة القيمة المضافة' } })?.field, `taxNames.${code}`);
  assert.equal(first({ mentions: 'Paiement ☕' })?.code, 'UNSUPPORTED_SCRIPT');
});

test('the guard follows the font: it refuses what Roboto lacks, and accepts what it draws', () => {
  const input = mockInvoice();
  const check = (patch: Partial<typeof input>) => checkRender({ ...input, ...patch });
  assert.deepEqual(check({ notes: 'Delivery → Bordeaux' }), [{ code: 'UNSUPPORTED_SCRIPT', field: 'notes', value: '→' }]);
  assert.deepEqual(check({ buyer: { ...input.buyer, name: 'ООО «Ромашка»' } }), []);
  assert.deepEqual(check({ notes: 'Line one\r\nLine two\ttabbed' }), [], 'pasted Windows text is refused');
  assert.deepEqual(check({ buyer: { ...input.buyer, name: 'Societé' } }), [], 'a decomposed accent is refused');
  assert.deepEqual(check({ locale: 'ar-EG' }), [], 'an Arabic locale still prints Latin digits');
});

test('pasted text is tidied before it is drawn: composed accents, Unix line breaks, no tabs', () => {
  const input = mockInvoice();
  const text = printed(definitionFor({ ...input, notes: 'Line one\r\nLine two\tend', buyer: { ...input.buyer, name: 'Societé' } }));
  assert.ok(text.includes('Line one\nLine two end'), 'the notes were not tidied');
  assert.ok(text.includes('Societé'), 'the accent was not composed');
  assert.ok(!text.includes('\r'), 'a carriage return reached the page');
});

test('rendering refuses a document with problems, and says all of them', async () => {
  await assert.rejects(
    renderDocument({ ...mockInvoice(), template: 'fancy' as never }),
    (error: unknown) => error instanceof Error && error.name === 'RenderError',
  );
});
