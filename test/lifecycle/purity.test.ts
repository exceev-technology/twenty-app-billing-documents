import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const LIFECYCLE = fileURLToPath(new URL('../../lifecycle/', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

// Import and export statements over as many lines as they take, side-effect imports, dynamic imports.
const FROM = /^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT = /^\s*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;

const specifiers = (source: string): string[] =>
  [...source.matchAll(FROM), ...source.matchAll(SIDE_EFFECT), ...source.matchAll(DYNAMIC)].map((match) => match[1]!);

test('there is lifecycle code to check', () => {
  assert.ok(sources(LIFECYCLE).length > 0);
});

test('lifecycle imports its own files, the Engine and the Renderer, and nothing from Twenty or Node', () => {
  for (const file of sources(LIFECYCLE)) {
    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      const local = specifier.startsWith('./') || specifier.startsWith('../');
      assert.ok(local, `${file} imports ${specifier}`);
      const outside = join(file, '..', specifier);
      assert.ok(
        outside.includes('/lifecycle/') || outside.includes('/engine/') || outside.includes('/render/'),
        `${file} reaches ${specifier}, outside lifecycle, engine and render`,
      );
    }
  }
});

test('only the actions import the Renderer’s entry point, which bundles pdfmake: the rest reach its types, words and formatting', () => {
  const reachable = ['/render/types.ts', '/render/lang/pack.ts', '/render/format.ts'];
  for (const file of sources(LIFECYCLE)) {
    if (file.endsWith('/lifecycle/actions.ts')) continue;
    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      const target = join(file, '..', specifier);
      const allowed = !target.includes('/render/') || reachable.some((path) => target.endsWith(path));
      assert.ok(allowed, `${file} imports ${specifier}: outside actions.ts, only ${reachable.join(', ')} are allowed`);
    }
  }
});

test('lifecycle never reads the clock or draws a random number: both are passed in', () => {
  for (const file of sources(LIFECYCLE)) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bDate\.now\b|new Date\(\s*\)|Math\.random\b|crypto\./, `${file} reads the clock, randomness or crypto`);
  }
});
