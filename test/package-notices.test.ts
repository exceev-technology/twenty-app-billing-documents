import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/package-notices.mjs', import.meta.url));
const repository = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const NOTICES = ['LICENSE', 'THIRD_PARTY_NOTICES.md'];
const prepack: string = JSON.parse(repository('package.json')).scripts.prepack;

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

/**
 * A clone at `<top>/a/repo` that holds `notices` (and our script), with a build output
 * in `.twenty/output`, and a script of the same name planted at `<top>/scripts`: what
 * `../../scripts/…` reaches from the repository root. The planted one leaves a `ran` file.
 */
function inCheckout<T>(notices: string[], check: (tree: { top: string; repo: string; output: string; prepackIn: (cwd: string) => SpawnSyncReturns<string> }) => T): T {
  const top = mkdtempSync(join(tmpdir(), 'billing-prepack-'));
  try {
    const repo = join(top, 'a', 'repo');
    const output = join(repo, '.twenty', 'output');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    mkdirSync(output, { recursive: true });
    mkdirSync(join(top, 'scripts'));
    copyFileSync(script, join(repo, 'scripts', 'package-notices.mjs'));
    for (const name of notices) copyFileSync(new URL(`../${name}`, import.meta.url), join(repo, name));
    writeFileSync(join(output, 'manifest.json'), '{}');
    writeFileSync(join(top, 'scripts', 'package-notices.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync(new URL('./ran', import.meta.url), 'x');");
    const prepackIn = (cwd: string) => spawnSync('sh', ['-c', prepack], { cwd, encoding: 'utf8' });
    return check({ top, repo, output, prepackIn });
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
}

test('prepack in the repository root refuses, and runs nothing from two folders up', () => {
  inCheckout(NOTICES, ({ top, repo, prepackIn }) => {
    const run = prepackIn(repo);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /twenty app:publish/);
    assert.equal(existsSync(join(top, 'scripts', 'ran')), false);
  });
});

test('prepack in .twenty/output adds the notices, and runs only the repository’s script', () => {
  inCheckout(NOTICES, ({ top, output, prepackIn }) => {
    const run = prepackIn(output);
    assert.equal(run.status, 0, run.stderr);
    for (const name of NOTICES) assert.equal(readFileSync(join(output, name), 'utf8'), repository(name));
    assert.equal(existsSync(join(top, 'scripts', 'ran')), false);
  });
});

test('prepack replaces notices left in the output by an earlier run', () => {
  inCheckout(NOTICES, ({ output, prepackIn }) => {
    for (const name of NOTICES) writeFileSync(join(output, name), 'stale');
    const run = prepackIn(output);
    assert.equal(run.status, 0, run.stderr);
    for (const name of NOTICES) assert.equal(readFileSync(join(output, name), 'utf8'), repository(name));
  });
});

for (const missing of NOTICES) {
  test(`when the repository lacks ${missing} it says so in one line and copies nothing`, () => {
    inCheckout(
      NOTICES.filter((name) => name !== missing),
      ({ output, prepackIn }) => {
        const run = prepackIn(output);
        assert.equal(run.status, 1);
        assert.match(run.stderr, new RegExp(missing.replace('.', '\\.')));
        assert.equal(run.stderr.trim().split('\n').length, 1, run.stderr);
        assert.deepEqual(NOTICES.filter((name) => existsSync(join(output, name))), []);
      },
    );
  });
}
