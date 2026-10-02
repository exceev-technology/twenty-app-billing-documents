import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/listing-images.mjs', import.meta.url));
const source = readFileSync(script, 'utf8');

test('the picture is drawn on a 1600 × 1000 canvas, 8:5, and written at twice that size', () => {
  assert.match(source, /const CANVAS = \{ width: 1600, height: 1000, scale: 2 \};/);
  assert.doesNotMatch(source, /xmlns:xlink/);
});

/**
 * The script in a repository of its own, with `programs` as the only programs on the PATH (each a
 * shell script that runs `body`), and its own temporary folder, which must be empty when it exits.
 */
function failing(programs: Record<string, string>, files: string[], check: (result: ReturnType<typeof spawnSync>, leftovers: string[]) => void) {
  const top = mkdtempSync(join(tmpdir(), 'billing-listing-test-'));
  try {
    const repo = join(top, 'repo');
    const bin = join(top, 'bin');
    const scratch = join(top, 'tmp');
    for (const dir of [join(repo, 'scripts'), join(repo, 'assets'), join(repo, 'docs', 'templates'), bin, scratch]) mkdirSync(dir, { recursive: true });
    copyFileSync(script, join(repo, 'scripts', 'listing-images.mjs'));
    writeFileSync(join(repo, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    for (const file of files) writeFileSync(join(repo, 'docs', 'templates', file), '%PDF');
    for (const [name, body] of Object.entries(programs)) {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    }
    const result = spawnSync(process.execPath, [join(repo, 'scripts', 'listing-images.mjs')], { encoding: 'utf8', env: { PATH: bin, TMPDIR: scratch } });
    check(result, readdirSync(scratch));
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
}

test('a missing sample PDF stops it with how to make them, and its temporary folder is removed', () => {
  failing({ 'rsvg-convert': 'exit 0', pdftoppm: 'exit 0' }, [], (result, leftovers) => {
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /classic\.pdf is missing: run `npm run render:samples` first\./);
    assert.deepEqual(leftovers, []);
  });
});

test('a program that fails stops it with its own message, and its temporary folder is removed', () => {
  failing({ 'rsvg-convert': 'exit 0', pdftoppm: 'echo "Syntax Error: broken" >&2; exit 1' }, ['classic.pdf', 'modern.pdf', 'compact.pdf', 'letterhead.pdf', 'receipt.pdf'], (result, leftovers) => {
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /pdftoppm failed:\nSyntax Error: broken/);
    assert.deepEqual(leftovers, []);
  });
});

test('a program that is not installed is named with the Homebrew formula that brings it', () => {
  failing({}, [], (result) => {
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /^rsvg-convert is not installed\. Install it with: brew install librsvg/);
  });
  failing({ 'rsvg-convert': 'exit 0' }, ['classic.pdf', 'modern.pdf', 'compact.pdf', 'letterhead.pdf', 'receipt.pdf'], (result, leftovers) => {
    assert.match(String(result.stderr), /^pdftoppm is not installed\. Install it with: brew install poppler/);
    assert.deepEqual(leftovers, []);
  });
});
