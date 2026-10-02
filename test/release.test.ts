import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_CHECK_USAGE, RELEASE_GALLERY_MIN, changelogProblem, changelogSection, galleryProblem, localPathProblems, npmTookTag, packageProblems,
  parseReleaseArgs, releaseConclusion, tagProblem, unlockedIdentifiers,
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
  assert.match(problems[0], /^2 file\(s\) name \/Users\/camille\/Data\/billing, a folder of the machine that built the package \(b\.mjs\.map, c\.mjs\)/);
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

// What pdfmake’s own source map says: it was built on a GitHub runner, and esbuild copies the names of its
// sources into ours. The folder is pdfmake’s build, not ours, so it is no leak, even on a runner.
const RUNNER_CHECKOUT = '/home/runner/work/twenty-app-billing-documents/twenty-app-billing-documents';
const RUNNER_ROOTS = [RUNNER_CHECKOUT, '/home/runner'];
const PDFMAKE_IGNORED = [
  'webpack://pdfmake/ignored%7C/home/runner/work/pdfmake/pdfmake/node_modules/js-md5/src%7Cbuffer',
  'webpack://pdfmake/ignored|/home/runner/work/pdfmake/pdfmake/node_modules/stream-browserify/node_modules/readable-stream/lib%7Cutil',
];
const mapOf = (sources: string[], rest: Record<string, unknown> = {}) => JSON.stringify({ version: 3, sources, sourcesContent: sources.map(() => ''), mappings: '', ...rest });

test('pdfmake’s own paths, named by a webpack:// source, are no leak on a runner, in a map or in a bundle', () => {
  const files = [
    { path: 'src/logic-functions/billing-action.mjs.map', text: mapOf(['../../../../src/a.ts', 'webpack://pdfmake/src/PDFDocument.js', ...PDFMAKE_IGNORED]) },
    // A bundle may repeat the name in a comment: the URL it sits in is still pdfmake’s.
    { path: 'src/logic-functions/billing-action.mjs', text: `// ${PDFMAKE_IGNORED[0]}\nconst x = "${PDFMAKE_IGNORED[1]}";\n` },
  ];
  assert.deepEqual(localPathProblems(files, RUNNER_ROOTS), []);
});

test('only a URL of another tool is skipped: file:// and a bare path of the runner still count', () => {
  for (const [path, text] of [
    ['a.mjs.map', mapOf([`file://${RUNNER_CHECKOUT}/src/a.ts`])],
    ['b.mjs.map', mapOf([`../../../../../../../home/runner/work/twenty-app-billing-documents/twenty-app-billing-documents/node_modules/x/index.ts`])],
    ['c.mjs.map', mapOf(['../../../../src/a.ts'], { sourceRoot: `${RUNNER_CHECKOUT}/` })],
    ['d.mjs', `// ${RUNNER_CHECKOUT}/src/d.ts`],
    ['e.mjs', `const dir = "file://${RUNNER_CHECKOUT}/src";`],
    ['f.json', `{"path":"/home/runner/.cache/x"}`],
  ]) {
    assert.equal(localPathProblems([{ path, text }], RUNNER_ROOTS).length, 1, path);
  }
});

test('a real leak is found in a map that also holds pdfmake’s string, and the message quotes the text that matched', () => {
  const leak = '../../../../../../../home/runner/work/twenty-app-billing-documents/twenty-app-billing-documents/node_modules/x/index.ts';
  const files = [
    { path: 'a.mjs.map', text: mapOf([...PDFMAKE_IGNORED, leak, '../../../../src/ok.ts']) },
    { path: 'b.mjs', text: 'const ok = 1;' },
  ];
  const problems = localPathProblems(files, RUNNER_ROOTS);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].startsWith(`1 file(s) name ${RUNNER_CHECKOUT}, a folder of the machine that built the package (a.mjs.map).`), problems[0]);
  assert.ok(problems[0].includes(`a.mjs.map, holds “${leak}”`), problems[0]);
  assert.ok(!problems[0].includes('pdfmake'), problems[0]);
});

test('the excerpt of a bundle’s match is the text around it, on one line and not longer than a screen', () => {
  const text = `${'x'.repeat(300)}\n// built in ${RUNNER_CHECKOUT}/src/long.ts\n${'y'.repeat(300)}`;
  const [problem] = localPathProblems([{ path: 'a.mjs', text }], RUNNER_ROOTS);
  const quoted = problem.match(/holds “([^”]*)”/)![1];
  assert.ok(quoted.includes(`${RUNNER_CHECKOUT}/src/long.ts`));
  assert.ok(!quoted.includes('\n') && quoted.length < 220, `${quoted.length}`);
});

test('the remedy tells a linked node_modules from a path in our own source', () => {
  const [problem] = localPathProblems([{ path: 'a.mjs', text: '// /Users/camille/x' }], ['/Users/camille']);
  assert.match(problem, /If that goes through node_modules, it is linked from elsewhere: run `npm ci` in the checkout and build again\. Otherwise the path is in our own source or configuration: remove it\.$/);
});

test('a map that is not JSON is read as text, so a leak in it is still found', () => {
  assert.equal(localPathProblems([{ path: 'a.mjs.map', text: 'not json /Users/camille/Data/x' }], ['/Users/camille']).length, 1);
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

test('npm takes --tag for itself when it is given without `--`, and the script says so instead of running without it', () => {
  // `npm run release:check --tag v0.1.0`: npm reads --tag as its own dist-tag option, exports it as npm_config_tag,
  // and hands the script no argument at all.
  assert.match(npmTookTag({ npm_config_tag: 'v0.1.0' }, undefined)!, /^npm took --tag for itself: run `npm run release:check -- --tag vX\.Y\.Z`/);
  // With the `--`, the script has its own --tag and npm_config_tag is not set.
  assert.equal(npmTookTag({ npm_config_tag: 'v0.1.0' }, 'v0.1.0'), null);
  assert.equal(npmTookTag({}, undefined), null);
  assert.equal(npmTookTag({ npm_config_tag: '' }, undefined), null);
});

test('the script refuses at once when npm took --tag, before any step: exit 1 and the message, whatever the other arguments', () => {
  const script = fileURLToPath(new URL('../scripts/release-check.mjs', import.meta.url));
  for (const argv of [[], ['--package-only']]) {
    const result = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8', timeout: 15_000, env: { ...process.env, npm_config_tag: 'v0.1.0' } });
    assert.equal(result.status, 1, `${JSON.stringify(argv)}: ${result.stderr}`);
    assert.equal(result.stdout, '', `${JSON.stringify(argv)} ran a step`);
    assert.match(result.stderr, /^\nRelease check stopped: npm took --tag for itself: run `npm run release:check -- --tag vX\.Y\.Z`/, JSON.stringify(argv));
  }
});

test('only a check of everything with a tag says "Ready to release", and the others say what they did not check', () => {
  const pkg = { name: 'twenty-app-billing-documents', version: '0.1.0' };
  assert.equal(releaseConclusion({ packageOnly: false, tag: 'v0.1.0' }, pkg), 'Ready to release twenty-app-billing-documents@0.1.0 as v0.1.0.');
  assert.equal(
    releaseConclusion({ packageOnly: false, tag: undefined }, pkg),
    'The package is ready. Not checked: the tag, the changelog date, the gallery and the identifier lock: run `npm run release:check -- --tag vX.Y.Z` before tagging.',
  );
  const onlyPackage = releaseConclusion({ packageOnly: true, tag: undefined }, pkg);
  assert.match(onlyPackage, /^Only the package was checked/);
  assert.match(onlyPackage, /Not checked: the tests, the typecheck, the identifier lock, the tag, the changelog date and the gallery: run `npm run release:check -- --tag vX\.Y\.Z` before tagging\.$/);
  const packageAndTag = releaseConclusion({ packageOnly: true, tag: 'v0.1.0' }, pkg);
  assert.match(packageAndTag, /^The package and the tag v0\.1\.0 are ready\. Not checked: the tests, the typecheck and that no locked identifier changed/);
  for (const mode of [{ packageOnly: true, tag: undefined }, { packageOnly: false, tag: undefined }, { packageOnly: true, tag: 'v0.1.0' }]) {
    assert.doesNotMatch(releaseConclusion(mode, pkg), /Ready to release/, JSON.stringify(mode));
  }
});

test('the script prints that conclusion and nothing else as its last line', () => {
  const script = repository('scripts/release-check.mjs');
  assert.match(script, /console\.log\(`\\n\$\{releaseConclusion\(parsed, pkg\)\}`\);\s*$/);
  // The script's code (not its header, which explains the wording) never writes the sentence itself.
  assert.doesNotMatch(script.split('\n').filter((line) => !line.startsWith('//')).join('\n'), /Ready to release/);
});
