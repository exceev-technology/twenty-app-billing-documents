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

/** What must never be published: state, tests, secrets, archives. */
const FORBIDDEN_FILES: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /^(\.twenty|test|node_modules)\//, why: 'build state, tests and dependencies are not part of the package' },
  { pattern: /(^|\/)\.[^/]/, why: 'a dotfile (an environment file, a git or editor folder) has no place in the package' },
  { pattern: /\.test\.(ts|tsx|mjs|js)$/, why: 'a test file' },
  { pattern: /\.(tgz|zip|pem|key)$/, why: 'an archive or a key' },
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
 * Files that name a folder of the machine that built the package. Source maps and the
 * bundles' own comments hold paths, and with `node_modules` linked from elsewhere they
 * hold the real one, climbed to from the filesystem's root (`../../Users/name/...`), so
 * the roots are looked for with their leading slash and not only at the start of a path.
 * One problem at most, naming the first three files: a linked `node_modules` taints all of them.
 */
export function localPathProblems(
  files: readonly { path: string; text: string }[],
  roots: readonly string[],
): string[] {
  // A root of a few characters (`/root` as a home) would match ordinary text.
  const markers = [...new Set(roots.map((root) => root.replaceAll('\\', '/').replace(/\/+$/, '')))].filter((root) => root.length >= 6);
  const named = files.flatMap(({ path, text }) => {
    const marker = markers.find((candidate) => text.includes(candidate));
    return marker === undefined ? [] : [{ path, marker }];
  });
  if (named.length === 0) return [];
  const examples = named.slice(0, 3).map(({ path }) => path).join(', ');
  return [
    `${named.length} file(s) name ${named[0].marker}, a folder of the machine that built the package (${examples}${named.length > 3 ? ', …' : ''}): ` +
      'build from a checkout whose node_modules is installed in it, not linked from elsewhere.',
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

/**
 * A version's section of CHANGELOG.md: what follows its `## 0.1.0` heading (a date or a
 * link may follow the version on that line) up to the next `## ` heading, trimmed. Null
 * when there is no such heading or nothing under it.
 */
export function changelogSection(changelog: string, version: string): string | null {
  const heading = new RegExp(`^##\\s+\\[?${version.replaceAll('.', '\\.')}\\]?(\\s|$)`);
  const lines = changelog.replaceAll('\r\n', '\n').split('\n');
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? null : body;
}
