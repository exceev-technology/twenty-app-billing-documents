// Renders the mock documents on every template. The five one-per-layout
// invoices are committed under docs/templates/; everything else lands in
// .render-out/, which git ignores. Run: npm run render:samples
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderDocument } from '../render/document.ts';
import { mockInvoice, mockLongInvoice, mockQuote, mockReceipt } from '../render/samples/mock.ts';

const TEMPLATES = ['classic', 'modern', 'compact', 'letterhead', 'receipt'];
const committed = fileURLToPath(new URL('../docs/templates/', import.meta.url));
const scratch = fileURLToPath(new URL('../.render-out/', import.meta.url));
mkdirSync(committed, { recursive: true });
mkdirSync(scratch, { recursive: true });

const extras = [['long-invoice', mockLongInvoice], ['quote', mockQuote]];

for (const template of TEMPLATES) {
  const source = template === 'receipt' ? mockReceipt() : mockInvoice();
  const { bytes, pages } = await renderDocument({ ...source, template });
  writeFileSync(`${committed}${template}.pdf`, bytes);
  console.log(`docs/templates/${template}.pdf: ${pages} page(s), ${bytes.length} bytes`);
  for (const [name, make] of extras) {
    const extra = await renderDocument({ ...make(), template });
    writeFileSync(`${scratch}${template}-${name}.pdf`, extra.bytes);
  }
}
console.log(`other samples: ${scratch}`);
