/**
 * What THIRD_PARTY_NOTICES.md says about the code and the fonts the published bundles hold,
 * for scripts/third-party-notices.mjs (which writes it) and scripts/release-check.mjs (which
 * checks it). Everything here takes text and returns text: it reads no file, so the tests can
 * feed it what a build's source maps look like.
 */

/** The generated part of THIRD_PARTY_NOTICES.md lies between these two lines; what is outside them is ours. */
export const NOTICES_BEGIN =
  '<!-- notices:begin: generated from the build’s source maps by scripts/third-party-notices.mjs (run `npm run build` then `npm run notices`); do not edit by hand -->';
export const NOTICES_END = '<!-- notices:end -->';

/**
 * A package a build bundles. `direct`: one of our own bundles holds it (or it is the package a
 * prebuilt bundle is a build of), so the copy installed here is the one bundled and has its version.
 * `hosts`: the prebuilt bundles (`webpack://<host>/…`) that hold their own copy of it.
 */
export type Bundled = { name: string; hosts: string[]; direct: boolean };

/** The `sources` of a source map; none for a text that is not one. */
export function sourcesOfMap(text: string): string[] {
  try {
    const map: unknown = JSON.parse(text);
    if (typeof map !== 'object' || map === null || !('sources' in map) || !Array.isArray(map.sources)) return [];
    return map.sources.filter((source): source is string => typeof source === 'string');
  } catch {
    return [];
  }
}

const decoded = (source: string): string => {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
};

/** The package a folder path ends in: the part after its last `node_modules/`, one segment, two for a scoped name. */
function packageOfPath(path: string): string | null {
  const at = path.lastIndexOf('node_modules/');
  // `my_node_modules/` is a folder of ours that only ends alike.
  if (at === -1 || (at > 0 && path[at - 1] !== '/')) return null;
  const [first, second] = path.slice(at + 'node_modules/'.length).split('/');
  if (!first) return null;
  return first.startsWith('@') ? (second ? `${first}/${second}` : null) : first;
}

/**
 * The packages named by the `sources` of a build's source maps, sorted, one record each. A
 * source is a `node_modules` path (the package it ends in is bundled), or, when a prebuilt
 * bundle brought its own map, `webpack://<package>/…`: the package whose build it is, and the
 * host of every package that map names. A module webpack ignored (`ignored|…`) holds no code.
 */
export function bundledPackages(sources: readonly string[]): Bundled[] {
  const found = new Map<string, { hosts: Set<string>; direct: boolean }>();
  const record = (name: string) => {
    const entry = found.get(name) ?? { hosts: new Set<string>(), direct: false };
    found.set(name, entry);
    return entry;
  };
  for (const source of sources) {
    const path = decoded(source);
    if (/\/ignored\|/.test(path)) continue;
    const webpack = path.match(/^webpack:\/\/([^/]+)\/(.*)$/);
    const name = packageOfPath(webpack ? webpack[2]! : path);
    if (name !== null) {
      if (webpack) record(name).hosts.add(webpack[1]!);
      else record(name).direct = true;
    } else if (webpack && webpack[1] !== 'webpack') {
      // The prebuilt bundle's own sources (`webpack://pdfmake/src/…`): the package is the one it is a build of.
      record(webpack[1]!).direct = true;
    }
  }
  return [...found]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, { hosts, direct }]) => ({ name, hosts: [...hosts].sort(), direct }));
}

/** Whether a notice names the package: as `` `name` `` or `` `name@version` ``, the way the generated section lists them. */
const named = (notices: string, name: string): boolean => notices.includes(`\`${name}\``) || notices.includes(`\`${name}@`);

/** The packages, of those given, that the notices do not name. */
export function missingFromNotices(notices: string, names: readonly string[]): string[] {
  return names.filter((name) => !named(notices, name));
}

/** What release:check says when the notices lack a package the build bundles; null when none does. */
export function noticesProblem(names: readonly string[], notices: string): string | null {
  const missing = missingFromNotices(notices, names);
  if (missing.length === 0) return null;
  return (
    `THIRD_PARTY_NOTICES.md does not name ${missing.length} package(s) the build bundles (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}): ` +
    'run `npm run build` then `npm run notices`, and commit the file.'
  );
}

export type LicenceKind = 'permissive' | 'copyleft' | 'unknown';

const PERMISSIVE = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'Zlib', 'CC0-1.0', 'Unlicense']);
const COPYLEFT = /(^|[^A-Za-z])(A?GPL|LGPL|MPL|EPL|CDDL|SSPL|EUPL|OSL|CPAL|CC-BY-SA|CC-BY-NC)(?![A-Za-z])/i;

/** Whether an SPDX expression asks nothing of a bundle beyond keeping the notice: every licence it names must be one we know to be so. */
export function licenceKind(spdx: string | undefined): LicenceKind {
  const ids = (spdx ?? '').split(/\s+(?:AND|OR|WITH)\s+|[()]/i).map((id) => id.trim().replace(/\+$/, '')).filter(Boolean);
  if (ids.length === 0) return 'unknown';
  if (ids.some((id) => COPYLEFT.test(id))) return 'copyleft';
  return ids.every((id) => PERMISSIVE.has(id)) ? 'permissive' : 'unknown';
}

/** The licence a licence file's text is, for a package whose package.json names none; null when the text is not one we know. */
export function licenceFromText(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ').toLowerCase();
  if (flat.includes('permission is hereby granted, free of charge, to any person obtaining a copy')) return 'MIT';
  if (flat.includes('permission to use, copy, modify, and/or distribute this software for any purpose with or without fee')) return 'ISC';
  if (flat.includes('redistribution and use in source and binary forms')) return flat.includes('neither the name of') ? 'BSD-3-Clause' : 'BSD-2-Clause';
  if (flat.includes('apache license') && flat.includes('version 2.0')) return 'Apache-2.0';
  return null;
}

const MIT = (copyright: string) => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const ISC = (copyright: string) => `ISC License

${copyright}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

const BSD_3 = (copyright: string) => `BSD 3-Clause License

${copyright}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

/** The zlib licence, as zlib and its ports (pako) carry it in their file headers; SPDX's `Zlib` has the same words. */
const ZLIB_TERMS = `This software is provided 'as-is', without any express or implied
warranty.  In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.`;

const ZLIB = (copyright: string) => `zlib License\n\n${copyright}\n\n${ZLIB_TERMS}`;

const STANDARD: Readonly<Record<string, (copyright: string) => string>> = { MIT, ISC, 'BSD-3-Clause': BSD_3, Zlib: ZLIB };

/** A copyright line as a licence carries it: what already is one is kept, a name gets `Copyright (c)` in front. */
export function copyrightStatement(holder: string): string {
  return /^(Copyright\b|\([cC]\)|©)/.test(holder) ? holder : `Copyright (c) ${holder}`;
}

/**
 * The standard text of a licence, with the copyright line (or the holder's name) of the package it
 * stands in for: for a package that ships no licence file. Null for a licence we hold no standard text of.
 */
export function standardLicence(spdx: string, holder: string): string | null {
  const text = Object.hasOwn(STANDARD, spdx) ? STANDARD[spdx] : undefined;
  return text === undefined ? null : text(copyrightStatement(holder));
}

const COPYRIGHT_LINE = /^[ \t]*(?:\/\/|\/\*+!?|\*|#)?[ \t]*((?:Copyright\s|\(c\)\s|©\s?).*?)[ \t]*(?:\*\/)?[ \t]*$/gm;

/** The copyright lines of other people's source, up to `limit` distinct ones, as the code writes them without its comment marks. */
export function copyrightLines(texts: readonly string[], limit = 3): string[] {
  const lines = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(COPYRIGHT_LINE)) {
      lines.add(match[1]!.slice(0, 140));
      if (lines.size >= limit) return [...lines];
    }
  }
  return [...lines];
}

/**
 * The copyright lines above an Apache-2.0 header in other people's source, or null when none of
 * the texts carries one. A package that is MIT as a whole can hold files under the Apache licence
 * (brotli's decoder is Google's), and that licence asks that a copy of it travels with them.
 */
export function apacheNotice(texts: readonly string[]): string[] | null {
  for (const text of texts) {
    const at = text.search(/Licensed under the Apache License, Version 2\.0/);
    if (at === -1) continue;
    return copyrightLines([text.slice(Math.max(0, at - 400), at)], 2);
  }
  return null;
}

/**
 * The copyright lines above a zlib header in other people's source, or null when none of the texts
 * carries one. pako is MIT by its own file, but it is a port of zlib: its zlib-derived files carry
 * the zlib licence in their headers, and that licence asks that the notice stay with them.
 */
export function zlibNotice(texts: readonly string[]): string[] | null {
  for (const text of texts) {
    const at = text.search(/This software is provided 'as-is', without any express or implied/);
    if (at === -1) continue;
    const above = text.slice(Math.max(0, at - 400), at);
    const lines = [...above.matchAll(/^[ \t]*(?:\/\/|\/\*+!?|\*|#)?[ \t]*((?:Copyright\s|\([cC]\)\s|©\s?).*?)[ \t]*$/gm)].map((match) => match[1]!.slice(0, 140));
    return [...new Set(lines)].slice(0, 3);
  }
  return null;
}

/** The description and the copyright an ICC colour profile names, from its tag table. */
export function iccTags(profile: Uint8Array): { description?: string; copyright?: string } {
  const bytes = Buffer.from(profile.buffer, profile.byteOffset, profile.byteLength);
  const found: { description?: string; copyright?: string } = {};
  if (bytes.length < 132) return found;
  const count = bytes.readUInt32BE(128);
  for (let index = 0; index < count && 132 + index * 12 + 12 <= bytes.length; index += 1) {
    const signature = bytes.toString('latin1', 132 + index * 12, 136 + index * 12);
    const offset = bytes.readUInt32BE(136 + index * 12);
    const size = bytes.readUInt32BE(140 + index * 12);
    if ((signature !== 'desc' && signature !== 'cprt') || offset + size > bytes.length) continue;
    const body = bytes.subarray(offset, offset + size);
    const type = body.toString('latin1', 0, 4);
    let value: string | undefined;
    if (type === 'text') value = body.toString('latin1', 8);
    else if (type === 'desc' && body.length >= 12) value = body.toString('latin1', 12, 12 + body.readUInt32BE(8));
    value = value?.replace(/\0+$/, '').trim();
    if (value) found[signature === 'desc' ? 'description' : 'copyright'] = value;
  }
  return found;
}

/** One package for the generated section: where its licence text came from says how the section words it. */
export type NoticeEntry = {
  name: string;
  /** Only for a package one of our own bundles holds: a prebuilt bundle's version of it is not in the map. */
  version?: string;
  /** The prebuilt bundle that holds the package, when it is not one of ours. */
  via?: string;
  /** What else to say of it, in parentheses after its name. */
  note?: string;
  license: string;
  text: string;
  /** `file`: the package's own licence file. `standard`: the licence's standard text, for a package with no file at hand. */
  origin: 'file' | 'standard';
};

const flatten = (text: string): string => text.replaceAll('\r\n', '\n').trim();

const plainLabel = ({ name, version }: NoticeEntry): string => `\`${version === undefined ? name : `${name}@${version}`}\``;
const labelOf = (entry: NoticeEntry): string => `${plainLabel(entry)}${entry.note === undefined ? '' : ` (${entry.note})`}`;
const byName = (a: NoticeEntry, b: NoticeEntry): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** "Applies to" the packages bundled from a copy installed here, then those a prebuilt bundle embeds, each bundle named once. */
function appliesTo(entries: readonly NoticeEntry[]): string {
  const own = entries.filter((entry) => entry.via === undefined);
  const hosts = [...new Set(entries.flatMap((entry) => (entry.via === undefined ? [] : [entry.via])))].sort();
  const sentences = [
    ...(own.length > 0 ? [`Applies to: ${own.map(labelOf).join(', ')}.`] : []),
    ...hosts.map((host) => `Embedded in ${host}’s prebuilt bundle: ${entries.filter((entry) => entry.via === host).map(labelOf).join(', ')}.`),
  ];
  return sentences.join(' ');
}

/** The packages' licences as blocks, one per distinct text, each naming the packages it applies to. */
export function renderPackageNotices(entries: readonly NoticeEntry[]): string {
  const groups = new Map<string, { license: string; text: string; entries: NoticeEntry[] }>();
  for (const entry of entries) {
    const text = flatten(entry.text);
    const key = `${entry.license}\n${text}`;
    const group = groups.get(key) ?? { license: entry.license, text, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  const blocks = [...groups.values()].map((group) => {
    // The first `Copyright …` line; a text that has none (zlib's header says `(C) 1995-2013 …`) its first `(C) <year>` line.
    const copyright = (group.text.match(/^[ \t]*(Copyright\b.*?)[ \t]*$/m) ?? group.text.match(/^[ \t]*(\([cC]\)\s\d.*?)[ \t]*$/m))?.[1];
    const title = `${group.license}${copyright ? ` - ${copyright.slice(0, 100)}` : ''}`;
    const listed = group.entries.sort(byName);
    const standard = listed.filter((entry) => entry.origin === 'standard');
    const standIn = standard.length === listed.length ? 'their licence files' : `the licence file of ${standard.map(plainLabel).join(', ')}`;
    return {
      title,
      text: [
        `### ${title}`,
        appliesTo(listed),
        ...(standard.length > 0 ? [`Standard ${group.license} text, in place of ${standIn} (none is available here).`] : []),
        `\`\`\`text\n${group.text}\n\`\`\``,
      ].join('\n\n'),
    };
  });
  const order = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  return blocks.sort((a, b) => order(a.title, b.title)).map((block) => block.text).join('\n\n');
}

/** What the script found out about an embedded font: its own words, read from the font. */
export type FontNotice = {
  family: string;
  faces: string[];
  version: string;
  copyright: string;
  trademark?: string;
  /** The licence sentence in the font's name table. */
  licence: string;
  /** The text that goes with it: the licence the sentence names. */
  licenceText: string;
};

/** The generated section's fonts: every face, its copyright and the licence it is under, whole. */
export function renderFontNotices(fonts: readonly FontNotice[]): string {
  return fonts
    .map((font) =>
      [
        `### ${font.family}`,
        `Faces: ${font.faces.join(', ')}. Version ${font.version}.`,
        font.copyright,
        ...(font.trademark ? [font.trademark] : []),
        font.licence,
        `\`\`\`text\n${flatten(font.licenceText)}\n\`\`\``,
      ].join('\n\n'),
    )
    .join('\n\n');
}

/**
 * THIRD_PARTY_NOTICES.md with its generated section replaced by `section`, or added at the end
 * when it has none yet. Everything outside the two marker lines is kept as it is.
 */
export function spliceSection(file: string, section: string): string {
  const count = (marker: string) => file.split(marker).length - 1;
  if (count(NOTICES_BEGIN) > 1 || count(NOTICES_END) > 1) throw new Error('THIRD_PARTY_NOTICES.md holds a notices marker more than once.');
  const begin = file.indexOf(NOTICES_BEGIN);
  const end = file.indexOf(NOTICES_END);
  if ((begin === -1) !== (end === -1)) throw new Error('THIRD_PARTY_NOTICES.md holds only one of the two markers of the generated section: restore the other, or remove this one.');
  if (begin !== -1 && end < begin) throw new Error('In THIRD_PARTY_NOTICES.md the end marker comes before the begin marker.');
  const body = `${NOTICES_BEGIN}\n\n${section.trimEnd()}\n\n${NOTICES_END}`;
  if (begin === -1) return `${file.trimEnd()}\n\n${body}\n`;
  return `${file.slice(0, begin)}${body}${file.slice(end + NOTICES_END.length)}`;
}

/** SIL Open Font License 1.1, as its authors publish it (https://openfontlicense.org). */
export const OFL_1_1 = `-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.`;
