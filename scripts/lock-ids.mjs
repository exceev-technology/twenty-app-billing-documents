// Records every current identifier as released. Run it right after a deploy
// to a workspace, and commit ids.lock.json. Refuses to run over a violation.
import { readFileSync, writeFileSync } from 'node:fs';
import { IDS } from '../src/ids.ts';
import { lockViolations } from '../src/lib/id-lock.ts';

const path = new URL('../ids.lock.json', import.meta.url);
const lock = JSON.parse(readFileSync(path, 'utf8'));

const violations = lockViolations(lock, IDS);
if (violations.length > 0) {
  console.error('Released identifiers were changed or removed:\n' + violations.join('\n'));
  process.exit(1);
}

const next = Object.fromEntries(Object.keys(IDS).sort().map((key) => [key, IDS[key]]));
writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
console.log(`ids.lock.json now holds ${Object.keys(next).length} released identifier(s).`);
