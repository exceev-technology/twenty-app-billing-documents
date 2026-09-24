import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENGINE = fileURLToPath(new URL('../../engine/', import.meta.url));

/** Every `.ts` file under `dir`, recursing into subfolders. */
function collectFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) return collectFiles(`${path}/`);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const files = collectFiles(ENGINE);

// `from '…'` (static imports and re-exports), a side-effect `import '…'`, and a dynamic `import('…')`.
const MODULE_SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

test('there is engine code to check', () => {
  assert.ok(files.length > 0);
});

test('the engine imports only its own files, never Twenty or Node', () => {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? match[3]!;
      assert.ok(specifier.startsWith('./'), `${file} imports "${specifier}"`);
    }
  }
});

test('the engine never reads the clock', () => {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bDate\s*\(|\bDate\.now\b/, `${file} reads the clock`);
  }
});
