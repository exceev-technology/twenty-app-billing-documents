import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definitionFor, renderDocument } from '../../render/document.ts';
import { mockInvoice, mockLongInvoice, mockQuote, mockReceipt } from '../../render/samples/mock.ts';
import type { RenderInput, TemplateKey } from '../../render/types.ts';
import { formatMoney } from '../../render/format.ts';
import { shown } from './helpers/pdf-text.ts';
import { printed } from './helpers/printed.ts';

const TEMPLATES: TemplateKey[] = ['classic', 'modern', 'compact', 'letterhead', 'receipt'];
const on = (template: TemplateKey, input: RenderInput): RenderInput => ({ ...input, template });

test('every layout prints the content the law needs, on every document', () => {
  for (const template of TEMPLATES) {
    for (const make of [mockInvoice, mockQuote, mockLongInvoice]) {
      const input = on(template, make());
      const text = printed(definitionFor(input));
      const needed = [
        input.number!, input.seller.name, ...input.lines.map((line) => line.description), input.mentions!, input.taxNotes[0]!,
        ...input.totals.taxCodesUsed.map((code) => input.taxNames[code]!),
      ];
      if (template !== 'receipt') needed.push(input.buyer.name);
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

test('a document with everything optional missing still renders cleanly', () => {
  const bare = (template: TemplateKey): RenderInput => ({
    ...on(template, mockInvoice()),
    dueDate: null, validUntil: null, subject: null, notes: null, buyerReference: null,
    identifiers: [], taxNotes: [], mentions: null, amountInWords: false,
    brand: { accentColor: null, footerNote: null, paymentDetails: null, logo: null },
    qr: null,
  });
  for (const template of TEMPLATES) {
    const text = printed(definitionFor(bare(template)));
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
