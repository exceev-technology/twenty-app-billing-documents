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

test('the security policy sends reports to GitHub’s private advisories', () => {
  assert.ok(read('SECURITY.md').includes('https://github.com/exceev-technology/twenty-app-billing-documents/security/advisories/new'));
});

test('there are issue forms for a bug, a preset correction (with its official source) and a new language', () => {
  for (const form of ['bug', 'preset-correction', 'new-language']) {
    const text = read(`.github/ISSUE_TEMPLATE/${form}.yml`);
    assert.match(text, /^name: .+$/m, form);
    assert.match(text, /^body:$/m, form);
    assert.match(text, /required: true/, form);
  }
  assert.match(read('.github/ISSUE_TEMPLATE/preset-correction.yml'), /id: source[\s\S]*required: true/);
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

test('every file the runbook and the workflows read exists', () => {
  for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'scripts/release-notes.mjs', 'docs/templates/classic.pdf', 'assets/logo.svg']) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
});
