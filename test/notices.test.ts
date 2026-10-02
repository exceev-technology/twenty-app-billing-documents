import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOTICES_BEGIN, NOTICES_END, OFL_1_1, apacheNotice, bundledPackages, copyrightLines, copyrightStatement, iccTags, licenceFromText, licenceKind, missingFromNotices,
  noticesProblem, renderFontNotices, renderPackageNotices, spliceSection, standardLicence, sourcesOfMap, zlibNotice,
} from '../src/lib/notices.ts';

const repository = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('the packages a build bundles are read from its source maps, one record each, sorted, whatever the way a bundler names them', () => {
  const sources = [
    '../../../../src/own-code.ts',
    '../../../../node_modules/uuid/dist-node/stringify.js',
    '../../../../node_modules/@sniptt/guards/lib/guards/primitives.ts',
    '../../../../node_modules/react-dom/node_modules/scheduler/index.js',
    'webpack://pdfmake/node_modules/stream-browserify/node_modules/readable-stream/lib/a.js',
    'webpack://pdfmake/node_modules/@noble/hashes/src/_md.ts',
    'webpack://pdfmake/node_modules/%40noble/ciphers/src/a.ts',
    'webpack://pdfmake/src/PDFDocument.js',
    'webpack://pdfmake/webpack/universalModuleDefinition',
    'react-wrapper:react',
    'twenty-sdk-define-stub:__twenty-sdk-define-stub__',
  ];
  assert.deepEqual(bundledPackages(sources), [
    { name: '@noble/ciphers', hosts: ['pdfmake'], direct: false },
    { name: '@noble/hashes', hosts: ['pdfmake'], direct: false },
    { name: '@sniptt/guards', hosts: [], direct: true },
    { name: 'pdfmake', hosts: [], direct: true },
    { name: 'readable-stream', hosts: ['pdfmake'], direct: false },
    { name: 'scheduler', hosts: [], direct: true },
    { name: 'uuid', hosts: [], direct: true },
  ]);
});

test('a module webpack ignored, and a name that only looks like a folder, name no package', () => {
  const sources = [
    'webpack://pdfmake/ignored%7C/home/runner/work/pdfmake/pdfmake/node_modules/js-md5/src%7Cbuffer',
    'webpack://pdfmake/ignored|/home/runner/work/pdfmake/pdfmake/node_modules/stream-browserify/node_modules/readable-stream/lib|util',
    '../../../../src/my_node_modules/a.ts',
    '../../../../src/node_modules_notes.ts',
  ];
  assert.deepEqual(bundledPackages(sources), []);
});

test('a package is hosted by every prebuilt bundle that holds it, and direct when one of our own bundles holds it too', () => {
  const found = bundledPackages(['webpack://pdfmake/node_modules/tslib/a.js', 'webpack://other/node_modules/tslib/b.js', 'webpack://pdfmake/node_modules/tslib/c.js']);
  assert.deepEqual(found, [{ name: 'tslib', hosts: ['other', 'pdfmake'], direct: false }]);
  assert.deepEqual(bundledPackages(['webpack://pdfmake/node_modules/tslib/a.js', '../../../../node_modules/tslib/b.js']), [{ name: 'tslib', hosts: ['pdfmake'], direct: true }]);
});

test('the sources of a map are its sources, and a text that is not a map has none', () => {
  assert.deepEqual(sourcesOfMap('{"version":3,"sources":["a.ts","b.ts"],"mappings":""}'), ['a.ts', 'b.ts']);
  assert.deepEqual(sourcesOfMap('{"version":3}'), []);
  assert.deepEqual(sourcesOfMap('not json'), []);
  assert.deepEqual(sourcesOfMap('{"sources":[1,"a.ts"]}'), ['a.ts']);
});

const NOTICES = [
  '# Third-party notices',
  NOTICES_BEGIN,
  'Applies to: `pdfmake@0.3.11`, `@noble/hashes`, `safe-buffer` (embedded) and `util-deprecate`.',
  'The buffer module is not the safe-buffer one, and a util is not util-deprecate.',
  NOTICES_END,
].join('\n');

test('a package the notices do not name is found, however another name contains it', () => {
  assert.deepEqual(missingFromNotices(NOTICES, ['pdfmake', '@noble/hashes', 'safe-buffer', 'util-deprecate']), []);
  // “buffer” and “util” appear in the notices, but only as words and inside other names.
  assert.deepEqual(missingFromNotices(NOTICES, ['buffer', 'util', 'hashes', '@noble/ciphers', 'pdfkit']), ['buffer', 'util', 'hashes', '@noble/ciphers', 'pdfkit']);
  // A version after the name is part of how a package is named; one that starts another name is not.
  assert.deepEqual(missingFromNotices('`pdfmake@0.3.11`', ['pdfmake']), []);
  assert.deepEqual(missingFromNotices('`pdfmake-extra@1.0.0`', ['pdfmake']), ['pdfmake']);
});

test('release:check’s problem says which packages are missing, how many, and the two commands that fix it', () => {
  assert.equal(noticesProblem(['pdfmake', 'safe-buffer'], NOTICES), null);
  const problem = noticesProblem(['a', 'b', 'c', 'd', 'e', 'f', 'pdfmake'], NOTICES)!;
  assert.match(problem, /^THIRD_PARTY_NOTICES\.md does not name 6 package\(s\) the build bundles \(a, b, c, d, e, …\)/);
  assert.match(problem, /run `npm run build` then `npm run notices`, and commit the file\.$/);
  assert.match(noticesProblem(['zzz'], '')!, /does not name 1 package\(s\) the build bundles \(zzz\)/);
});

test('a licence is permissive when every licence of its expression is, and copyleft or unknown otherwise', () => {
  for (const spdx of ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'Zlib', '(MIT AND Zlib)', 'MIT OR Apache-2.0', 'CC0-1.0', 'Unlicense']) {
    assert.equal(licenceKind(spdx), 'permissive', spdx);
  }
  for (const spdx of ['GPL-3.0', 'GPL-2.0-only', 'AGPL-3.0-or-later', 'LGPL-2.1', 'MPL-2.0', 'EPL-2.0', 'CDDL-1.0', 'SSPL-1.0', 'CC-BY-SA-4.0', '(MIT OR GPL-3.0)', 'MIT AND LGPL-2.1+']) {
    assert.equal(licenceKind(spdx), 'copyleft', spdx);
  }
  for (const spdx of ['', 'UNLICENSED', 'SEE LICENSE IN LICENSE.md', 'Custom', 'MIT AND Custom', undefined]) {
    assert.equal(licenceKind(spdx), 'unknown', String(spdx));
  }
});

test('a licence file that names no licence is told by its text, and an unfamiliar text is not guessed', () => {
  assert.equal(licenceFromText(standardLicence('MIT', 'A')!), 'MIT');
  assert.equal(licenceFromText(standardLicence('ISC', 'A')!), 'ISC');
  assert.equal(licenceFromText(standardLicence('BSD-3-Clause', 'A')!), 'BSD-3-Clause');
  assert.equal(licenceFromText(repository('THIRD_PARTY_NOTICES.md')), 'MIT');
  assert.equal(licenceFromText('All rights reserved.'), null);
  assert.equal(licenceFromText('GNU GENERAL PUBLIC LICENSE Version 3'), null);
});

test('the standard text of a licence takes the holder’s line, and a licence without one is not invented', () => {
  const mit = standardLicence('MIT', 'Devon Govett')!;
  assert.match(mit, /^MIT License\n\nCopyright \(c\) Devon Govett\n\nPermission is hereby granted, free of charge/);
  assert.match(mit, /DEALINGS IN THE\nSOFTWARE\.$/);
  assert.match(standardLicence('ISC', 'Isaac Z. Schlueter')!, /^ISC License\n\nCopyright \(c\) Isaac Z\. Schlueter\n\nPermission to use, copy, modify, and\/or distribute/);
  assert.match(standardLicence('BSD-3-Clause', 'Feross')!, /^BSD 3-Clause License\n\nCopyright \(c\) Feross\n\nRedistribution and use in source and binary forms/);
  // A line that already is one is kept, whole and on as many lines as it has.
  assert.match(standardLicence('MIT', 'Copyright Joyent, Inc. and other Node contributors.')!, /^MIT License\n\nCopyright Joyent, Inc\. and other Node contributors\.\n\nPermission/);
  assert.match(standardLicence('ISC', '© 2020 A\n© 2021 B')!, /^ISC License\n\n© 2020 A\n© 2021 B\n\nPermission/);
  assert.equal(standardLicence('GPL-3.0', 'x'), null);
  assert.equal(standardLicence('MIT AND Zlib', 'x'), null);
});

test('the MIT text we write is the one pdfcn’s notice carries, word for word', () => {
  const pdfcn = repository('THIRD_PARTY_NOTICES.md').match(/```\n(MIT License[\s\S]*?)\n```/)![1];
  assert.equal(standardLicence('MIT', 'Shadcn Labs')!.replace('Copyright (c) Shadcn Labs', 'Copyright (c) 2026 Shadcn Labs'), pdfcn);
});

test('copyright lines are taken from the top of other people’s source, whatever the comment around them', () => {
  const lines = copyrightLines([
    '// Copyright Joyent, Inc. and other Node contributors.\n//\n// Permission is hereby granted',
    '/*! x */\n/* Copyright 2013 Google Inc. All Rights Reserved.\n\n   Licensed under the Apache License */',
    ' * Copyright (c) Microsoft Corporation.\nconst a = 1;',
    '// Copyright Joyent, Inc. and other Node contributors.',
    'get copyright() { return this.getName("copyright"); } // The font’s copyright information',
    "const copyright = 'a Copyright (c) in the middle of a line';",
    '(c) 1995-2013 Jean-loup Gailly and Mark Adler',
    '  © 2020 Someone',
  ], 10);
  assert.deepEqual(lines, [
    'Copyright Joyent, Inc. and other Node contributors.',
    'Copyright 2013 Google Inc. All Rights Reserved.',
    'Copyright (c) Microsoft Corporation.',
    '(c) 1995-2013 Jean-loup Gailly and Mark Adler',
    '© 2020 Someone',
  ]);
  assert.deepEqual(copyrightLines(['// Copyright 1 A', '// Copyright 2 B', '// Copyright 3 C', '// Copyright 4 D']), ['Copyright 1 A', 'Copyright 2 B', 'Copyright 3 C']);
});

test('code under the Apache licence is told from its header, with the copyright line above it', () => {
  const header = '/* Copyright 2013 Google Inc. All Rights Reserved.\n\n   Licensed under the Apache License, Version 2.0 (the "License");\n   you may not use this file except in compliance with the License. */';
  assert.deepEqual(apacheNotice(['const a = 1;', header]), ['Copyright 2013 Google Inc. All Rights Reserved.']);
  assert.deepEqual(apacheNotice(['// Licensed under the Apache License, Version 2.0']), []);
  assert.equal(apacheNotice(['// MIT licensed', 'The Apache Software Foundation']), null);
});

test('code under the zlib licence is told from its header, with the copyright lines above it', () => {
  const header = "'use strict';\n\n// (C) 1995-2013 Jean-loup Gailly and Mark Adler\n// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin\n//\n// This software is provided 'as-is', without any express or implied\n// warranty.";
  assert.deepEqual(zlibNotice(['const a = 1;', header]), ['(C) 1995-2013 Jean-loup Gailly and Mark Adler', '(C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin']);
  assert.deepEqual(zlibNotice(["// This software is provided 'as-is', without any express or implied warranty."]), []);
  assert.equal(zlibNotice(['// MIT licensed', 'const text = "provided as-is";']), null);
});

test('the zlib text takes the copyright lines of the code it travels with, and a line that is one is not given a second `Copyright (c)`', () => {
  const zlib = standardLicence('Zlib', '(C) 1995-2013 Jean-loup Gailly and Mark Adler\n(C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin')!;
  assert.match(zlib, /^zlib License\n\n\(C\) 1995-2013 Jean-loup Gailly and Mark Adler\n\(C\) 2014-2017 Vitaly Puzrin and Andrey Tupitsin\n\nThis software is provided 'as-is', without any express or implied\nwarranty\./);
  for (const clause of ['1. The origin of this software must not be misrepresented', '2. Altered source versions must be plainly marked as such', '3. This notice may not be removed or altered from any source distribution.']) {
    assert.ok(zlib.includes(clause), clause);
  }
  assert.match(zlib, /source distribution\.$/);
  assert.equal(copyrightStatement('(C) 1995 A'), '(C) 1995 A');
  assert.equal(copyrightStatement('Linus Torvalds'), 'Copyright (c) Linus Torvalds');
});

test('a zlib block is titled by its first (C) line, and an Apache block by its Copyright line though a clause of the licence starts with (c)', () => {
  const zlib = renderPackageNotices([{ name: 'pako', license: 'Zlib', text: standardLicence('Zlib', '(C) 1995-2013 Jean-loup Gailly and Mark Adler')!, origin: 'standard', via: 'pdfmake' }]);
  assert.match(zlib, /^### Zlib - \(C\) 1995-2013 Jean-loup Gailly and Mark Adler\n/);
  const apache = renderPackageNotices([{ name: 'a', license: 'Apache-2.0', text: 'Copyright 2024 X.\n\n     (c) You must retain, in the Source form', origin: 'file' }]);
  assert.match(apache, /^### Apache-2\.0 - Copyright 2024 X\.\n/);
});

test('an ICC profile’s description and copyright are read from its tag table', () => {
  const text = (value: string) => Buffer.concat([Buffer.from('text\0\0\0\0'), Buffer.from(`${value}\0`, 'latin1')]);
  const description = (value: string) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length + 1);
    return Buffer.concat([Buffer.from('desc\0\0\0\0'), length, Buffer.from(`${value}\0`, 'latin1')]);
  };
  const tags: [string, Buffer][] = [['desc', description('sRGB2014')], ['cprt', text('Copyright International Color Consortium, 2015.')], ['wtpt', Buffer.alloc(20)]];
  const header = Buffer.alloc(128);
  const table = Buffer.alloc(4 + 12 * tags.length);
  table.writeUInt32BE(tags.length, 0);
  let offset = 128 + table.length;
  const bodies = tags.map(([signature, body], index) => {
    table.write(signature, 4 + 12 * index, 'latin1');
    table.writeUInt32BE(offset, 8 + 12 * index);
    table.writeUInt32BE(body.length, 12 + 12 * index);
    offset += body.length;
    return body;
  });
  assert.deepEqual(iccTags(Buffer.concat([header, table, ...bodies])), { description: 'sRGB2014', copyright: 'Copyright International Color Consortium, 2015.' });
  assert.deepEqual(iccTags(Buffer.alloc(10)), {});
});

const MIT_TEXT = standardLicence('MIT', 'Ada')!;

test('packages with the same licence text share one block, named by name and version, and an embedded one by name alone', () => {
  const section = renderPackageNotices([
    { name: 'zeta', version: '2.0.0', license: 'MIT', text: MIT_TEXT, origin: 'standard' },
    { name: 'alpha', version: '1.0.0', license: 'MIT', text: `${MIT_TEXT}\n`, origin: 'file' },
    { name: 'core-js', license: 'MIT', text: MIT_TEXT, origin: 'standard', via: 'pdfmake' },
    { name: 'tslib', version: '2.8.1', license: '0BSD', text: 'Zero-clause text', origin: 'file' },
  ]);
  assert.equal([...section.matchAll(/^### /gm)].length, 2);
  assert.match(section, /^### 0BSD\n\nApplies to: `tslib@2\.8\.1`\./m);
  assert.match(section, /^### MIT - Copyright \(c\) Ada\n\nApplies to: `alpha@1\.0\.0`, `zeta@2\.0\.0`\. Embedded in pdfmake’s prebuilt bundle: `core-js`\.\n/m);
  assert.match(section, /Standard MIT text, in place of the licence file of `core-js`, `zeta@2\.0\.0` \(none is available here\)\./);
  // The text is quoted once.
  assert.equal(section.split('Permission is hereby granted').length, 2);
  assert.equal(renderPackageNotices([{ name: 'a', license: 'MIT', text: MIT_TEXT, origin: 'file' }]), renderPackageNotices([{ name: 'a', license: 'MIT', text: `${MIT_TEXT}\r\n`.replaceAll('\n', '\r\n'), origin: 'file' }]));
});

test('a block that holds only embedded packages names the bundle, and one bundle is named once however many packages it holds', () => {
  const section = renderPackageNotices([
    { name: 'b', license: 'MIT', text: MIT_TEXT, origin: 'standard', via: 'twenty-sdk' },
    { name: 'a', license: 'MIT', text: MIT_TEXT, origin: 'standard', via: 'pdfmake' },
    { name: 'c', license: 'MIT', text: MIT_TEXT, origin: 'standard', via: 'pdfmake' },
    { name: 'd', license: 'MIT', note: 'files with an Apache header', text: MIT_TEXT, origin: 'file' },
  ]);
  assert.match(section, /^Applies to: `d` \(files with an Apache header\)\. Embedded in pdfmake’s prebuilt bundle: `a`, `c`\. Embedded in twenty-sdk’s prebuilt bundle: `b`\.$/m);
  const alone = renderPackageNotices([{ name: 'a', license: 'ISC', text: standardLicence('ISC', 'A')!, origin: 'standard', via: 'pdfmake' }]);
  assert.match(alone, /^Embedded in pdfmake’s prebuilt bundle: `a`\.$/m);
  // When every package of a block stands in for a missing file, the block says so once and does not list them again.
  assert.match(alone, /^Standard ISC text, in place of their licence files \(none is available here\)\.$/m);
});

test('every name the section lists is one the release check finds again', () => {
  const entries = [
    { name: '@noble/hashes', version: '1.8.0', license: 'MIT', text: MIT_TEXT, origin: 'file' as const },
    { name: 'util', license: 'MIT', text: MIT_TEXT, origin: 'standard' as const, via: 'pdfmake' },
  ];
  assert.deepEqual(missingFromNotices(renderPackageNotices(entries), ['@noble/hashes', 'util']), []);
});

test('a font is described by its own words, one block per family, and its licence follows whole', () => {
  const block = renderFontNotices([
    { family: 'Roboto', faces: ['Roboto', 'Roboto Italic'], version: '3.014; 2025', copyright: 'Copyright 2011 The Roboto Project Authors', trademark: 'Roboto is a trademark of Google.', licence: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.', licenceText: OFL_1_1 },
    { family: 'Plain', faces: ['Plain'], version: '1.0', copyright: 'Copyright 2020 A', licence: 'Licensed under the OFL.', licenceText: OFL_1_1 },
  ]);
  assert.match(block, /^### Roboto\n\nFaces: Roboto, Roboto Italic\. Version 3\.014; 2025\.\n\nCopyright 2011 The Roboto Project Authors\n\nRoboto is a trademark of Google\.\n\nThis Font Software is licensed under the SIL Open Font License, Version 1\.1\.\n\n```text\n-+\nSIL OPEN FONT LICENSE/);
  assert.match(block, /\n```\n\n### Plain\n\nFaces: Plain\. Version 1\.0\.\n\nCopyright 2020 A\n\nLicensed under the OFL\.\n\n```text/);
  assert.ok(!block.includes('trademark of Google.\n\nCopyright 2020 A'));
});

test('the generated section replaces what is between the markers, keeps what is outside them, and is stable', () => {
  const head = '# Third-party notices\n\n## pdfcn\n\nOur text.\n';
  const once = spliceSection(head, 'first\n');
  assert.equal(once, `${head}\n${NOTICES_BEGIN}\n\nfirst\n\n${NOTICES_END}\n`);
  const twice = spliceSection(once, 'second\n');
  assert.equal(twice, `${head}\n${NOTICES_BEGIN}\n\nsecond\n\n${NOTICES_END}\n`);
  assert.equal(spliceSection(twice, 'second\n'), twice);
  // Something written after the end marker is kept too.
  assert.equal(spliceSection(`${once}\n## Later\n`, 'third\n'), `${head}\n${NOTICES_BEGIN}\n\nthird\n\n${NOTICES_END}\n\n## Later\n`);
});

test('a file with one marker, or the markers the wrong way round, is refused rather than guessed at', () => {
  assert.throws(() => spliceSection(`a\n${NOTICES_BEGIN}\nb\n`, 'x'), /one of the two markers/);
  assert.throws(() => spliceSection(`a\n${NOTICES_END}\nb\n`, 'x'), /one of the two markers/);
  assert.throws(() => spliceSection(`${NOTICES_END}\n${NOTICES_BEGIN}\n`, 'x'), /end marker comes before/);
  assert.throws(() => spliceSection(`${NOTICES_BEGIN}\n${NOTICES_BEGIN}\n${NOTICES_END}\n`, 'x'), /more than once/);
});

test('the Open Font License text is the 1.1 licence, whole', () => {
  assert.match(OFL_1_1, /^SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007\n-+\n/m);
  for (const heading of ['PREAMBLE', 'DEFINITIONS', 'PERMISSION & CONDITIONS', 'TERMINATION', 'DISCLAIMER']) assert.ok(OFL_1_1.includes(`\n${heading}\n`), heading);
  for (const clause of ['1) Neither the Font Software', '2) Original or Modified Versions', '3) No Modified Version', '4) The name(s) of the Copyright Holder(s)', '5) The Font Software, modified or unmodified']) {
    assert.ok(OFL_1_1.includes(clause), clause);
  }
  assert.match(OFL_1_1, /OTHER DEALINGS IN THE FONT SOFTWARE\.$/);
});

// What this repository commits: the table that stands in for packages no copy of which is installed, and the notices.
const table: { packages: Record<string, { license: string; via?: string; holder?: string }> } = JSON.parse(repository('scripts/embedded-licences.json'));

test('every package the table stands in for has a permissive licence, a host that is a package, and a standard text', () => {
  const names = Object.keys(table.packages);
  assert.ok(names.length > 20);
  assert.deepEqual(names, [...names].sort());
  for (const [name, { license, via }] of Object.entries(table.packages)) {
    assert.equal(licenceKind(license), 'permissive', name);
    assert.ok(standardLicence(license, 'x'), `${name}: no standard text for ${license}`);
    if (via !== undefined) assert.match(via, /^[a-z][a-z0-9-]*$/, name);
  }
});

test('every package the table stands in for names its own copyright holder, as its LICENSE file does, not a stand-in for the authors', () => {
  for (const [name, { holder }] of Object.entries(table.packages)) {
    assert.ok(holder !== undefined, `${name}: no holder`);
    assert.match(holder, /^(Copyright\b|©|\([cC]\))/, name);
    for (const line of holder.split('\n')) assert.match(line, /^(Copyright\b|©|\([cC]\)) \S/, `${name}: ${line}`);
  }
  // twenty-shared is Twenty's own, MIT by its LICENSE in the twentyhq/twenty repository; the AGPL-3.0 package of that name on npm is not it.
  assert.deepEqual(table.packages['twenty-shared'], { license: 'MIT', via: 'twenty-sdk', holder: 'Copyright (c) 2023-present Twenty.com, PBC' });
  const notices = repository('THIRD_PARTY_NOTICES.md');
  assert.ok(!notices.includes('the authors of each package named above'), 'no package is left with the stand-in line');
  assert.match(notices, /^### MIT - Copyright \(c\) 2023-present Twenty\.com, PBC$/m);
  assert.match(notices, /^### BSD-3-Clause - Copyright 2008 Fair Oaks Labs, Inc\.$/m);
});

test('pako, which is "MIT AND Zlib", has the zlib licence in the notices beside its own MIT file', () => {
  const notices = repository('THIRD_PARTY_NOTICES.md');
  assert.match(notices, /^### \(MIT AND Zlib\) - Copyright \(C\) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn$/m);
  assert.match(notices, /^### Zlib - \(C\) 1995-2013 Jean-loup Gailly and Mark Adler\n\nEmbedded in pdfmake’s prebuilt bundle: `pako` \(the files that carry a zlib header\)\./m);
});

test('THIRD_PARTY_NOTICES.md keeps the pdfcn section above the generated one, and names the fonts the package embeds', () => {
  const notices = repository('THIRD_PARTY_NOTICES.md');
  assert.ok(notices.startsWith('# Third-party notices\n\n## pdfcn\n'));
  const begin = notices.indexOf(NOTICES_BEGIN);
  const end = notices.indexOf(NOTICES_END);
  assert.ok(begin > notices.indexOf('## pdfcn') && end > begin, 'the generated section follows the pdfcn one');
  assert.ok(notices.indexOf('Copyright (c) 2026 Shadcn Labs') < begin);
  const generated = notices.slice(begin, end);
  assert.match(generated, /^## Fonts$/m);
  assert.match(generated, /^### Roboto$/m);
  assert.ok(generated.includes('Copyright 2011 The Roboto Project Authors'));
  assert.ok(generated.includes(OFL_1_1));
  // The colour profile pdfkit embeds is named by its own tags.
  assert.ok(generated.includes('Copyright International Color Consortium, 2015'));
});
