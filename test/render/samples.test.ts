import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderDocument } from '../../render/document.ts';
import { mockCreditNote, mockInvoice, mockLogo, mockLongInvoice, mockQuote, mockReceipt } from '../../render/samples/mock.ts';

const LOGO = fileURLToPath(new URL('../../render/samples/logo.png', import.meta.url));

test('the mock logo is a real PNG, generated into the repository', () => {
  assert.ok(existsSync(LOGO), 'run: npm run mock:logo');
  const bytes = readFileSync(LOGO);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.length < 20_000, `the logo is ${bytes.length} bytes, too heavy for a sample`);
});

test('the mock company carries the logo into a rendered invoice', async () => {
  const logo = mockLogo();
  assert.ok(logo, 'mockLogo() returned nothing');
  const { pages, bytes } = await renderDocument({ ...mockInvoice(), brand: { ...mockInvoice().brand, logo } });
  assert.equal(pages, 1);
  assert.match(Buffer.from(bytes).toString('latin1'), /\/Subtype \/Image/, 'the logo is not in the file');
});

test('every sample prints totals that agree with its lines, with or without tax in the prices', () => {
  for (const make of [mockInvoice, mockLongInvoice, mockQuote, mockReceipt, mockCreditNote]) {
    const input = make();
    const lines = input.lines.reduce((total, line) => total + line.lineTotalMicros, 0);
    const { subtotalMicros, taxTotalMicros, totalMicros } = input.totals;
    assert.equal(subtotalMicros + taxTotalMicros, totalMicros, `${make.name}: subtotal and tax do not make the total`);
    assert.equal(input.pricesIncludeTax ? totalMicros : subtotalMicros, lines, `${make.name}: the lines do not add up`);
  }
});

test('the long invoice has two tax codes, discounts and service periods', () => {
  const input = mockLongInvoice();
  assert.equal(input.totals.taxCodesUsed.length, 2);
  assert.ok(input.lines.some((line) => line.discountPercent), 'no line is discounted');
  assert.ok(input.lines.every((line) => line.periodStart && line.periodEnd), 'a line has no service period');
});

test('the mock company is fictitious', () => {
  const input = mockInvoice();
  assert.match(input.seller.email ?? '', /\.example$/);
  assert.match(input.buyer.email ?? '', /\.example$/);
  assert.ok(!JSON.stringify(input).toLowerCase().includes('exceev'), 'the mock names a real company');
});

test('the committed sample PDFs are what the renderer draws today: run npm run render:samples', async () => {
  for (const template of ['classic', 'modern', 'compact', 'letterhead', 'receipt'] as const) {
    const source = template === 'receipt' ? mockReceipt() : mockInvoice();
    const { bytes } = await renderDocument({ ...source, template });
    const committed = readFileSync(fileURLToPath(new URL(`../../docs/templates/${template}.pdf`, import.meta.url)));
    assert.ok(Buffer.from(bytes).equals(committed), `docs/templates/${template}.pdf is stale`);
  }
});
