import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path: string) => existsSync(new URL(`../${path}`, import.meta.url));
const pkg = JSON.parse(read('package.json'));
const REPOSITORY = 'https://github.com/exceev-technology/twenty-app-billing-documents';

test('the package is public: npm refuses to publish one marked private', () => {
  assert.equal('private' in pkg, false);
});

test('it is the unscoped twenty-app-billing-documents, under the MIT licence, at a plain X.Y.Z version', () => {
  assert.equal(pkg.name, 'twenty-app-billing-documents');
  assert.equal(pkg.license, 'MIT');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

test('it carries the keyword the marketplace searches the registry for', () => {
  assert.ok(pkg.keywords.includes('twenty-app'));
});

test('its links all point at the one repository', () => {
  assert.equal(pkg.repository.url, `git+${REPOSITORY}.git`);
  assert.equal(pkg.bugs.url, `${REPOSITORY}/issues`);
  assert.equal(pkg.homepage, `${REPOSITORY}#readme`);
});

test('the Twenty server it requires is the version of the pinned SDK, and both SDK packages agree', () => {
  assert.equal(pkg.engines.twenty, `>=${pkg.devDependencies['twenty-sdk']}`);
  assert.equal(pkg.devDependencies['twenty-client-sdk'], pkg.devDependencies['twenty-sdk']);
});

test('the Node it requires is the major .nvmrc names', () => {
  assert.match(pkg.engines.node, new RegExp(`^>=${read('.nvmrc').trim()}\\.`));
});

test('it lists no files: the build publishes its own folder', () => {
  assert.equal('files' in pkg, false);
});

test('it sets no publishConfig: app:publish passes the access, the tag and the provenance itself', () => {
  assert.equal('publishConfig' in pkg, false);
});

test('prepack ends by running the script that adds the licence files, which exists', () => {
  // npm runs prepack in .twenty/output, two folders below the repository root.
  assert.match(pkg.scripts.prepack, /&& node \.\.\/\.\.\/scripts\/package-notices\.mjs$/);
  assert.ok(exists('scripts/package-notices.mjs'));
});

test('what prepack copies is in the repository, and the build state is not committed', () => {
  assert.ok(exists('LICENSE') && exists('THIRD_PARTY_NOTICES.md'));
  assert.match(read('.gitignore'), /^\.twenty\/$/m);
});
