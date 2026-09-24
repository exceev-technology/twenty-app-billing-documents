import { test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { checkRender, definitionFor, renderDocument } from '../../render/document.ts';
import { mockCreditNote, mockInvoice, mockLongInvoice, mockReceipt } from '../../render/samples/mock.ts';
import { countPages } from '../../render/pdf.ts';
import { RenderError, type RenderLine } from '../../render/types.ts';
import { formatMoney } from '../../render/format.ts';
import { pdfStreams, shown } from './helpers/pdf-text.ts';
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

test('a credit note names the invoice it corrects, in either language', () => {
  const input = mockCreditNote();
  const text = printed(definitionFor(input));
  assert.ok(text.includes('Credit note'), 'the title is not a credit note');
  assert.ok(text.includes('Original invoice: INV-2026-0042 (24/09/2026)'), 'the corrected invoice is not named');
  assert.ok(printed(definitionFor({ ...input, language: 'FR', locale: 'fr-FR' })).includes('Facture d’origine'), 'the French label is missing');
  assert.deepEqual(
    checkRender({ ...input, corrects: { number: 'INV-2026-0042', issueDate: '24/09/2026' } }),
    [{ code: 'INVALID_DATE', field: 'corrects.issueDate', value: '24/09/2026' }],
  );
  assert.deepEqual(checkRender({ ...input, corrects: { number: 'INV-٤٢', issueDate: '2026-09-24' } })[0]?.field, 'corrects.number');
});

test('the recap gives the rate a column of its own, and the lines table prints unit prices in full', () => {
  const input = mockInvoice();
  const content = (definitionFor({ ...input, lines: [{ ...input.lines[0]!, unitPriceMicros: 12_500 }, ...input.lines.slice(1)] }) as { content: unknown }).content;
  const find = (node: unknown, first: string): { body: { text: unknown }[][] } | undefined => {
    if (!node || typeof node !== 'object') return undefined;
    const table = (node as { table?: { body?: { text?: unknown }[][] } }).table;
    if (table?.body?.[0]?.[0]?.text === first) return table as { body: { text: unknown }[][] };
    for (const child of Object.values(node)) {
      const found = find(child, first);
      if (found) return found;
    }
    return undefined;
  };
  const recap = find(content, 'Tax summary')!;
  assert.deepEqual(recap.body.map((row) => row[1]!.text), ['Rate', '20%']);
  assert.equal(find(content, 'Description')!.body[1]![2]!.text, '€0.0125');
});

test('a document with no number prints the draft marker instead', () => {
  const text = printed(definitionFor({ ...mockInvoice(), number: null }));
  assert.match(text, /DRAFT/);
});

test('the lines table repeats its header and the footer counts the pages', () => {
  const definition = definitionFor(mockLongInvoice()) as Record<string, any>;
  assert.ok(JSON.stringify(definition.content).includes('"headerRows":1'), 'the lines table does not repeat its header');
  assert.equal(typeof definition.footer, 'function');
  assert.match(printed(definition.footer(2, 3)), /Page 2 of 3/);
  assert.match(printed((definitionFor({ ...mockLongInvoice(), language: 'FR', locale: 'fr-FR' }) as Record<string, any>).footer(2, 3)), /Page 2 sur 3/);
});

test('the tax column shows whenever the lines use two codes, even two with the same name', () => {
  const input = mockLongInvoice();
  const sameName = {
    ...input,
    taxNames: Object.fromEntries(Object.keys(input.taxNames).map((code) => [code, 'VAT'])),
    lines: input.lines.map((line) => ({ ...line, taxLabel: 'VAT' })),
  };
  const table = (definitionFor(sameName) as { content: { table?: { headerRows?: number; widths: unknown[] } }[] }).content
    .find((node) => node.table?.headerRows === 1)!.table!;
  assert.equal(table.widths.length, 6, 'description, quantity, unit price, discount, tax and amount');
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

/** A real PNG of the given size, one flat colour: big in pixels, small in bytes. */
function flatPng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x40)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

test('a logo far larger than its slot is drawn scaled into it, never at full size', async () => {
  const input = mockInvoice();
  const { bytes } = await renderDocument({ ...input, brand: { ...input.brand, logo: { bytes: flatPng(3000, 1200), type: 'image/png' } } });
  const file = Buffer.from(bytes).toString('latin1');
  assert.match(file, /\/Subtype \/Image[\s\S]*?\/Width 3000/, 'the logo was not embedded');
  const drawn = [...pdfStreams(file).join('\n').matchAll(/([\d.]+) 0 0 (-?[\d.]+) -?[\d.]+ -?[\d.]+ cm\s*\/I\d+ Do/g)];
  assert.equal(drawn.length, 1, 'the logo was not drawn exactly once');
  const [, width, height] = drawn[0]!;
  assert.ok(Number(width) <= 120 && Math.abs(Number(height)) <= 48, `drawn at ${width} x ${height} pt, outside its 120 x 48 slot`);
});

test('a logo that starts right but is damaged is refused, not thrown by the PDF library', async () => {
  const input = mockInvoice();
  const png = flatPng(200, 80);
  for (const logo of [
    { bytes: png.slice(0, png.length - 40), type: 'image/png' as const },
    { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4]), type: 'image/jpeg' as const },
  ]) {
    await assert.rejects(renderDocument({ ...input, brand: { ...input.brand, logo } }), (error: unknown) => {
      assert.ok(error instanceof RenderError, `${logo.type}: ${String(error)}`);
      assert.deepEqual(error.problems, [{ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo.bytes', value: logo.type }]);
      return true;
    });
  }
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
  const kashmiri = one({ locale: 'ks' });
  assert.deepEqual([kashmiri[0]?.code, kashmiri[0]?.field], ['UNSUPPORTED_SCRIPT', 'locale'], 'a locale whose numbers Roboto cannot draw');
  assert.deepEqual(one({ qr: { mode: 'PAYLOAD', payload: '' } }), [{ code: 'QR_PAYLOAD_EMPTY', field: 'qr.payload' }]);
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
  const input = mockInvoice();
  await assert.rejects(
    renderDocument({ ...input, template: 'fancy' as never, locale: 'fr_FR', notes: 'Delivery → Bordeaux' }),
    (error: unknown) => {
      assert.ok(error instanceof RenderError);
      assert.deepEqual(error.problems.map((problem) => problem.code).sort(), ['INVALID_LOCALE', 'UNKNOWN_TEMPLATE', 'UNSUPPORTED_SCRIPT']);
      return true;
    },
  );
});
