// npm runs this as `prepack`, inside .twenty/output: the folder `twenty app:publish`
// publishes. The build copies the README but neither licence file, and the MIT licence
// asks that its notice travel with every copy, so this puts LICENSE and
// THIRD_PARTY_NOTICES.md in the package. It writes to stderr: npm's --json output
// is read from stdout. The `prepack` command checks the folder's name before it runs
// this file (from the repository root, `../../scripts/` is outside the clone); the
// manifest check below is for a run by hand.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOTICES = ['LICENSE', 'THIRD_PARTY_NOTICES.md'];
const root = fileURLToPath(new URL('../', import.meta.url));

if (!existsSync('manifest.json')) {
  console.error(
    'prepack: this folder is not a Twenty build output (no manifest.json). Publish with ' +
      '`./node_modules/.bin/twenty app:publish`, never with `npm publish` in the repository root.',
  );
  process.exit(1);
}

// Checked before the first copy: a package must not leave with one licence file and not the other.
const missing = NOTICES.filter((name) => !existsSync(join(root, name)));
if (missing.length > 0) {
  console.error(`prepack: ${missing.join(' and ')} not found in the repository (${root}), so the package would ship without it.`);
  process.exit(1);
}

for (const name of NOTICES) copyFileSync(join(root, name), name);
console.error(`prepack: ${NOTICES.join(' and ')} added to the package.`);
