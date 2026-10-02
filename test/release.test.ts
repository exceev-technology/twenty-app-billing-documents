import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_CHECK_USAGE, RELEASE_GALLERY_MIN, changelogProblem, changelogSection, galleryProblem, localPathProblems, packageProblems,
  parseReleaseArgs, tagProblem, unlockedIdentifiers,
} from '../src/lib/release.ts';

const EXPECTED = { logo: 'public/logo.png', gallery: ['public/gallery/layouts.png'] };
const GOOD = [
  'manifest.json', 'package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'public/logo.png', 'public/gallery/layouts.png',
  'src/logic-functions/seed-presets.mjs', 'src/logic-functions/seed-presets.mjs.map', 'src/logic-functions/seed-presets.ts',
];

test('a package with everything the listing and the licence need has no problem', () => {
  assert.deepEqual(packageProblems(GOOD, EXPECTED), []);
});

test('a package without LICENSE or the notices is refused, naming the script that adds them', () => {
  const problems = packageProblems(GOOD.filter((file) => file !== 'LICENSE' && file !== 'THIRD_PARTY_NOTICES.md'), EXPECTED);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /does not hold LICENSE.*scripts\/package-notices\.mjs/);
  assert.match(problems[1], /does not hold THIRD_PARTY_NOTICES\.md/);
});

test('a package without its manifest, post-install bundle, logo or a listed gallery image is refused', () => {
  const missing = ['manifest.json', 'src/logic-functions/seed-presets.mjs', 'public/logo.png', 'public/gallery/layouts.png'];
  const problems = packageProblems(GOOD.filter((file) => !missing.includes(file)), EXPECTED);
  assert.deepEqual(problems.map((problem) => problem.match(/hold (\S+):/)?.[1]), missing);
});

test('state, tests, dotfiles and archives in the package are refused', () => {
  const stray = [
    '.twenty/output/manifest.json', 'test/application.test.ts', '.env', 'src/.DS_Store', 'node_modules/x/index.js', 'twenty-app-billing-documents-0.1.0.tgz', 'src/lib/thing.test.ts',
    'x.tar.gz', 'id_rsa', 'x.ZIP', 'src/test/a.js', 'src/node_modules/a/b.js', 'x.spec.ts', 'x.test.mjs.map', '__tests__/a.js',
  ];
  const problems = packageProblems([...GOOD, ...stray], EXPECTED);
  assert.deepEqual(problems.map((problem) => problem.match(/holds (\S+):/)?.[1]), stray);
});

test('every archive, key and private-key name is refused, in any case, with or without a folder', () => {
  const stray = [
    'a.tar', 'a.gz', 'a.tgz', 'a.zip', 'a.7z', 'a.rar', 'a.pem', 'a.key', 'a.p12', 'a.pfx', 'a.jks', 'dist/KEY.PEM', 'dist/Backup.TGZ',
    'id_rsa', 'id_rsa.pub', 'id_ed25519', 'id_ed25519.pub', 'id_ecdsa', 'id_ecdsa.pub', '.ssh/id_rsa', 'deploy/ID_RSA',
  ];
  const problems = packageProblems([...GOOD, ...stray], EXPECTED);
  assert.deepEqual(problems.map((problem) => problem.match(/holds (\S+):/)?.[1]), stray);
});

test('names that only look like what is refused are published', () => {
  const lookalikes = [
    'src/contest/a.mjs', 'src/latest/a.mjs', 'src/inspector.mjs', 'src/testing.mjs', 'src/test-data.json', 'src/attest.test-data.json',
    'src/keys.ts', 'src/lib/monkey.mjs', 'src/archive.json', 'src/gzip.mjs', 'src/lib/id_rsa.ts', 'src/specs.ts', 'public/gallery/layouts.png',
  ];
  assert.deepEqual(packageProblems([...GOOD, ...lookalikes], EXPECTED), []);
});

test('a source map or bundle that names the builder’s home is refused, absolute or climbed to from the root', () => {
  const roots = ['/Users/camille/Data/billing', '/Users/camille'];
  const files = [
    { path: 'a.mjs.map', text: '{"sources":["../../../../src/a.ts"]}' },
    { path: 'b.mjs.map', text: '{"sources":["../../../../../../Users/camille/Data/billing/node_modules/x/index.ts"]}' },
    { path: 'c.mjs', text: '// /Users/camille/Data/billing/src/c.ts' },
  ];
  const problems = localPathProblems(files, roots);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^2 file\(s\) name \/Users\/camille\/Data\/billing.*\(b\.mjs\.map, c\.mjs\)/);
});

test('five tainted files make one problem naming the first three', () => {
  const files = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ path: `${name}.mjs`, text: '/Users/camille/x' }));
  const problems = localPathProblems(files, ['/Users/camille']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^5 file\(s\).*\(a\.mjs, b\.mjs, c\.mjs, …\)/);
});

test('a folder name too short to be told from ordinary text is not looked for', () => {
  assert.deepEqual(localPathProblems([{ path: 'a.mjs', text: 'the /root of the tree' }], ['/root', '/']), []);
});

test('the tag of a version is v and the version, and nothing else', () => {
  assert.equal(tagProblem('v0.1.0', '0.1.0'), null);
  assert.match(tagProblem('v0.2.0', '0.1.0')!, /releases 0\.2\.0, but package\.json says 0\.1\.0/);
  for (const tag of ['0.1.0', 'v0.1', 'v0.1.0-rc.1', 'refs/tags/v0.1.0', 'v0.1.0 ', '']) {
    assert.match(tagProblem(tag, '0.1.0')!, /not of the form vX\.Y\.Z/, JSON.stringify(tag));
  }
});

test('a release needs the four gallery images the spec lists', () => {
  assert.equal(RELEASE_GALLERY_MIN, 4);
  assert.equal(galleryProblem(['a', 'b', 'c', 'd']), null);
  assert.match(galleryProblem(['a'])!, /holds 1 of 4 images.*docs\/releasing\.md/);
});

test('the identifiers the lock does not hold are listed, sorted', () => {
  assert.deepEqual(unlockedIdentifiers({ a: '1' }, { a: '1', c: '3', b: '2' }), ['b', 'c']);
  assert.deepEqual(unlockedIdentifiers({ a: '1', gone: '9' }, { a: '1' }), []);
});

const CHANGELOG = `# Changelog

## 0.2.0 - 2026-11-01

Newer.

## [0.1.0] - 2026-10-02

First line.

- A bullet.

## 0.0.9

Older.
`;

test('a version’s section is what follows its heading up to the next one', () => {
  assert.equal(changelogSection(CHANGELOG, '0.1.0'), 'First line.\n\n- A bullet.');
  assert.equal(changelogSection(CHANGELOG, '0.2.0'), 'Newer.');
  assert.equal(changelogSection(CHANGELOG, '0.0.9'), 'Older.');
});

test('a changelog with Windows line breaks gives the same section', () => {
  assert.equal(changelogSection(CHANGELOG.replaceAll('\n', '\r\n'), '0.1.0'), 'First line.\n\n- A bullet.');
});

test('a version is not found in a longer one, and a missing or empty section is null', () => {
  assert.equal(changelogSection('## 0.1.01\n\nx\n', '0.1.0'), null);
  assert.equal(changelogSection('## 10.1.0\n\nx\n', '0.1.0'), null);
  assert.equal(changelogSection(CHANGELOG, '9.9.9'), null);
  assert.equal(changelogSection('## 0.1.0\n\n## 0.0.9\n\nx\n', '0.1.0'), null);
});

test('a version with a character a pattern would read is looked for as text, and is not found', () => {
  for (const version of ['(', '[', '0.1.0|0.2.0', '0.*', '+', '\\', '0.1.0)', '^0.1.0', '0.1.0$']) {
    assert.equal(changelogSection(CHANGELOG, version), null, version);
    assert.match(changelogProblem(CHANGELOG, version)!, /has no section for/, version);
  }
});

test('a version’s heading must be dated before a release: unreleased is refused, in any case, in any heading form', () => {
  assert.equal(changelogProblem(CHANGELOG, '0.1.0'), null);
  assert.equal(changelogProblem(CHANGELOG, '0.0.9'), null);
  for (const heading of ['## 0.1.0 - unreleased', '## [0.1.0] - Unreleased', '## 0.1.0 (UNRELEASED)']) {
    assert.match(changelogProblem(`# Changelog\n\n## Unreleased\n\n${heading}\n\nx\n`, '0.1.0')!, /heading of 0\.1\.0 still says “unreleased”/, heading);
  }
  // Only the heading counts: a dated section that mentions the word is a release.
  assert.equal(changelogProblem('## 0.1.0 - 2026-10-02\n\nWhat was unreleased is out.\n', '0.1.0'), null);
});

test('a missing section is the problem, with what to add, and the unreleased heading above does not hide it', () => {
  assert.match(changelogProblem(CHANGELOG, '9.9.9')!, /CHANGELOG\.md has no section for 9\.9\.9: add `## 9\.9\.9 - <date>`/);
  assert.match(changelogProblem('## Unreleased\n\nx\n', '0.1.0')!, /has no section for 0\.1\.0/);
  assert.match(changelogProblem('', '0.1.0')!, /has no section for 0\.1\.0/);
});

const repository = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const pkg = JSON.parse(repository('package.json'));
const notes = (tag: string) => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/release-notes.mjs', import.meta.url)), tag], { encoding: 'utf8' });

test('the repository’s changelog has a section for the version in package.json, and a heading for the next', () => {
  const changelog = repository('CHANGELOG.md');
  assert.ok(changelogSection(changelog, pkg.version), `no section for ${pkg.version}`);
  assert.match(changelog, /^## Unreleased$/m);
});

test('release:check is wired to its script', () => {
  assert.equal(pkg.scripts['release:check'], 'node scripts/release-check.mjs');
  assert.ok(repository('scripts/release-check.mjs').length > 0);
});

test('the release notes of a tag are its changelog section, and a tag with none is refused', () => {
  const found = notes(`v${pkg.version}`);
  assert.equal(found.status, 0, found.stderr);
  assert.equal(found.stdout.trim(), changelogSection(repository('CHANGELOG.md'), pkg.version));
  const missing = notes('v9.9.9');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /CHANGELOG\.md has no section for "9\.9\.9"/);
});

test('release:check reads --tag in both forms, --package-only, and nothing else', () => {
  assert.deepEqual(parseReleaseArgs([]), { packageOnly: false, tag: undefined });
  assert.deepEqual(parseReleaseArgs(['--package-only']), { packageOnly: true, tag: undefined });
  assert.deepEqual(parseReleaseArgs(['--tag', 'v0.1.0']), { packageOnly: false, tag: 'v0.1.0' });
  assert.deepEqual(parseReleaseArgs(['--tag=v0.1.0']), { packageOnly: false, tag: 'v0.1.0' });
  assert.deepEqual(parseReleaseArgs(['--package-only', '--tag=v0.1.0']), { packageOnly: true, tag: 'v0.1.0' });
  assert.deepEqual(parseReleaseArgs(['--tag', 'v0.1.0', '--package-only']), { packageOnly: true, tag: 'v0.1.0' });
  // The tag's own form is tagProblem's to judge, with its explanation.
  assert.deepEqual(parseReleaseArgs(['--tag=refs/tags/v0.1.0']), { packageOnly: false, tag: 'refs/tags/v0.1.0' });
});

test('release:check refuses an argument it does not understand, whatever it looks like', () => {
  const refused: [string[], RegExp][] = [
    [['--tag'], /--tag needs the tag/],
    [['--tag='], /--tag needs the tag/],
    [['--tag', ''], /--tag needs the tag/],
    [['--tag', '--package-only'], /--tag needs the tag/],
    [['--package-only', '--tag'], /--tag needs the tag/],
    [['--tag', 'v0.1.0', '--tag', 'v0.2.0'], /--tag is given twice/],
    [['--tag=v0.1.0', '--tag=v0.2.0'], /--tag is given twice/],
    [['--bogus'], /Unknown option --bogus/],
    [['--tga=v0.1.0'], /Unknown option --tga=v0\.1\.0/],
    [['--package-only=1'], /Unknown option --package-only=1/],
    [['--package-only', '-x'], /Unknown option -x/],
    [['v0.1.0'], /Stray argument “v0\.1\.0”.*--tag v0\.1\.0/],
    [['--tag', 'v0.1.0', 'v0.2.0'], /Stray argument “v0\.2\.0”/],
  ];
  for (const [argv, message] of refused) {
    const parsed = parseReleaseArgs(argv);
    assert.ok('problem' in parsed, JSON.stringify(argv));
    assert.match(parsed.problem, message, JSON.stringify(argv));
  }
});

test('the script stops on such an argument at once: exit 1, the usage, and no step run', () => {
  const script = fileURLToPath(new URL('../scripts/release-check.mjs', import.meta.url));
  // Always with --package-only: were the argument ignored, a build would run, never the tests again.
  for (const argv of [['--package-only', '--bogus'], ['--package-only', '--tag'], ['--package-only', 'v0.1.0'], ['--package-only', '--tag=']]) {
    const result = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8', timeout: 15_000 });
    assert.equal(result.status, 1, `${JSON.stringify(argv)}: ${result.stderr}`);
    assert.equal(result.stdout, '', `${JSON.stringify(argv)} ran a step`);
    assert.match(result.stderr, /^\nRelease check stopped: /, JSON.stringify(argv));
    assert.ok(result.stderr.includes(RELEASE_CHECK_USAGE), JSON.stringify(argv));
  }
});
