import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPages, toPdf, type PdfDefinition } from '../../render/pdf.ts';

const ONE_PAGE: PdfDefinition = { content: [{ text: 'Hello' }], defaultStyle: { font: 'Roboto' } };
const TWO_PAGES: PdfDefinition = {
  content: [{ text: 'one' }, { text: 'two', pageBreak: 'before' }],
  defaultStyle: { font: 'Roboto' },
};
const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

test('a definition becomes a PDF', async () => {
  const bytes = await toPdf(ONE_PAGE, '2026-09-24');
  assert.equal(latin1(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.length > 500, `only ${bytes.length} bytes`);
});

test('the same definition rendered twice gives identical bytes', async () => {
  const first = await toPdf(ONE_PAGE, '2026-09-24');
  const second = await toPdf(ONE_PAGE, '2026-09-24');
  assert.deepEqual(first, second);
});

test('every date in the file is the issue date, so an archive can be hashed', async () => {
  const text = latin1(await toPdf(ONE_PAGE, '2026-09-24'));
  assert.match(text, /D:20260924000000Z/);
  assert.equal(text.match(/D:\d{14}/g)?.every((found) => found === 'D:20260924000000'), true);
});

test('pages are counted from the bytes', async () => {
  assert.equal(countPages(await toPdf(ONE_PAGE, '2026-09-24')), 1);
  assert.equal(countPages(await toPdf(TWO_PAGES, '2026-09-24')), 2);
});
