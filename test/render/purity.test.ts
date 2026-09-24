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

// Import and export statements only, over as many lines as they take: the scan
// stops at the first quote or semicolon, so a label whose value happens to be
// 'from' is not an import.
const FROM = /^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT = /^\s*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;

test('the import pattern sees an import over several lines, and not a label called from', () => {
  const specifiers = (source: string): string[] => [...source.matchAll(FROM)].map((match) => match[1]!);
  assert.deepEqual(specifiers("import {\n  defineApp,\n  defineObject,\n} from 'twenty-sdk';"), ['twenty-sdk']);
  assert.deepEqual(specifiers("export const en = {\n  from: 'From',\n};\nexport type Language = 'EN' | 'FR';"), []);
});

test('there is render code to check', () => {
  assert.ok(sources(RENDER).length > 0);
});

test('only render/pdf.ts knows pdfmake, and nothing knows Twenty', () => {
  for (const file of sources(RENDER)) {
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of [...source.matchAll(FROM), ...source.matchAll(SIDE_EFFECT), ...source.matchAll(DYNAMIC)]) {
      // The prebuilt bundle only: the package's Node entry breaks once bundled.
      const pdfmake = specifier.startsWith('pdfmake/build/');
      // render/samples holds sample data, never part of a rendered document's code
      // path, so it may read its own logo from disk. The renderer itself may not.
      const sample = file.includes('/render/samples/') && specifier.startsWith('node:');
      const allowed = specifier.startsWith('./') || specifier.startsWith('../') || (pdfmake && file.endsWith('/pdf.ts')) || sample;
      assert.ok(allowed, `${file} imports ${specifier}`);
      assert.doesNotMatch(specifier, /^twenty-/, `${file} imports Twenty`);
    }
  }
});

test('the renderer itself reads nothing from disk: only the samples may', () => {
  for (const file of sources(RENDER)) {
    if (file.includes('/render/samples/')) continue;
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of [...source.matchAll(FROM), ...source.matchAll(SIDE_EFFECT), ...source.matchAll(DYNAMIC)]) {
      assert.ok(!specifier.startsWith('node:'), `${file} imports ${specifier}`);
    }
  }
});
