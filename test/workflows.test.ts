import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const release = read('.github/workflows/release.yml');
const ci = read('.github/workflows/ci.yml');

/** The `key: value` lines indented under a top-level key. */
const block = (text: string, key: string): string[] =>
  (text.match(new RegExp(`^${key}:\\n((?: {2}.*\\n)+)`, 'm'))?.[1] ?? '').split('\n').filter(Boolean).map((line) => line.trim().replace(/\s+#.*$/, ''));

/** What a runner executes or configures: no comment (a whole line or a trailing one), no blank line, no `name:` line. */
const code = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .filter((line) => line.trim() !== '' && !/^\s*(- )?name:/.test(line))
    .join('\n');

/** Every needle is in `text`, and their first positions run in the order given. */
const assertInOrder = (text: string, needles: string[]) => {
  const order = needles.map((needle) => text.indexOf(needle));
  assert.ok(order.every((index) => index >= 0), JSON.stringify(Object.fromEntries(needles.map((needle, i) => [needle, order[i]]))));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), needles.join(' < '));
};

test('the release workflow runs on a pushed version tag and nothing else', () => {
  assert.deepEqual(block(release, 'on'), ['push:', "tags: ['v*']"]);
});

test('its permissions are contents: write and id-token: write, nothing more, and no job or step widens them', () => {
  assert.deepEqual(block(release, 'permissions').filter((line) => !line.startsWith('#')), ['contents: write', 'id-token: write']);
  assert.doesNotMatch(code(release), /^\s{2,}permissions:/m);
});

test('it checks the tag, then publishes, then creates the release, in that order', () => {
  assertInOrder(code(release), [
    'fetch-depth: 0',
    'git merge-base --is-ancestor',
    'sort -V | head -n1)" = 11.5.1',
    'npm ci',
    'release:check -- --tag "$GITHUB_REF_NAME"',
    'twenty app:publish',
    'gh release create',
  ]);
});

test('no step can fail without failing the job, and none is skipped on a condition', () => {
  assert.doesNotMatch(code(release), /continue-on-error|^\s*(- )?if:/m);
});

test('the only expressions are the two secrets, each on an env line: the tag name is read as a shell variable', () => {
  assert.deepEqual(release.match(/\$\{\{[^}]*\}\}/g), ['${{ secrets.NPM_TOKEN }}', '${{ github.token }}']);
  assert.deepEqual(
    release.split('\n').filter((line) => line.includes('${{')).map((line) => line.trim()),
    ['NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}', 'GH_TOKEN: ${{ github.token }}'],
  );
});

test('the checkout keeps the whole history and no token, and the setup-node step restores no cache', () => {
  const withLines = (uses: string) =>
    (code(release).match(new RegExp(`- uses: ${uses}\\n {8}with:\\n((?: {10}\\S.*\\n?)+)`))?.[1] ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(withLines('actions/checkout@v4'), ['fetch-depth: 0', 'persist-credentials: false']);
  assert.deepEqual(withLines('actions/setup-node@v4'), ['node-version-file: .nvmrc', 'registry-url: https://registry.npmjs.org']);
  assert.doesNotMatch(code(release), /^\s+cache:/m);
});

test('the release job stops after 30 minutes, and runs npm ci with its install scripts as it did', () => {
  // A hung step must not hold id-token: write for GitHub's six-hour default.
  assert.match(code(release), /^ {2}release:\n {4}runs-on: ubuntu-latest\n {4}timeout-minutes: 30\n {4}steps:$/m);
  // Not --ignore-scripts: the CLI the later steps run is installed by npm ci and may need its own install scripts.
  assert.match(code(release), /^\s+- run: npm ci$/m);
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

test('CI builds the package after the tests and before the secret scan, and a failure of that step fails the run', () => {
  assertInOrder(code(ci), ['npm ci', 'npm test', 'npm run release:check -- --package-only', 'gitleaks']);
  assert.doesNotMatch(code(ci), /continue-on-error/);
  assert.match(ci, /cache: npm/);
});
