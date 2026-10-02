import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const release = read('.github/workflows/release.yml');
const ci = read('.github/workflows/ci.yml');

/** The `key: value` lines indented under a top-level key. */
const block = (text: string, key: string): string[] =>
  (text.match(new RegExp(`^${key}:\\n((?: {2}.*\\n)+)`, 'm'))?.[1] ?? '').split('\n').filter(Boolean).map((line) => line.trim().replace(/\s+#.*$/, ''));

test('the release workflow runs on a pushed version tag and nothing else', () => {
  assert.deepEqual(block(release, 'on'), ['push:', "tags: ['v*']"]);
});

test('its permissions are contents: write and id-token: write, nothing more', () => {
  assert.deepEqual(block(release, 'permissions').filter((line) => !line.startsWith('#')), ['contents: write', 'id-token: write']);
});

test('it checks the tag, then publishes, then creates the release, in that order', () => {
  const at = (needle: string) => release.indexOf(needle);
  const order = [at('git merge-base --is-ancestor'), at('npm ci'), at('release:check -- --tag "$GITHUB_REF_NAME"'), at('twenty app:publish'), at('gh release create')];
  assert.ok(order.every((index) => index >= 0), JSON.stringify(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('it uses the installed CLI, never npx, and Node from .nvmrc', () => {
  assert.match(release, /run: \.\/node_modules\/\.bin\/twenty app:publish/);
  assert.doesNotMatch(release, /npx twenty/);
  assert.match(release, /node-version-file: \.nvmrc/);
});

test('it can sign in to npm with a token or with trusted publishing, and takes the release notes from the changelog', () => {
  assert.match(release, /registry-url: https:\/\/registry\.npmjs\.org/);
  assert.match(release, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.match(release, /node scripts\/release-notes\.mjs "\$GITHUB_REF_NAME"/);
  assert.match(release, /--notes-file/);
});

test('CI still runs the typecheck, the tests and the secret scan, and now builds the package', () => {
  for (const step of ['npm run typecheck', 'npm test', 'npm run release:check -- --package-only', 'gitleaks']) assert.ok(ci.includes(step), step);
  assert.deepEqual(block(ci, 'permissions'), ['contents: read']);
});
