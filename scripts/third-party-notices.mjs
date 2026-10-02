// Writes the generated part of THIRD_PARTY_NOTICES.md: the licence of every npm package the
// published bundles hold, and of every font they embed. It reads what the build made
// (`npm run build`, in .twenty/output), not what package.json lists: the bundles hold code from
// 80-odd packages, most of them dependencies of dependencies, and the source maps next to them
// name each one. Run: npm run build, then npm run notices, then commit the file.
//
//   packages  from `sources` of the maps. A package one of our bundles holds is read from the
//             copy installed here (name, version, licence, licence file). A package that a
//             prebuilt bundle embeds (pdfmake's browser build, the Twenty SDK) is listed
//             without a version: its licence file is the installed copy's when there is one, and
//             otherwise the standard text of the licence in scripts/embedded-licences.json, with
//             the copyright line of the package's own LICENSE file that the table holds.
//   fonts     base64 TrueType/OpenType strings in the bundles, read with fontkit: their own
//             copyright, trademark and licence sentence come from the font's name table.
//   other     an ICC colour profile (pdfkit embeds one in every PDF it writes), by its own tags.
//
// A licence that is copyleft or that this script cannot name stops it, and so does a package it
// has no licence for: nothing is guessed. Everything above the generated section of
// THIRD_PARTY_NOTICES.md (the pdfcn notice) is kept as it is.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OFL_1_1, apacheNotice, bundledPackages, copyrightLines, copyrightStatement, iccTags, licenceFromText, licenceKind, renderFontNotices,
  renderPackageNotices, spliceSection, standardLicence, zlibNotice,
} from '../src/lib/notices.ts';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output = join(root, '.twenty', 'output');
const NOTICES_FILE = join(root, 'THIRD_PARTY_NOTICES.md');

const fail = (message) => {
  console.error(`notices: ${message}`);
  process.exit(1);
};

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

if (!existsSync(output)) fail('there is no build in .twenty/output: run `npm run build` first.');
const files = walk(output);
const maps = files.filter((file) => file.endsWith('.map'));
if (maps.length === 0) fail('the build in .twenty/output has no source maps: run `npm run build` again.');

// What the maps name: the packages, the folders of the copies one of our bundles holds, and the
// source text of each package (for the copyright lines and licence headers it carries).
const sources = [];
const directDirs = new Map();
const sourceTexts = new Map();
for (const file of maps) {
  const map = JSON.parse(readFileSync(file, 'utf8'));
  (map.sources ?? []).forEach((source, index) => {
    sources.push(source);
    const [found] = bundledPackages([source]);
    if (found === undefined) return;
    const content = map.sourcesContent?.[index];
    if (typeof content === 'string') {
      if (!sourceTexts.has(found.name)) sourceTexts.set(found.name, new Set());
      sourceTexts.get(found.name).add(content);
    }
    if (found.hosts.length === 0 && found.direct) {
      // `../../../../node_modules/a/node_modules/b/index.js` from the map's folder: the folder of b, if it exists here.
      const absolute = resolve(dirname(file), source);
      const marker = `/node_modules/${found.name}/`;
      const at = absolute.lastIndexOf(marker);
      if (at === -1) return;
      const dir = absolute.slice(0, at + marker.length - 1);
      if (existsSync(join(dir, 'package.json'))) {
        if (!directDirs.has(found.name)) directDirs.set(found.name, new Set());
        directDirs.get(found.name).add(dir);
      }
    }
  });
}
const bundled = bundledPackages(sources);

/** Every copy of a package that is installed here: the top-level one first, then those nested in other packages. */
function installedCopies() {
  const copies = new Map();
  const register = (name, dir) => {
    if (!existsSync(join(dir, 'package.json'))) return;
    if (!copies.has(name)) copies.set(name, []);
    copies.get(name).push(dir);
    scan(join(dir, 'node_modules'));
  };
  function scan(modules) {
    if (!existsSync(modules)) return;
    for (const entry of readdirSync(modules).sort()) {
      if (entry.startsWith('.')) continue;
      const dir = join(modules, entry);
      if (entry.startsWith('@')) {
        for (const scoped of readdirSync(dir).sort()) register(`${entry}/${scoped}`, join(dir, scoped));
      } else {
        register(entry, dir);
      }
    }
  }
  scan(join(root, 'node_modules'));
  return copies;
}
const installed = installedCopies();
const table = JSON.parse(readFileSync(join(root, 'scripts', 'embedded-licences.json'), 'utf8')).packages;

const LICENCE_FILE = /^(licen[sc]e|copying)(\b|[-_.])/i;

function licenceTextOf(dir) {
  const names = readdirSync(dir).filter((name) => LICENCE_FILE.test(name) && statSync(join(dir, name)).isFile()).sort();
  return [...new Set(names.map((name) => readFileSync(join(dir, name), 'utf8').replaceAll('\r\n', '\n').trim()))].join('\n\n');
}

const licenceOf = (manifest) => {
  const declared = manifest.license ?? manifest.licenses;
  if (typeof declared === 'string') return declared;
  if (Array.isArray(declared)) return declared.map((item) => item.type ?? item).join(' AND ');
  return declared?.type;
};

/** The author's name from package.json, without the email and the URL. */
const authorOf = (manifest) => {
  const author = typeof manifest.author === 'string' ? manifest.author : manifest.author?.name;
  return author?.replace(/\s*[<(].*$/, '').trim() || undefined;
};

// The line for a licence text whose package's holder nothing here names: it stands for every package of its block.
const NO_HOLDER = 'the authors of each package named above';
const apacheTerms = readFileSync(join(root, 'scripts', 'licenses', 'Apache-2.0.txt'), 'utf8').trim();
const hintsOf = (name) => copyrightLines([...(sourceTexts.get(name) ?? [])]);

/** A package whose own licence file is at hand. */
function fromDirectory(name, dir, via) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const text = licenceTextOf(dir);
  const license = licenceOf(manifest) ?? licenceFromText(text);
  const label = `${name}@${manifest.version}`;
  if (licenceKind(license) !== 'permissive') {
    fail(`${label} is under ${license === undefined ? 'no licence this script can name' : `“${license}”`}, which is ${license === undefined ? 'unknown' : licenceKind(license)}: read its licence, and decide before it ships.`);
  }
  const entry = { name, license, version: via === undefined ? manifest.version : undefined, via };
  if (text !== '') return { ...entry, text, origin: 'file' };
  // No licence file in the package: the licence package.json names, in its standard text, with the author's line.
  const holder = authorOf(manifest) || hintsOf(name).join('\n') || NO_HOLDER;
  const standard = standardLicence(license, holder);
  if (standard === null) fail(`${label} ships no licence file, and there is no standard text of “${license}” to stand in for it: add its licence text to scripts/third-party-notices.mjs.`);
  return { ...entry, text: standard, origin: 'standard' };
}

const entries = [];
for (const { name, hosts } of bundled) {
  const direct = [...(directDirs.get(name) ?? [])].sort();
  const via = hosts.length === 0 ? undefined : hosts.join(' and ');
  if (direct.length > 0) {
    for (const dir of direct) entries.push(fromDirectory(name, dir));
  } else if (installed.has(name)) {
    // Embedded in a prebuilt bundle: the copy installed here, at its own version, is where the licence text comes from.
    const entry = fromDirectory(name, installed.get(name)[0], via ?? table[name]?.via ?? 'a prebuilt bundle');
    entries.push(entry);
  } else if (table[name]) {
    const { license, holder, via: tableVia } = table[name];
    if (licenceKind(license) !== 'permissive') fail(`${name} is listed in scripts/embedded-licences.json under “${license}”, which is ${licenceKind(license)}: decide before it ships.`);
    const text = standardLicence(license, holder ?? (hintsOf(name).join('\n') || NO_HOLDER));
    if (text === null) fail(`${name} is listed under “${license}”, and there is no standard text of that licence to stand in for its file: add it to scripts/third-party-notices.mjs.`);
    entries.push({ name, license, text, origin: 'standard', via: via ?? tableVia ?? 'a prebuilt bundle' });
  } else {
    fail(
      `${name} is bundled, but no copy of it is installed and scripts/embedded-licences.json does not know it: ` +
        'read its licence (its repository, or `npm view` on a machine with network access) and add it there, with the copyright line of its LICENSE file as `holder`; copyleft or unknown licences are excepted: those need a decision first.',
    );
  }
}

// Code under the Apache licence inside a package that is not: the licence asks that a copy of it travels with the code.
for (const { name } of bundled) {
  const copyright = apacheNotice([...(sourceTexts.get(name) ?? [])]);
  const own = entries.filter((entry) => entry.name === name);
  if (copyright === null || own.every((entry) => /Apache-2\.0/.test(entry.license))) continue;
  entries.push({
    name,
    note: 'the files that carry an Apache-2.0 header',
    via: own[0]?.via,
    license: 'Apache-2.0',
    text: `${copyright.length > 0 ? copyright.map(copyrightStatement).join('\n') : copyrightStatement(NO_HOLDER)}\n\n${apacheTerms}`,
    origin: 'standard',
  });
}

// Code under the zlib licence inside a package that is not (pako's own file is MIT, and its zlib-derived files carry zlib's header):
// the licence asks that its notice stays with that code.
for (const { name } of bundled) {
  const copyright = zlibNotice([...(sourceTexts.get(name) ?? [])]);
  const own = entries.filter((entry) => entry.name === name);
  if (copyright === null || own.every((entry) => /Zlib/.test(entry.license) && /provided 'as-is'/.test(entry.text))) continue;
  entries.push({
    name,
    note: 'the files that carry a zlib header',
    via: own[0]?.via,
    license: 'Zlib',
    text: standardLicence('Zlib', copyright.length > 0 ? copyright.join('\n') : NO_HOLDER),
    origin: 'standard',
  });
}

// Fonts and colour profiles: the long base64 strings of the bundles that decode to one.
const FONT_MAGIC = ['AAEAAA', 'T1RUTw', 'd09GR', 'd09GM'];
const fontkit = require('fontkit');
const faces = new Map();
const profiles = new Map();
for (const file of files.filter((name) => /\.(mjs|js)$/.test(name))) {
  const text = readFileSync(file, 'utf8');
  for (const [, , blob] of text.matchAll(/(["'`])([A-Za-z0-9+/]{2000,}={0,2})\1/g)) {
    const bytes = Buffer.from(blob, 'base64');
    if (bytes.toString('latin1', 36, 40) === 'acsp') {
      const tags = iccTags(bytes);
      profiles.set(`${tags.description}|${tags.copyright}`, tags);
    } else if (FONT_MAGIC.some((magic) => blob.startsWith(magic))) {
      let font;
      try {
        font = fontkit.create(bytes);
      } catch (error) {
        fail(`${file} embeds a font that fontkit cannot read (${error.message}): add its notice by hand to scripts/third-party-notices.mjs.`);
      }
      const key = [font.fullName, font.version, font.copyright].join('|');
      faces.set(key, font);
    }
  }
}

const fontFamilies = new Map();
for (const font of faces.values()) {
  const licence = font.getName('license') ?? '';
  if (!/SIL Open Font License,? Version 1\.1/i.test(licence)) {
    fail(`the font ${font.fullName} is under “${licence || 'a licence its name table does not give'}”: only the SIL Open Font License 1.1 is known here. Add its text to scripts/third-party-notices.mjs.`);
  }
  // The faces of one family share their copyright and licence; the family's name is the shortest of theirs ("Roboto" for "Roboto Medium").
  const key = `${font.copyright}|${licence}|${font.version}`;
  const group = fontFamilies.get(key) ?? { family: font.familyName, faces: [], version: font.version.replace(/^Version\s+/i, ''), copyright: font.copyright, trademark: font.getName('trademark') ?? undefined, licence, licenceText: OFL_1_1 };
  if (font.familyName.length < group.family.length) group.family = font.familyName;
  group.faces.push(font.fullName);
  fontFamilies.set(key, group);
}
const fontNotices = [...fontFamilies.values()]
  .map((group) => ({ ...group, faces: group.faces.sort() }))
  .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0));

const sections = [
  `## Packages bundled in the published files

The published files (\`src/logic-functions/*.mjs\`, \`src/front-components/*.mjs\`) are bundles: they hold the code of the npm packages listed here, which the source maps next to them name. A package listed with a version is bundled from the copy installed in this repository, and the text below is its own licence file. A package listed without one is embedded in a prebuilt bundle that brings its own copy (pdfmake’s browser build, the Twenty SDK’s distribution), whose version its map does not record: its text is the licence file of the copy installed here when there is one, and otherwise the standard text of the licence the package is published under, with the copyright line of the package’s own LICENSE file.

${renderPackageNotices(entries)}`,
];
if (fontNotices.length > 0) {
  sections.push(`## Fonts

The bundles embed these faces as base64 (pdfmake’s \`vfs_fonts.js\` brings them), and the PDF layouts are set in them. The copyright, trademark and licence sentence are the ones in each font’s own name table.

${renderFontNotices(fontNotices)}`);
}
if (profiles.size > 0) {
  const lines = [...profiles.values()].map(
    (tags) => `- The colour profile “${tags.description ?? 'unnamed'}”, embedded by pdfkit in the PDFs it writes. Its own copyright tag reads: ${tags.copyright ?? 'none'}`,
  );
  sections.push(`## Other embedded data\n\n${lines.join('\n')}`);
}

const before = readFileSync(NOTICES_FILE, 'utf8');
let after;
try {
  after = spliceSection(before, sections.join('\n\n'));
} catch (error) {
  fail(error.message);
}
if (after !== before) writeFileSync(NOTICES_FILE, after);
const blocks = [...after.matchAll(/^### /gm)].length;
console.log(
  `THIRD_PARTY_NOTICES.md ${after === before ? 'is up to date' : 'written'}: ${bundled.length} packages in ${blocks - fontNotices.length} licence blocks, ` +
    `${fontNotices.length} font ${fontNotices.length === 1 ? 'family' : 'families'}, ${profiles.size} colour profile(s).`,
);
