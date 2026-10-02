/**
 * What a release is checked against, for scripts/release-check.mjs and the release
 * workflow. Everything here takes text and lists and returns problems: it reads no file
 * and runs no program, so the tests can feed it what a bad package looks like.
 */

/** Spec §4: the listing's gallery holds four images. */
export const RELEASE_GALLERY_MIN = 4;

/** What the published folder must hold, as `npm pack --dry-run` lists it. */
const REQUIRED_FILES: readonly { path: string; why: string }[] = [
  { path: 'manifest.json', why: 'the marketplace and the server read it' },
  { path: 'package.json', why: 'the server reads engines.twenty from it' },
  { path: 'README.md', why: 'it is the listing’s text' },
  { path: 'LICENSE', why: 'the MIT licence asks that it travels with every copy; the prepack script copies it (scripts/package-notices.mjs)' },
  { path: 'THIRD_PARTY_NOTICES.md', why: 'it carries the pdfcn attribution; the prepack script copies it (scripts/package-notices.mjs)' },
  { path: 'src/logic-functions/seed-presets.mjs', why: 'the post-install function seeds the presets' },
];

/**
 * What must never be published: state, tests, secrets, archives. Folders are refused at any
 * depth (a `src/test/` is as much a test folder as `test/`), names without regard to case,
 * and a test file whatever follows `.test.` (a source map of one is a test file too).
 */
const FORBIDDEN_FILES: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /(^|\/)(\.twenty|test|__tests__|node_modules)\//, why: 'build state, tests and dependencies are not part of the package' },
  { pattern: /(^|\/)\.[^/]/, why: 'a dotfile (an environment file, a git or editor folder) has no place in the package' },
  { pattern: /(^|\/)[^/]+\.(test|spec)\.[^/]+$/, why: 'a test file' },
  { pattern: /\.(tar|gz|tgz|zip|7z|rar|pem|key|p12|pfx|jks)$/i, why: 'an archive or a key' },
  { pattern: /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/i, why: 'an SSH key' },
];

export type PackageExpectations = { logo: string; gallery: readonly string[] };

/** What is wrong with the list of files `npm pack --dry-run` names, one sentence each. */
export function packageProblems(files: readonly string[], expected: PackageExpectations): string[] {
  const present = new Set(files);
  const problems: string[] = [];
  const required = [
    ...REQUIRED_FILES,
    { path: expected.logo, why: 'the listing’s logo (npm run listing:images draws it)' },
    ...expected.gallery.map((path) => ({ path, why: 'a gallery image of the listing' })),
  ];
  for (const { path, why } of required) {
    if (!present.has(path)) problems.push(`The package does not hold ${path}: ${why}.`);
  }
  for (const file of files) {
    const hit = FORBIDDEN_FILES.find(({ pattern }) => pattern.test(file));
    if (hit) problems.push(`The package holds ${file}: ${hit.why}.`);
  }
  return problems;
}

/**
 * A URL of another tool, such as `webpack://pdfmake/ignored|/home/runner/work/pdfmake/…`: not a
 * path of this machine, whatever folder it names. `file://` is a path of this machine.
 */
const isForeignUrl = (text: string): boolean => /^[a-z][a-z0-9+.-]+:\/\//i.test(text) && !/^file:\/\//i.test(text);

/** Where a token of a bundle ends, so that the URL it sits in can be told: spaces, quotes, brackets, commas. */
const TOKEN_BREAK = /[\s"'`<>()[\]{},;]/;

const EXCERPT_CONTEXT = 48;
const EXCERPT_MAX = 160;

/** `text` around [start, end), on one line and cut to a screen's width, with … where it was cut. */
function excerptAround(text: string, start: number, end: number): string {
  const from = Math.max(0, start - EXCERPT_CONTEXT);
  const to = Math.min(text.length, end + EXCERPT_CONTEXT);
  const cut = text.slice(from, to).replace(/\s+/g, ' ');
  const shown = cut.length > EXCERPT_MAX ? `${cut.slice(0, EXCERPT_MAX)}…` : cut;
  return `${from > 0 ? '…' : ''}${shown}${to < text.length && shown === cut ? '…' : ''}`;
}

/** The names a source map gives its sources, or null when the text is not a source map. */
function mapSources(text: string): string[] | null {
  try {
    const map: unknown = JSON.parse(text);
    if (typeof map !== 'object' || map === null || !('sources' in map) || !Array.isArray(map.sources)) return null;
    const { file, sourceRoot } = map as { file?: unknown; sourceRoot?: unknown };
    return [file, sourceRoot, ...map.sources].filter((entry): entry is string => typeof entry === 'string' && entry !== '');
  } catch {
    return null;
  }
}

/** The first thing in a file that names one of the folders, as the text to show; null when nothing does. */
function firstLeak(path: string, text: string, markers: readonly string[]): { marker: string; excerpt: string } | null {
  // A source map is looked at where it names paths: its sources. Its sourcesContent is the text
  // of other people's code and not a path of ours.
  const entries = path.endsWith('.map') ? mapSources(text) : null;
  if (entries !== null) {
    for (const marker of markers) {
      const entry = entries.find((candidate) => !isForeignUrl(candidate) && candidate.includes(marker));
      if (entry !== undefined) return { marker, excerpt: excerptAround(entry, entry.indexOf(marker), entry.indexOf(marker) + marker.length) };
    }
    return null;
  }
  for (const marker of markers) {
    for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) {
      let start = at;
      while (start > 0 && !TOKEN_BREAK.test(text[start - 1]!)) start -= 1;
      if (isForeignUrl(text.slice(start, at))) continue;
      return { marker, excerpt: excerptAround(text, at, at + marker.length) };
    }
  }
  return null;
}

/**
 * Files that name a folder of the machine that built the package. Source maps and the
 * bundles' own comments hold paths, and with `node_modules` linked from elsewhere they
 * hold the real one, climbed to from the filesystem's root (`../../Users/name/...`), so
 * the roots are looked for with their leading slash and not only at the start of a path.
 *
 * A path that belongs to someone else's build does not count. pdfmake's prebuilt bundle comes
 * with a source map made on a GitHub runner (`webpack://pdfmake/ignored|/home/runner/work/…`),
 * which esbuild copies into ours, so on a runner the home folder would be "found" in every
 * package. What decides is the form: a URL with a scheme other than `file` (in a map, a source
 * entry that is one; in a bundle, the token the folder sits in) is another tool's name for
 * one of its own files, while a path of this machine, climbed to or absolute or `file://`, is a leak.
 *
 * One problem at most, naming the first three files and quoting what matched in the first:
 * a linked `node_modules` taints all of them.
 */
export function localPathProblems(
  files: readonly { path: string; text: string }[],
  roots: readonly string[],
): string[] {
  // A root of a few characters (`/root` as a home) would match ordinary text.
  const markers = [...new Set(roots.map((root) => root.replaceAll('\\', '/').replace(/\/+$/, '')))].filter((root) => root.length >= 6);
  const named = files.flatMap(({ path, text }) => {
    const leak = firstLeak(path, text, markers);
    return leak === null ? [] : [{ path, ...leak }];
  });
  if (named.length === 0) return [];
  const [first] = named;
  const examples = named.slice(0, 3).map(({ path }) => path).join(', ');
  return [
    `${named.length} file(s) name ${first!.marker}, a folder of the machine that built the package (${examples}${named.length > 3 ? ', …' : ''}). ` +
      `The first, ${first!.path}, holds “${first!.excerpt}”. ` +
      'If that goes through node_modules, it is linked from elsewhere: run `npm ci` in the checkout and build again. ' +
      'Otherwise the path is in our own source or configuration: remove it.',
  ];
}

/** The tag of version 0.1.0 is v0.1.0: an npm pre-release would need a --tag the workflow does not pass. */
export function tagProblem(tag: string, version: string): string | null {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    return `The tag “${tag}” is not of the form vX.Y.Z (for example v0.1.0).`;
  }
  if (tag.slice(1) !== version) {
    return `The tag ${tag} releases ${tag.slice(1)}, but package.json says ${version}: bump the version in a pull request, merge it, and tag the merge commit.`;
  }
  return null;
}

/** A release needs the listing's whole gallery (spec §4). */
export function galleryProblem(gallery: readonly string[]): string | null {
  if (gallery.length >= RELEASE_GALLERY_MIN) return null;
  return `The listing’s gallery holds ${gallery.length} of ${RELEASE_GALLERY_MIN} images: take the Twenty screenshots (docs/releasing.md, “Before the first release”) and list them in src/application-config.ts.`;
}

/** The identifiers of the registry that the lock does not hold yet: a release makes them permanent. */
export function unlockedIdentifiers(
  lock: Readonly<Record<string, string>>,
  registry: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(registry).filter((key) => !(key in lock)).sort();
}

/** The `## 0.1.0` heading of a version: a date or a link may follow the version on that line. */
function headingOf(version: string): RegExp {
  // The version is text, not a pattern: a stray `(` must find no section, not throw.
  return new RegExp(`^##\\s+\\[?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?(\\s|$)`);
}

/** A version's heading line and what is under it, up to the next `## ` heading, trimmed; null without such a heading. */
function findSection(changelog: string, version: string): { heading: string; body: string } | null {
  const lines = changelog.replaceAll('\r\n', '\n').split('\n');
  const heading = headingOf(version);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return { heading: lines[start], body: (end === -1 ? rest : rest.slice(0, end)).join('\n').trim() };
}

/**
 * A version's section of CHANGELOG.md: what follows its `## 0.1.0` heading (a date or a
 * link may follow the version on that line) up to the next `## ` heading, trimmed. Null
 * when there is no such heading or nothing under it.
 */
export function changelogSection(changelog: string, version: string): string | null {
  const section = findSection(changelog, version);
  return section === null || section.body === '' ? null : section.body;
}

/**
 * What is wrong with CHANGELOG.md for releasing `version`, or null. A release needs its
 * section, and a section whose heading still says "unreleased" has not been dated by the
 * release's pull request (`## 0.1.0 - unreleased` becomes `## 0.1.0 - 2026-10-02`).
 */
export function changelogProblem(changelog: string, version: string): string | null {
  const section = findSection(changelog, version);
  if (section === null || section.body === '') {
    return `CHANGELOG.md has no section for ${version}: add \`## ${version} - <date>\` and what a user can do.`;
  }
  if (/\bunreleased\b/i.test(section.heading)) {
    return `The CHANGELOG.md heading of ${version} still says “unreleased” (${section.heading}): the pull request that releases it dates it, as \`## ${version} - <date>\`.`;
  }
  return null;
}

export const RELEASE_CHECK_USAGE = 'Usage: node scripts/release-check.mjs [--package-only] [--tag vX.Y.Z | --tag=vX.Y.Z]';

export type ReleaseArgs = { packageOnly: boolean; tag: string | undefined } | { problem: string };

/**
 * The command line of scripts/release-check.mjs. It accepts `--package-only` and `--tag` in
 * both of its forms, and refuses everything else: an argument that is ignored would let a
 * release check skip the checks it was asked for and still say it is ready.
 */
export function parseReleaseArgs(argv: readonly string[]): ReleaseArgs {
  let packageOnly = false;
  let tag: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--package-only') {
      packageOnly = true;
    } else if (arg === '--tag' || arg.startsWith('--tag=')) {
      if (tag !== undefined) return { problem: '--tag is given twice: a release has one tag.' };
      let value: string | undefined;
      if (arg === '--tag') {
        index += 1;
        value = argv[index];
      } else {
        value = arg.slice('--tag='.length);
      }
      if (value === undefined || value === '' || (arg === '--tag' && value.startsWith('-'))) {
        return { problem: '--tag needs the tag: `--tag v0.1.0`.' };
      }
      tag = value;
    } else if (arg.startsWith('-')) {
      return { problem: `Unknown option ${arg}.` };
    } else {
      return { problem: `Stray argument “${arg}”: a tag goes after --tag, as in \`--tag ${arg}\`.` };
    }
  }
  return { packageOnly, tag };
}

/**
 * Whether npm kept a `--tag` that was meant for the script. `npm run release:check --tag v0.1.0`,
 * without the `--` before it, reads --tag as its own dist-tag option: the script is started with no
 * argument, and with the tag in `npm_config_tag`. A check run that way would skip the tag, the
 * changelog date, the gallery and the lock, so it is refused. (A `tag` set in an .npmrc or the
 * environment is seen the same way; the message says what to do for both.)
 */
export function npmTookTag(env: Readonly<Record<string, string | undefined>>, tag: string | undefined): string | null {
  if (tag !== undefined || !env.npm_config_tag) return null;
  return 'npm took --tag for itself: run `npm run release:check -- --tag vX.Y.Z`, with the -- before --tag (if the tag comes from an .npmrc or the environment, unset it for this run).';
}

/**
 * The last line of a passing check. Only the check of everything, with a tag, says it is ready to
 * release: every other run lists what it did not look at, so that "ready" is never read as more
 * than was checked.
 */
export function releaseConclusion(mode: { packageOnly: boolean; tag: string | undefined }, pkg: { name: string; version: string }): string {
  if (mode.tag !== undefined && !mode.packageOnly) return `Ready to release ${pkg.name}@${pkg.version} as ${mode.tag}.`;
  if (mode.tag !== undefined) {
    return (
      `The package and the tag ${mode.tag} are ready. Not checked: the tests, the typecheck and that no locked identifier changed: ` +
      `run \`npm run release:check -- --tag ${mode.tag}\`, without --package-only, before tagging.`
    );
  }
  if (mode.packageOnly) {
    return (
      'Only the package was checked, and it is ready. Not checked: the tests, the typecheck, the identifier lock, the tag, the changelog date and the gallery: ' +
      'run `npm run release:check -- --tag vX.Y.Z` before tagging.'
    );
  }
  return 'The package is ready. Not checked: the tag, the changelog date, the gallery and the identifier lock: run `npm run release:check -- --tag vX.Y.Z` before tagging.';
}
