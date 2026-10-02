import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { galleryProblem } from '../src/lib/release.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('the contributing guide covers setup, tests, identifiers, languages, presets, deploying and pull requests', () => {
  const guide = read('CONTRIBUTING.md');
  for (const heading of ['Set up', 'Identifiers', 'Adding or correcting a preset', 'Adding a language', 'Deploying to a test workspace', 'Pull requests']) {
    assert.match(guide, new RegExp(`^## ${heading}$`, 'm'), heading);
  }
  for (const text of ['npm test', 'npm run ids:sync', 'Never edit or delete an entry of `src/ids.ts`', 'npm run presets:docs', 'sources', 'render/lang', 'lifecycle/lang', 'npm run deploy -- --remote']) {
    assert.ok(guide.includes(text), text);
  }
});

const ADVISORY_URL = 'https://github.com/exceev-technology/twenty-app-billing-documents/security/advisories/new';

test('the security policy and the issue chooser send reports to GitHub’s private advisories', () => {
  assert.ok(read('SECURITY.md').includes(ADVISORY_URL));
  assert.ok(read('.github/ISSUE_TEMPLATE/config.yml').includes(`url: ${ADVISORY_URL}`));
});

test('the security policy promises no response time (decision 20)', () => {
  const policy = read('SECURITY.md');
  assert.match(policy, /acknowledge your report and say when a fix can be expected/);
  assert.doesNotMatch(policy, /\bwithin\b|\b\d+\s*(?:hours?|days?|weeks?)\b|\b(?:hours?|days?|weeks?)\b/i);
});

test('there are issue forms for a bug, a preset correction (with its official source) and a new language', () => {
  for (const form of ['bug', 'preset-correction', 'new-language']) {
    const text = read(`.github/ISSUE_TEMPLATE/${form}.yml`);
    assert.match(text, /^name: .+$/m, form);
    assert.match(text, /^body:$/m, form);
    assert.match(text, /required: true/, form);
  }
  // The form's fields are the items of its body; the official source is required whatever its place.
  const fields = read('.github/ISSUE_TEMPLATE/preset-correction.yml').split(/^ {2}- type:/m).slice(1);
  const source = fields.find((field) => /^ {4}id: source$/m.test(field));
  assert.ok(source, 'the form has a field with id: source');
  assert.match(source, /^ {4}validations:\n {6}required: true$/m);
  assert.match(read('.github/ISSUE_TEMPLATE/config.yml'), /blank_issues_enabled: false/);
});

test('the pull request template asks what changed, how it was tested and whether identifiers are locked', () => {
  const template = read('.github/pull_request_template.md');
  for (const heading of ['What changed', 'How it was tested', 'Identifiers locked']) assert.match(template, new RegExp(`^## ${heading}$`, 'm'), heading);
});

test('the runbook has the sections the tools point at, and every step the spec lists', () => {
  const runbook = read('docs/releasing.md');
  // release:check names this heading when the gallery is incomplete.
  assert.match(galleryProblem([])!, /“Before the first release”/);
  assert.match(runbook, /^## Before the first release: the Twenty screenshots$/m);
  assert.ok(runbook.includes('Never run `npm publish` in the repository root'));
  for (const text of ['NPM_TOKEN', 'Trusted Publisher', 'release:check -- --tag', 'git tag vX.Y.Z', 'provenance', 'dev:catalog-sync', 'docker:start', 'app:publish --private --remote local', 'app:install --remote local', 'remote:use']) {
    assert.ok(runbook.includes(text), text);
  }
});

test('the runbook warns about ignore-scripts, and quotes the refusal the root prepack really prints', () => {
  const runbook = read('docs/releasing.md');
  // ignore-scripts skips the prepack that adds the licence files, which only release:check would notice.
  assert.ok(runbook.includes('ignore-scripts'));
  const refusal = 'prepack: not a Twenty build output';
  assert.ok(runbook.includes(refusal), refusal);
  assert.ok((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts.prepack.includes(refusal), 'package.json’s prepack');
});

test('the runbook says what really stops an unreviewed publish, and how a release is and is not made', () => {
  const runbook = read('docs/releasing.md');
  // The workflow's "tagged commit is on main" check is in the tagged commit's own file, so a ruleset is the lock.
  for (const text of ['tag ruleset', '`v*`', 'environment: release', 'never create the release in GitHub\'s interface', 'Do not re-run the workflow', '--notes-file <(node scripts/release-notes.mjs vX.Y.Z)']) {
    assert.ok(runbook.includes(text), text);
  }
});

test('every npm script the guides, the runbook and the pull request template name exists', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
  for (const file of ['CONTRIBUTING.md', 'docs/releasing.md', '.github/pull_request_template.md']) {
    const named = [...read(file).matchAll(/npm run ([a-z][\w:-]*)/g)].map((match) => match[1]!);
    assert.ok(named.length > 0, `${file} names no npm script`);
    for (const name of named) assert.ok(name in scripts, `${file} names npm run ${name}, which package.json does not define`);
  }
});

test('the lock step is the end of npm run deploy, never a second step, wherever it is named', () => {
  for (const file of ['CONTRIBUTING.md', 'docs/releasing.md', '.github/pull_request_template.md']) {
    const text = read(file).replaceAll(/\s+/g, ' ');
    assert.doesNotMatch(text, /npm run deploy`? (?:then|followed by|and then) `?npm run ids:lock/, file);
  }
  assert.match(read('.github/pull_request_template.md'), /`npm run deploy`, which ends with `npm run ids:lock`/);
  assert.match(read('CONTRIBUTING.md').replaceAll(/\s+/g, ' '), /`npm run deploy`, which ends with `npm run ids:lock`/);
});

test('the runbook’s npm setup follows npm today: a granular token, trusted publishing that allows publish, a safe hand publish', () => {
  const runbook = read('docs/releasing.md');
  const text = runbook.replaceAll(/\s+/g, ' ');
  // As npm's documentation says (October 2026): classic tokens are gone, a trusted publisher made after
  // 2026-09-03 allows `npm stage publish` only, and the workflow runs a direct `npm publish`.
  for (const wanted of [
    'granular access tokens only',
    'Read and write (publish and stage)',
    'All Packages',
    'Bypass two-factor authentication',
    'at most 90 days',
    'Allowed actions',
    'allow `npm publish`',
    'Environment name',
    'as npm\'s documentation says (October 2026)',
    'https://docs.npmjs.com/trusted-publishers',
    'Make the repository public',
  ]) assert.ok(text.includes(wanted), wanted);
  assert.doesNotMatch(runbook, /classic automation\s+token/);
  // The authentication row names the trusted publisher's allowed actions as a cause, and the token's renewal has its row.
  assert.match(runbook, /^\| npm refuses the publish \(authentication\) \|.*Allowed actions.*\|$/m);
  assert.match(runbook, /^\| `NPM_TOKEN` has expired \|/m);
  // A hand publish is a last resort, done in an order that cannot strand the tag.
  const order = ['a last resort', 'release:check -- --tag v0.1.0', '`npm login`', 'twenty app:publish', 'Push the tag `v0.1.0`', 'Expect one red run', 'gh release create v0.1.0 --verify-tag --notes-file'].map((wanted) => {
    const at = text.indexOf(wanted);
    assert.ok(at >= 0, wanted);
    return at;
  });
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the hand publish steps are in order');
});

test('the runbook dates the changelog heading instead of adding a second one', () => {
  const text = read('docs/releasing.md').replaceAll(/\s+/g, ' ');
  for (const wanted of ['## 0.1.0 - unreleased', 'add no second one', 'still says "unreleased"']) assert.ok(text.includes(wanted), wanted);
});

test('every file the runbook and the workflows read exists', () => {
  for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'scripts/release-notes.mjs', 'docs/templates/classic.pdf', 'assets/logo.svg']) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
});
