// Prints the CHANGELOG.md section of a release, for the GitHub release's notes:
// `node scripts/release-notes.mjs v0.1.0`.
import { readFileSync } from 'node:fs';
import { changelogSection } from '../src/lib/release.ts';

const version = (process.argv[2] ?? '').replace(/^v/, '');
const section = changelogSection(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version);
if (section === null) {
  console.error(`CHANGELOG.md has no section for "${version}": pass a tag such as v0.1.0.`);
  process.exit(1);
}
console.log(section);
