import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readme = read('README.md');
const pkg = JSON.parse(read('package.json'));
const headings = [...readme.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
const REPOSITORY = 'https://github.com/exceev-technology/twenty-app-billing-documents';

/** The README without its code, which the marketplace shows as plain text too but which may hold <angle brackets>. */
const prose = readme.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
const urls = [...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);

test('the README is no longer under construction', () => {
  assert.doesNotMatch(readme, /under construction/i);
  assert.doesNotMatch(readme, /Do not use it for real invoices/);
  assert.doesNotMatch(readme, /What it will do/);
});

test('it opens with what a person deciding to install needs: install, requirements, a first invoice in six steps', () => {
  assert.deepEqual(headings.slice(0, 3), ['Install', 'Requirements', 'Your first invoice']);
  const first = readme.split('## Your first invoice')[1].split(/^## /m)[0];
  assert.equal([...first.matchAll(/^\d+\. /gm)].length, 6);
  assert.match(readme.split('## Install')[0], /Quotes, invoices and credit notes/);
});

test('it keeps its reference sections, then upgrading, uninstalling and limits', () => {
  const expected = [
    'What it installs', 'Issuing documents', 'Numbering', 'Issued documents are locked', 'From a quote to an invoice',
    'Credit notes and cancelling', 'Payment status', 'Views', 'Sending documents by email', 'Roles to set',
    'Countries, taxes and languages', 'Upgrading', 'Uninstalling', 'Limits',
  ];
  assert.deepEqual(headings.filter((heading) => expected.includes(heading)), expected);
});

test('it names the Twenty server version the package requires', () => {
  assert.match(readme, new RegExp(`Twenty server at version ${pkg.engines.twenty.replace('>=', '').replaceAll('.', '\\.')} or later`));
});

test('every README section the app’s own messages point to exists, and Requirements explains logic functions', () => {
  const source = read('src/front-components/action-feedback.ts');
  const named = [...source.matchAll(/“([^”]+)” in the app’s README/g), ...source.matchAll(/«\\u00a0([^»]+?)\\u00a0» dans le README/g)].map((match) => match[1]);
  assert.equal(named.length, 2);
  for (const name of named) assert.ok(headings.includes(name), `no README section “${name}”`);
  assert.match(readme.split('## Requirements')[1].split(/^## /m)[0], /LOGIC_FUNCTION_TYPE/);
});

test('uninstalling says plainly that the documents go with the app', () => {
  assert.match(readme, /Uninstalling removes the app's objects and every document in them/);
});

test('every link is absolute, so it works on GitHub, on npm and in the marketplace’s About tab', () => {
  assert.ok(urls.length > 10);
  for (const url of urls) assert.match(url, /^https:\/\//, url);
});

test('every link into this repository names a file or folder that exists', () => {
  const inside = urls.filter((url) => url.startsWith(`${REPOSITORY}/blob/main/`) || url.startsWith(`https://raw.githubusercontent.com/exceev-technology/twenty-app-billing-documents/main/`));
  assert.ok(inside.length > 10);
  for (const url of inside) {
    const path = url.replace(/^.*\/(blob\/)?main\//, '');
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), url);
  }
});

test('it holds no raw HTML, which the marketplace would show as text', () => {
  assert.doesNotMatch(prose, /<\/?[a-z][^>]*>/i);
});
