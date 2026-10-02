// Everything a release needs, in one command, with no server and no network.
//
//   npm run release:check                      tests, typecheck, identifier lock, build, the package's contents
//   npm run release:check -- --tag v0.1.0      and: the tag matches package.json, CHANGELOG.md has the
//                                              version under a dated heading, the listing's gallery is
//                                              complete, every identifier is in the lock
//   npm run release:check -- --package-only    only the build and the package (CI has run the tests)
//
// `--tag=v0.1.0` works as `--tag v0.1.0`. Any other argument is refused with the usage, before
// anything runs: an argument that was ignored would skip checks and still say "ready".
//
// The build is `twenty dev:build`, which needs no remote; the package is what
// `npm pack --dry-run` lists in .twenty/output, the folder `twenty app:publish` publishes.
// The release workflow runs it with --tag before anything is published, and the maintainer
// runs it with --tag before creating the tag (docs/releasing.md). Every CLI call goes through
// ./node_modules/.bin/twenty, never `npx twenty`: npm has an unrelated package with that name.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../src/application-config.ts';
import { IDS } from '../src/ids.ts';
import { lockViolations } from '../src/lib/id-lock.ts';
import {
  RELEASE_CHECK_USAGE, changelogProblem, galleryProblem, localPathProblems, packageProblems, parseReleaseArgs, tagProblem,
  unlockedIdentifiers,
} from '../src/lib/release.ts';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const output = join(root, '.twenty', 'output');
const TWENTY = './node_modules/.bin/twenty';

const step = (title) => console.log(`\n=== ${title} ===`);
const fail = (message) => {
  console.error(`\nRelease check stopped: ${message}`);
  process.exit(1);
};
const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
  const shown = `\`${[command, ...commandArgs].join(' ')}\``;
  if (result.error) fail(`${shown} could not run: ${result.error.message}.`);
  if (result.status !== 0) fail(`${shown} ${result.signal ? `was stopped by ${result.signal}` : `exited with ${result.status}`}.`);
};
const read = (name) => readFileSync(join(root, name), 'utf8');

const parsed = parseReleaseArgs(process.argv.slice(2));
if ('problem' in parsed) fail(`${parsed.problem}\n${RELEASE_CHECK_USAGE}`);
const { packageOnly, tag } = parsed;

// Before the long steps: without the installed CLI the build cannot run.
if (!existsSync(join(root, TWENTY))) fail(`${TWENTY} is not there: run \`npm ci\` in the checkout first.`);

const pkg = JSON.parse(read('package.json'));
const problems = [];

if (!packageOnly) {
  step('Tests');
  run('npm', ['test']);
  step('Typecheck');
  run('npm', ['run', 'typecheck']);
}

// The lock is read by the full run (nothing it holds may change) and by --tag (nothing may be missing from it).
const lock = !packageOnly || tag !== undefined ? JSON.parse(read('ids.lock.json')) : {};
if (!packageOnly) {
  step('Identifier lock');
  problems.push(...lockViolations(lock, IDS));
}

if (tag !== undefined) {
  step(`The tag ${tag}`);
  const mismatch = tagProblem(tag, pkg.version);
  if (mismatch) {
    problems.push(mismatch);
  } else {
    const changelog = changelogProblem(existsSync(join(root, 'CHANGELOG.md')) ? read('CHANGELOG.md') : '', pkg.version);
    if (changelog) problems.push(changelog);
  }
  const gallery = galleryProblem(app.config.galleryImages ?? []);
  if (gallery) problems.push(gallery);
  // A pull request may add identifiers a deploy has not locked yet; a release may not.
  const unlocked = unlockedIdentifiers(lock, IDS);
  if (unlocked.length > 0) {
    problems.push(
      `${unlocked.length} identifier(s) are not in ids.lock.json (${unlocked.slice(0, 3).join(', ')}${unlocked.length > 3 ? ', …' : ''}): ` +
        'a release makes them permanent. Deploy to the test workspace and run `npm run ids:lock`, then commit it.',
    );
  }
}

step('Build');
run(TWENTY, ['dev:build']);

step('The package');
const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: output, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let listing;
try {
  listing = JSON.parse(pack.stdout)[0];
} catch {
  fail(`\`npm pack --dry-run --json\` in ${output} did not print JSON:\n${pack.error?.message ?? pack.stderr}`);
}
const files = listing.files.map((file) => file.path);
console.log(`${listing.name}@${listing.version}: ${files.length} files, ${(listing.size / 1e6).toFixed(1)} MB packed.`);
problems.push(...packageProblems(files, { logo: app.config.logo ?? '', gallery: app.config.galleryImages ?? [] }));

const texts = files
  .filter((file) => /\.(mjs|map|json)$/.test(file) && existsSync(join(output, file)))
  .map((file) => ({ path: file, text: readFileSync(join(output, file), 'utf8') }));
problems.push(...localPathProblems(texts, [root, realpathSync(root), homedir()]));

if (problems.length > 0) {
  console.error(`\nNot ready to release (${problems.length}):\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`\nReady to release ${pkg.name}@${pkg.version}${tag ? ` as ${tag}` : ''}.`);
