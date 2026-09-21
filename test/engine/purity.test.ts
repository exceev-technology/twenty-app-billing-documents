import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENGINE = fileURLToPath(new URL('../../engine/', import.meta.url));
const files = readdirSync(ENGINE).filter((name) => name.endsWith('.ts'));

test('there is engine code to check', () => {
  assert.ok(files.length > 0);
});

test('the engine imports nothing from Twenty or Node, and never reads the clock', () => {
  for (const file of files) {
    const source = readFileSync(ENGINE + file, 'utf8');
    assert.doesNotMatch(source, /from\s+['"](twenty-|node:)/, `${file} imports Twenty or Node`);
    assert.doesNotMatch(source, /\bnew\s+Date\b|\bDate\.now\b/, `${file} reads the clock`);
  }
});
