import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { LOGIC_FUNCTION } from '../helpers/logic-function-build.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('the renderer still renders once bundled as a Twenty logic function', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'render-bundle-'));
  try {
    const entry = join(folder, 'entry.ts');
    writeFileSync(entry, [
      `import { renderDocument } from ${JSON.stringify(join(ROOT, 'render/document.ts'))};`,
      `import { mockInvoice } from ${JSON.stringify(join(ROOT, 'render/samples/mock.ts'))};`,
      'const { pages, bytes } = await renderDocument(mockInvoice());',
      'console.log(JSON.stringify({ pages, head: Buffer.from(bytes.slice(0, 5)).toString("latin1") }));',
    ].join('\n'));
    await build({ ...LOGIC_FUNCTION, entryPoints: [entry], outfile: join(folder, 'out/function.mjs') });
    const output = execFileSync(process.execPath, [join(folder, 'out/function.mjs')], { cwd: folder, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { pages: 1, head: '%PDF-' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
