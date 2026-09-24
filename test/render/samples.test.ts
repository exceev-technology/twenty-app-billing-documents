import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderDocument } from '../../render/document.ts';
import { mockInvoice, mockLogo } from '../../render/samples/mock.ts';

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
  const { pages } = await renderDocument({ ...mockInvoice(), brand: { ...mockInvoice().brand, logo } });
  assert.equal(pages, 1);
});

test('the mock company is fictitious', () => {
  const input = mockInvoice();
  assert.match(input.seller.email ?? '', /\.example$/);
  assert.match(input.buyer.email ?? '', /\.example$/);
  assert.ok(!JSON.stringify(input).toLowerCase().includes('exceev'), 'the mock names a real company');
});
