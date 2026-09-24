import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RENDER = fileURLToPath(new URL('../../render/', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

const SPECIFIER = /(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g;

test('there is render code to check', () => {
  assert.ok(sources(RENDER).length > 0);
});

test('only render/pdf.ts knows pdfmake, and nothing knows Twenty', () => {
  for (const file of sources(RENDER)) {
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(SPECIFIER)) {
      const pdfmake = specifier === 'pdfmake' || specifier.startsWith('pdfmake/');
      const allowed = specifier.startsWith('./') || specifier.startsWith('../') || (pdfmake && file.endsWith('/pdf.ts'));
      assert.ok(allowed, `${file} imports ${specifier}`);
      assert.doesNotMatch(specifier, /^twenty-/, `${file} imports Twenty`);
    }
  }
});
