# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Twenty app that installs fourteen `billing` objects with their relations, an append-only identifier registry, an app role, and thirteen presets (Generic and twelve countries) seeded by an idempotent post-install function.

**Architecture:** Entities are declared with `twenty-sdk/define`, one default export per file, built from small field builders that take every universal identifier from a generated registry (`src/ids.ts`) by a stable key. Presets are plain typed data; a pure seeder turns them into records through a two-method store, backed in production by Twenty's REST client and in tests by an in-memory fake. Preset docs pages are generated from the same data.

**Tech Stack:** Node 24, TypeScript 5.9 (type stripping, no build step for tests), `twenty-sdk` 2.41.0, `twenty-client-sdk` 2.41.0, `node:test`.

**Spec:** [docs/superpowers/specs/2026-09-21-foundation-design.md](../specs/2026-09-21-foundation-design.md), read with [the product overview](../specs/2026-09-21-product-overview.md).

## Global Constraints

- Every shell command runs under Node 24: start each shell with `source ~/.nvm/nvm.sh && nvm use --silent` (reads `.nvmrc`). `twenty-sdk` 2.41.0 requires Node `^24.5.0`.
- `twenty-sdk` and `twenty-client-sdk` are pinned exactly to `2.41.0`, `typescript` to `5.9.3`, all as devDependencies.
- Call the Twenty CLI through npm scripts or `./node_modules/.bin/twenty`, never `npx twenty`: npm has an unrelated package named `twenty`.
- Relative imports carry the `.ts` extension. Type-only imports use `import type` or the `type` modifier: Node strips types at runtime, and a type imported as a value fails. No enums, namespaces or parameter properties in our code (`erasableSyntaxOnly`).
- An entity file's default export is a direct call, `export default defineObject({...})`: the CLI finds entities by that shape.
- Universal identifiers come only from `id('<key>')`. Never paste a UUID into source. After adding keys, run `npm run ids:sync`. Never edit or delete an entry of `src/ids.ts` or `ids.lock.json` by hand.
- Key grammar: `app`, `role.billing`, `logicFunction.<name>`, `object.<object>`, `field.<object>.<field>`, `option.<object>.<field>.<VALUE>`.
- Object API names start with `billing`. Fields added to standard objects start with `billing`. No field is named `id`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `position`, `searchVector` or `type`.
- Labels are plain English ("Invoice"). Select option values are `UPPER_SNAKE_CASE`.
- `LICENSE` already exists from the repository's initial commit. Do not modify it.
- Nothing in the repository names a real workspace, server, client or person. The test workspace's URL and API key live outside the repository.
- Commits: the repository's git identity is the only author. No `Co-Authored-By` or tool-attribution lines. Conventional prefixes (`feat:`, `test:`, `docs:`, `chore:`, `ci:`).
- Work on the branch `feat/foundation`. Never push to `main`: push the branch and open a pull request; a maintainer merges it.

## File Structure

```
.nvmrc, package.json, tsconfig.json         toolchain
src/ids.ts                                  generated identifier registry (append-only)
ids.lock.json                               identifiers released to a workspace
src/lib/id.ts                               id(key) lookup, collect mode for ids:sync
src/lib/id-lock.ts                          lockViolations(lock, registry)
src/application-config.ts                   defineApplication
src/schema/names.ts                         APP_OBJECTS, STANDARD_TARGETS
src/schema/fields.ts                        field, select and relation builders
src/schema/options.ts                       select option lists, UN/ECE unit codes
src/schema/documents.ts                     documentFields(), lineFields()
src/objects/billing-*.object.ts             one file per object (14)
src/fields/<standard>-billing-*.field.ts    reverse fields on company, person, opportunity (10)
src/roles/billing.role.ts                   the app role
src/presets/types.ts                        Preset types
src/presets/<key>.ts                        one preset per file (13)
src/presets/index.ts                        PRESETS
src/presets/docs.ts                         renderPresetDoc()
src/seed/seed.ts                            seedPresets(store, presets), record mappers
src/seed/rest-store.ts                      restSeedStore(client)
src/logic-functions/seed-presets.ts         post-install function, runSeed()
scripts/sync-ids.mjs, scripts/lock-ids.mjs, scripts/preset-docs.mjs
test/*.test.ts, test/helpers/*.ts
docs/presets/<key>.md                       generated from preset data
.github/workflows/ci.yml
```

---

### Task 1: Toolchain, identifier registry, application manifest

**Files:**
- Create: `.nvmrc`, `package.json`, `tsconfig.json`, `src/ids.ts`, `src/lib/id.ts`, `scripts/sync-ids.mjs`, `src/application-config.ts`
- Test: `test/ids.test.ts`, `test/application.test.ts`

**Interfaces:**
- Produces: `id(key: string): string` and `requestedKeys: Set<string>` from `src/lib/id.ts`; `IDS: Readonly<Record<string, string>>` from `src/ids.ts`; npm scripts `test`, `typecheck`, `ids:sync`.

- [ ] **Step 1: Start the branch**

```bash
git fetch https://github.com/exceev-technology/twenty-app-billing-documents.git main
git checkout -b feat/foundation FETCH_HEAD
```

- [ ] **Step 2: Write the toolchain files**

`.nvmrc`:

```
24
```

`package.json`:

```json
{
  "name": "twenty-app-billing-documents",
  "version": "0.1.0",
  "private": true,
  "description": "Quotes, invoices and credit notes as PDFs, inside Twenty. Any country, any currency, your own tax rules.",
  "keywords": ["twenty-app", "invoice", "quote", "pdf", "billing"],
  "author": "Exceev Consulting & Exceev Technology",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/exceev-technology/twenty-app-billing-documents.git"
  },
  "bugs": { "url": "https://github.com/exceev-technology/twenty-app-billing-documents/issues" },
  "homepage": "https://github.com/exceev-technology/twenty-app-billing-documents#readme",
  "type": "module",
  "engines": { "node": ">=24.5.0", "twenty": ">=2.40.0" },
  "scripts": {
    "test": "node --test \"test/**/*.test.ts\"",
    "typecheck": "tsc --noEmit",
    "ids:sync": "node scripts/sync-ids.mjs",
    "ids:lock": "node scripts/lock-ids.mjs",
    "presets:docs": "node scripts/preset-docs.mjs",
    "status": "twenty remote:status",
    "plan": "twenty plan",
    "apply": "twenty apply"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Install the pinned dependencies**

Run: `npm install --save-dev --save-exact twenty-sdk@2.41.0 twenty-client-sdk@2.41.0 typescript@5.9.3 @types/node@24`
Expected: `package.json` gains a `devDependencies` block with exact versions, and `package-lock.json` is created.

- [ ] **Step 4: Write the failing tests**

`test/ids.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDS } from '../src/ids.ts';
import { id } from '../src/lib/id.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('every registered identifier is a lowercase v4 UUID', () => {
  for (const [key, value] of Object.entries(IDS)) assert.match(value, UUID_V4, key);
});

test('no identifier is registered twice', () => {
  const values = Object.values(IDS);
  assert.equal(new Set(values).size, values.length);
});

test('id() returns the registered identifier', () => {
  assert.equal(id('app'), IDS.app);
});

test('id() refuses a key the registry does not have, and says how to fix it', () => {
  assert.throws(() => id('field.nothing.here'), /npm run ids:sync/);
});

test('id() refuses a key that could not be written back into the registry safely', () => {
  assert.throws(() => id("bad'key"), /Invalid identifier key/);
});
```

`test/application.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/application-config.ts';

test('the application manifest validates', () => {
  assert.equal(app.success, true, app.errors.join('\n'));
});

test('the application is listed as Billing Documents, in Sales, by its two authors', () => {
  assert.equal(app.config.displayName, 'Billing Documents');
  assert.equal(app.config.category, 'Sales');
  assert.equal(app.config.author, 'Exceev Consulting & Exceev Technology');
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module` for `../src/ids.ts`.

- [ ] **Step 6: Write the registry, the lookup, the sync script and the manifest**

`src/ids.ts`:

```ts
// Generated by scripts/sync-ids.mjs. Append-only: never edit or delete an entry.
export const IDS: Readonly<Record<string, string>> = {
};
```

`src/lib/id.ts`:

```ts
import { createHash } from 'node:crypto';
import { IDS } from '../ids.ts';

/**
 * Universal identifiers are permanent once released. Twenty keys every upgrade
 * on them, and a changed identifier is a delete plus a create, which drops the
 * data. So nobody writes one by hand: code asks for an identifier by a stable
 * key, and `npm run ids:sync` registers the keys it has not seen yet.
 */

const KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;

/** Every key asked for since the process started. `ids:sync` reads it. */
export const requestedKeys = new Set<string>();

/**
 * While `ids:sync` collects keys, a missing key gets a stand-in derived from
 * the key, so distinct keys still get distinct values. Never deployed.
 */
function standIn(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function id(key: string): string {
  if (!KEY.test(key)) throw new Error(`Invalid identifier key "${key}"`);
  requestedKeys.add(key);
  const value = IDS[key];
  if (value !== undefined) return value;
  if (process.env.BILLING_IDS_COLLECT === '1') return standIn(key);
  throw new Error(`No universal identifier for "${key}". Run: npm run ids:sync`);
}
```

`scripts/sync-ids.mjs`:

```js
// Registers a universal identifier for every key the app asks for and the
// registry does not have yet. Never changes or removes an existing entry.
// See src/lib/id.ts.
import { readdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const registryPath = join(root, 'src', 'ids.ts');

process.env.BILLING_IDS_COLLECT = '1';

function tsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

for (const path of tsFiles(join(root, 'src'))) {
  if (path !== registryPath) await import(pathToFileURL(path).href);
}

const { requestedKeys } = await import(pathToFileURL(join(root, 'src', 'lib', 'id.ts')).href);
const { IDS } = await import(pathToFileURL(registryPath).href);

const missing = [...requestedKeys].filter((key) => !(key in IDS)).sort();
const unused = Object.keys(IDS).filter((key) => !requestedKeys.has(key)).sort();

if (missing.length > 0) {
  const entries = { ...IDS };
  for (const key of missing) entries[key] = randomUUID();
  const body = Object.keys(entries)
    .sort()
    .map((key) => `  '${key}': '${entries[key]}',`)
    .join('\n');
  writeFileSync(
    registryPath,
    '// Generated by scripts/sync-ids.mjs. Append-only: never edit or delete an entry.\n' +
      'export const IDS: Readonly<Record<string, string>> = {\n' +
      body +
      '\n};\n',
  );
}

console.log(`ids:sync registered ${missing.length} new identifier(s).`);
for (const key of missing) console.log(`  + ${key}`);
if (unused.length > 0) {
  console.log(`${unused.length} registered key(s) are no longer asked for; they stay: ${unused.join(', ')}`);
}
```

`src/application-config.ts`:

```ts
import { defineApplication } from 'twenty-sdk/define';
import { id } from './lib/id.ts';

export default defineApplication({
  universalIdentifier: id('app'),
  displayName: 'Billing Documents',
  description:
    'Quotes, invoices and credit notes as PDFs, inside Twenty. Any country, any currency, your own tax rules.',
  author: 'Exceev Consulting & Exceev Technology',
  category: 'Sales',
});
```

- [ ] **Step 7: Register the first identifier**

Run: `npm run ids:sync`
Expected: `ids:sync registered 1 new identifier(s).` then `  + app`. `src/ids.ts` now holds one entry.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: 7 tests pass; `tsc` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add .nvmrc package.json package-lock.json tsconfig.json src/ids.ts src/lib/id.ts scripts/sync-ids.mjs src/application-config.ts test/ids.test.ts test/application.test.ts
git commit -m "feat: toolchain, identifier registry and application manifest"
```

---

### Task 2: Identifier lock

**Files:**
- Create: `src/lib/id-lock.ts`, `scripts/lock-ids.mjs`, `ids.lock.json`
- Test: `test/ids-lock.test.ts`

**Interfaces:**
- Consumes: `IDS` from `src/ids.ts`.
- Produces: `lockViolations(lock, registry): string[]`; npm script `ids:lock`.

- [ ] **Step 1: Write the failing test**

`test/ids-lock.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDS } from '../src/ids.ts';
import { lockViolations } from '../src/lib/id-lock.ts';

test('an identical registry honours the lock', () => {
  assert.deepEqual(lockViolations({ a: '1' }, { a: '1' }), []);
});

test('a registry may add identifiers', () => {
  assert.deepEqual(lockViolations({ a: '1' }, { a: '1', b: '2' }), []);
});

test('a changed identifier is a violation', () => {
  assert.deepEqual(lockViolations({ a: '1' }, { a: '9' }), ['a: released as 1, now 9']);
});

test('a removed identifier is a violation', () => {
  assert.deepEqual(lockViolations({ a: '1' }, {}), ['a: released as 1, now missing from src/ids.ts']);
});

test('the registry honours the repository lock', () => {
  const lock = JSON.parse(readFileSync(new URL('../ids.lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    lockViolations(lock, IDS),
    [],
    'A released identifier was changed or removed. Released identifiers are permanent: restore it.',
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module` for `../src/lib/id-lock.ts`.

- [ ] **Step 3: Write the check, the lock script and an empty lock**

`src/lib/id-lock.ts`:

```ts
/**
 * The lock lists every identifier that has reached a workspace. The registry
 * may grow past it, never change or drop one of its entries: on upgrade,
 * Twenty would read a changed identifier as a delete plus a create.
 */
export function lockViolations(
  lock: Readonly<Record<string, string>>,
  registry: Readonly<Record<string, string>>,
): string[] {
  const violations: string[] = [];
  for (const [key, released] of Object.entries(lock)) {
    const current = registry[key];
    if (current === undefined) violations.push(`${key}: released as ${released}, now missing from src/ids.ts`);
    else if (current !== released) violations.push(`${key}: released as ${released}, now ${current}`);
  }
  return violations;
}
```

`scripts/lock-ids.mjs`:

```js
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
```

`ids.lock.json`:

```json
{}
```

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run typecheck`
Expected: all tests pass, including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/id-lock.ts scripts/lock-ids.mjs ids.lock.json test/ids-lock.test.ts
git commit -m "feat: identifier lock, append-only once released"
```

---

### Task 3: Field builders and option lists

**Files:**
- Create: `src/schema/names.ts`, `src/schema/fields.ts`, `src/schema/options.ts`
- Test: `test/fields.test.ts`, `test/options.test.ts`

**Interfaces:**
- Consumes: `id()` from `src/lib/id.ts`.
- Produces (from `src/schema/fields.ts`): types `ObjectField`, `FieldConfig`, `Meta`, `Option`, `Color`; `objectId(object)`, `fieldId(object, field)`, `optionId(object, field, value)`, `targetObjectId(object)`; builders `text`, `richText`, `date`, `dateTime`, `currency`, `rawJson`, `address`, `emails`, `phones`, `links` (all `(object, name, meta) => ObjectField`), `boolean(object, name, meta, defaultValue)`, `integer(object, name, meta)`, `decimal(object, name, meta, decimals)`, `files(object, name, meta, maxNumberOfValues)`, `select(object, name, meta, options, defaultValue?)`, `manyToOne(object, name, meta, { object, inverse, onDelete })`, `oneToMany(object, name, meta, { object, inverse })`, `onStandard(standardObject, field): FieldConfig`.
- Produces (from `src/schema/names.ts`): `APP_OBJECTS`, `AppObject`, `STANDARD_TARGETS`, `StandardTarget`.
- Produces (from `src/schema/options.ts`): `LANGUAGES`, `ROUNDING_MODES`, `NUMBERING_RESETS`, `QR_MODES`, `APPLIES_TO`, `TAX_CATEGORIES`, `UNITS`, `UNECE_UNIT_CODES`, `QUOTE_STATUSES`, `INVOICE_STATUSES`, `CREDIT_NOTE_STATUSES`, `DOCUMENT_TYPES`.

- [ ] **Step 1: Write the failing tests**

`test/fields.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

// No object exists yet, so the builders run in collect mode: each key gets a
// stand-in identifier derived from the key.
process.env.BILLING_IDS_COLLECT = '1';

const { defineField, OnDeleteAction, STANDARD_OBJECT } = await import('twenty-sdk/define');
const { id } = await import('../src/lib/id.ts');
const f = await import('../src/schema/fields.ts');

const O = 'billingDemo';

test('select gives every option its registry identifier and position, and quotes the default', () => {
  const field = f.select(O, 'state', { label: 'State' }, [['ON', 'On', 'green'], ['OFF', 'Off', 'gray']], 'OFF') as any;
  assert.deepEqual(
    field.options.map((o: any) => [o.value, o.position, o.id]),
    [['ON', 0, id('option.billingDemo.state.ON')], ['OFF', 1, id('option.billingDemo.state.OFF')]],
  );
  assert.equal(field.defaultValue, "'OFF'");
});

test('select refuses a default that is not one of its options', () => {
  assert.throws(() => f.select(O, 'state', { label: 'State' }, [['ON', 'On', 'green']], 'MAYBE'), /not one of its options/);
});

test('manyToOne holds the join column and points at the other side', () => {
  const field = f.manyToOne(O, 'owner', { label: 'Owner' }, {
    object: 'billingOther', inverse: 'demos', onDelete: OnDeleteAction.CASCADE,
  }) as any;
  assert.equal(field.type, 'RELATION');
  assert.equal(field.relationTargetObjectMetadataUniversalIdentifier, id('object.billingOther'));
  assert.equal(field.relationTargetFieldMetadataUniversalIdentifier, id('field.billingOther.demos'));
  assert.deepEqual(field.universalSettings, { relationType: 'MANY_TO_ONE', onDelete: 'CASCADE', joinColumnName: 'ownerId' });
});

test('a relation to a standard object uses Twenty’s own identifier for it', () => {
  const field = f.manyToOne(O, 'company', { label: 'Company' }, {
    object: 'company', inverse: 'billingDemos', onDelete: OnDeleteAction.SET_NULL,
  }) as any;
  assert.equal(field.relationTargetObjectMetadataUniversalIdentifier, STANDARD_OBJECT.company.universalIdentifier);
  assert.equal(field.relationTargetFieldMetadataUniversalIdentifier, id('field.company.billingDemos'));
});

test('oneToMany is the collection side, with no join column', () => {
  const field = f.oneToMany(O, 'demos', { label: 'Demos' }, { object: 'billingOther', inverse: 'owner' }) as any;
  assert.deepEqual(field.universalSettings, { relationType: 'ONE_TO_MANY' });
});

test('booleans have a default and are never null; numbers and files carry their settings', () => {
  const flag = f.boolean(O, 'on', { label: 'On' }, true) as any;
  assert.deepEqual([flag.isNullable, flag.defaultValue], [false, true]);
  assert.deepEqual((f.integer(O, 'count', { label: 'Count' }) as any).universalSettings, { dataType: 'int', decimals: 0 });
  assert.deepEqual((f.decimal(O, 'rate', { label: 'Rate' }, 4) as any).universalSettings, { dataType: 'float', decimals: 4 });
  assert.deepEqual((f.files(O, 'pdf', { label: 'PDF' }, 10) as any).universalSettings, { maxNumberOfValues: 10 });
});

test('every builder produces a field Twenty accepts', () => {
  const meta = { label: 'X' };
  const fields = [
    f.text(O, 'a', meta), f.richText(O, 'b', meta), f.date(O, 'c', meta), f.dateTime(O, 'd', meta),
    f.currency(O, 'e', meta), f.rawJson(O, 'g', meta), f.address(O, 'h', meta), f.emails(O, 'i', meta),
    f.phones(O, 'j', meta), f.links(O, 'k', meta), f.boolean(O, 'l', meta, false), f.integer(O, 'm', meta),
    f.decimal(O, 'n', meta, 2), f.files(O, 'p', meta, 1), f.select(O, 'q', meta, [['A', 'A', 'blue']], 'A'),
    f.manyToOne(O, 'r', meta, { object: 'billingOther', inverse: 's', onDelete: OnDeleteAction.SET_NULL }),
    f.oneToMany(O, 't', meta, { object: 'billingOther', inverse: 'u' }),
  ];
  for (const field of fields) {
    const result = defineField({ ...(field as any), objectUniversalIdentifier: f.objectId(O) });
    assert.equal(result.success, true, `${(field as any).name}: ${result.errors.join('; ')}`);
  }
});

test('onStandard attaches a field to the standard object it extends', () => {
  const field = f.onStandard('person', f.oneToMany('person', 'billingDemos', { label: 'Demos' }, { object: O, inverse: 'person' })) as any;
  assert.equal(field.objectUniversalIdentifier, STANDARD_OBJECT.person.universalIdentifier);
});
```

`test/options.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as options from '../src/schema/options.ts';

const lists = Object.entries(options).filter(([, value]) => Array.isArray(value)) as [string, readonly (readonly string[])[]][];

test('option values are UPPER_SNAKE_CASE and unique within their list', () => {
  for (const [name, list] of lists) {
    const values = list.map(([value]) => value);
    for (const value of values) assert.match(value, /^[A-Z][A-Z0-9_]*$/, `${name}: ${value}`);
    assert.equal(new Set(values).size, values.length, `${name} repeats a value`);
  }
});

test('every unit has a UN/ECE Recommendation 20 code', () => {
  for (const [value] of options.UNITS) assert.match(options.UNECE_UNIT_CODES[value] ?? '', /^[A-Z0-9]{2,3}$/, value);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module` for `../src/schema/fields.ts` and `../src/schema/options.ts`.

- [ ] **Step 3: Write names, builders and options**

`src/schema/names.ts`:

```ts
/** Every object the app declares. API names are prefixed `billing`. */
export const APP_OBJECTS = [
  'billingProfile',
  'billingIdentifierType',
  'billingIdentifier',
  'billingIssuer',
  'billingTaxCode',
  'billingTaxComponent',
  'billingCatalogItem',
  'billingQuote',
  'billingQuoteLine',
  'billingInvoice',
  'billingInvoiceLine',
  'billingCreditNote',
  'billingCreditNoteLine',
  'billingSequence',
] as const;

export type AppObject = (typeof APP_OBJECTS)[number];

/** Standard Twenty objects the app relates to. */
export const STANDARD_TARGETS = ['company', 'person', 'opportunity'] as const;

export type StandardTarget = (typeof STANDARD_TARGETS)[number];
```

`src/schema/fields.ts`:

```ts
import { FieldType, NumberDataType, OnDeleteAction, RelationType, STANDARD_OBJECT } from 'twenty-sdk/define';
import type { defineField, defineObject } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { STANDARD_TARGETS, type StandardTarget } from './names.ts';

/**
 * Field builders. Every object, field and option identifier comes from the
 * registry, by a key derived from its names, so one builder call declares a
 * field and `npm run ids:sync` registers whatever is new.
 */

export type ObjectConfig = Parameters<typeof defineObject>[0];
export type ObjectField = ObjectConfig['fields'][number];
export type FieldConfig = Parameters<typeof defineField>[0];

export type Meta = { label: string; description?: string; icon?: string };
export type Color = 'red' | 'orange' | 'yellow' | 'green' | 'turquoise' | 'sky' | 'blue' | 'purple' | 'pink' | 'gray';
export type Option = readonly [value: string, label: string, color: Color];

export const objectId = (object: string): string => id(`object.${object}`);
export const fieldId = (object: string, field: string): string => id(`field.${object}.${field}`);
export const optionId = (object: string, field: string, value: string): string =>
  id(`option.${object}.${field}.${value}`);

function isStandard(object: string): object is StandardTarget {
  return (STANDARD_TARGETS as readonly string[]).includes(object);
}

/** The universal identifier of one of the app's objects, or of a standard one. */
export function targetObjectId(object: string): string {
  return isStandard(object) ? STANDARD_OBJECT[object].universalIdentifier : objectId(object);
}

function field(
  object: string,
  name: string,
  type: FieldType,
  meta: Meta,
  extra: Record<string, unknown> = {},
): ObjectField {
  return {
    universalIdentifier: fieldId(object, name),
    type,
    name,
    ...meta,
    isNullable: true,
    ...extra,
  } as unknown as ObjectField;
}

export const text = (o: string, n: string, m: Meta) => field(o, n, FieldType.TEXT, m);
export const richText = (o: string, n: string, m: Meta) => field(o, n, FieldType.RICH_TEXT, m);
export const date = (o: string, n: string, m: Meta) => field(o, n, FieldType.DATE, m);
export const dateTime = (o: string, n: string, m: Meta) => field(o, n, FieldType.DATE_TIME, m);
export const currency = (o: string, n: string, m: Meta) => field(o, n, FieldType.CURRENCY, m);
export const rawJson = (o: string, n: string, m: Meta) => field(o, n, FieldType.RAW_JSON, m);
export const address = (o: string, n: string, m: Meta) => field(o, n, FieldType.ADDRESS, m);
export const emails = (o: string, n: string, m: Meta) => field(o, n, FieldType.EMAILS, m);
export const phones = (o: string, n: string, m: Meta) => field(o, n, FieldType.PHONES, m);
export const links = (o: string, n: string, m: Meta) => field(o, n, FieldType.LINKS, m);

export const boolean = (o: string, n: string, m: Meta, defaultValue: boolean) =>
  field(o, n, FieldType.BOOLEAN, m, { isNullable: false, defaultValue });

export const integer = (o: string, n: string, m: Meta) =>
  field(o, n, FieldType.NUMBER, m, { universalSettings: { dataType: NumberDataType.INT, decimals: 0 } });

export const decimal = (o: string, n: string, m: Meta, decimals: number) =>
  field(o, n, FieldType.NUMBER, m, { universalSettings: { dataType: NumberDataType.FLOAT, decimals } });

export const files = (o: string, n: string, m: Meta, maxNumberOfValues: number) =>
  field(o, n, FieldType.FILES, m, { universalSettings: { maxNumberOfValues } });

/**
 * Options get explicit identifiers. Left without one, the CLI derives it from
 * the label, so renaming a label would change the identifier and lose the
 * records holding that value on the next upgrade.
 */
export function select(o: string, n: string, m: Meta, options: readonly Option[], defaultValue?: string): ObjectField {
  if (defaultValue !== undefined && !options.some(([value]) => value === defaultValue)) {
    throw new Error(`${o}.${n}: default "${defaultValue}" is not one of its options`);
  }
  return field(o, n, FieldType.SELECT, m, {
    options: options.map(([value, label, color], position) => ({ id: optionId(o, n, value), value, label, color, position })),
    ...(defaultValue === undefined ? {} : { defaultValue: `'${defaultValue}'` }),
  });
}

export type ManyToOneTarget = { object: string; inverse: string; onDelete: OnDeleteAction };
export type OneToManyTarget = { object: string; inverse: string };

/** The side that holds the foreign key, `<name>Id`. */
export function manyToOne(o: string, n: string, m: Meta, target: ManyToOneTarget): ObjectField {
  return {
    universalIdentifier: fieldId(o, n),
    type: FieldType.RELATION,
    name: n,
    ...m,
    isNullable: true,
    relationTargetObjectMetadataUniversalIdentifier: targetObjectId(target.object),
    relationTargetFieldMetadataUniversalIdentifier: fieldId(target.object, target.inverse),
    universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: target.onDelete, joinColumnName: `${n}Id` },
  } as unknown as ObjectField;
}

/** The collection side. Twenty requires both sides to be declared. */
export function oneToMany(o: string, n: string, m: Meta, target: OneToManyTarget): ObjectField {
  return {
    universalIdentifier: fieldId(o, n),
    type: FieldType.RELATION,
    name: n,
    ...m,
    relationTargetObjectMetadataUniversalIdentifier: targetObjectId(target.object),
    relationTargetFieldMetadataUniversalIdentifier: fieldId(target.object, target.inverse),
    universalSettings: { relationType: RelationType.ONE_TO_MANY },
  } as unknown as ObjectField;
}

/** A field the app adds to a standard object: `defineField` needs its owner. */
export function onStandard(object: StandardTarget, f: ObjectField): FieldConfig {
  return { ...f, objectUniversalIdentifier: STANDARD_OBJECT[object].universalIdentifier } as unknown as FieldConfig;
}
```

`src/schema/options.ts`:

```ts
import type { Option } from './fields.ts';

export const LANGUAGES: readonly Option[] = [
  ['EN', 'English', 'blue'],
  ['FR', 'French', 'purple'],
];

export const ROUNDING_MODES: readonly Option[] = [
  ['PER_RATE_ON_TOTAL', 'Per rate, on totals', 'blue'],
  ['PER_LINE', 'Per line', 'gray'],
];

export const NUMBERING_RESETS: readonly Option[] = [
  ['NEVER', 'Never', 'gray'],
  ['YEARLY', 'Every year', 'blue'],
  ['MONTHLY', 'Every month', 'sky'],
];

export const QR_MODES: readonly Option[] = [
  ['NONE', 'No QR code', 'gray'],
  ['PAYLOAD', 'Payload only', 'blue'],
  ['URL_WITH_PAYLOAD', 'Link with payload', 'green'],
];

export const APPLIES_TO: readonly Option[] = [
  ['SELLER', 'Seller', 'blue'],
  ['BUYER', 'Buyer', 'orange'],
  ['BOTH', 'Seller and buyer', 'purple'],
];

export const TAX_CATEGORIES: readonly Option[] = [
  ['STANDARD', 'Standard', 'blue'],
  ['REDUCED', 'Reduced', 'sky'],
  ['ZERO', 'Zero-rated', 'turquoise'],
  ['EXEMPT', 'Exempt', 'gray'],
  ['REVERSE_CHARGE', 'Reverse charge', 'orange'],
  ['OUT_OF_SCOPE', 'Out of scope', 'pink'],
];

export const UNITS: readonly Option[] = [
  ['UNIT', 'Unit', 'gray'],
  ['HOUR', 'Hour', 'blue'],
  ['DAY', 'Day', 'blue'],
  ['WEEK', 'Week', 'blue'],
  ['MONTH', 'Month', 'blue'],
  ['YEAR', 'Year', 'blue'],
  ['KG', 'Kilogram', 'orange'],
  ['G', 'Gram', 'orange'],
  ['TONNE', 'Tonne', 'orange'],
  ['M', 'Metre', 'green'],
  ['KM', 'Kilometre', 'green'],
  ['M2', 'Square metre', 'green'],
  ['M3', 'Cubic metre', 'green'],
  ['LITRE', 'Litre', 'turquoise'],
  ['KWH', 'Kilowatt-hour', 'yellow'],
  ['FLAT_FEE', 'Flat fee', 'purple'],
  ['PACKAGE', 'Package', 'pink'],
];

/** UN/ECE Recommendation 20 codes, what structured e-invoices expect. */
export const UNECE_UNIT_CODES: Readonly<Record<string, string>> = {
  UNIT: 'C62', HOUR: 'HUR', DAY: 'DAY', WEEK: 'WEE', MONTH: 'MON', YEAR: 'ANN',
  KG: 'KGM', G: 'GRM', TONNE: 'TNE', M: 'MTR', KM: 'KMT', M2: 'MTK', M3: 'MTQ',
  LITRE: 'LTR', KWH: 'KWH', FLAT_FEE: 'LS', PACKAGE: 'XPK',
};

export const QUOTE_STATUSES: readonly Option[] = [
  ['DRAFT', 'Draft', 'gray'],
  ['SENT', 'Sent', 'blue'],
  ['ACCEPTED', 'Accepted', 'green'],
  ['DECLINED', 'Declined', 'red'],
  ['EXPIRED', 'Expired', 'orange'],
  ['INVOICED', 'Invoiced', 'purple'],
];

export const INVOICE_STATUSES: readonly Option[] = [
  ['DRAFT', 'Draft', 'gray'],
  ['ISSUED', 'Issued', 'blue'],
  ['SENT', 'Sent', 'sky'],
  ['PAID', 'Paid', 'green'],
  ['CANCELLED', 'Cancelled', 'red'],
];

export const CREDIT_NOTE_STATUSES: readonly Option[] = [
  ['DRAFT', 'Draft', 'gray'],
  ['ISSUED', 'Issued', 'blue'],
];

export const DOCUMENT_TYPES: readonly Option[] = [
  ['QUOTE', 'Quote', 'sky'],
  ['INVOICE', 'Invoice', 'blue'],
  ['CREDIT_NOTE', 'Credit note', 'orange'],
];
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass. The `billingDemo` keys exist only in collect mode inside the test process: nothing is added to `src/ids.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/schema test/fields.test.ts test/options.test.ts
git commit -m "feat: field, select and relation builders with explicit option identifiers"
```

---

### Task 4: Configuration objects and the schema-wide checks

**Files:**
- Create: `src/objects/billing-profile.object.ts`, `src/objects/billing-identifier-type.object.ts`, `src/objects/billing-identifier.object.ts`, `src/objects/billing-issuer.object.ts`, `src/fields/company-billing-identifiers.field.ts`, `src/fields/person-billing-identifiers.field.ts`, `test/helpers/entities.ts`
- Test: `test/schema.test.ts`

**Interfaces:**
- Consumes: builders from `src/schema/fields.ts`; option lists from `src/schema/options.ts`.
- Produces: `loadEntities(folder: 'objects' | 'fields'): Promise<Entity[]>` in `test/helpers/entities.ts`, where `Entity = { file: string; result: { success: boolean; errors: string[]; config: any } }`. Field names later tasks rely on: `billingProfile.identifierTypes`, `billingProfile.issuers`, `billingIdentifierType.profile`, `billingIdentifierType.identifiers`, `billingIdentifier.identifierType`, `billingIdentifier.issuer`, `billingIdentifier.company`, `billingIdentifier.person`, `billingIssuer.profile`, `billingIssuer.identifiers`.

- [ ] **Step 1: Write the entity loader and the failing schema test**

`test/helpers/entities.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Entity = { file: string; result: { success: boolean; errors: string[]; config: any } };

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/** Every entity file of a folder, as the validation result its default export is. */
export async function loadEntities(folder: 'objects' | 'fields'): Promise<Entity[]> {
  const dir = join(SRC, folder);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts')).sort();
  return Promise.all(
    files.map(async (file) => ({ file, result: (await import(pathToFileURL(join(dir, file)).href)).default })),
  );
}
```

`test/schema.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const standardFields = await loadEntities('fields');

const RESERVED = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'position', 'searchVector', 'type'];

type Declared = { owner: string; field: any };
const declared = new Map<string, Declared>();
for (const { result } of objects) {
  for (const field of result.config.fields) declared.set(field.universalIdentifier, { owner: result.config.universalIdentifier, field });
}
for (const { result } of standardFields) {
  declared.set(result.config.universalIdentifier, { owner: result.config.objectUniversalIdentifier, field: result.config });
}

test('there is something to check', () => {
  assert.ok(objects.length > 0, 'no object file found in src/objects');
});

test('every object and field file validates', () => {
  for (const { file, result } of [...objects, ...standardFields]) {
    assert.equal(result.success, true, `${file}: ${result.errors.join('; ')}`);
  }
});

test('every object API name is prefixed billing, singular and plural distinct', () => {
  for (const { file, result } of objects) {
    assert.match(result.config.nameSingular, /^billing[A-Z]/, file);
    assert.match(result.config.namePlural, /^billing[A-Z]/, file);
    assert.notEqual(result.config.nameSingular, result.config.namePlural, file);
  }
});

test('every field added to a standard object is prefixed billing', () => {
  for (const { file, result } of standardFields) assert.match(result.config.name, /^billing[A-Z]/, file);
});

test('no field takes a name Twenty reserves or already uses', () => {
  for (const { field } of declared.values()) assert.ok(!RESERVED.includes(field.name), field.name);
});

test('field names are unique within each object', () => {
  const seen = new Set<string>();
  for (const { owner, field } of declared.values()) {
    const key = `${owner}:${field.name}`;
    assert.ok(!seen.has(key), `two fields named ${field.name} on one object`);
    seen.add(key);
  }
});

test('every select option carries an explicit identifier', () => {
  for (const { field } of declared.values()) {
    for (const option of field.options ?? []) assert.ok(option.id, `${field.name}.${option.value}`);
  }
});

test('every object names its label identifier, and that field exists on it', () => {
  for (const { file, result } of objects) {
    const labelId = result.config.labelIdentifierFieldMetadataUniversalIdentifier;
    assert.ok(labelId, `${file} names no label identifier`);
    assert.ok(result.config.fields.some((f: any) => f.universalIdentifier === labelId), `${file}: label identifier is not one of its fields`);
  }
});

test('every relation is declared on both sides, each side pointing at the other', () => {
  for (const [uid, { owner, field }] of declared) {
    if (field.type !== 'RELATION') continue;
    const other = declared.get(field.relationTargetFieldMetadataUniversalIdentifier);
    assert.ok(other, `${field.name}: its other side is not declared`);
    assert.equal(other.field.relationTargetFieldMetadataUniversalIdentifier, uid, `${field.name}: the other side does not point back`);
    assert.equal(other.owner, field.relationTargetObjectMetadataUniversalIdentifier, `${field.name}: the other side is on the wrong object`);
    assert.equal(other.field.relationTargetObjectMetadataUniversalIdentifier, owner, `${field.name}: the other side targets the wrong object`);
    assert.deepEqual(
      [field.universalSettings.relationType, other.field.universalSettings.relationType].sort(),
      ['MANY_TO_ONE', 'ONE_TO_MANY'],
      `${field.name}: one side must be MANY_TO_ONE and the other ONE_TO_MANY`,
    );
  }
});

test('no universal identifier is used twice across objects, fields and options', () => {
  const all: string[] = [];
  for (const { result } of objects) all.push(result.config.universalIdentifier);
  for (const { field } of declared.values()) {
    all.push(field.universalIdentifier);
    for (const option of field.options ?? []) all.push(option.id);
  }
  assert.equal(new Set(all).size, all.length);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL on `there is something to check`: no object file found in src/objects.

- [ ] **Step 3: Write the four configuration objects**

`src/objects/billing-profile.object.ts`:

```ts
import { defineObject } from 'twenty-sdk/define';
import { boolean, date, fieldId, integer, objectId, oneToMany, richText, select, text } from '../schema/fields.ts';
import { LANGUAGES, NUMBERING_RESETS, QR_MODES, ROUNDING_MODES } from '../schema/options.ts';

const O = 'billingProfile';

/**
 * Country rules: what a document must say and how it is numbered, for one
 * country. The app seeds one per supported country; users edit or copy them.
 */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingProfiles',
  labelSingular: 'Billing profile',
  labelPlural: 'Billing profiles',
  description: 'Country rules for documents: identifiers, mentions, numbering and rounding.',
  icon: 'IconWorld',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', icon: 'IconAbc' }),
    text(O, 'presetKey', { label: 'Preset key', description: 'Key of the preset this profile was seeded from. Empty on profiles you create.', icon: 'IconKey' }),
    text(O, 'countryCode', { label: 'Country', description: 'ISO 3166-1 alpha-2 code. Empty for the generic profile.', icon: 'IconFlag' }),
    select(O, 'language', { label: 'Language', description: 'Language documents are printed in.', icon: 'IconLanguage' }, LANGUAGES, 'EN'),
    text(O, 'locale', { label: 'Locale', description: 'BCP 47 tag for number and date formatting, for example fr-MA.', icon: 'IconWorld' }),
    text(O, 'defaultCurrency', { label: 'Default currency', description: 'ISO 4217 code.', icon: 'IconCurrencyDollar' }),
    select(O, 'roundingMode', { label: 'Tax rounding', icon: 'IconMathFunction' }, ROUNDING_MODES, 'PER_RATE_ON_TOTAL'),
    boolean(O, 'amountInWords', { label: 'Total in words', description: 'Print the total in words, when the language supports it.', icon: 'IconAbc' }, false),
    text(O, 'invoiceTitle', { label: 'Invoice title', description: 'Replaces the printed title, for example "Tax Invoice". Empty: the language default.', icon: 'IconHeading' }),
    text(O, 'creditNoteTitle', { label: 'Credit note title', description: 'Replaces the printed title. Empty: the language default.', icon: 'IconHeading' }),
    text(O, 'quoteNumberPattern', { label: 'Quote number pattern', description: 'Tokens: {YYYY} {YY} {MM} {SEQ:n}.', icon: 'IconHash' }),
    text(O, 'invoiceNumberPattern', { label: 'Invoice number pattern', description: 'Tokens: {YYYY} {YY} {MM} {SEQ:n}.', icon: 'IconHash' }),
    text(O, 'creditNoteNumberPattern', { label: 'Credit note number pattern', description: 'Tokens: {YYYY} {YY} {MM} {SEQ:n}.', icon: 'IconHash' }),
    select(O, 'numberingReset', { label: 'Numbering restarts', icon: 'IconRefresh' }, NUMBERING_RESETS, 'YEARLY'),
    integer(O, 'defaultPaymentTermDays', { label: 'Payment term (days)', icon: 'IconCalendarDue' }),
    integer(O, 'defaultQuoteValidityDays', { label: 'Quote validity (days)', icon: 'IconCalendarTime' }),
    richText(O, 'quoteMentions', { label: 'Quote mentions', description: 'Printed on every quote.', icon: 'IconFileText' }),
    richText(O, 'invoiceMentions', { label: 'Invoice mentions', description: 'Printed on every invoice.', icon: 'IconFileText' }),
    richText(O, 'creditNoteMentions', { label: 'Credit note mentions', description: 'Printed on every credit note.', icon: 'IconFileText' }),
    select(O, 'qrMode', { label: 'QR code', icon: 'IconQrcode' }, QR_MODES, 'NONE'),
    text(O, 'complianceNote', { label: 'Compliance note', description: 'What the PDF does not cover in this country. Shown here, never printed.', icon: 'IconAlertTriangle' }),
    date(O, 'verifiedOn', { label: 'Verified on', description: 'When a seeded preset was last checked against official sources.', icon: 'IconCalendarCheck' }),
    oneToMany(O, 'identifierTypes', { label: 'Identifier types', icon: 'IconIdBadge2' }, { object: 'billingIdentifierType', inverse: 'profile' }),
    oneToMany(O, 'issuers', { label: 'Issuers', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'profile' }),
  ],
});
```

`src/objects/billing-identifier-type.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { boolean, fieldId, integer, manyToOne, objectId, oneToMany, select, text } from '../schema/fields.ts';
import { APPLIES_TO } from '../schema/options.ts';

const O = 'billingIdentifierType';

/** One legal identifier a profile uses, and when it is required. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingIdentifierTypes',
  labelSingular: 'Identifier type',
  labelPlural: 'Identifier types',
  description: 'A legal identifier a profile prints, such as a VAT number, and when it is required.',
  icon: 'IconIdBadge2',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', description: 'Printed label, for example "VAT number".', icon: 'IconAbc' }),
    text(O, 'key', { label: 'Key', description: 'Stable key, for example "fr.siren". Used by the preset seeder.', icon: 'IconKey' }),
    manyToOne(O, 'profile', { label: 'Profile', icon: 'IconWorld' }, { object: 'billingProfile', inverse: 'identifierTypes', onDelete: OnDeleteAction.CASCADE }),
    select(O, 'appliesTo', { label: 'Applies to', icon: 'IconUsers' }, APPLIES_TO, 'SELLER'),
    boolean(O, 'requiredForSeller', { label: 'Required for the seller', description: 'Issuing is refused while the seller has no value.', icon: 'IconAlertCircle' }, false),
    boolean(O, 'requiredForBusinessBuyer', { label: 'Required for a domestic business buyer', description: 'Issuing is refused while a company buyer in the profile’s country, or of unknown country, has no value. Foreign and person buyers are never required to have one.', icon: 'IconAlertCircle' }, false),
    boolean(O, 'printOnDocuments', { label: 'Print on documents', icon: 'IconPrinter' }, true),
    boolean(O, 'includeInQr', { label: 'Include in QR code', icon: 'IconQrcode' }, false),
    text(O, 'validationPattern', { label: 'Validation pattern', description: 'Optional regular expression the value must match.', icon: 'IconRegex' }),
    integer(O, 'sortOrder', { label: 'Print order', icon: 'IconSortAscending' }),
    oneToMany(O, 'identifiers', { label: 'Values', icon: 'IconId' }, { object: 'billingIdentifier', inverse: 'identifierType' }),
  ],
});
```

`src/objects/billing-identifier.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { fieldId, manyToOne, objectId, text } from '../schema/fields.ts';

const O = 'billingIdentifier';

/**
 * One identifier value, owned by an issuer, a company or a person: exactly one
 * of the three. Twenty cannot enforce that, so the issue gate checks it.
 */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingIdentifiers',
  labelSingular: 'Legal identifier',
  labelPlural: 'Legal identifiers',
  description: 'The value of a legal identifier for an issuer, a company or a person.',
  icon: 'IconId',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'value'),
  fields: [
    text(O, 'value', { label: 'Value', icon: 'IconId' }),
    manyToOne(O, 'identifierType', { label: 'Type', icon: 'IconIdBadge2' }, { object: 'billingIdentifierType', inverse: 'identifiers', onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'identifiers', onDelete: OnDeleteAction.CASCADE }),
    manyToOne(O, 'company', { label: 'Company', icon: 'IconBuildingSkyscraper' }, { object: 'company', inverse: 'billingIdentifiers', onDelete: OnDeleteAction.CASCADE }),
    manyToOne(O, 'person', { label: 'Person', icon: 'IconUser' }, { object: 'person', inverse: 'billingIdentifiers', onDelete: OnDeleteAction.CASCADE }),
  ],
});
```

`src/objects/billing-issuer.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import {
  address, boolean, emails, fieldId, files, links, manyToOne, objectId, oneToMany, phones, richText, text,
} from '../schema/fields.ts';

const O = 'billingIssuer';

/** You, the seller. A workspace may have several. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingIssuers',
  labelSingular: 'Issuer',
  labelPlural: 'Issuers',
  description: 'The business that issues quotes, invoices and credit notes.',
  icon: 'IconBuildingStore',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Trading name', icon: 'IconAbc' }),
    text(O, 'legalName', { label: 'Legal name', icon: 'IconAbc' }),
    text(O, 'legalForm', { label: 'Legal form', description: 'Free text: legal forms differ by country.', icon: 'IconBuildingBank' }),
    manyToOne(O, 'profile', { label: 'Profile', icon: 'IconWorld' }, { object: 'billingProfile', inverse: 'issuers', onDelete: OnDeleteAction.SET_NULL }),
    address(O, 'address', { label: 'Address', icon: 'IconMap' }),
    emails(O, 'emails', { label: 'Emails', icon: 'IconMail' }),
    phones(O, 'phones', { label: 'Phones', icon: 'IconPhone' }),
    links(O, 'website', { label: 'Website', icon: 'IconLink' }),
    files(O, 'logo', { label: 'Logo', icon: 'IconPhoto' }, 1),
    text(O, 'defaultCurrency', { label: 'Default currency', description: 'ISO 4217 code. Empty: the profile’s.', icon: 'IconCurrencyDollar' }),
    richText(O, 'paymentDetails', { label: 'Payment details', description: 'Free text: bank formats differ by country.', icon: 'IconBuildingBank' }),
    text(O, 'accentColor', { label: 'Accent colour', description: '#RRGGBB.', icon: 'IconPalette' }),
    text(O, 'footerNote', { label: 'Footer note', icon: 'IconAlignLeft' }),
    links(O, 'verificationBaseUrl', { label: 'Verification link', description: 'Used when the profile’s QR mode is "Link with payload".', icon: 'IconQrcode' }),
    boolean(O, 'isDefault', { label: 'Default issuer', icon: 'IconStar' }, false),
    oneToMany(O, 'identifiers', { label: 'Legal identifiers', icon: 'IconId' }, { object: 'billingIdentifier', inverse: 'issuer' }),
  ],
});
```

- [ ] **Step 4: Write the two standard-object fields**

`src/fields/company-billing-identifiers.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('company', oneToMany('company', 'billingIdentifiers', { label: 'Legal identifiers', icon: 'IconId' }, { object: 'billingIdentifier', inverse: 'company' })),
);
```

`src/fields/person-billing-identifiers.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('person', oneToMany('person', 'billingIdentifiers', { label: 'Legal identifiers', icon: 'IconId' }, { object: 'billingIdentifier', inverse: 'person' })),
);
```

- [ ] **Step 5: Register the new identifiers**

Run: `npm run ids:sync`
Expected: `ids:sync registered N new identifier(s).`, listing `object.billingProfile`, the `field.*` keys of the four objects and the two standard fields, and the `option.*` keys of their selects.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/objects src/fields src/ids.ts test/helpers/entities.ts test/schema.test.ts
git commit -m "feat: profile, identifier type, identifier and issuer objects"
```

---

### Task 5: Tax codes, tax components and the catalog

**Files:**
- Create: `src/objects/billing-tax-code.object.ts`, `src/objects/billing-tax-component.object.ts`, `src/objects/billing-catalog-item.object.ts`
- Test: `test/tax-catalog.test.ts`

**Interfaces:**
- Consumes: builders, `TAX_CATEGORIES`, `UNITS`.
- Produces field names later tasks rely on: `billingTaxCode.components`, `billingTaxCode.catalogItems`, `billingTaxComponent.taxCode`, `billingCatalogItem.taxCode`. Task 6 adds line reverse fields to both objects.

- [ ] **Step 1: Write the failing test**

`test/tax-catalog.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const config = (name: string) => objects.find(({ result }) => result.config.nameSingular === name)?.result.config;
const field = (object: string, name: string) => config(object)?.fields.find((f: any) => f.name === name);

test('a tax code has a category, standard by default, and a printed note', () => {
  assert.equal(field('billingTaxCode', 'category')?.defaultValue, "'STANDARD'");
  assert.equal(field('billingTaxCode', 'printNote')?.type, 'TEXT');
  assert.equal(field('billingTaxCode', 'isActive')?.defaultValue, true);
});

test('a tax component rate keeps four decimals, enough for 9.975 %', () => {
  assert.deepEqual(field('billingTaxComponent', 'rate')?.universalSettings, { dataType: 'float', decimals: 4 });
});

test('deleting a tax code deletes its components', () => {
  assert.equal(field('billingTaxComponent', 'taxCode')?.universalSettings.onDelete, 'CASCADE');
});

test('a catalog item has a price in any currency and a unit, one unit by default', () => {
  assert.equal(field('billingCatalogItem', 'unitPrice')?.type, 'CURRENCY');
  assert.equal(field('billingCatalogItem', 'unit')?.defaultValue, "'UNIT'");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL: `field('billingTaxCode', 'category')` is `undefined`.

- [ ] **Step 3: Write the three objects**

`src/objects/billing-tax-code.object.ts`:

```ts
import { defineObject } from 'twenty-sdk/define';
import { boolean, fieldId, objectId, oneToMany, select, text } from '../schema/fields.ts';
import { TAX_CATEGORIES } from '../schema/options.ts';

const O = 'billingTaxCode';

/**
 * A tax a line can carry: one or more components (GST plus QST), and the
 * wording the law wants printed when it applies (exemption, reverse charge).
 */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingTaxCodes',
  labelSingular: 'Tax code',
  labelPlural: 'Tax codes',
  description: 'A tax a line can carry, with its components and the note printed when it applies.',
  icon: 'IconReceiptTax',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', icon: 'IconAbc' }),
    text(O, 'code', { label: 'Code', description: 'Stable key, for example "fr.tva.20". Used by the preset seeder.', icon: 'IconKey' }),
    text(O, 'countryCode', { label: 'Country', description: 'ISO 3166-1 alpha-2 code.', icon: 'IconFlag' }),
    select(O, 'category', { label: 'Category', icon: 'IconCategory' }, TAX_CATEGORIES, 'STANDARD'),
    text(O, 'printNote', { label: 'Printed note', description: 'Printed on documents that use this code, for example an exemption article.', icon: 'IconFileText' }),
    boolean(O, 'isActive', { label: 'Active', description: 'Inactive codes stay on old documents but are not offered.', icon: 'IconToggleRight' }, true),
    oneToMany(O, 'components', { label: 'Components', icon: 'IconPercentage' }, { object: 'billingTaxComponent', inverse: 'taxCode' }),
    oneToMany(O, 'catalogItems', { label: 'Catalog items', icon: 'IconPackage' }, { object: 'billingCatalogItem', inverse: 'taxCode' }),
  ],
});
```

`src/objects/billing-tax-component.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { boolean, decimal, fieldId, integer, manyToOne, objectId, text } from '../schema/fields.ts';

const O = 'billingTaxComponent';

/** One tax inside a tax code, recapped on its own line of the document. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingTaxComponents',
  labelSingular: 'Tax component',
  labelPlural: 'Tax components',
  description: 'One tax inside a tax code, such as GST or QST.',
  icon: 'IconPercentage',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', description: 'Printed in the tax recap: "VAT", "GST", "CGST".', icon: 'IconAbc' }),
    manyToOne(O, 'taxCode', { label: 'Tax code', icon: 'IconReceiptTax' }, { object: 'billingTaxCode', inverse: 'components', onDelete: OnDeleteAction.CASCADE }),
    decimal(O, 'rate', { label: 'Rate (%)', icon: 'IconPercentage' }, 4),
    boolean(O, 'compound', { label: 'Compound', description: 'Computed on the base plus the components before it.', icon: 'IconStack2' }, false),
    integer(O, 'sortOrder', { label: 'Order', icon: 'IconSortAscending' }),
  ],
});
```

`src/objects/billing-catalog-item.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { boolean, currency, fieldId, manyToOne, objectId, select, text } from '../schema/fields.ts';
import { UNITS } from '../schema/options.ts';

const O = 'billingCatalogItem';

/** A product or service. Picking one fills a line; the line stays editable. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingCatalogItems',
  labelSingular: 'Catalog item',
  labelPlural: 'Catalog items',
  description: 'A product or service with a default price, unit and tax code.',
  icon: 'IconPackage',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', icon: 'IconAbc' }),
    text(O, 'description', { label: 'Description', icon: 'IconAlignLeft' }),
    text(O, 'sku', { label: 'SKU', icon: 'IconBarcode' }),
    select(O, 'unit', { label: 'Unit', icon: 'IconRuler' }, UNITS, 'UNIT'),
    currency(O, 'unitPrice', { label: 'Unit price', icon: 'IconCurrencyDollar' }),
    manyToOne(O, 'taxCode', { label: 'Tax code', icon: 'IconReceiptTax' }, { object: 'billingTaxCode', inverse: 'catalogItems', onDelete: OnDeleteAction.SET_NULL }),
    boolean(O, 'isActive', { label: 'Active', icon: 'IconToggleRight' }, true),
  ],
});
```

- [ ] **Step 4: Register, test, typecheck**

Run: `npm run ids:sync && npm test && npm run typecheck`
Expected: `object.billingTaxCode`, `object.billingTaxComponent`, `object.billingCatalogItem` and their field and option keys registered; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/objects src/ids.ts test/tax-catalog.test.ts
git commit -m "feat: tax code, tax component and catalog item objects"
```

---

### Task 6: Documents, lines and the numbering ledger

**Files:**
- Create: `src/schema/documents.ts`, `src/objects/billing-quote.object.ts`, `src/objects/billing-quote-line.object.ts`, `src/objects/billing-invoice.object.ts`, `src/objects/billing-invoice-line.object.ts`, `src/objects/billing-credit-note.object.ts`, `src/objects/billing-credit-note-line.object.ts`, `src/objects/billing-sequence.object.ts`, and eight files in `src/fields/`: `company-billing-quotes.field.ts`, `company-billing-invoices.field.ts`, `company-billing-credit-notes.field.ts`, `person-billing-quotes.field.ts`, `person-billing-invoices.field.ts`, `person-billing-credit-notes.field.ts`, `opportunity-billing-quotes.field.ts`, `opportunity-billing-invoices.field.ts`
- Modify: `src/objects/billing-issuer.object.ts`, `src/objects/billing-tax-code.object.ts`, `src/objects/billing-catalog-item.object.ts` (reverse fields)
- Test: `test/documents.test.ts`

**Interfaces:**
- Consumes: builders; `APP_OBJECTS`; `LANGUAGES`, `UNITS`, `QUOTE_STATUSES`, `INVOICE_STATUSES`, `CREDIT_NOTE_STATUSES`, `DOCUMENT_TYPES`.
- Produces: `documentFields(shape: DocumentShape): ObjectField[]`, `lineFields(shape: LineShape): ObjectField[]` in `src/schema/documents.ts`. Document fields every later sub-project uses: `subject`, `number`, `status`, `issuer`, `company`, `person`, `issueDate`, `currencyCode`, `pricesIncludeTax`, `language`, `notes`, `subtotal`, `discountTotal`, `taxTotal`, `total`, `pdf`, `snapshot`, `documentHash`, `lines`. Line fields: `description`, the parent (`quote` / `invoice` / `creditNote`), `sortOrder`, `catalogItem`, `quantity`, `unit`, `unitPrice`, `discountPercent`, `taxCode`, `periodStart`, `periodEnd`, `lineTotal`.

- [ ] **Step 1: Write the failing test**

`test/documents.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_OBJECTS } from '../src/schema/names.ts';
import { fieldId } from '../src/schema/fields.ts';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const byName = new Map(objects.map(({ result }) => [result.config.nameSingular, result.config]));
const field = (object: string, name: string) => byName.get(object)?.fields.find((f: any) => f.name === name);
const values = (object: string, name: string) => field(object, name)?.options.map((o: any) => o.value);

test('the app declares exactly the fourteen objects of the spec', () => {
  assert.deepEqual([...byName.keys()].sort(), [...APP_OBJECTS].sort());
});

test('each document type has its own statuses, and starts as a draft', () => {
  assert.deepEqual(values('billingQuote', 'status'), ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'INVOICED']);
  assert.deepEqual(values('billingInvoice', 'status'), ['DRAFT', 'ISSUED', 'SENT', 'PAID', 'CANCELLED']);
  assert.deepEqual(values('billingCreditNote', 'status'), ['DRAFT', 'ISSUED']);
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    assert.equal(field(doc, 'status')?.defaultValue, "'DRAFT'", doc);
  }
});

test('a document is named by its subject, never by its number', () => {
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    assert.equal(byName.get(doc)?.labelIdentifierFieldMetadataUniversalIdentifier, fieldId(doc, 'subject'), doc);
  }
});

test('deleting a document deletes its lines', () => {
  assert.equal(field('billingQuoteLine', 'quote')?.universalSettings.onDelete, 'CASCADE');
  assert.equal(field('billingInvoiceLine', 'invoice')?.universalSettings.onDelete, 'CASCADE');
  assert.equal(field('billingCreditNoteLine', 'creditNote')?.universalSettings.onDelete, 'CASCADE');
});

test('an invoice links back to its quote and forward to its credit notes', () => {
  assert.equal(field('billingInvoice', 'quote')?.type, 'RELATION');
  assert.equal(field('billingQuote', 'invoices')?.universalSettings.relationType, 'ONE_TO_MANY');
  assert.equal(field('billingCreditNote', 'invoice')?.type, 'RELATION');
  assert.equal(field('billingInvoice', 'creditNotes')?.universalSettings.relationType, 'ONE_TO_MANY');
});

test('amounts are currency fields, and quantities keep three decimals', () => {
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    for (const name of ['subtotal', 'discountTotal', 'taxTotal', 'total']) assert.equal(field(doc, name)?.type, 'CURRENCY', `${doc}.${name}`);
  }
  for (const line of ['billingQuoteLine', 'billingInvoiceLine', 'billingCreditNoteLine']) {
    for (const name of ['unitPrice', 'lineTotal']) assert.equal(field(line, name)?.type, 'CURRENCY', `${line}.${name}`);
    assert.deepEqual(field(line, 'quantity')?.universalSettings, { dataType: 'float', decimals: 3 }, line);
  }
});

test('a document keeps up to ten PDFs and a frozen snapshot', () => {
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    assert.deepEqual(field(doc, 'pdf')?.universalSettings, { maxNumberOfValues: 10 }, doc);
    assert.equal(field(doc, 'snapshot')?.type, 'RAW_JSON', doc);
  }
});

test('the numbering ledger is keyed by issuer, document type and period', () => {
  for (const name of ['issuer', 'documentType', 'periodKey', 'lastValue']) assert.ok(field('billingSequence', name), name);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL on `the app declares exactly the fourteen objects of the spec`: seven objects are missing.

- [ ] **Step 3: Write the document and line factories**

`src/schema/documents.ts`:

```ts
import { OnDeleteAction } from 'twenty-sdk/define';
import {
  boolean, currency, date, decimal, files, integer, manyToOne, oneToMany, rawJson, richText, select, text,
  type ObjectField, type Option,
} from './fields.ts';
import { LANGUAGES, UNITS } from './options.ts';

/**
 * Quotes, invoices and credit notes are separate objects so Twenty gives each
 * its own menu, views and record page. They share this shape, and the engine
 * and renderer read all three through one normalized form.
 */
export type DocumentShape = {
  object: string;
  lineObject: string;
  lineParentField: string;
  issuerInverse: string;
  buyerInverse: string;
  statuses: readonly Option[];
};

export function documentFields(d: DocumentShape): ObjectField[] {
  const O = d.object;
  return [
    text(O, 'subject', { label: 'Subject', icon: 'IconFileText' }),
    text(O, 'number', { label: 'Number', description: 'Set when the document is numbered. Never typed by hand.', icon: 'IconHash' }),
    select(O, 'status', { label: 'Status', icon: 'IconProgressCheck' }, d.statuses, 'DRAFT'),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: d.issuerInverse, onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'company', { label: 'Company', icon: 'IconBuildingSkyscraper' }, { object: 'company', inverse: d.buyerInverse, onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'person', { label: 'Person', icon: 'IconUser' }, { object: 'person', inverse: d.buyerInverse, onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'issueDate', { label: 'Issue date', icon: 'IconCalendar' }),
    text(O, 'currencyCode', { label: 'Currency', description: 'ISO 4217 code. Every line must use it.', icon: 'IconCurrencyDollar' }),
    boolean(O, 'pricesIncludeTax', { label: 'Prices include tax', icon: 'IconReceiptTax' }, false),
    select(O, 'language', { label: 'Language', description: 'Empty: the profile’s language.', icon: 'IconLanguage' }, LANGUAGES),
    richText(O, 'notes', { label: 'Notes', icon: 'IconNotes' }),
    currency(O, 'subtotal', { label: 'Subtotal', icon: 'IconSum' }),
    currency(O, 'discountTotal', { label: 'Discount', icon: 'IconDiscount' }),
    currency(O, 'taxTotal', { label: 'Tax', icon: 'IconReceiptTax' }),
    currency(O, 'total', { label: 'Total', icon: 'IconCash' }),
    files(O, 'pdf', { label: 'PDF', icon: 'IconFileTypePdf' }, 10),
    rawJson(O, 'snapshot', { label: 'Snapshot', description: 'Seller, buyer, identifiers and taxes, frozen when the document is numbered.', icon: 'IconLock' }),
    text(O, 'documentHash', { label: 'Document hash', icon: 'IconFingerprint' }),
    oneToMany(O, 'lines', { label: 'Lines', icon: 'IconList' }, { object: d.lineObject, inverse: d.lineParentField }),
  ];
}

export type LineShape = {
  object: string;
  parentObject: string;
  parentField: string;
  parentLabel: string;
  catalogInverse: string;
  taxCodeInverse: string;
};

export function lineFields(l: LineShape): ObjectField[] {
  const O = l.object;
  return [
    text(O, 'description', { label: 'Description', icon: 'IconAlignLeft' }),
    manyToOne(O, l.parentField, { label: l.parentLabel, icon: 'IconFileText' }, { object: l.parentObject, inverse: 'lines', onDelete: OnDeleteAction.CASCADE }),
    integer(O, 'sortOrder', { label: 'Order', icon: 'IconSortAscending' }),
    manyToOne(O, 'catalogItem', { label: 'Catalog item', icon: 'IconPackage' }, { object: 'billingCatalogItem', inverse: l.catalogInverse, onDelete: OnDeleteAction.SET_NULL }),
    decimal(O, 'quantity', { label: 'Quantity', icon: 'IconNumbers' }, 3),
    select(O, 'unit', { label: 'Unit', icon: 'IconRuler' }, UNITS, 'UNIT'),
    currency(O, 'unitPrice', { label: 'Unit price', description: 'Net or gross, per the document’s price basis.', icon: 'IconCurrencyDollar' }),
    decimal(O, 'discountPercent', { label: 'Discount (%)', icon: 'IconDiscount' }, 2),
    manyToOne(O, 'taxCode', { label: 'Tax code', icon: 'IconReceiptTax' }, { object: 'billingTaxCode', inverse: l.taxCodeInverse, onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'periodStart', { label: 'Period start', icon: 'IconCalendar' }),
    date(O, 'periodEnd', { label: 'Period end', icon: 'IconCalendar' }),
    currency(O, 'lineTotal', { label: 'Line total', icon: 'IconSum' }),
  ];
}
```

- [ ] **Step 4: Write the seven objects**

`src/objects/billing-quote.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { date, fieldId, manyToOne, objectId, oneToMany } from '../schema/fields.ts';
import { documentFields } from '../schema/documents.ts';
import { QUOTE_STATUSES } from '../schema/options.ts';

const O = 'billingQuote';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingQuotes',
  labelSingular: 'Quote',
  labelPlural: 'Quotes',
  description: 'A priced offer to a client. Once accepted, it becomes an invoice.',
  icon: 'IconFileDescription',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'subject'),
  fields: [
    ...documentFields({ object: O, lineObject: 'billingQuoteLine', lineParentField: 'quote', issuerInverse: 'quotes', buyerInverse: 'billingQuotes', statuses: QUOTE_STATUSES }),
    manyToOne(O, 'opportunity', { label: 'Opportunity', icon: 'IconTargetArrow' }, { object: 'opportunity', inverse: 'billingQuotes', onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'validUntil', { label: 'Valid until', icon: 'IconCalendarDue' }),
    date(O, 'acceptedAt', { label: 'Accepted on', icon: 'IconCircleCheck' }),
    oneToMany(O, 'invoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'quote' }),
  ],
});
```

`src/objects/billing-quote-line.object.ts`:

```ts
import { defineObject } from 'twenty-sdk/define';
import { fieldId, objectId } from '../schema/fields.ts';
import { lineFields } from '../schema/documents.ts';

const O = 'billingQuoteLine';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingQuoteLines',
  labelSingular: 'Quote line',
  labelPlural: 'Quote lines',
  description: 'One line of a quote.',
  icon: 'IconList',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'description'),
  fields: lineFields({ object: O, parentObject: 'billingQuote', parentField: 'quote', parentLabel: 'Quote', catalogInverse: 'quoteLines', taxCodeInverse: 'quoteLines' }),
});
```

`src/objects/billing-invoice.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { date, dateTime, fieldId, manyToOne, objectId, oneToMany, text } from '../schema/fields.ts';
import { documentFields } from '../schema/documents.ts';
import { INVOICE_STATUSES } from '../schema/options.ts';

const O = 'billingInvoice';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingInvoices',
  labelSingular: 'Invoice',
  labelPlural: 'Invoices',
  description: 'An invoice. Numbered and locked when issued; corrected only by a credit note.',
  icon: 'IconFileInvoice',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'subject'),
  fields: [
    ...documentFields({ object: O, lineObject: 'billingInvoiceLine', lineParentField: 'invoice', issuerInverse: 'invoices', buyerInverse: 'billingInvoices', statuses: INVOICE_STATUSES }),
    manyToOne(O, 'opportunity', { label: 'Opportunity', icon: 'IconTargetArrow' }, { object: 'opportunity', inverse: 'billingInvoices', onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'quote', { label: 'Quote', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'invoices', onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'dueDate', { label: 'Due date', icon: 'IconCalendarDue' }),
    text(O, 'buyerReference', { label: 'Buyer reference', description: 'The client’s purchase order or reference.', icon: 'IconHash' }),
    dateTime(O, 'issuedAt', { label: 'Issued at', icon: 'IconCalendarCheck' }),
    dateTime(O, 'sentAt', { label: 'Sent at', icon: 'IconSend' }),
    date(O, 'paidAt', { label: 'Paid on', icon: 'IconCash' }),
    oneToMany(O, 'creditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'invoice' }),
  ],
});
```

`src/objects/billing-invoice-line.object.ts`:

```ts
import { defineObject } from 'twenty-sdk/define';
import { fieldId, objectId } from '../schema/fields.ts';
import { lineFields } from '../schema/documents.ts';

const O = 'billingInvoiceLine';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingInvoiceLines',
  labelSingular: 'Invoice line',
  labelPlural: 'Invoice lines',
  description: 'One line of an invoice.',
  icon: 'IconList',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'description'),
  fields: lineFields({ object: O, parentObject: 'billingInvoice', parentField: 'invoice', parentLabel: 'Invoice', catalogInverse: 'invoiceLines', taxCodeInverse: 'invoiceLines' }),
});
```

`src/objects/billing-credit-note.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { dateTime, fieldId, manyToOne, objectId, text } from '../schema/fields.ts';
import { documentFields } from '../schema/documents.ts';
import { CREDIT_NOTE_STATUSES } from '../schema/options.ts';

const O = 'billingCreditNote';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingCreditNotes',
  labelSingular: 'Credit note',
  labelPlural: 'Credit notes',
  description: 'Corrects or cancels an issued invoice, in whole or in part.',
  icon: 'IconReceiptRefund',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'subject'),
  fields: [
    ...documentFields({ object: O, lineObject: 'billingCreditNoteLine', lineParentField: 'creditNote', issuerInverse: 'creditNotes', buyerInverse: 'billingCreditNotes', statuses: CREDIT_NOTE_STATUSES }),
    manyToOne(O, 'invoice', { label: 'Invoice', description: 'The invoice this credit note corrects. Required to issue.', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'creditNotes', onDelete: OnDeleteAction.SET_NULL }),
    text(O, 'reason', { label: 'Reason', icon: 'IconMessage' }),
    dateTime(O, 'issuedAt', { label: 'Issued at', icon: 'IconCalendarCheck' }),
  ],
});
```

`src/objects/billing-credit-note-line.object.ts`:

```ts
import { defineObject } from 'twenty-sdk/define';
import { fieldId, objectId } from '../schema/fields.ts';
import { lineFields } from '../schema/documents.ts';

const O = 'billingCreditNoteLine';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingCreditNoteLines',
  labelSingular: 'Credit note line',
  labelPlural: 'Credit note lines',
  description: 'One line of a credit note.',
  icon: 'IconList',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'description'),
  fields: lineFields({ object: O, parentObject: 'billingCreditNote', parentField: 'creditNote', parentLabel: 'Credit note', catalogInverse: 'creditNoteLines', taxCodeInverse: 'creditNoteLines' }),
});
```

`src/objects/billing-sequence.object.ts`:

```ts
import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { fieldId, integer, manyToOne, objectId, select, text } from '../schema/fields.ts';
import { DOCUMENT_TYPES } from '../schema/options.ts';

const O = 'billingSequence';

/** The numbering ledger. Allocation and gap handling belong to Lifecycle. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingSequences',
  labelSingular: 'Numbering sequence',
  labelPlural: 'Numbering sequences',
  description: 'The last number issued, per issuer, document type and period. Never edit it by hand.',
  icon: 'IconListNumbers',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'periodKey'),
  fields: [
    text(O, 'periodKey', { label: 'Period', description: 'ALL, a year (2026) or a month (2026-09), per the profile’s numbering reset.', icon: 'IconCalendar' }),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'sequences', onDelete: OnDeleteAction.SET_NULL }),
    select(O, 'documentType', { label: 'Document type', icon: 'IconFiles' }, DOCUMENT_TYPES, 'INVOICE'),
    integer(O, 'lastValue', { label: 'Last number', icon: 'IconHash' }),
  ],
});
```

- [ ] **Step 5: Add the reverse fields to issuer, tax code and catalog item**

In `src/objects/billing-issuer.object.ts`, append to `fields`, after `identifiers`:

```ts
    oneToMany(O, 'quotes', { label: 'Quotes', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'issuer' }),
    oneToMany(O, 'invoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'issuer' }),
    oneToMany(O, 'creditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'issuer' }),
    oneToMany(O, 'sequences', { label: 'Numbering sequences', icon: 'IconListNumbers' }, { object: 'billingSequence', inverse: 'issuer' }),
```

In `src/objects/billing-tax-code.object.ts`, append after `catalogItems`:

```ts
    oneToMany(O, 'quoteLines', { label: 'Quote lines', icon: 'IconList' }, { object: 'billingQuoteLine', inverse: 'taxCode' }),
    oneToMany(O, 'invoiceLines', { label: 'Invoice lines', icon: 'IconList' }, { object: 'billingInvoiceLine', inverse: 'taxCode' }),
    oneToMany(O, 'creditNoteLines', { label: 'Credit note lines', icon: 'IconList' }, { object: 'billingCreditNoteLine', inverse: 'taxCode' }),
```

In `src/objects/billing-catalog-item.object.ts`, add `oneToMany` to the import from `../schema/fields.ts` and append after `isActive`:

```ts
    oneToMany(O, 'quoteLines', { label: 'Quote lines', icon: 'IconList' }, { object: 'billingQuoteLine', inverse: 'catalogItem' }),
    oneToMany(O, 'invoiceLines', { label: 'Invoice lines', icon: 'IconList' }, { object: 'billingInvoiceLine', inverse: 'catalogItem' }),
    oneToMany(O, 'creditNoteLines', { label: 'Credit note lines', icon: 'IconList' }, { object: 'billingCreditNoteLine', inverse: 'catalogItem' }),
```

- [ ] **Step 6: Write the eight standard-object fields**

`src/fields/company-billing-quotes.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('company', oneToMany('company', 'billingQuotes', { label: 'Quotes', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'company' })),
);
```

`src/fields/company-billing-invoices.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('company', oneToMany('company', 'billingInvoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'company' })),
);
```

`src/fields/company-billing-credit-notes.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('company', oneToMany('company', 'billingCreditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'company' })),
);
```

`src/fields/person-billing-quotes.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('person', oneToMany('person', 'billingQuotes', { label: 'Quotes', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'person' })),
);
```

`src/fields/person-billing-invoices.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('person', oneToMany('person', 'billingInvoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'person' })),
);
```

`src/fields/person-billing-credit-notes.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('person', oneToMany('person', 'billingCreditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'person' })),
);
```

`src/fields/opportunity-billing-quotes.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('opportunity', oneToMany('opportunity', 'billingQuotes', { label: 'Quotes', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'opportunity' })),
);
```

`src/fields/opportunity-billing-invoices.field.ts`:

```ts
import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('opportunity', oneToMany('opportunity', 'billingInvoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'opportunity' })),
);
```

- [ ] **Step 7: Register, test, typecheck**

Run: `npm run ids:sync && npm test && npm run typecheck`
Expected: the new keys registered; all tests pass, including the schema-wide relation check across all fourteen objects and ten standard fields.

- [ ] **Step 8: Commit**

```bash
git add src/schema/documents.ts src/objects src/fields src/ids.ts test/documents.test.ts
git commit -m "feat: quote, invoice and credit note objects with their lines, and the numbering ledger"
```

---

### Task 7: The app role

**Files:**
- Create: `src/roles/billing.role.ts`
- Test: `test/role.test.ts`

**Interfaces:**
- Consumes: `APP_OBJECTS`, `STANDARD_TARGETS`, `objectId()`, `id()`.
- Produces: the role with identifier key `role.billing`.

- [ ] **Step 1: Write the failing test**

`test/role.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_OBJECT, SystemPermissionFlag } from 'twenty-sdk/define';
import role from '../src/roles/billing.role.ts';
import { APP_OBJECTS, STANDARD_TARGETS } from '../src/schema/names.ts';
import { objectId } from '../src/schema/fields.ts';

const permission = (objectUid: string) =>
  role.config.objectPermissions?.find((p) => p.objectUniversalIdentifier === objectUid);

test('the role validates', () => {
  assert.equal(role.success, true, role.errors.join('\n'));
});

test('it grants nothing globally', () => {
  const c = role.config;
  for (const flag of [c.canReadAllObjectRecords, c.canUpdateAllObjectRecords, c.canSoftDeleteAllObjectRecords, c.canDestroyAllObjectRecords, c.canUpdateAllSettings, c.canAccessAllTools]) {
    assert.equal(flag, false);
  }
});

test('it reads, writes and soft-deletes every app object, and destroys none', () => {
  for (const object of APP_OBJECTS) {
    const p = permission(objectId(object));
    assert.ok(p, object);
    assert.deepEqual(
      [p.canReadObjectRecords, p.canUpdateObjectRecords, p.canSoftDeleteObjectRecords, p.canDestroyObjectRecords],
      [true, true, true, false],
      object,
    );
  }
});

test('it only reads companies, people and opportunities', () => {
  for (const object of STANDARD_TARGETS) {
    const p = permission(STANDARD_OBJECT[object].universalIdentifier);
    assert.ok(p, object);
    assert.deepEqual(
      [p.canReadObjectRecords, p.canUpdateObjectRecords, p.canSoftDeleteObjectRecords, p.canDestroyObjectRecords],
      [true, false, false, false],
      object,
    );
  }
});

test('it may upload PDFs', () => {
  assert.ok(role.config.permissionFlagUniversalIdentifiers?.includes(SystemPermissionFlag.UPLOAD_FILE));
});

test('it belongs to the app alone', () => {
  assert.deepEqual(
    [role.config.canBeAssignedToUsers, role.config.canBeAssignedToAgents, role.config.canBeAssignedToApiKeys],
    [false, false, false],
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module` for `../src/roles/billing.role.ts`.

- [ ] **Step 3: Write the role**

`src/roles/billing.role.ts`:

```ts
import { defineApplicationRole, STANDARD_OBJECT, SystemPermissionFlag } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';
import { APP_OBJECTS, STANDARD_TARGETS } from '../schema/names.ts';

/**
 * Nothing is granted globally: an application role reads as a deny list
 * (twentyhq/twenty#23461), so every object is listed on purpose. The app never
 * destroys a record; guards added by Lifecycle refuse to soft-delete a
 * numbered document.
 */
export default defineApplicationRole({
  universalIdentifier: id('role.billing'),
  label: 'Billing Documents',
  description: 'Reads and writes the app’s own records, reads companies, people and opportunities, and uploads PDFs. Never destroys a record.',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: false,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    ...APP_OBJECTS.map((object) => ({
      objectUniversalIdentifier: objectId(object),
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    })),
    ...STANDARD_TARGETS.map((object) => ({
      objectUniversalIdentifier: STANDARD_OBJECT[object].universalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    })),
  ],
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
});
```

- [ ] **Step 4: Register, test, typecheck**

Run: `npm run ids:sync && npm test && npm run typecheck`
Expected: `+ role.billing` registered; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/roles src/ids.ts test/role.test.ts
git commit -m "feat: app role, least privilege, never destroys"
```

---

### Task 8: Preset model, the Generic preset, and generated preset pages

**Files:**
- Create: `src/presets/types.ts`, `src/presets/generic.ts`, `src/presets/index.ts`, `src/presets/docs.ts`, `scripts/preset-docs.mjs`, `docs/presets/generic.md` (generated)
- Test: `test/presets.test.ts`

**Interfaces:**
- Produces: types `Preset`, `PresetIdentifierType`, `PresetTaxCode`, `PresetTaxComponent`, `PresetSource`, `Language`, `TaxCategory`, `AppliesTo`, `NumberingReset`, `RoundingMode`, `QrMode`; `PRESETS: readonly Preset[]`; `renderPresetDoc(preset: Preset): string`; npm script `presets:docs`. Each preset file default-exports one `Preset`.

- [ ] **Step 1: Write the failing test**

`test/presets.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PRESETS } from '../src/presets/index.ts';
import { renderPresetDoc } from '../src/presets/docs.ts';
import { APPLIES_TO, LANGUAGES, NUMBERING_RESETS, QR_MODES, ROUNDING_MODES, TAX_CATEGORIES } from '../src/schema/options.ts';

const valuesOf = (list: readonly (readonly string[])[]) => list.map(([value]) => value);
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

function checkPattern(pattern: string, reset: string) {
  const tokens = pattern.match(/\{[^}]*\}/g) ?? [];
  for (const token of tokens) assert.match(token, /^\{(YYYY|YY|MM|SEQ:[1-9])\}$/, `${pattern}: unknown token ${token}`);
  assert.equal(tokens.filter((t) => t.startsWith('{SEQ:')).length, 1, `${pattern}: exactly one {SEQ:n}`);
  const hasYear = /\{YYYY\}|\{YY\}/.test(pattern);
  if (reset === 'YEARLY') assert.ok(hasYear, `${pattern}: restarts every year, so it must carry the year`);
  if (reset === 'MONTHLY') assert.ok(hasYear && pattern.includes('{MM}'), `${pattern}: restarts every month, so it must carry year and month`);
}

test('preset keys are unique: generic, or a lowercase ISO country code matching countryCode', () => {
  const keys = PRESETS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of PRESETS) {
    if (p.key === 'generic') assert.equal(p.countryCode, null);
    else assert.equal(p.countryCode, p.key.toUpperCase(), p.key);
  }
});

test('language, locale, currency, rounding and QR mode are valid', () => {
  for (const p of PRESETS) {
    assert.ok(valuesOf(LANGUAGES).includes(p.language), p.key);
    assert.equal(Intl.getCanonicalLocales(p.locale)[0], p.locale, `${p.key}: locale`);
    if (p.defaultCurrency !== null) assert.ok(CURRENCIES.has(p.defaultCurrency), `${p.key}: currency`);
    assert.ok(valuesOf(ROUNDING_MODES).includes(p.roundingMode), p.key);
    assert.ok(valuesOf(QR_MODES).includes(p.qrMode), p.key);
    assert.match(p.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, p.key);
  }
});

test('number patterns are well formed and unique across their period', () => {
  for (const p of PRESETS) {
    assert.ok(valuesOf(NUMBERING_RESETS).includes(p.numbering.reset), p.key);
    for (const pattern of [p.numbering.quote, p.numbering.invoice, p.numbering.creditNote]) checkPattern(pattern, p.numbering.reset);
  }
});

test('identifier types: keys unique and namespaced, requirements consistent, patterns compile', () => {
  const keys = PRESETS.flatMap((p) => p.identifierTypes.map((t) => t.key));
  assert.equal(new Set(keys).size, keys.length, 'an identifier type key repeats');
  for (const p of PRESETS) {
    for (const t of p.identifierTypes) {
      assert.ok(t.key.startsWith(`${p.key}.`), t.key);
      assert.ok(valuesOf(APPLIES_TO).includes(t.appliesTo), t.key);
      if (t.requiredForSeller) assert.ok(t.appliesTo !== 'BUYER', `${t.key}: required for a seller it does not apply to`);
      if (t.requiredForBusinessBuyer) assert.ok(t.appliesTo !== 'SELLER', `${t.key}: required for a buyer it does not apply to`);
      if (t.validationPattern) assert.doesNotThrow(() => new RegExp(t.validationPattern!), t.key);
    }
  }
});

test('tax codes: codes unique and namespaced, rates between 0 and 100, categories consistent', () => {
  const codes = PRESETS.flatMap((p) => p.taxCodes.map((c) => c.code));
  assert.equal(new Set(codes).size, codes.length, 'a tax code repeats');
  for (const p of PRESETS) {
    for (const c of p.taxCodes) {
      assert.ok(c.code.startsWith(`${p.key}.`), c.code);
      assert.ok(valuesOf(TAX_CATEGORIES).includes(c.category), c.code);
      assert.ok(c.components.length > 0, `${c.code}: no component`);
      for (const k of c.components) assert.ok(k.rate >= 0 && k.rate <= 100, `${c.code}: rate ${k.rate}`);
      const total = c.components.reduce((sum, k) => sum + k.rate, 0);
      if (['STANDARD', 'REDUCED'].includes(c.category)) assert.ok(total > 0, `${c.code}: a ${c.category} code charges tax`);
      else assert.equal(total, 0, `${c.code}: a ${c.category} code charges no tax`);
      if (['EXEMPT', 'REVERSE_CHARGE'].includes(c.category)) assert.ok(c.printNote, `${c.code}: the law wants the reason printed`);
    }
  }
});

test('every country preset cites its sources', () => {
  for (const p of PRESETS) {
    if (p.key === 'generic') continue;
    assert.ok(p.sources.length > 0, p.key);
    for (const s of p.sources) assert.match(s.url, /^https:\/\//, `${p.key}: ${s.title}`);
  }
});

test('every preset has its generated page, up to date', () => {
  for (const p of PRESETS) {
    const path = new URL(`../docs/presets/${p.key}.md`, import.meta.url);
    assert.ok(existsSync(path), `docs/presets/${p.key}.md is missing: run npm run presets:docs`);
    assert.equal(readFileSync(path, 'utf8'), renderPresetDoc(p), `docs/presets/${p.key}.md is stale: run npm run presets:docs`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module` for `../src/presets/index.ts`.

- [ ] **Step 3: Write the types, the Generic preset, the index and the page renderer**

`src/presets/types.ts`:

```ts
export type Language = 'EN' | 'FR';
export type TaxCategory = 'STANDARD' | 'REDUCED' | 'ZERO' | 'EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';
export type AppliesTo = 'SELLER' | 'BUYER' | 'BOTH';
export type NumberingReset = 'NEVER' | 'YEARLY' | 'MONTHLY';
export type RoundingMode = 'PER_RATE_ON_TOTAL' | 'PER_LINE';
export type QrMode = 'NONE' | 'PAYLOAD' | 'URL_WITH_PAYLOAD';

export type PresetIdentifierType = {
  key: string;
  name: string;
  appliesTo: AppliesTo;
  requiredForSeller?: boolean;
  /** Applies to company buyers in the preset's country, or of unknown country. */
  requiredForBusinessBuyer?: boolean;
  printOnDocuments?: boolean;
  includeInQr?: boolean;
  validationPattern?: string;
};

export type PresetTaxComponent = { name: string; rate: number; compound?: boolean };

export type PresetTaxCode = {
  code: string;
  name: string;
  category: TaxCategory;
  printNote?: string;
  components: readonly PresetTaxComponent[];
};

export type PresetSource = { title: string; url: string };

export type Preset = {
  key: string;
  name: string;
  countryCode: string | null;
  language: Language;
  locale: string;
  defaultCurrency: string | null;
  roundingMode: RoundingMode;
  amountInWords: boolean;
  invoiceTitle?: string;
  creditNoteTitle?: string;
  numbering: { quote: string; invoice: string; creditNote: string; reset: NumberingReset };
  defaultPaymentTermDays: number;
  defaultQuoteValidityDays: number;
  mentions: { quote?: string; invoice?: string; creditNote?: string };
  qrMode: QrMode;
  complianceNote?: string;
  verifiedOn: string;
  sources: readonly PresetSource[];
  identifierTypes: readonly PresetIdentifierType[];
  taxCodes: readonly PresetTaxCode[];
};
```

`src/presets/generic.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'generic',
  name: 'Generic',
  countryCode: null,
  language: 'EN',
  locale: 'en',
  defaultCurrency: null,
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'No country rules. Add the identifiers, tax codes and mentions your country requires.',
  verifiedOn: '2026-09-21',
  sources: [],
  identifierTypes: [
    { key: 'generic.tax-id', name: 'Tax ID', appliesTo: 'BOTH' },
    { key: 'generic.registration', name: 'Company registration', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'generic.no-tax', name: 'No tax', category: 'OUT_OF_SCOPE', components: [{ name: 'Tax', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/index.ts`:

```ts
import type { Preset } from './types.ts';
import generic from './generic.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic];
```

`src/presets/docs.ts`:

```ts
import type { Preset } from './types.ts';

const yes = (value?: boolean) => (value ? 'yes' : 'no');
const cell = (value: string) => value.replace(/\|/g, '\\|');
const code = (value: string) => `\`${cell(value)}\``;

const MENTION_LABELS = { quote: 'Quotes', invoice: 'Invoices', creditNote: 'Credit notes' } as const;

/** The page for one preset, generated from its data so the two never disagree. */
export function renderPresetDoc(p: Preset): string {
  const lines: string[] = [
    `# ${p.name} (\`${p.key}\`)`,
    '',
    `Verified on ${p.verifiedOn}. This preset is a starting point: check it with your accountant before you issue documents.`,
    '',
    '<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->',
    '',
    '## Settings',
    '',
    '| Setting | Value |',
    '|---|---|',
    `| Country | ${p.countryCode ?? 'none'} |`,
    `| Language | ${p.language} |`,
    `| Locale | ${p.locale} |`,
    `| Currency | ${p.defaultCurrency ?? 'set on the issuer'} |`,
    `| Tax rounding | ${p.roundingMode} |`,
    `| Total in words | ${yes(p.amountInWords)} |`,
    ...(p.invoiceTitle ? [`| Invoice title | ${cell(p.invoiceTitle)} |`] : []),
    ...(p.creditNoteTitle ? [`| Credit note title | ${cell(p.creditNoteTitle)} |`] : []),
    `| Quote numbers | ${code(p.numbering.quote)} |`,
    `| Invoice numbers | ${code(p.numbering.invoice)} |`,
    `| Credit note numbers | ${code(p.numbering.creditNote)} |`,
    `| Numbering restarts | ${p.numbering.reset} |`,
    `| Payment term | ${p.defaultPaymentTermDays} days |`,
    `| Quote validity | ${p.defaultQuoteValidityDays} days |`,
    '',
    '## Identifiers',
    '',
    '| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |',
    '|---|---|---|---|---|---|',
    ...p.identifierTypes.map((t) =>
      `| ${code(t.key)} | ${cell(t.name)} | ${t.appliesTo} | ${yes(t.requiredForSeller)} | ${yes(t.requiredForBusinessBuyer)} | ${t.validationPattern ? code(t.validationPattern) : ''} |`,
    ),
    '',
    '## Tax codes',
    '',
    '| Code | Name | Category | Components | Printed note |',
    '|---|---|---|---|---|',
    ...p.taxCodes.map((c) =>
      `| ${code(c.code)} | ${cell(c.name)} | ${c.category} | ${c.components.map((k) => `${cell(k.name)} ${k.rate} %`).join(' + ')} | ${cell(c.printNote ?? '')} |`,
    ),
    '',
  ];

  const mentions = (Object.keys(MENTION_LABELS) as (keyof typeof MENTION_LABELS)[]).filter((k) => p.mentions[k]);
  if (mentions.length > 0) {
    lines.push('## Mentions', '');
    for (const k of mentions) lines.push(`- **${MENTION_LABELS[k]}**: ${p.mentions[k]}`);
    lines.push('');
  }

  if (p.complianceNote) lines.push('## What this PDF does not cover', '', p.complianceNote, '');

  lines.push(
    '## Sources',
    '',
    ...(p.sources.length > 0
      ? p.sources.map((s) => `- [${s.title}](${s.url})`)
      : ['None: this preset carries no country rules.']),
    '',
  );
  return lines.join('\n');
}
```

`scripts/preset-docs.mjs`:

```js
// Writes docs/presets/<key>.md from the preset data. A test fails when a page
// and its data disagree, so run this after any preset change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PRESETS } from '../src/presets/index.ts';
import { renderPresetDoc } from '../src/presets/docs.ts';

const dir = new URL('../docs/presets/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const preset of PRESETS) writeFileSync(new URL(`${preset.key}.md`, dir), renderPresetDoc(preset));
console.log(`Wrote ${PRESETS.length} preset page(s) to docs/presets/.`);
```

- [ ] **Step 4: Generate the page**

Run: `npm run presets:docs`
Expected: `Wrote 1 preset page(s) to docs/presets/.` and `docs/presets/generic.md` exists.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/presets scripts/preset-docs.mjs docs/presets test/presets.test.ts
git commit -m "feat: preset model, generic preset and generated preset pages"
```

---

### Task 9: Morocco and France presets

**Files:**
- Create: `src/presets/ma.ts`, `src/presets/fr.ts`, `docs/presets/ma.md`, `docs/presets/fr.md` (generated)
- Modify: `src/presets/index.ts`
- Test: `test/presets-ma-fr.test.ts`

**Interfaces:**
- Consumes: `Preset` from `src/presets/types.ts`.
- Produces: presets with keys `ma` and `fr` in `PRESETS`.

- [ ] **Step 1: Write the failing test**

`test/presets-ma-fr.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const type = (key: string, typeKey: string) => preset(key).identifierTypes.find((t) => t.key === typeKey);
const tax = (key: string, code: string) => preset(key).taxCodes.find((c) => c.code === code);

test('Morocco requires the ICE from the seller and from a domestic business buyer, 15 digits, in the QR', () => {
  const ice = type('ma', 'ma.ice');
  assert.ok(ice?.requiredForSeller && ice.requiredForBusinessBuyer && ice.includeInQr);
  assert.match('001234567000089', new RegExp(ice.validationPattern!));
  for (const key of ['ma.if', 'ma.rc', 'ma.tp']) assert.equal(type('ma', key)?.requiredForSeller, true, key);
});

test('Morocco prints in French, in dirhams, with the total in words', () => {
  const ma = preset('ma');
  assert.deepEqual([ma.language, ma.defaultCurrency, ma.amountInWords], ['FR', 'MAD', true]);
  assert.equal(tax('ma', 'ma.tva.20')?.components[0].rate, 20);
});

test('France requires the seller SIREN and carries the late-payment mentions', () => {
  assert.equal(type('fr', 'fr.siren')?.requiredForSeller, true);
  assert.match(preset('fr').mentions.invoice ?? '', /40 €/);
  assert.match(preset('fr').mentions.invoice ?? '', /L441-10/);
});

test('France covers the franchise en base and reverse charge with their printed wording', () => {
  assert.match(tax('fr', 'fr.franchise')?.printNote ?? '', /293 B/);
  assert.equal(tax('fr', 'fr.autoliquidation')?.category, 'REVERSE_CHARGE');
  assert.equal(tax('fr', 'fr.tva.5-5')?.components[0].rate, 5.5);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL: `preset ma is missing`.

- [ ] **Step 3: Write the two presets**

`src/presets/ma.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'ma',
  name: 'Morocco',
  countryCode: 'MA',
  language: 'FR',
  locale: 'fr-MA',
  defaultCurrency: 'MAD',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: true,
  numbering: { quote: 'D-{YYYY}-{SEQ:4}', invoice: 'F-{YYYY}-{SEQ:4}', creditNote: 'AV-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 60,
  defaultQuoteValidityDays: 30,
  mentions: {
    invoice: 'En cas de retard de paiement, des pénalités de retard sont exigibles conformément à la loi n° 69-21 relative aux délais de paiement.',
  },
  qrMode: 'NONE',
  complianceNote: 'The tax administration (DGI) is preparing mandatory electronic invoicing. Until it applies to your business, this PDF is your invoice. Check the current timetable before relying on it.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Code général des impôts, article 145: invoice mentions (Direction générale des impôts)', url: 'https://www.tax.gov.ma' },
    { title: 'Loi n° 69-21 relative aux délais de paiement (Secrétariat général du gouvernement)', url: 'https://www.sgg.gov.ma' },
  ],
  identifierTypes: [
    { key: 'ma.ice', name: 'ICE', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, includeInQr: true, validationPattern: '^\\d{15}$' },
    { key: 'ma.if', name: 'IF', appliesTo: 'SELLER', requiredForSeller: true },
    { key: 'ma.rc', name: 'RC', appliesTo: 'SELLER', requiredForSeller: true },
    { key: 'ma.tp', name: 'TP', appliesTo: 'SELLER', requiredForSeller: true },
    { key: 'ma.cnss', name: 'CNSS', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'ma.tva.20', name: 'TVA 20 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 20 }] },
    { code: 'ma.tva.14', name: 'TVA 14 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 14 }] },
    { code: 'ma.tva.10', name: 'TVA 10 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 10 }] },
    { code: 'ma.tva.7', name: 'TVA 7 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 7 }] },
    { code: 'ma.exonere', name: 'Exonéré de TVA', category: 'EXEMPT', printNote: 'Exonéré de TVA en application du Code général des impôts (articles 91 et 92).', components: [{ name: 'TVA', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/fr.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'fr',
  name: 'France',
  countryCode: 'FR',
  language: 'FR',
  locale: 'fr-FR',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'D{YYYY}-{SEQ:4}', invoice: 'F{YYYY}-{SEQ:4}', creditNote: 'AV{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {
    invoice: 'En cas de retard de paiement, une pénalité égale à trois fois le taux d’intérêt légal est exigible (article L441-10 du Code de commerce), ainsi qu’une indemnité forfaitaire de 40 € pour frais de recouvrement (article D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.',
  },
  qrMode: 'NONE',
  complianceNote: 'E-invoicing reform: from 1 September 2026 every business must be able to receive electronic invoices, and large and mid-sized businesses must issue them; small businesses must issue them from 1 September 2027. From your issuing date, domestic B2B invoices go through an approved platform (plateforme agréée) and this PDF is no longer enough on its own. New mandatory mentions also apply, including the buyer’s SIREN and the category of the operation.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Facture : mentions obligatoires (entreprendre.service-public.fr)', url: 'https://entreprendre.service-public.fr/vosdroits/F31808' },
    { title: 'Facturation électronique (impots.gouv.fr)', url: 'https://www.impots.gouv.fr/professionnel' },
    { title: 'Code de commerce, articles L441-9, L441-10 et D441-5 (Légifrance)', url: 'https://www.legifrance.gouv.fr' },
    { title: 'Code général des impôts, articles 262 ter, 283 et 293 B (Légifrance)', url: 'https://www.legifrance.gouv.fr' },
  ],
  identifierTypes: [
    { key: 'fr.siren', name: 'SIREN', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^\\d{9}$' },
    { key: 'fr.siret', name: 'SIRET', appliesTo: 'SELLER', validationPattern: '^\\d{14}$' },
    { key: 'fr.rcs', name: 'RCS', appliesTo: 'SELLER' },
    { key: 'fr.tva', name: 'N° TVA intracommunautaire', appliesTo: 'BOTH', validationPattern: '^FR[0-9A-Z]{2}\\d{9}$' },
    { key: 'fr.capital', name: 'Capital social', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'fr.tva.20', name: 'TVA 20 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 20 }] },
    { code: 'fr.tva.10', name: 'TVA 10 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 10 }] },
    { code: 'fr.tva.5-5', name: 'TVA 5,5 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 5.5 }] },
    { code: 'fr.tva.2-1', name: 'TVA 2,1 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 2.1 }] },
    { code: 'fr.franchise', name: 'Franchise en base de TVA', category: 'EXEMPT', printNote: 'TVA non applicable, article 293 B du CGI.', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'fr.autoliquidation', name: 'Autoliquidation', category: 'REVERSE_CHARGE', printNote: 'Autoliquidation.', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'fr.intracom', name: 'Livraison intracommunautaire', category: 'EXEMPT', printNote: 'Exonération de TVA, article 262 ter, I du CGI.', components: [{ name: 'TVA', rate: 0 }] },
  ],
};

export default preset;
```

Replace `src/presets/index.ts` with:

```ts
import type { Preset } from './types.ts';
import generic from './generic.ts';
import ma from './ma.ts';
import fr from './fr.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic, ma, fr];
```

- [ ] **Step 4: Verify against the sources**

For each preset in this task, open every URL in its `sources` (WebFetch or a browser). Check every tax rate and its category; each identifier's name, format and whether it is required; the printed exemption and reverse-charge wording; the mentions; the dates in the compliance note. Where a source disagrees with this plan, the source wins: change the data and the matching assertion in the test, and list each change in the commit message body. Replace a root-domain URL with the exact page you used. Set `verifiedOn` to the day you checked. If a fact cannot be confirmed from an official source, do not guess: remove it and say so in the commit message.

- [ ] **Step 5: Generate the pages, test, typecheck**

Run: `npm run presets:docs && npm test && npm run typecheck`
Expected: `Wrote 3 preset page(s)`; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/presets docs/presets test/presets-ma-fr.test.ts
git commit -m "feat: Morocco and France presets"
```

---

### Task 10: United Kingdom, United States and Canada presets

**Files:**
- Create: `src/presets/gb.ts`, `src/presets/us.ts`, `src/presets/ca.ts`, generated `docs/presets/{gb,us,ca}.md`
- Modify: `src/presets/index.ts`
- Test: `test/presets-gb-us-ca.test.ts`

**Interfaces:**
- Produces: presets `gb`, `us`, `ca` in `PRESETS`.

- [ ] **Step 1: Write the failing test**

`test/presets-gb-us-ca.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const tax = (key: string, code: string) => preset(key).taxCodes.find((c) => c.code === code);

test('the UK preset has the three VAT rates and the domestic reverse-charge wording', () => {
  assert.deepEqual(['gb.vat.20', 'gb.vat.5', 'gb.vat.0'].map((c) => tax('gb', c)?.components[0].rate), [20, 5, 0]);
  assert.match(tax('gb', 'gb.reverse-charge')?.printNote ?? '', /customer to account for VAT to HMRC/);
});

test('the US preset ships no sales tax rate, because rates depend on the locality', () => {
  const charged = preset('us').taxCodes.filter((c) => c.components.some((k) => k.rate > 0));
  assert.deepEqual(charged, []);
  assert.equal(preset('us').creditNoteTitle, 'Credit Memo');
});

test('Quebec carries GST and QST as two components, neither compound', () => {
  const qc = tax('ca', 'ca.qc.gst-qst');
  assert.deepEqual(qc?.components.map((k) => [k.name, k.rate, k.compound ?? false]), [['GST', 5, false], ['QST', 9.975, false]]);
});

test('Canada covers every harmonized and provincial combination', () => {
  for (const code of ['ca.gst.5', 'ca.on.hst.13', 'ca.hst.15', 'ca.ns.hst.14', 'ca.bc.gst-pst', 'ca.mb.gst-rst', 'ca.sk.gst-pst']) {
    assert.ok(tax('ca', code), code);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL: `preset gb is missing`.

- [ ] **Step 3: Write the three presets**

`src/presets/gb.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'gb',
  name: 'United Kingdom',
  countryCode: 'GB',
  language: 'EN',
  locale: 'en-GB',
  defaultCurrency: 'GBP',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'No e-invoicing mandate was in force on the verification date. A limited company must also show its registered office and place of registration: add them to the issuer’s footer note.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Record keeping for VAT: VAT invoices (HMRC VAT Notice 700/21)', url: 'https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021' },
    { title: 'VAT rates (GOV.UK)', url: 'https://www.gov.uk/vat-rates' },
    { title: 'Running a limited company: signs, stationery and promotional material (GOV.UK)', url: 'https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material' },
  ],
  identifierTypes: [
    { key: 'gb.vat', name: 'VAT registration number', appliesTo: 'BOTH', validationPattern: '^GB(\\d{9}|\\d{12}|GD\\d{3}|HA\\d{3})$' },
    { key: 'gb.company-number', name: 'Company number', appliesTo: 'SELLER', validationPattern: '^[A-Z0-9]{8}$' },
  ],
  taxCodes: [
    { code: 'gb.vat.20', name: 'VAT 20%', category: 'STANDARD', components: [{ name: 'VAT', rate: 20 }] },
    { code: 'gb.vat.5', name: 'VAT 5%', category: 'REDUCED', components: [{ name: 'VAT', rate: 5 }] },
    { code: 'gb.vat.0', name: 'Zero-rated', category: 'ZERO', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'gb.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt from VAT.', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'gb.reverse-charge', name: 'Domestic reverse charge', category: 'REVERSE_CHARGE', printNote: 'Reverse charge: customer to account for VAT to HMRC.', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'gb.outside-scope', name: 'Outside the scope of VAT', category: 'OUT_OF_SCOPE', printNote: 'Outside the scope of UK VAT.', components: [{ name: 'VAT', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/us.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'us',
  name: 'United States',
  countryCode: 'US',
  language: 'EN',
  locale: 'en-US',
  defaultCurrency: 'USD',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  creditNoteTitle: 'Credit Memo',
  numbering: { quote: 'Q-{SEQ:5}', invoice: 'INV-{SEQ:5}', creditNote: 'CM-{SEQ:5}', reset: 'NEVER' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Sales tax depends on the state, county and city of the sale, and on whether you have nexus there. The preset ships no rates: add a tax code for each rate you charge.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Employer ID Numbers (IRS)', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers' },
    { title: 'State sales tax rates (Federation of Tax Administrators)', url: 'https://taxadmin.org' },
  ],
  identifierTypes: [
    { key: 'us.ein', name: 'EIN', appliesTo: 'SELLER', validationPattern: '^\\d{2}-\\d{7}$' },
    { key: 'us.sales-tax-permit', name: 'Sales tax permit', appliesTo: 'SELLER' },
    { key: 'us.resale-certificate', name: 'Resale certificate', appliesTo: 'BUYER' },
  ],
  taxCodes: [
    { code: 'us.no-tax', name: 'No sales tax', category: 'OUT_OF_SCOPE', components: [{ name: 'Sales tax', rate: 0 }] },
    { code: 'us.resale', name: 'Sale for resale', category: 'EXEMPT', printNote: 'Exempt from sales tax: sale for resale, certificate on file.', components: [{ name: 'Sales tax', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/ca.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'ca',
  name: 'Canada',
  countryCode: 'CA',
  language: 'EN',
  locale: 'en-CA',
  defaultCurrency: 'CAD',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'In Quebec, the Charter of the French language requires invoices to be available in French. Provincial sales taxes (PST in British Columbia and Saskatchewan, RST in Manitoba) are charged only by businesses registered for them.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'GST/HST calculator and rates (Canada Revenue Agency)', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html' },
    { title: 'Input tax credits: information required on invoices (Canada Revenue Agency)', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/input-tax-credits.html' },
    { title: 'GST/HST and QST (Revenu Québec)', url: 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/' },
  ],
  identifierTypes: [
    { key: 'ca.gst-hst', name: 'GST/HST number', appliesTo: 'SELLER', validationPattern: '^\\d{9}RT\\d{4}$' },
    { key: 'ca.qst', name: 'QST number', appliesTo: 'SELLER', validationPattern: '^\\d{10}TQ\\d{4}$' },
  ],
  taxCodes: [
    { code: 'ca.gst.5', name: 'GST 5%', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }] },
    { code: 'ca.on.hst.13', name: 'HST 13% (Ontario)', category: 'STANDARD', components: [{ name: 'HST', rate: 13 }] },
    { code: 'ca.hst.15', name: 'HST 15% (New Brunswick, Newfoundland and Labrador, Prince Edward Island)', category: 'STANDARD', components: [{ name: 'HST', rate: 15 }] },
    { code: 'ca.ns.hst.14', name: 'HST 14% (Nova Scotia)', category: 'STANDARD', components: [{ name: 'HST', rate: 14 }] },
    { code: 'ca.qc.gst-qst', name: 'GST 5% + QST 9.975% (Quebec)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'QST', rate: 9.975 }] },
    { code: 'ca.bc.gst-pst', name: 'GST 5% + PST 7% (British Columbia)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'PST', rate: 7 }] },
    { code: 'ca.mb.gst-rst', name: 'GST 5% + RST 7% (Manitoba)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'RST', rate: 7 }] },
    { code: 'ca.sk.gst-pst', name: 'GST 5% + PST 6% (Saskatchewan)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'PST', rate: 6 }] },
    { code: 'ca.zero', name: 'Zero-rated', category: 'ZERO', components: [{ name: 'GST/HST', rate: 0 }] },
    { code: 'ca.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt supply: no GST/HST charged.', components: [{ name: 'GST/HST', rate: 0 }] },
  ],
};

export default preset;
```

Replace `src/presets/index.ts` with:

```ts
import type { Preset } from './types.ts';
import generic from './generic.ts';
import ma from './ma.ts';
import fr from './fr.ts';
import gb from './gb.ts';
import us from './us.ts';
import ca from './ca.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic, ma, fr, gb, us, ca];
```

- [ ] **Step 4: Verify against the sources**

Same procedure as Task 9 Step 4, for `gb`, `us` and `ca`.

- [ ] **Step 5: Generate the pages, test, typecheck**

Run: `npm run presets:docs && npm test && npm run typecheck`
Expected: `Wrote 6 preset page(s)`; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/presets docs/presets test/presets-gb-us-ca.test.ts
git commit -m "feat: United Kingdom, United States and Canada presets"
```

---

### Task 11: Germany, Spain, Belgium, Netherlands and Italy presets

**Files:**
- Create: `src/presets/de.ts`, `src/presets/es.ts`, `src/presets/be.ts`, `src/presets/nl.ts`, `src/presets/it.ts`, generated `docs/presets/{de,es,be,nl,it}.md`
- Modify: `src/presets/index.ts`
- Test: `test/presets-eu.test.ts`

**Interfaces:**
- Produces: presets `de`, `es`, `be`, `nl`, `it` in `PRESETS`.

- [ ] **Step 1: Write the failing test**

`test/presets-eu.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const standardRate = (key: string) => preset(key).taxCodes.find((c) => c.category === 'STANDARD')?.components[0].rate;

test('standard VAT rates', () => {
  assert.deepEqual(['de', 'es', 'be', 'nl', 'it'].map(standardRate), [19, 21, 21, 21, 22]);
});

test('every EU preset has a reverse-charge code with printed wording', () => {
  for (const key of ['de', 'es', 'be', 'nl', 'it']) {
    const rc = preset(key).taxCodes.find((c) => c.category === 'REVERSE_CHARGE');
    assert.ok(rc?.printNote, key);
  }
});

test('Belgium and Italy say the PDF is not the legal invoice for domestic B2B', () => {
  assert.match(preset('be').complianceNote ?? '', /Peppol/);
  assert.match(preset('it').complianceNote ?? '', /courtesy copy/);
});

test('Germany covers the small-business exemption of § 19 UStG', () => {
  assert.match(preset('de').taxCodes.find((c) => c.code === 'de.kleinunternehmer')?.printNote ?? '', /§ 19 UStG/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL: `preset de is missing`.

- [ ] **Step 3: Write the five presets**

`src/presets/de.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'de',
  name: 'Germany',
  countryCode: 'DE',
  language: 'EN',
  locale: 'de-DE',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {
    invoice: 'Unless a line states a period, the date of supply is the invoice date.',
  },
  qrMode: 'NONE',
  complianceNote: 'Every business must be able to receive e-invoices (XRechnung or ZUGFeRD) since 1 January 2025. Issuing them is mandatory from 1 January 2027 for businesses with a prior-year turnover above €800,000, and for all businesses from 1 January 2028. Until your date, a PDF invoice remains allowed for domestic B2B. Documents print in English until a German language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: '§ 14 UStG: Ausstellung von Rechnungen (Gesetze im Internet)', url: 'https://www.gesetze-im-internet.de/ustg_1980/__14.html' },
    { title: '§ 19 UStG: Besteuerung der Kleinunternehmer (Gesetze im Internet)', url: 'https://www.gesetze-im-internet.de/ustg_1980/__19.html' },
    { title: '§ 13b UStG: Leistungsempfänger als Steuerschuldner (Gesetze im Internet)', url: 'https://www.gesetze-im-internet.de/ustg_1980/__13b.html' },
    { title: 'E-Rechnung (Bundesministerium der Finanzen)', url: 'https://www.bundesfinanzministerium.de' },
  ],
  identifierTypes: [
    { key: 'de.ust-idnr', name: 'USt-IdNr.', appliesTo: 'BOTH', validationPattern: '^DE\\d{9}$' },
    { key: 'de.steuernummer', name: 'Steuernummer', appliesTo: 'SELLER' },
    { key: 'de.handelsregister', name: 'Handelsregister', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'de.ust.19', name: 'USt 19 %', category: 'STANDARD', components: [{ name: 'USt', rate: 19 }] },
    { code: 'de.ust.7', name: 'USt 7 %', category: 'REDUCED', components: [{ name: 'USt', rate: 7 }] },
    { code: 'de.ust.0', name: 'USt 0 %', category: 'ZERO', components: [{ name: 'USt', rate: 0 }] },
    { code: 'de.kleinunternehmer', name: 'Kleinunternehmer', category: 'EXEMPT', printNote: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', components: [{ name: 'USt', rate: 0 }] },
    { code: 'de.reverse-charge', name: 'Reverse charge', category: 'REVERSE_CHARGE', printNote: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).', components: [{ name: 'USt', rate: 0 }] },
    { code: 'de.intra-eu', name: 'Innergemeinschaftliche Lieferung', category: 'EXEMPT', printNote: 'Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1b UStG).', components: [{ name: 'USt', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/es.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'es',
  name: 'Spain',
  countryCode: 'ES',
  language: 'EN',
  locale: 'es-ES',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'VERI*FACTU requires certified invoicing software, with the obligation postponed to 2027. B2B e-invoicing under the Crea y Crece law awaits its regulation. This app is not VERI*FACTU certified. IRPF withholding on professional invoices is not supported yet. Documents print in English until a Spanish language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Ley 37/1992 del Impuesto sobre el Valor Añadido (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740' },
    { title: 'Real Decreto 1619/2012, Reglamento de facturación (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696' },
    { title: 'VERI*FACTU (Agencia Tributaria)', url: 'https://sede.agenciatributaria.gob.es' },
  ],
  identifierTypes: [
    { key: 'es.nif', name: 'NIF', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^[A-Z0-9]\\d{7}[A-Z0-9]$' },
  ],
  taxCodes: [
    { code: 'es.iva.21', name: 'IVA 21 %', category: 'STANDARD', components: [{ name: 'IVA', rate: 21 }] },
    { code: 'es.iva.10', name: 'IVA 10 %', category: 'REDUCED', components: [{ name: 'IVA', rate: 10 }] },
    { code: 'es.iva.4', name: 'IVA 4 %', category: 'REDUCED', components: [{ name: 'IVA', rate: 4 }] },
    { code: 'es.exento', name: 'Exento', category: 'EXEMPT', printNote: 'Operación exenta de IVA (artículo 20 de la Ley 37/1992).', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'es.isp', name: 'Inversión del sujeto pasivo', category: 'REVERSE_CHARGE', printNote: 'Inversión del sujeto pasivo (artículo 84 de la Ley 37/1992).', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'es.intra-eu', name: 'Entrega intracomunitaria', category: 'EXEMPT', printNote: 'Entrega intracomunitaria exenta (artículo 25 de la Ley 37/1992).', components: [{ name: 'IVA', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/be.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'be',
  name: 'Belgium',
  countryCode: 'BE',
  language: 'FR',
  locale: 'fr-BE',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'D-{YYYY}-{SEQ:4}', invoice: 'F-{YYYY}-{SEQ:4}', creditNote: 'NC-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Structured B2B e-invoicing over Peppol is mandatory since 1 January 2026. For domestic B2B, this PDF is not a valid invoice: send the invoice through Peppol. It remains usable for consumers and foreign buyers.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'E-facturation (SPF Finances)', url: 'https://finances.belgium.be/fr/entreprises/tva/e-facturation' },
    { title: 'Code de la TVA (SPF Finances)', url: 'https://finances.belgium.be' },
  ],
  identifierTypes: [
    { key: 'be.bce', name: 'Numéro d’entreprise', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^[01]\\d{3}\\.?\\d{3}\\.?\\d{3}$' },
    { key: 'be.tva', name: 'N° TVA', appliesTo: 'BOTH', validationPattern: '^BE[01]\\d{9}$' },
    { key: 'be.rpm', name: 'RPM', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'be.tva.21', name: 'TVA 21 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 21 }] },
    { code: 'be.tva.12', name: 'TVA 12 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 12 }] },
    { code: 'be.tva.6', name: 'TVA 6 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 6 }] },
    { code: 'be.tva.0', name: 'TVA 0 %', category: 'ZERO', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'be.franchise', name: 'Franchise des petites entreprises', category: 'EXEMPT', printNote: 'Régime particulier de franchise des petites entreprises.', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'be.autoliquidation', name: 'Autoliquidation', category: 'REVERSE_CHARGE', printNote: 'Autoliquidation.', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'be.intracom', name: 'Livraison intracommunautaire', category: 'EXEMPT', printNote: 'Livraison intracommunautaire exemptée (article 39bis du Code de la TVA).', components: [{ name: 'TVA', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/nl.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'nl',
  name: 'Netherlands',
  countryCode: 'NL',
  language: 'EN',
  locale: 'nl-NL',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'No B2B e-invoicing mandate was in force on the verification date. Documents print in English until a Dutch language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Factuureisen (Belastingdienst)', url: 'https://www.belastingdienst.nl' },
    { title: 'KvK-nummer (Kamer van Koophandel)', url: 'https://www.kvk.nl' },
  ],
  identifierTypes: [
    { key: 'nl.kvk', name: 'KvK number', appliesTo: 'SELLER', requiredForSeller: true, validationPattern: '^\\d{8}$' },
    { key: 'nl.btw', name: 'VAT ID (btw-id)', appliesTo: 'BOTH', validationPattern: '^NL\\d{9}B\\d{2}$' },
  ],
  taxCodes: [
    { code: 'nl.btw.21', name: 'Btw 21%', category: 'STANDARD', components: [{ name: 'Btw', rate: 21 }] },
    { code: 'nl.btw.9', name: 'Btw 9%', category: 'REDUCED', components: [{ name: 'Btw', rate: 9 }] },
    { code: 'nl.btw.0', name: 'Btw 0%', category: 'ZERO', components: [{ name: 'Btw', rate: 0 }] },
    { code: 'nl.kor', name: 'Kleineondernemersregeling', category: 'EXEMPT', printNote: 'Vrijgesteld van btw op grond van de kleineondernemersregeling.', components: [{ name: 'Btw', rate: 0 }] },
    { code: 'nl.verlegd', name: 'Btw verlegd', category: 'REVERSE_CHARGE', printNote: 'Btw verlegd.', components: [{ name: 'Btw', rate: 0 }] },
    { code: 'nl.intra-eu', name: 'Intracommunautaire levering', category: 'EXEMPT', printNote: 'Intracommunautaire levering.', components: [{ name: 'Btw', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/it.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'it',
  name: 'Italy',
  countryCode: 'IT',
  language: 'EN',
  locale: 'it-IT',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Domestic invoices must be issued as FatturaPA XML through the SDI exchange system; this PDF is only a courtesy copy (copia di cortesia). Withholding tax (ritenuta d’acconto) and stamp duty (imposta di bollo) are not supported yet. Documents print in English until an Italian language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Fatturazione elettronica (Agenzia delle Entrate)', url: 'https://www.agenziaentrate.gov.it' },
    { title: 'D.P.R. 26 ottobre 1972, n. 633 (Normattiva)', url: 'https://www.normattiva.it' },
  ],
  identifierTypes: [
    { key: 'it.partita-iva', name: 'Partita IVA', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^\\d{11}$' },
    { key: 'it.codice-fiscale', name: 'Codice fiscale', appliesTo: 'BOTH', validationPattern: '^([A-Z0-9]{16}|\\d{11})$' },
    { key: 'it.sdi', name: 'Codice destinatario (SDI)', appliesTo: 'BUYER', validationPattern: '^[A-Z0-9]{7}$' },
  ],
  taxCodes: [
    { code: 'it.iva.22', name: 'IVA 22%', category: 'STANDARD', components: [{ name: 'IVA', rate: 22 }] },
    { code: 'it.iva.10', name: 'IVA 10%', category: 'REDUCED', components: [{ name: 'IVA', rate: 10 }] },
    { code: 'it.iva.5', name: 'IVA 5%', category: 'REDUCED', components: [{ name: 'IVA', rate: 5 }] },
    { code: 'it.iva.4', name: 'IVA 4%', category: 'REDUCED', components: [{ name: 'IVA', rate: 4 }] },
    { code: 'it.esente', name: 'Esente', category: 'EXEMPT', printNote: 'Operazione esente ai sensi dell’art. 10 del D.P.R. 633/1972.', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'it.reverse-charge', name: 'Inversione contabile', category: 'REVERSE_CHARGE', printNote: 'Inversione contabile ai sensi dell’art. 17 del D.P.R. 633/1972.', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'it.forfettario', name: 'Regime forfettario', category: 'OUT_OF_SCOPE', printNote: 'Operazione effettuata ai sensi dell’art. 1, commi 54-89, della Legge n. 190/2014.', components: [{ name: 'IVA', rate: 0 }] },
  ],
};

export default preset;
```

Replace `src/presets/index.ts` with:

```ts
import type { Preset } from './types.ts';
import generic from './generic.ts';
import ma from './ma.ts';
import fr from './fr.ts';
import gb from './gb.ts';
import us from './us.ts';
import ca from './ca.ts';
import de from './de.ts';
import es from './es.ts';
import be from './be.ts';
import nl from './nl.ts';
import it from './it.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic, ma, fr, gb, us, ca, de, es, be, nl, it];
```

- [ ] **Step 4: Verify against the sources**

Same procedure as Task 9 Step 4, for `de`, `es`, `be`, `nl` and `it`.

- [ ] **Step 5: Generate the pages, test, typecheck**

Run: `npm run presets:docs && npm test && npm run typecheck`
Expected: `Wrote 11 preset page(s)`; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/presets docs/presets test/presets-eu.test.ts
git commit -m "feat: Germany, Spain, Belgium, Netherlands and Italy presets"
```

---

### Task 12: India and United Arab Emirates presets

**Files:**
- Create: `src/presets/in.ts`, `src/presets/ae.ts`, generated `docs/presets/{in,ae}.md`
- Modify: `src/presets/index.ts`
- Test: `test/presets-in-ae.test.ts`

**Interfaces:**
- Produces: presets `in` and `ae` in `PRESETS`; all thirteen presets present.

- [ ] **Step 1: Write the failing test**

`test/presets-in-ae.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const tax = (key: string, code: string) => preset(key).taxCodes.find((c) => c.code === code);

test('all thirteen presets are seeded, Generic first', () => {
  assert.deepEqual(PRESETS.map((p) => p.key), ['generic', 'ma', 'fr', 'gb', 'us', 'ca', 'de', 'es', 'be', 'nl', 'it', 'in', 'ae']);
});

test('India splits intra-state GST into CGST and SGST, and charges IGST across states', () => {
  assert.deepEqual(tax('in', 'in.gst.18.intra')?.components.map((k) => [k.name, k.rate]), [['CGST', 9], ['SGST', 9]]);
  assert.deepEqual(tax('in', 'in.gst.18.inter')?.components.map((k) => [k.name, k.rate]), [['IGST', 18]]);
});

test('an Indian invoice number stays within 16 characters', () => {
  const sample = preset('in').numbering.invoice.replace('{YYYY}', '2026').replace(/\{SEQ:(\d)\}/, (_, n) => '9'.repeat(Number(n)));
  assert.ok(sample.length <= 16, sample);
});

test('India and the UAE title their invoices "Tax Invoice"', () => {
  assert.equal(preset('in').invoiceTitle, 'Tax Invoice');
  assert.equal(preset('ae').invoiceTitle, 'Tax Invoice');
  assert.equal(tax('ae', 'ae.vat.5')?.components[0].rate, 5);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL on `all thirteen presets are seeded`.

- [ ] **Step 3: Write the two presets**

`src/presets/in.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'in',
  name: 'India',
  countryCode: 'IN',
  language: 'EN',
  locale: 'en-IN',
  defaultCurrency: 'INR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  invoiceTitle: 'Tax Invoice',
  creditNoteTitle: 'Credit Note',
  numbering: { quote: 'Q-{YYYY}-{SEQ:5}', invoice: 'INV-{YYYY}-{SEQ:5}', creditNote: 'CN-{YYYY}-{SEQ:5}', reset: 'NEVER' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Businesses above the e-invoicing turnover threshold must obtain an IRN from the Invoice Registration Portal; this PDF does not. A tax invoice must show the place of supply (state and code), which is not supported yet. Invoice numbers must be unique within a financial year and at most 16 characters. Rates follow the GST rate rationalisation in force from 22 September 2025; union territories use UTGST in place of SGST.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'GST (Central Board of Indirect Taxes and Customs)', url: 'https://cbic-gst.gov.in' },
    { title: 'GST Council', url: 'https://gstcouncil.gov.in' },
    { title: 'e-Invoice System (GSTN)', url: 'https://einvoice1.gst.gov.in' },
  ],
  identifierTypes: [
    { key: 'in.gstin', name: 'GSTIN', appliesTo: 'BOTH', requiredForSeller: true, validationPattern: '^\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' },
    { key: 'in.pan', name: 'PAN', appliesTo: 'SELLER', validationPattern: '^[A-Z]{5}\\d{4}[A-Z]$' },
  ],
  taxCodes: [
    { code: 'in.gst.5.intra', name: 'GST 5% (intra-state)', category: 'REDUCED', components: [{ name: 'CGST', rate: 2.5 }, { name: 'SGST', rate: 2.5 }] },
    { code: 'in.gst.5.inter', name: 'GST 5% (inter-state)', category: 'REDUCED', components: [{ name: 'IGST', rate: 5 }] },
    { code: 'in.gst.18.intra', name: 'GST 18% (intra-state)', category: 'STANDARD', components: [{ name: 'CGST', rate: 9 }, { name: 'SGST', rate: 9 }] },
    { code: 'in.gst.18.inter', name: 'GST 18% (inter-state)', category: 'STANDARD', components: [{ name: 'IGST', rate: 18 }] },
    { code: 'in.gst.40.intra', name: 'GST 40% (intra-state)', category: 'STANDARD', components: [{ name: 'CGST', rate: 20 }, { name: 'SGST', rate: 20 }] },
    { code: 'in.gst.40.inter', name: 'GST 40% (inter-state)', category: 'STANDARD', components: [{ name: 'IGST', rate: 40 }] },
    { code: 'in.nil', name: 'Nil-rated', category: 'ZERO', components: [{ name: 'GST', rate: 0 }] },
    { code: 'in.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt supply under GST.', components: [{ name: 'GST', rate: 0 }] },
    { code: 'in.export-lut', name: 'Export under LUT', category: 'ZERO', printNote: 'Supply meant for export under LUT without payment of IGST.', components: [{ name: 'IGST', rate: 0 }] },
  ],
};

export default preset;
```

`src/presets/ae.ts`:

```ts
import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'ae',
  name: 'United Arab Emirates',
  countryCode: 'AE',
  language: 'EN',
  locale: 'en-AE',
  defaultCurrency: 'AED',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  invoiceTitle: 'Tax Invoice',
  creditNoteTitle: 'Tax Credit Note',
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Mandatory e-invoicing through accredited service providers is being phased in from 2026 to 2027. Until it applies to your business, a PDF tax invoice is valid. When the invoice is in another currency, the tax amount must also be shown in AED, which is not supported yet.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Tax invoices (Federal Tax Authority)', url: 'https://tax.gov.ae' },
    { title: 'E-invoicing (Ministry of Finance)', url: 'https://mof.gov.ae' },
  ],
  identifierTypes: [
    { key: 'ae.trn', name: 'TRN', appliesTo: 'BOTH', requiredForSeller: true, validationPattern: '^\\d{15}$' },
  ],
  taxCodes: [
    { code: 'ae.vat.5', name: 'VAT 5%', category: 'STANDARD', components: [{ name: 'VAT', rate: 5 }] },
    { code: 'ae.vat.0', name: 'Zero-rated', category: 'ZERO', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'ae.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt from VAT.', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'ae.reverse-charge', name: 'Reverse charge', category: 'REVERSE_CHARGE', printNote: 'Reverse charge: the recipient accounts for VAT (Article 48, Federal Decree-Law No. 8 of 2017).', components: [{ name: 'VAT', rate: 0 }] },
  ],
};

export default preset;
```

Replace `src/presets/index.ts` with (`in` is a reserved word, so India is imported as `india`):

```ts
import type { Preset } from './types.ts';
import generic from './generic.ts';
import ma from './ma.ts';
import fr from './fr.ts';
import gb from './gb.ts';
import us from './us.ts';
import ca from './ca.ts';
import de from './de.ts';
import es from './es.ts';
import be from './be.ts';
import nl from './nl.ts';
import it from './it.ts';
import india from './in.ts';
import ae from './ae.ts';

/** Seeding order. Generic first, then countries. */
export const PRESETS: readonly Preset[] = [generic, ma, fr, gb, us, ca, de, es, be, nl, it, india, ae];
```

- [ ] **Step 4: Verify against the sources**

Same procedure as Task 9 Step 4, for `in` and `ae`. For India, confirm the slabs of the September 2025 rate rationalisation first: they are the facts most likely to have moved.

- [ ] **Step 5: Generate the pages, test, typecheck**

Run: `npm run presets:docs && npm test && npm run typecheck`
Expected: `Wrote 13 preset page(s)`; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/presets docs/presets test/presets-in-ae.test.ts
git commit -m "feat: India and United Arab Emirates presets"
```

---

### Task 13: The seeder

**Files:**
- Create: `src/seed/seed.ts`
- Test: `test/seed.test.ts`

**Interfaces:**
- Consumes: `Preset` types, `PRESETS`.
- Produces: `SeedRow = { id: string; deletedAt?: string | null; [field: string]: unknown }`; `SeedStore = { list(plural: string): Promise<SeedRow[]>; create(plural: string, singular: string, data: Record<string, unknown>): Promise<SeedRow> }`; `SeedReport = { profiles: number; identifierTypes: number; taxCodes: number; taxComponents: number }`; `seedPresets(store: SeedStore, presets: readonly Preset[]): Promise<SeedReport>`; mappers `profileRecord`, `identifierTypeRecord`, `taxCodeRecord`, `taxComponentRecord`.

- [ ] **Step 1: Write the failing test**

`test/seed.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';
import { seedPresets, type SeedRow, type SeedStore } from '../src/seed/seed.ts';

const total = {
  profiles: PRESETS.length,
  identifierTypes: PRESETS.reduce((n, p) => n + p.identifierTypes.length, 0),
  taxCodes: PRESETS.reduce((n, p) => n + p.taxCodes.length, 0),
  taxComponents: PRESETS.reduce((n, p) => n + p.taxCodes.reduce((m, c) => m + c.components.length, 0), 0),
};
const NOTHING = { profiles: 0, identifierTypes: 0, taxCodes: 0, taxComponents: 0 };

/** An in-memory store. `interruptAfter(n)` lets n more creates succeed, then throws, as an interrupted run would. */
function memoryStore(initial: Record<string, SeedRow[]> = {}) {
  const tables = new Map<string, SeedRow[]>(Object.entries(initial).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  let next = 0;
  let remaining = Infinity;
  const store: SeedStore = {
    async list(plural) {
      return (tables.get(plural) ?? []).map((r) => ({ ...r }));
    },
    async create(plural, _singular, data) {
      if (remaining <= 0) throw new Error('interrupted');
      remaining -= 1;
      const row: SeedRow = { id: `row-${++next}`, deletedAt: null, ...data };
      tables.set(plural, [...(tables.get(plural) ?? []), row]);
      return { ...row };
    },
  };
  return { store, tables, interruptAfter: (n: number) => { remaining = n; } };
}

test('on an empty workspace, one run creates every preset record', async () => {
  const { store } = memoryStore();
  assert.deepEqual(await seedPresets(store, PRESETS), total);
});

test('a second run creates nothing', async () => {
  const { store } = memoryStore();
  await seedPresets(store, PRESETS);
  assert.deepEqual(await seedPresets(store, PRESETS), NOTHING);
});

test('identifier types hang off their profile, components off their tax code', async () => {
  const { store, tables } = memoryStore();
  await seedPresets(store, PRESETS);
  const ma = tables.get('billingProfiles')!.find((r) => r.presetKey === 'ma')!;
  const ice = tables.get('billingIdentifierTypes')!.find((r) => r.key === 'ma.ice')!;
  assert.equal(ice.profileId, ma.id);
  const qc = tables.get('billingTaxCodes')!.find((r) => r.code === 'ca.qc.gst-qst')!;
  const parts = tables.get('billingTaxComponents')!.filter((r) => r.taxCodeId === qc.id);
  assert.deepEqual(parts.map((r) => [r.name, r.rate, r.sortOrder]), [['GST', 5, 0], ['QST', 9.975, 1]]);
});

test('a record the user edited is never touched', async () => {
  const { store, tables } = memoryStore();
  await seedPresets(store, PRESETS);
  const code = tables.get('billingTaxCodes')!.find((r) => r.code === 'gb.vat.20')!;
  code.name = 'VAT 20% (edited)';
  await seedPresets(store, PRESETS);
  assert.equal(tables.get('billingTaxCodes')!.find((r) => r.code === 'gb.vat.20')!.name, 'VAT 20% (edited)');
});

test('a preset the user deleted stays deleted, and gets no new identifier type', async () => {
  const { store, tables } = memoryStore({
    billingProfiles: [{ id: 'p-nl', presetKey: 'nl', deletedAt: '2026-09-21T10:00:00Z' }],
  });
  const report = await seedPresets(store, PRESETS);
  assert.equal(report.profiles, total.profiles - 1);
  assert.equal(tables.get('billingProfiles')!.filter((r) => r.presetKey === 'nl').length, 1);
  assert.equal(tables.get('billingIdentifierTypes')!.filter((r) => String(r.key).startsWith('nl.')).length, 0);
});

test('an interrupted run is completed by the next one, without duplicates', async () => {
  const { store, tables, interruptAfter } = memoryStore();
  interruptAfter(40);
  await assert.rejects(seedPresets(store, PRESETS), /interrupted/);
  interruptAfter(Infinity);
  await seedPresets(store, PRESETS);
  assert.equal(tables.get('billingProfiles')!.length, total.profiles);
  assert.equal(tables.get('billingIdentifierTypes')!.length, total.identifierTypes);
  assert.equal(tables.get('billingTaxCodes')!.length, total.taxCodes);
  assert.equal(tables.get('billingTaxComponents')!.length, total.taxComponents);
});

test('a tax code left without any component gets its components; one with components is left alone', async () => {
  const { store, tables } = memoryStore({
    billingTaxCodes: [
      { id: 'c-empty', code: 'gb.vat.5', deletedAt: null },
      { id: 'c-edited', code: 'gb.vat.20', deletedAt: null },
    ],
    billingTaxComponents: [{ id: 'k-1', taxCodeId: 'c-edited', name: 'VAT', rate: 17.5, deletedAt: null }],
  });
  await seedPresets(store, PRESETS);
  const components = tables.get('billingTaxComponents')!;
  assert.deepEqual(components.filter((r) => r.taxCodeId === 'c-empty').map((r) => r.rate), [5]);
  assert.deepEqual(components.filter((r) => r.taxCodeId === 'c-edited').map((r) => r.rate), [17.5]);
});

test('rich text mentions are written as markdown, empty ones not at all', async () => {
  const { store, tables } = memoryStore();
  await seedPresets(store, PRESETS);
  const fr = tables.get('billingProfiles')!.find((r) => r.presetKey === 'fr')!;
  assert.match((fr.invoiceMentions as { markdown: string }).markdown, /L441-10/);
  assert.equal('quoteMentions' in fr, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module` for `../src/seed/seed.ts`.

- [ ] **Step 3: Write the seeder**

`src/seed/seed.ts`:

```ts
import type { Preset, PresetIdentifierType, PresetTaxCode, PresetTaxComponent } from '../presets/types.ts';

/**
 * Creates what is missing, never changes what exists. A record found by its
 * stable key is the user's, edited or not, deleted or not. The only repair is
 * a seeded tax code with no component at all, which only an interrupted run
 * leaves behind.
 */

export type SeedRow = { id: string; deletedAt?: string | null; [field: string]: unknown };

export type SeedStore = {
  /** Every row of an object, soft-deleted ones included. */
  list(plural: string): Promise<SeedRow[]>;
  create(plural: string, singular: string, data: Record<string, unknown>): Promise<SeedRow>;
};

export type SeedReport = { profiles: number; identifierTypes: number; taxCodes: number; taxComponents: number };

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}

const markdown = (text?: string) => (text ? { markdown: text } : undefined);

export function profileRecord(p: Preset): Record<string, unknown> {
  return compact({
    name: p.name,
    presetKey: p.key,
    countryCode: p.countryCode,
    language: p.language,
    locale: p.locale,
    defaultCurrency: p.defaultCurrency,
    roundingMode: p.roundingMode,
    amountInWords: p.amountInWords,
    invoiceTitle: p.invoiceTitle,
    creditNoteTitle: p.creditNoteTitle,
    quoteNumberPattern: p.numbering.quote,
    invoiceNumberPattern: p.numbering.invoice,
    creditNoteNumberPattern: p.numbering.creditNote,
    numberingReset: p.numbering.reset,
    defaultPaymentTermDays: p.defaultPaymentTermDays,
    defaultQuoteValidityDays: p.defaultQuoteValidityDays,
    quoteMentions: markdown(p.mentions.quote),
    invoiceMentions: markdown(p.mentions.invoice),
    creditNoteMentions: markdown(p.mentions.creditNote),
    qrMode: p.qrMode,
    complianceNote: p.complianceNote,
    verifiedOn: p.verifiedOn,
  });
}

export function identifierTypeRecord(t: PresetIdentifierType, sortOrder: number, profileId: string): Record<string, unknown> {
  return compact({
    name: t.name,
    key: t.key,
    profileId,
    appliesTo: t.appliesTo,
    requiredForSeller: t.requiredForSeller ?? false,
    requiredForBusinessBuyer: t.requiredForBusinessBuyer ?? false,
    printOnDocuments: t.printOnDocuments ?? true,
    includeInQr: t.includeInQr ?? false,
    validationPattern: t.validationPattern,
    sortOrder,
  });
}

export function taxCodeRecord(p: Preset, c: PresetTaxCode): Record<string, unknown> {
  return compact({ name: c.name, code: c.code, countryCode: p.countryCode, category: c.category, printNote: c.printNote, isActive: true });
}

export function taxComponentRecord(c: PresetTaxComponent, sortOrder: number, taxCodeId: string): Record<string, unknown> {
  return compact({ name: c.name, rate: c.rate, compound: c.compound ?? false, sortOrder, taxCodeId });
}

export async function seedPresets(store: SeedStore, presets: readonly Preset[]): Promise<SeedReport> {
  const report: SeedReport = { profiles: 0, identifierTypes: 0, taxCodes: 0, taxComponents: 0 };

  const profiles = new Map<string, SeedRow>();
  for (const row of await store.list('billingProfiles')) {
    if (typeof row.presetKey === 'string' && row.presetKey) profiles.set(row.presetKey, row);
  }
  for (const preset of presets) {
    if (profiles.has(preset.key)) continue;
    profiles.set(preset.key, await store.create('billingProfiles', 'billingProfile', profileRecord(preset)));
    report.profiles += 1;
  }

  const typeKeys = new Set((await store.list('billingIdentifierTypes')).map((row) => row.key));
  for (const preset of presets) {
    const profile = profiles.get(preset.key)!;
    if (profile.deletedAt) continue;
    for (const [index, type] of preset.identifierTypes.entries()) {
      if (typeKeys.has(type.key)) continue;
      await store.create('billingIdentifierTypes', 'billingIdentifierType', identifierTypeRecord(type, index, profile.id));
      typeKeys.add(type.key);
      report.identifierTypes += 1;
    }
  }

  const codes = new Map<string, SeedRow>();
  for (const row of await store.list('billingTaxCodes')) {
    if (typeof row.code === 'string' && row.code) codes.set(row.code, row);
  }
  const componentCount = new Map<string, number>();
  for (const row of await store.list('billingTaxComponents')) {
    const taxCodeId = row.taxCodeId;
    if (typeof taxCodeId === 'string') componentCount.set(taxCodeId, (componentCount.get(taxCodeId) ?? 0) + 1);
  }
  for (const preset of presets) {
    for (const code of preset.taxCodes) {
      let row = codes.get(code.code);
      if (!row) {
        row = await store.create('billingTaxCodes', 'billingTaxCode', taxCodeRecord(preset, code));
        codes.set(code.code, row);
        report.taxCodes += 1;
      }
      if (row.deletedAt || (componentCount.get(row.id) ?? 0) > 0) continue;
      for (const [index, component] of code.components.entries()) {
        await store.create('billingTaxComponents', 'billingTaxComponent', taxComponentRecord(component, index, row.id));
        report.taxComponents += 1;
      }
      componentCount.set(row.id, code.components.length);
    }
  }

  return report;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, including the 8 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/seed/seed.ts test/seed.test.ts
git commit -m "feat: preset seeder that only creates what is missing"
```

---

### Task 14: The REST store and the post-install function

**Files:**
- Create: `src/seed/rest-store.ts`, `src/logic-functions/seed-presets.ts`, `test/helpers/fake-twenty.ts`
- Test: `test/rest-store.test.ts`, `test/seed-presets.test.ts`

**Interfaces:**
- Consumes: `SeedStore`, `SeedRow`, `seedPresets`, `PRESETS`, `id()`.
- Produces: `RestLike` type; `restSeedStore(client: RestLike): SeedStore`; `runSeed(client: RestLike): Promise<SeedReport>`; the post-install function with key `logicFunction.seedPresets`; `fakeTwentyRest()` test helper.

- [ ] **Step 1: Write the fake and the failing tests**

`test/helpers/fake-twenty.ts`:

```ts
type Query = Record<string, string | number | boolean | null | undefined>;
type Row = Record<string, unknown> & { id: string; deletedAt: string | null };

/**
 * An in-memory stand-in for Twenty's REST API, shaped like its responses:
 * `{ data: { <plural>: [...] }, pageInfo }` for lists and
 * `{ data: { create<Singular>: {...} } }` for creates. Soft-deleted rows are
 * listed only under `filter=deletedAt[is]:NOT_NULL`.
 */
export function fakeTwentyRest(pageSize = 60) {
  const tables = new Map<string, Row[]>();
  const requests: string[] = [];
  let seq = 0;
  return {
    tables,
    requests,
    async get<T = unknown>(path: string, options?: { query?: Query }): Promise<T> {
      const plural = path.replace('/rest/', '');
      const q = options?.query ?? {};
      requests.push(`GET ${plural} ${JSON.stringify(q)}`);
      const deleted = q.filter === 'deletedAt[is]:NOT_NULL';
      const rows = (tables.get(plural) ?? []).filter((r) => Boolean(r.deletedAt) === deleted);
      const start = q.starting_after ? rows.findIndex((r) => r.id === q.starting_after) + 1 : 0;
      const limit = Math.min(Number(q.limit ?? pageSize), pageSize);
      const page = rows.slice(start, start + limit);
      return {
        data: { [plural]: page },
        pageInfo: { hasNextPage: start + limit < rows.length, endCursor: page.at(-1)?.id ?? null },
        totalCount: rows.length,
      } as T;
    },
    async post<T = unknown>(path: string, body?: unknown): Promise<T> {
      const plural = path.replace('/rest/', '');
      requests.push(`POST ${plural}`);
      const row: Row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, deletedAt: null, ...(body as object) };
      tables.set(plural, [...(tables.get(plural) ?? []), row]);
      const singular = plural.replace(/s$/, '');
      return { data: { [`create${singular[0].toUpperCase()}${singular.slice(1)}`]: row } } as T;
    },
  };
}
```

`test/rest-store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restSeedStore } from '../src/seed/rest-store.ts';
import { fakeTwentyRest } from './helpers/fake-twenty.ts';

test('list follows the cursor across pages', async () => {
  const twenty = fakeTwentyRest(2);
  const store = restSeedStore(twenty);
  for (let i = 0; i < 5; i++) await store.create('billingTaxCodes', 'billingTaxCode', { code: `x.${i}` });
  assert.equal((await store.list('billingTaxCodes')).length, 5);
  assert.ok(twenty.requests.some((r) => r.includes('"starting_after"')));
});

test('list includes soft-deleted rows, asked for separately', async () => {
  const twenty = fakeTwentyRest();
  twenty.tables.set('billingProfiles', [
    { id: 'a', presetKey: 'ma', deletedAt: null },
    { id: 'b', presetKey: 'nl', deletedAt: '2026-09-21T10:00:00Z' },
  ]);
  const rows = await restSeedStore(twenty).list('billingProfiles');
  assert.deepEqual(rows.map((r) => r.id).sort(), ['a', 'b']);
  assert.ok(twenty.requests.some((r) => r.includes('deletedAt[is]:NOT_NULL')));
});

test('create returns the created row from Twenty’s envelope', async () => {
  const row = await restSeedStore(fakeTwentyRest()).create('billingProfiles', 'billingProfile', { name: 'Generic' });
  assert.equal(row.name, 'Generic');
  assert.ok(row.id);
});

test('create fails loudly when Twenty answers with something else', async () => {
  const client = { get: async () => ({}), post: async () => ({ data: {} }) } as any;
  await assert.rejects(restSeedStore(client).create('billingProfiles', 'billingProfile', {}), /did not return the created billingProfile/);
});
```

`test/seed-presets.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fn, { runSeed } from '../src/logic-functions/seed-presets.ts';
import { PRESETS } from '../src/presets/index.ts';
import { fakeTwentyRest } from './helpers/fake-twenty.ts';

test('the post-install function validates and runs on every upgrade', () => {
  assert.equal(fn.success, true, fn.errors.join('\n'));
  assert.equal(fn.config.shouldRunOnVersionUpgrade, true);
  assert.equal(fn.config.timeoutSeconds, 300);
});

test('through the REST API, a first run seeds every preset and a second adds nothing', async () => {
  const twenty = fakeTwentyRest();
  const first = await runSeed(twenty);
  assert.equal(first.profiles, PRESETS.length);
  assert.equal(twenty.tables.get('billingTaxCodes')!.length, PRESETS.reduce((n, p) => n + p.taxCodes.length, 0));
  assert.deepEqual(await runSeed(twenty), { profiles: 0, identifierTypes: 0, taxCodes: 0, taxComponents: 0 });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module` for `../src/seed/rest-store.ts` and `../src/logic-functions/seed-presets.ts`.

- [ ] **Step 3: Write the REST store and the function**

`src/seed/rest-store.ts`:

```ts
import type { SeedRow, SeedStore } from './seed.ts';

/**
 * The two calls of Twenty's `RestApiClient` the seeder needs. REST addresses
 * objects by path, so it does not depend on a generated type map, which a
 * logic function bundle does not carry.
 */
export type RestLike = {
  get<T = unknown>(path: string, options?: { query?: Record<string, string | number> }): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
};

type ListResponse = {
  data?: Record<string, SeedRow[]>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const PAGE_SIZE = 60;

export function restSeedStore(client: RestLike): SeedStore {
  async function listAll(plural: string, filter?: string): Promise<SeedRow[]> {
    const rows: SeedRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const query: Record<string, string | number> = { limit: PAGE_SIZE, depth: 0 };
      if (filter) query.filter = filter;
      if (cursor) query.starting_after = cursor;
      const response = await client.get<ListResponse>(`/rest/${plural}`, { query });
      rows.push(...(response.data?.[plural] ?? []));
      const next = response.pageInfo?.hasNextPage ? response.pageInfo.endCursor : null;
      if (!next) return rows;
      cursor = next;
    }
  }

  return {
    // Twenty lists soft-deleted rows only when asked. A preset the user
    // deleted must count as existing, or the next upgrade would bring it back.
    async list(plural) {
      const [active, deleted] = await Promise.all([listAll(plural), listAll(plural, 'deletedAt[is]:NOT_NULL')]);
      return [...active, ...deleted];
    },
    async create(plural, singular, data) {
      const response = await client.post<{ data?: Record<string, SeedRow> }>(`/rest/${plural}`, data);
      const row = response.data?.[`create${singular[0].toUpperCase()}${singular.slice(1)}`];
      if (!row?.id) {
        throw new Error(`Twenty did not return the created ${singular}: ${JSON.stringify(response).slice(0, 300)}`);
      }
      return row;
    },
  };
}
```

`src/logic-functions/seed-presets.ts`:

```ts
import { definePostInstallLogicFunction, type InstallPayload } from 'twenty-sdk/define';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { id } from '../lib/id.ts';
import { PRESETS } from '../presets/index.ts';
import { seedPresets, type SeedReport } from '../seed/seed.ts';
import { restSeedStore, type RestLike } from '../seed/rest-store.ts';

/** Seeds through any REST-shaped client: Twenty's in production, a fake in tests. */
export function runSeed(client: RestLike): Promise<SeedReport> {
  return seedPresets(restSeedStore(client), PRESETS);
}

const handler = async ({ previousVersion, newVersion }: InstallPayload): Promise<SeedReport> => {
  const report = await runSeed(new RestApiClient({ runAs: 'application' }));
  console.log(`seed-presets ${previousVersion ?? 'fresh install'} -> ${newVersion}: ${JSON.stringify(report)}`);
  return report;
};

export default definePostInstallLogicFunction({
  universalIdentifier: id('logicFunction.seedPresets'),
  name: 'seed-presets',
  description: 'Creates the country presets, identifier types and tax codes that are missing. Never changes an existing record.',
  timeoutSeconds: 300,
  shouldRunOnVersionUpgrade: true,
  shouldRunSynchronously: false,
  handler,
});
```

- [ ] **Step 4: Register, test, typecheck**

Run: `npm run ids:sync && npm test && npm run typecheck`
Expected: `+ logicFunction.seedPresets` registered; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/seed/rest-store.ts src/logic-functions src/ids.ts test/helpers/fake-twenty.ts test/rest-store.test.ts test/seed-presets.test.ts
git commit -m "feat: post-install seeding through Twenty's REST API"
```

---

### Task 15: README and CI

**Files:**
- Modify: `README.md`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: npm scripts `typecheck`, `test`.

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      # Runs as the runner's user: git refuses a repository owned by another
      # user ("dubious ownership"), which is what the container would be.
      - name: Secret scan, whole history
        run: docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" zricethezav/gitleaks:v8.18.4 detect --source /repo --redact --verbose
```

- [ ] **Step 2: Rewrite the README**

`README.md`:

````markdown
# Billing Documents for Twenty

Quotes, invoices and credit notes, issued as PDFs, inside [Twenty](https://twenty.com).
Your clients are already in Twenty, so your documents can be too.

> **Status: under construction.** The data model and the country presets
> install; documents cannot be rendered or issued yet. Do not use it for real
> invoices until the first release.

## What it will do

- Quotes that become invoices, invoices that are numbered and locked when
  issued, and credit notes to correct them.
- Any country, any currency: legal identifiers, tax codes, mentions and
  numbering rules are records you edit in Twenty, with
  [presets for 12 countries plus a generic one](docs/presets) to start from.
- Taxes with several components (for example GST plus QST), exemptions and
  reverse charge with the wording the law requires, and prices entered with
  or without tax.
- A product and service catalog, payment status, and ready-made views.

Where a country requires structured e-invoicing, the PDF is a courtesy copy,
and the country preset says so.

## Requirements

- A Twenty server at version 2.40 or later.
- On a self-hosted server, logic functions enabled (`LOGIC_FUNCTION_TYPE`):
  they are off by default, and without them the presets are not seeded.

## What it installs

Fourteen objects, all prefixed `billing` so they never clash with objects you
built yourself: profiles, identifier types, legal identifiers, issuers, tax
codes and their components, catalog items, quotes, invoices, credit notes,
their lines, and the numbering ledger. Companies, people and opportunities
gain relations to them.

On install and on every upgrade, the app creates the country presets that are
missing. It never changes a record that exists: your edits always win, and a
preset you delete stays deleted.

## Development

```bash
npm install
npm test
npm run typecheck
```

- Universal identifiers are generated, never written by hand: after declaring
  a new object, field or option, run `npm run ids:sync`. Never edit or delete
  an entry of `src/ids.ts`.
- After a deploy to a workspace, run `npm run ids:lock` and commit
  `ids.lock.json`. A test then fails if a released identifier changes.
- After changing a preset, run `npm run presets:docs`.

## Design

- [Product overview](docs/superpowers/specs/2026-09-21-product-overview.md)
- [Foundation design](docs/superpowers/specs/2026-09-21-foundation-design.md)
- [Foundation plan](docs/superpowers/plans/2026-09-21-foundation.md)

## Authors

Exceev Consulting & Exceev Technology. Released under the [MIT licence](LICENSE).
````

- [ ] **Step 3: Run the checks CI runs**

Run: `npm ci && npm run typecheck && npm test`
Expected: all pass. If Docker is available locally, also run `docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" zricethezav/gitleaks:v8.18.4 detect --source /repo --redact --verbose`. Expected: `no leaks found`.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/ci.yml
git commit -m "ci: typecheck, tests and history secret scan; README for the Foundation"
```

---

### Task 16: Deploy to the test workspace and accept

This task talks to a real workspace. The maintainer does the steps marked **(maintainer)**; the agent does the rest and stops at every checkpoint where the result differs from the expected one.

**Files:**
- Modify: `ids.lock.json`, `package.json` (version), and any file an acceptance failure points at

- [ ] **Step 1 (maintainer): Connect the CLI to the test workspace**

The test workspace URL and API key are not in this repository.

```bash
./node_modules/.bin/twenty remote:add --url <test-workspace-url> --api-key <api-key> --as billing-test
./node_modules/.bin/twenty remote:use billing-test
```

- [ ] **Step 2: Check the server**

Run: `npm run status`
Expected: the remote `billing-test`, authenticated, and a server version at 2.40 or later. If it is older, stop: the pinned SDK requires 2.40.

- [ ] **Step 3 (maintainer approval): Prepare the collision test**

With the maintainer's explicit OK, create in the test workspace a custom object named `invoice` (labels "Invoice" / "Invoices"), in Settings → Data model, or through the workspace's MCP connector. It proves the app installs next to an object a user built by hand.

- [ ] **Step 4: Plan the deploy**

Run: `npm run plan`
Expected: creations only (objects, fields, role, function), and zero deletions. If any deletion appears, stop and report it.

- [ ] **Step 5: Deploy**

Run: `npm run apply`
Expected: the apply succeeds. If it fails with a label clash against the hand-built `invoice` object, change the labels of `billingInvoice` to "Invoice (Billing)" / "Invoices (Billing)", run the tests, commit, and apply again.

- [ ] **Step 6: Lock the released identifiers**

Run: `npm run ids:lock && npm test`
Expected: `ids.lock.json now holds N released identifier(s).`; all tests pass.

```bash
git add ids.lock.json
git commit -m "chore: lock the identifiers released to the test workspace"
```

- [ ] **Step 7: Check what was created**

Print the expected counts:

```bash
node --input-type=module -e "import { PRESETS } from './src/presets/index.ts'; const n = (f) => PRESETS.reduce((s, p) => s + f(p), 0); console.log(JSON.stringify({ profiles: PRESETS.length, identifierTypes: n((p) => p.identifierTypes.length), taxCodes: n((p) => p.taxCodes.length), taxComponents: n((p) => p.taxCodes.reduce((s, c) => s + c.components.length, 0)) }))"
```

Then, read-only through the test workspace's MCP connector: the object list contains the fourteen `billing` objects and still the hand-built `invoice`; the counts of billing profiles, identifier types, tax codes and tax components equal the printed ones; the `ca.qc.gst-qst` tax code has two components; the `fr` profile's invoice mentions read as text.

If every count is zero, the post-install function did not run: read its logs (`./node_modules/.bin/twenty logs`), fix the cause, and run it once by hand with `./node_modules/.bin/twenty dev:function:exec` (its `--help` names the arguments for `seed-presets`).

- [ ] **Step 8: Prove the seeder respects the user**

In the test workspace: rename the tax code `gb.vat.20` to "VAT 20% (edited)", and soft-delete the profile whose preset key is `nl`. Then bump `version` in `package.json` to `0.1.1` and redeploy:

Run: `npm run plan && npm run apply`
Expected: the plan shows no object or field change. After apply, through MCP: no count grew, `gb.vat.20` is still "VAT 20% (edited)", and the `nl` profile is still deleted.

If `nl` came back, Twenty's REST API did not honour `deletedAt[is]:NOT_NULL`: find the filter it does accept, change `restSeedStore.list` and the fake in `test/helpers/fake-twenty.ts` together, and repeat this step.

```bash
git add package.json package-lock.json src test
git commit -m "chore: 0.1.1, seeder verified against the test workspace"
```

- [ ] **Step 9: Open the pull request**

```bash
git push https://github.com/exceev-technology/twenty-app-billing-documents.git feat/foundation:feat/foundation
gh pr create --repo exceev-technology/twenty-app-billing-documents --base main --head feat/foundation --title "feat: Foundation, data model and country presets" --body "Implements docs/superpowers/plans/2026-09-21-foundation.md. Accepted on the test workspace: fourteen objects installed next to a hand-built invoice object, thirteen presets seeded, a second deploy created nothing and kept a user edit and a user deletion."
```

Ask the maintainer whether to remove the throwaway `invoice` object from the test workspace.
