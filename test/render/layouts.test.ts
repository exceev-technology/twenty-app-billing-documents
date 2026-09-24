import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definitionFor, renderDocument } from '../../render/document.ts';
import { mockCreditNote, mockInvoice, mockLongInvoice, mockQuote, mockReceipt } from '../../render/samples/mock.ts';
import type { RenderInput, TemplateKey } from '../../render/types.ts';
import { formatMoney } from '../../render/format.ts';
import { pdfText, placed, shown } from './helpers/pdf-text.ts';
import { printed } from './helpers/printed.ts';

const TEMPLATES: TemplateKey[] = ['classic', 'modern', 'compact', 'letterhead', 'receipt'];
const on = (template: TemplateKey, input: RenderInput): RenderInput => ({ ...input, template });

test('every layout prints the content the law needs, on every document', () => {
  for (const template of TEMPLATES) {
    for (const make of [mockInvoice, mockQuote, mockLongInvoice, mockReceipt, mockCreditNote]) {
      const input = on(template, make());
      const text = printed(definitionFor(input));
      const { seller, buyer } = input;
      const needed = [
        input.number!,
        seller.name, seller.legalName!, seller.legalForm!, ...seller.addressLines, seller.email!, seller.phone!, seller.website!,
        ...input.identifiers.filter((identifier) => identifier.side === 'SELLER').map((identifier) => identifier.value),
        ...input.lines.map((line) => line.description),
        ...input.totals.taxCodesUsed.map((code) => input.taxNames[code]!),
        formatMoney(input.totals.subtotalMicros, 'EUR', 'en-GB'), formatMoney(input.totals.totalMicros, 'EUR', 'en-GB'),
        input.mentions!, ...input.taxNotes, input.brand.footerNote!,
        ...(input.corrects ? [input.corrects.number] : []),
      ];
      if (template !== 'receipt') {
        needed.push(buyer.name, ...buyer.addressLines, ...input.identifiers.filter((identifier) => identifier.side === 'BUYER').map((identifier) => identifier.value));
      }
      for (const value of needed) assert.ok(text.includes(value), `${template}: missing ${value}`);
      for (const row of input.totals.recap) {
        assert.ok(text.includes(String(row.rate)) || text.includes(String(row.rate).replace('.', ',')), `${template}: missing the ${row.rate}% recap row`);
      }
    }
  }
});

test('legal text taller than a page flows on, and takes nothing with it', async () => {
  for (const template of TEMPLATES) {
    const input = { ...on(template, mockInvoice()), mentions: `${'General terms of sale apply to this invoice. '.repeat(600)}ENDOFTERMS` };
    const text = await shown(input);
    for (const needed of ['Tax summary', formatMoney(input.totals.totalMicros, 'EUR', 'en-GB'), 'Payment details:', 'VAT on debits.', 'ENDOFTERMS']) {
      assert.ok(text.includes(needed), `${template}: ${needed} vanished`);
    }
  }
});

test('a line taller than a page breaks across pages instead of vanishing', async () => {
  for (const template of TEMPLATES) {
    const input = on(template, mockInvoice());
    const [first, ...rest] = input.lines;
    const text = await shown({ ...input, lines: [{ ...first!, description: `${'Scope item, as agreed. '.repeat(700)}ENDOFSCOPE` }, ...rest] });
    for (const needed of ['ENDOFSCOPE', formatMoney(first!.lineTotalMicros, 'EUR', 'en-GB'), formatMoney(rest[0]!.lineTotalMicros, 'EUR', 'en-GB')]) {
      assert.ok(text.includes(needed), `${template}: ${needed} vanished`);
    }
  }
});

test('a word longer than its column wraps, and pushes no column off the page', async () => {
  // Where each amount starts: a column pushed sideways moves them, and nothing may start past the page's edge.
  const amounts = async (input: RenderInput): Promise<number[]> => {
    const pages = placed((await renderDocument(input)).bytes);
    for (const { width, pieces } of pages) {
      for (const piece of pieces) assert.ok(piece.x < width, `${input.template}: "${piece.text}" starts past the page's edge`);
    }
    const wanted = input.lines.map((line) => formatMoney(line.lineTotalMicros, 'EUR', 'en-GB'));
    return pages.flatMap(({ pieces }) => pieces.filter((piece) => wanted.includes(piece.text.trim())).map((piece) => Math.round(piece.x)));
  };
  for (const template of TEMPLATES) {
    const input = on(template, mockInvoice());
    const [first, ...rest] = input.lines;
    const normal = await amounts(input);
    assert.ok(normal.length >= input.lines.length, `${template}: the amounts were not found`);
    for (const description of ['Rechnungsstellungsdienstleistungspaket', 'x'.repeat(300)]) {
      assert.deepEqual(await amounts({ ...input, lines: [{ ...first!, description }, ...rest] }), normal, `${template}: a ${description.length}-character word moved the amounts`);
    }
    assert.deepEqual(await amounts({ ...input, buyer: { ...input.buyer, name: 'y'.repeat(200) }, mentions: 'z'.repeat(400) }), normal, `${template}: a long name or mention moved the amounts`);
  }
});

test('an e-mail, an IBAN and a URL copy out of the PDF whole, on every layout', async () => {
  const url = 'https://verdal.example/terms/2026/receipts';
  const iban = 'FR7630006000011234567890189';
  for (const template of TEMPLATES) {
    const input = on(template, mockInvoice());
    const text = await shown({ ...input, notes: url, brand: { ...input.brand, paymentDetails: `IBAN ${iban} BIC BNPAFRPPXXX` } });
    for (const whole of [input.seller.email!, iban, url]) {
      assert.ok(text.split('\n').some((line) => line.includes(whole)), `${template}: ${whole} is cut or spaced out`);
    }
  }
});

test('a line stays on one page with its service period, however the pages fall', async () => {
  for (const template of TEMPLATES.filter((key) => key !== 'receipt')) {
    const pages = pdfText((await renderDocument(on(template, mockLongInvoice()))).bytes);
    assert.ok(pages.length > 1, `${template}: the long invoice should run to several pages`);
    for (const [index, page] of pages.entries()) {
      const lines = page.split('\n');
      const starts = lines.filter((line) => /^Sprint \d+:/.test(line)).length;
      const periods = lines.filter((line) => line.startsWith('Period:')).length;
      assert.equal(starts, periods, `${template}, page ${index + 1}: a line and its service period were parted`);
    }
  }
});

test('a document with everything optional missing still renders cleanly', () => {
  const bare = (template: TemplateKey): RenderInput => ({
    ...on(template, mockInvoice()),
    dueDate: null, validUntil: null, subject: null, notes: null, buyerReference: null,
    identifiers: [], taxNotes: [], mentions: null, amountInWords: false,
    brand: { accentColor: null, footerNote: null, paymentDetails: null, logo: null },
    qr: null,
  });
  for (const template of TEMPLATES) {
    const definition = definitionFor(bare(template)) as { content: unknown };
    // pdfmake gives an empty text a full line: an absent block must leave nothing behind, not a gap.
    assert.ok(!JSON.stringify(definition.content).includes('{"text":""'), `${template} leaves empty lines where absent blocks were`);
    const text = printed(definition);
    for (const orphan of ['Due date:', 'Your reference:', 'Subject:', 'Payment details:']) {
      assert.ok(!text.includes(orphan), `${template} prints "${orphan}" with nothing after it`);
    }
    assert.ok(text.includes('INV-2026-0042'), `${template} lost the number`);
  }
});

test('the receipt is an 80 mm roll with no buyer block', () => {
  const definition = definitionFor(mockReceipt()) as Record<string, any>;
  assert.deepEqual(definition.pageSize, { width: 226.77, height: 'auto' });
  assert.ok(!printed(definition).includes(mockReceipt().buyer.name));
});

test('the letterhead leaves its top band empty and still prints the seller', () => {
  const definition = definitionFor(on('letterhead', mockInvoice())) as Record<string, any>;
  assert.ok(definition.pageMargins[1] >= 127, `top margin is ${definition.pageMargins[1]}pt, not 45 mm`);
  assert.ok(printed(definition).includes(mockInvoice().seller.name), 'the seller disappeared');
});

test('the modern layout puts its header in an accent band, the classic one does not', () => {
  const modern = definitionFor(on('modern', mockInvoice())) as Record<string, any>;
  const classic = definitionFor(on('classic', mockInvoice())) as Record<string, any>;
  assert.ok(modern.content[0].table, 'the modern header is not a band');
  assert.ok(!classic.content[0].table, 'the classic header should not be a band');
});

/** The totals table: the one whose first row is the subtotal. Its layout callbacks are kept on the definition. */
function totalsTable(template: TemplateKey): { layout: Record<string, (index: number, node: unknown) => unknown>; table: unknown } {
  const find = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return undefined;
    const record = node as { table?: { body?: { text?: string }[][] } };
    if (record.table?.body?.[0]?.[0]?.text === 'Subtotal') return record;
    for (const child of Object.values(node)) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };
  return find((definitionFor(on(template, mockInvoice())) as { content: unknown }).content) as ReturnType<typeof totalsTable>;
}

test('classic boxes its totals, modern sets them on a tinted panel, the others leave them plain', () => {
  const classic = totalsTable('classic');
  assert.equal(classic.layout.vLineWidth!(0, classic), 0.5, 'classic totals have no left border');
  assert.equal(classic.layout.hLineWidth!(0, classic), 0.5, 'classic totals have no top border');
  const modern = totalsTable('modern');
  const fill = modern.layout.fillColor?.(0, modern);
  assert.match(String(fill), /^#[0-9a-f]{6}$/, 'modern totals have no panel');
  assert.notEqual(fill, '#ffffff');
  const compact = totalsTable('compact');
  assert.equal(compact.layout.fillColor, undefined);
  assert.equal(compact.layout.vLineWidth!(0, compact), 0);
});

test('a light accent never leaves text that cannot be read', () => {
  const yellow = '#f5d547';
  for (const template of ['classic', 'modern'] as const) {
    const input = on(template, mockInvoice());
    const json = JSON.stringify(definitionFor({ ...input, brand: { ...input.brand, accentColor: yellow } }));
    assert.ok(!json.includes(`"color":"${yellow}"`), `${template}: yellow text on white paper`);
    assert.ok(!json.includes('"color":"#ffffff"'), `${template}: white text on a yellow band`);
  }
  assert.ok(JSON.stringify(definitionFor(on('modern', mockInvoice()))).includes('"color":"#ffffff"'), 'a dark band lost its white text');
  assert.ok(JSON.stringify(definitionFor(on('classic', mockInvoice()))).includes('"color":"#2f6f4e"'), 'a dark accent no longer colours the headings');
});

test('the compact layout fits a long invoice in fewer pages than the classic one', async () => {
  const compact = await renderDocument(on('compact', mockLongInvoice()));
  const classic = await renderDocument(on('classic', mockLongInvoice()));
  assert.ok(compact.pages <= classic.pages, `compact ${compact.pages} pages, classic ${classic.pages}`);
  assert.ok(classic.pages > 1, 'the long invoice should not fit on one page');
});

test('every layout renders real bytes for every document', async () => {
  for (const template of TEMPLATES) {
    for (const make of [mockInvoice, mockQuote, mockReceipt]) {
      const { bytes, pages } = await renderDocument(on(template, make()));
      assert.equal(Buffer.from(bytes.slice(0, 5)).toString('latin1'), '%PDF-', `${template}`);
      assert.ok(pages >= 1, `${template}`);
    }
  }
});
