import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import app from '../src/application-config.ts';
import { pngSize } from './helpers/png.ts';

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const pkg = JSON.parse(file('package.json').toString('utf8'));
const repository: string = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
/** The marketplace skips a logo or gallery image larger than 10 MB when it copies the package’s assets. */
const MARKETPLACE_LIMIT = 10_000_000;

test('the application manifest validates, with nothing to warn about', () => {
  assert.equal(app.success, true, app.errors.join('\n'));
  assert.deepEqual(app.warnings, []);
});

test('the application is listed as Billing Documents, in Sales, by Exceev Technology', () => {
  assert.equal(app.config.displayName, 'Billing Documents');
  assert.equal(app.config.category, 'Sales');
  assert.equal(app.config.author, 'Exceev Technology');
});

test('the logo is a 512 × 512 PNG kept in public/', () => {
  assert.equal(app.config.logo, 'public/logo.png');
  const bytes = file(app.config.logo!);
  assert.deepEqual(pngSize(bytes), { width: 512, height: 512 });
  assert.ok(bytes.length < MARKETPLACE_LIMIT);
});

test('every gallery image is listed once, is a PNG kept in public/gallery/, and is small enough for the marketplace', () => {
  const gallery = app.config.galleryImages ?? [];
  assert.ok(gallery.length >= 1);
  assert.equal(new Set(gallery).size, gallery.length);
  for (const path of gallery) {
    assert.match(path, /^public\/gallery\/[a-z0-9-]+\.png$/, path);
    const bytes = file(path);
    assert.ok(pngSize(bytes), `${path} is not a PNG`);
    assert.ok(bytes.length < MARKETPLACE_LIMIT, `${path} is over the marketplace’s 10 MB`);
  }
});

test('the five layouts picture is in the gallery', () => {
  assert.ok(app.config.galleryImages?.includes('public/gallery/layouts.png'));
});

test('the website is the repository and the issue tracker is its issues', () => {
  assert.equal(app.config.websiteUrl, repository);
  assert.equal(app.config.issueReportUrl, pkg.bugs.url);
  assert.equal(app.config.issueReportUrl, `${repository}/issues`);
});

test('the listing’s text is the README: the manifest’s about text is not set by hand', () => {
  assert.equal('aboutDescription' in app.config, false);
});

test('the listing’s pictures have a recipe, which npm run listing:images runs', () => {
  assert.equal(pkg.scripts['listing:images'], 'node scripts/listing-images.mjs');
  for (const path of ['scripts/listing-images.mjs', 'assets/logo.svg']) assert.ok(readFileSync(new URL(`../${path}`, import.meta.url)).length > 0, path);
});
