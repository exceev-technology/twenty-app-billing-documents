import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICES_BEGIN, NOTICES_END } from '../src/lib/notices.ts';

const here = (name: string) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const PDFCN = '# Third-party notices\n\n## pdfcn\n\nOur own text, which the script must not touch.\n';
const MIT = (holder: string) => `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n`;

type Fixture = {
  /** Installed packages: name -> package.json fields and an optional licence file. */
  packages?: Record<string, { manifest: Record<string, unknown>; licence?: string }>;
  /** What the build's map names, relative to the map's folder (`.twenty/output/src`). */
  sources?: string[];
  /** The scripts/embedded-licences.json table. */
  table?: Record<string, { license: string; via?: string; holder?: string }>;
  /** Extra files of the build, by path under `.twenty/output`. */
  build?: Record<string, string>;
  /** No build at all. */
  noBuild?: boolean;
};

/** A copy of the script in a folder of its own, with the repository's own library and licence text, and the files a run reads. */
function inFixture<T>(fixture: Fixture, check: (run: () => ReturnType<typeof spawnSync>, tree: { read: (name: string) => string; root: string }) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'billing-notices-script-'));
  try {
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    mkdirSync(join(root, 'scripts', 'licenses'), { recursive: true });
    mkdirSync(join(root, 'src', 'lib'), { recursive: true });
    copyFileSync(here('scripts/third-party-notices.mjs'), join(root, 'scripts', 'third-party-notices.mjs'));
    copyFileSync(here('scripts/licenses/Apache-2.0.txt'), join(root, 'scripts', 'licenses', 'Apache-2.0.txt'));
    copyFileSync(here('src/lib/notices.ts'), join(root, 'src', 'lib', 'notices.ts'));
    put('scripts/embedded-licences.json', JSON.stringify({ packages: fixture.table ?? {} }));
    put('THIRD_PARTY_NOTICES.md', PDFCN);
    // fontkit is the one real package the script needs: a link to the repository's own copy, whose dependencies it finds from there.
    mkdirSync(join(root, 'node_modules'));
    symlinkSync(here('node_modules/fontkit'), join(root, 'node_modules', 'fontkit'));
    for (const [name, { manifest, licence }] of Object.entries(fixture.packages ?? {})) {
      put(`node_modules/${name}/package.json`, JSON.stringify({ name, ...manifest }));
      if (licence !== undefined) put(`node_modules/${name}/LICENSE`, licence);
    }
    if (!fixture.noBuild) {
      put('.twenty/output/src/a.mjs.map', JSON.stringify({ version: 3, sources: fixture.sources ?? [], sourcesContent: (fixture.sources ?? []).map(() => ''), mappings: '' }));
      for (const [path, text] of Object.entries(fixture.build ?? {})) put(`.twenty/output/${path}`, text);
    }
    const run = () => spawnSync(process.execPath, [join(root, 'scripts', 'third-party-notices.mjs')], { encoding: 'utf8', cwd: root });
    return check(run, { read: (name) => readFileSync(join(root, name), 'utf8'), root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const ALPHA = { manifest: { version: '1.0.0', license: 'MIT' }, licence: MIT('Ada Lovelace') };

test('it writes the licences of what the build bundles below the pdfcn section, and a second run changes nothing', () => {
  inFixture(
    {
      packages: { alpha: ALPHA, beta: { manifest: { version: '2.1.0', license: 'ISC', author: 'Grace Hopper <grace@example.test>' } } },
      sources: ['../../../node_modules/alpha/index.js', '../../../node_modules/beta/lib/a.js', '../../../src/own.ts', 'webpack://pdfmake/node_modules/gamma/index.js'],
      table: { gamma: { license: 'MIT', via: 'pdfmake', holder: 'Linus Torvalds' } },
    },
    (run, { read }) => {
      const first = run();
      assert.equal(first.status, 0, String(first.stderr));
      const notices = read('THIRD_PARTY_NOTICES.md');
      assert.ok(notices.startsWith(PDFCN), 'the pdfcn section is kept as it was');
      assert.ok(notices.includes(NOTICES_BEGIN) && notices.includes(NOTICES_END));
      // alpha has a licence file: its text, verbatim, with its version. beta has none: ISC's standard text, with its author's name.
      assert.match(notices, /Applies to: `alpha@1\.0\.0`\./);
      assert.ok(notices.includes('Copyright (c) Ada Lovelace'));
      assert.match(notices, /Applies to: `beta@2\.1\.0`\./);
      assert.match(notices, /ISC License\n\nCopyright \(c\) Grace Hopper\n/);
      // gamma is embedded in pdfmake's bundle and not installed: the table's licence and holder, no version.
      assert.match(notices, /Embedded in pdfmake’s prebuilt bundle: `gamma`\./);
      assert.ok(notices.includes('Copyright (c) Linus Torvalds'));
      // Our own source is no package.
      assert.ok(!notices.includes('own.ts'));
      assert.match(String(first.stdout), /written: 3 packages/);
      const second = run();
      assert.equal(second.status, 0, String(second.stderr));
      assert.equal(read('THIRD_PARTY_NOTICES.md'), notices);
      assert.match(String(second.stdout), /is up to date/);
    },
  );
});

test('a package under a copyleft licence stops it, and the file is left as it was', () => {
  inFixture(
    {
      packages: { alpha: ALPHA, beta: { manifest: { version: '1.0.0', license: 'GPL-3.0-only' }, licence: 'GNU GENERAL PUBLIC LICENSE\nVersion 3' } },
      sources: ['../../../node_modules/alpha/index.js', '../../../node_modules/beta/index.js'],
    },
    (run, { read }) => {
      const result = run();
      assert.equal(result.status, 1);
      assert.match(String(result.stderr), /^notices: beta@1\.0\.0 is under “GPL-3\.0-only”, which is copyleft/);
      assert.equal(read('THIRD_PARTY_NOTICES.md'), PDFCN);
    },
  );
});

test('a licence it cannot name stops it, whether package.json says nothing or the file is not one it knows', () => {
  for (const [manifest, licence] of [
    [{ version: '1.0.0' }, 'All rights reserved.'],
    [{ version: '1.0.0', license: 'SEE LICENSE IN LICENSE' }, 'Ours.'],
    [{ version: '1.0.0', license: 'UNLICENSED' }, undefined],
  ] as const) {
    inFixture({ packages: { beta: { manifest, licence } }, sources: ['../../../node_modules/beta/index.js'] }, (run) => {
      const result = run();
      assert.equal(result.status, 1, JSON.stringify(manifest));
      assert.match(String(result.stderr), /beta@1\.0\.0 is under .*unknown/s, JSON.stringify(manifest));
    });
  }
});

test('an embedded package that is neither installed nor in the table stops it, saying where to add it', () => {
  inFixture({ sources: ['webpack://pdfmake/node_modules/delta/index.js'] }, (run, { read }) => {
    const result = run();
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /^notices: delta is bundled, but no copy of it is installed and scripts\/embedded-licences\.json does not know it/);
    assert.equal(read('THIRD_PARTY_NOTICES.md'), PDFCN);
  });
});

test('a table entry that is copyleft stops it too, and a licence with no standard text asks for one', () => {
  inFixture({ sources: ['webpack://pdfmake/node_modules/delta/index.js'], table: { delta: { license: 'LGPL-2.1', via: 'pdfmake' } } }, (run) => {
    const result = run();
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /delta is listed in scripts\/embedded-licences\.json under “LGPL-2\.1”, which is copyleft/);
  });
  inFixture({ sources: ['webpack://pdfmake/node_modules/delta/index.js'], table: { delta: { license: 'BlueOak-1.0.0', via: 'pdfmake' } } }, (run) => {
    const result = run();
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /no standard text of that licence/);
  });
});

test('without a build it says to run npm run build, and changes nothing', () => {
  inFixture({ noBuild: true }, (run, { read }) => {
    const result = run();
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /^notices: there is no build in \.twenty\/output: run `npm run build` first\./);
    assert.equal(read('THIRD_PARTY_NOTICES.md'), PDFCN);
  });
});

test('a font in a bundle is described by its own name table, with the licence it names', () => {
  const vfs = createRequire(import.meta.url)('pdfmake/build/vfs_fonts.js') as Record<string, string>;
  inFixture(
    { sources: ['../../../node_modules/alpha/index.js'], packages: { alpha: ALPHA }, build: { 'src/b.mjs': `var fonts = { "Roboto-Regular.ttf": "${vfs['Roboto-Regular.ttf']}" };\n` } },
    (run, { read }) => {
      const result = run();
      assert.equal(result.status, 0, String(result.stderr));
      const notices = read('THIRD_PARTY_NOTICES.md');
      assert.match(notices, /^## Fonts$/m);
      assert.match(notices, /^### Roboto\n\nFaces: Roboto\. Version 3\.\d+; \d{4}\.\n\nCopyright 2011 The Roboto Project Authors/m);
      assert.ok(notices.includes('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007'));
      assert.match(String(result.stdout), /1 font family/);
    },
  );
});

test('the script is wired to npm run notices, and release:check applies the rule to the packages of the package', () => {
  const pkg = JSON.parse(readFileSync(here('package.json'), 'utf8'));
  assert.equal(pkg.scripts.notices, 'node scripts/third-party-notices.mjs');
  // The script’s own message names this command, so it must exist.
  assert.match(pkg.scripts.build, /twenty dev:build$/);
  const check = readFileSync(here('scripts/release-check.mjs'), 'utf8');
  assert.match(check, /noticesProblem\(bundled\.map\(\(\{ name \}\) => name\), read\('THIRD_PARTY_NOTICES\.md'\)\)/);
  assert.match(check, /bundledPackages\(texts\.filter\(\(\{ path \}\) => path\.endsWith\('\.map'\)\)/);
});
