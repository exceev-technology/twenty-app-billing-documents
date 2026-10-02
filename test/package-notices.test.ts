import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/package-notices.mjs', import.meta.url));
const repository = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const NOTICES = ['LICENSE', 'THIRD_PARTY_NOTICES.md'];

/** Runs the script in a fresh folder holding `files`, as npm runs prepack in the build output. */
function inFolder(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'billing-notices-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
    const copied = Object.fromEntries(NOTICES.filter((name) => existsSync(join(dir, name))).map((name) => [name, readFileSync(join(dir, name), 'utf8')]));
    return { run, copied };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('in a build output it adds LICENSE and THIRD_PARTY_NOTICES.md, as the repository has them', () => {
  const { run, copied } = inFolder({ 'manifest.json': '{}' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(copied, { LICENSE: repository('LICENSE'), 'THIRD_PARTY_NOTICES.md': repository('THIRD_PARTY_NOTICES.md') });
  // npm's --json output is read from stdout: the script must not write to it.
  assert.equal(run.stdout, '');
});

test('anywhere else it refuses, says how to publish, and copies nothing', () => {
  const { run, copied } = inFolder({});
  assert.equal(run.status, 1);
  assert.match(run.stderr, /not a Twenty build output/);
  assert.match(run.stderr, /twenty app:publish/);
  assert.deepEqual(copied, {});
});
