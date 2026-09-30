# Issue Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the objects, the Engine and the Renderer into documents a business can issue: totals kept current while lines change, PDFs previewed and issued, numbers allocated with no gap and no double, issued invoices and credit notes frozen and guarded, quotes numbered and versioned.

**Architecture:** `lifecycle/` at the repository root, beside `engine/` and `render/`, holds every rule as plain TypeScript over a `Store` interface: memory in tests, Twenty's REST API in production (`src/lib/rest-store.ts`). One HTTP route (`billing-action`, the only function that bundles pdfmake) runs the three actions a button asks for; seven database event triggers keep totals current and put back what nobody may change; five headless buttons call the route. Nothing in `lifecycle/` imports Twenty or Node.

**Tech Stack:** Node 24, TypeScript 5.9 (type stripping, no build step for tests), `node:test`, `twenty-sdk` and `twenty-client-sdk` 2.41.0 pinned, esbuild (bundle tests), pdfmake through `render/`.

**Spec:** [docs/superpowers/specs/2026-09-26-issue-path-design.md](../specs/2026-09-26-issue-path-design.md), read with [the Engine design](../specs/2026-09-22-engine-design.md), [the Rendering design](../specs/2026-09-24-rendering-design.md) and [the Foundation design](../specs/2026-09-21-foundation-design.md).

## Global Constraints

- **Node 24 through nvm.** Every command starts with `source ~/.nvm/nvm.sh && nvm use --silent`.
- **Lifecycle is pure.** Nothing in `lifecycle/` imports `twenty-sdk`, `twenty-client-sdk` or a `node:` module; a purity test (Task 3) fails otherwise. The clock, SHA-256, the Renderer and the caller come in as dependencies.
- **Code style.** Relative imports with their `.ts` (`.tsx`) extension; `erasableSyntaxOnly` and `verbatimModuleSyntax` (no enums, no parameter properties, no namespaces, `import type` for types). Test titles use the curly apostrophe (’), like the existing suites. Comments say why, as the surrounding code does.
- **Twenty's clients are built inside each run**, never at module scope: they cache their token, and a warm process would reuse another person's.
- **Identifiers.** After declaring an object, field, option or entity, run `npm run ids:sync`. Never edit or delete an entry of `src/ids.ts` by hand. Front components read `src/ids.ts`; everything else calls `id()`.
- **Twenty's CLI** is `./node_modules/.bin/twenty`, never `npx twenty` (npm has an unrelated package of that name), and always with `--remote billing-test`. The `exceev-tech` remote is never deployed to.
- **Workspaces.** Only billing-test (workspace demo-exceev, MCP server `demo-exceev-crm`) is written to. The other MCP servers are never written to.
- **Deploy** with `npm run deploy -- --remote billing-test --yes` (there is no terminal to confirm in), then commit `ids.lock.json`.
- **Git.** Commits carry the repository's git identity only: no `Co-Authored-By` trailer, and no attribution line in the pull request. One git command per shell call (a hook blocks `git remote` and `git config`). Push by URL: `git push https://github.com/exceev-technology/twenty-app-billing-documents.git feat/issue-path-part-2`. Work on `feat/issue-path-part-2` (Tasks 1–8 merged through `feat/issue-path` and `fix/numbering`); Task 1's probe branch is never pushed or merged.
- **People's words.** Everything a person reads comes from Lifecycle's packs (`lifecycle/lang/en.ts`, `fr.ts`), except the buttons' transport messages (Task 17) and the timeline types' labels, which Twenty shows untranslated.

## Decisions taken on the maintainer's behalf

The spec leaves these open or states them for another situation; the plan settles them, and the pull request lists them.

1. **Numbers follow the `fr` preset**: `F2026-0001`, `AV2026-0001`, `D2026-0001`. The spec's acceptance examples (`INV-2026-0001`, `CN-2026-0001`) are not what the preset's patterns produce.
2. **Template option values are upper case** (`CLASSIC`…`RECEIPT`): the server refuses lower-case option values. `map.ts` lower-cases them into the Renderer's keys.
3. **Two timeline types**, "issued" and "put back a change to", instead of the spec's one "Billing", so that the collapsed row already says what happened. The message shows when the row is expanded (the maintainer chose this over a note).
4. **A person set beside a company is the company's contact** on the document: their email and phone print under the company.
5. **Every identifier involved is checked against its type's format**, the seller's and the buyer's, not only the required ones.
6. **Totals use the effective currency**: the document's, else the issuer's default, else the profile's.
7. **A line's default unit (`UNIT`) counts as empty** when the catalog fills it, so a catalog item's unit replaces it.
8. **The availability expressions are written with a quoted key** (Task 17): the CLI's text rewrite would otherwise quote them twice.
9. **A numbered quote that is deleted is restored**, as a numbered invoice or credit note is: its number must not be lost.
10. **Timeline labels are English only**: Twenty does not translate an app's labels; the expanded message follows the document's language.
11. **The route refuses a call no signed-in person made** (an API key) as `NOT_ALLOWED`: without a person, Twenty's role check cannot decide who may act.
12. **The buttons carry no icon**: Twenty 2.41 ignores a command menu item's icon and shows the app's.

## Review Focus

Places where a reader should slow down; each has tests, but the reasoning is subtle.

- **A ledger row deleted before its first number still holds its unique `scopeKey`** (a soft-deleted row keeps its value). Twenty accepts an update to a deleted row and leaves it deleted, so the key is cleared on the deleted row itself (Tasks 8 and 9), and its stale `lastValue` never comes back to life; a deleted row whose scope has given out numbers is restored instead.
- **Rich text is compared by its markdown** (Task 12): Twenty derives `blocknote` on the server, so comparing the whole value would make a guard rewrite forever.
- **Totals use the effective currency** (Task 10): a document with no currency yet still totals in the one Issue will fill.
- **The catalog fill treats `UNIT` as empty** (Task 10): otherwise no catalog item's unit would ever reach a new line, whose unit defaults to `UNIT`.
- **A double-clicked Issue converges on one number and one PDF** (Task 11): the ledger is read before the document, the claim is re-checked after loading, and the second request answers `ALREADY_ISSUED`. The lockstep tests interleave two whole actions step by step.

## File Structure

```
lifecycle/lang/pack.ts, en.ts, fr.ts   Lifecycle's words, both languages behind one type        (Task 3)
lifecycle/store.ts                     the Store interface, its errors, timeline messages       (Tasks 4, 9)
lifecycle/load.ts                      a document and everything it needs, as one shape        (Task 5)
lifecycle/map.ts                       records to DocumentInput and RenderInput                 (Task 6)
lifecycle/gate.ts                      the checks before every action                           (Task 7)
lifecycle/numbering.ts                 allocation, dates, the ledger's rules                    (Tasks 8, 9)
lifecycle/totals.ts                    recomputation and the catalog fill                       (Task 10)
lifecycle/actions.ts                   preview, issue, quote PDF                                (Task 11)
lifecycle/guards.ts                    status rules, reverts, restores                          (Task 12)
src/schema/app-only.ts                 the fields only the app sets                             (Task 2)
src/schema/fields.ts, options.ts, documents.ts, src/objects/*, src/roles/billing.role.ts        (Task 2)
src/timeline-activity-types/billing-issued.ts, billing-correction.ts                           (Task 13)
src/front-components/timeline-message.ts, billing-timeline-message.tsx                         (Task 13)
src/lib/rest-store.ts, twenty-stores.ts   the Store over Twenty's REST API                      (Task 14)
src/lib/trigger.ts, src/logic-functions/guard-*.ts   the seven triggers                         (Task 15)
src/logic-functions/billing-action.ts  the route                                                (Task 16)
src/front-components/action-feedback.ts, action-command.tsx, five button .tsx                  (Task 17)
src/command-menu-items/*.command-menu-item.ts   the five buttons                               (Task 17)
test/lifecycle/*.test.ts, test/lifecycle/helpers/memory-store.ts, fixtures.ts, triggers.ts
test/issue-fields.test.ts, timeline.test.ts, triggers.test.ts, route.test.ts, buttons.test.ts
test/helpers/front-component-build.ts, logic-function-build.ts
README.md                              issuing, and the destroy warning                         (Task 18)
```

Tasks run in order. Task 1 decides details of Tasks 13, 14 and 16 before they are written; Task 2's deploy checks that Twenty's own forms still create documents once fields are app-only.

---

### Task 1: What the spike could not check, checked first

Two things the spec leaves to be verified on the live server come first, on a throwaway branch: a real signed-in person acting through the app (acceptance step 1), and how Twenty's timeline shows an app activity's text. Both change code later in this plan, so they are settled before it is written. The probe is deployed to billing-test, used, then removed; its branch is never pushed or merged.

What the server source says, to be confirmed:

- A route called by a signed-in person runs with `TWENTY_APP_ACCESS_TOKEN` set to a token for the app and that person. A write with it (`RestApiClient({ runAs: 'user' })`) is checked against both the person's role and the app's, and a refusal is HTTP 400 with `code: 'PERMISSION_DENIED'` (never 403), or 404 when the record is hidden from them.
- An app's timeline row reads "<author> <type label> <record>" on one line. The activity's text shows only in the front component the type names, when the person expands the row.

This task needs the maintainer twice: to add a second workspace member with a role that can read invoices but not edit them, and to sign in as that member in the in-app browser.

**Files (on `spike/issue-path-probe` only):**
- Create: `src/logic-functions/probe-caller-write.ts`, `src/front-components/probe-button.tsx`, `src/front-components/probe-message.tsx`, `src/command-menu-items/probe.command-menu-item.ts`, `src/timeline-activity-types/probe.ts`
- Modify: `src/roles/billing.role.ts` (timeline activities, as Task 2 will), `package.json`, `package-lock.json`, `tsconfig.json` (React, as Task 13 will), `src/ids.ts`

- [ ] **Step 1: The probe branch**

```bash
git checkout -b spike/issue-path-probe
```

- [ ] **Step 2: React for the probe's components, as Task 13 will add it**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm install --save-dev --save-exact @types/react@19.3.0 react@19.3.0 react-dom@19.3.0
```

In `tsconfig.json`, add `"jsx": "react-jsx"` to `compilerOptions`, and `"src/**/*.tsx"` to `include`.

- [ ] **Step 3: Let the app write timeline activities**

In `src/roles/billing.role.ts`, add to `objectPermissions`:

```ts
    {
      objectUniversalIdentifier: STANDARD_OBJECT.timelineActivity.universalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    },
```

- [ ] **Step 4: The probe route**

`src/logic-functions/probe-caller-write.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { Response, type LogicFunctionExecutionContext, type RoutePayload } from 'twenty-sdk/logic-function';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { id } from '../lib/id.ts';

type Failure = { status?: number; body?: unknown; message?: string };
const failure = (error: unknown) => {
  const { status, body, message } = error as Failure;
  return { ok: false, status, body, message };
};

/** Probe only: who called, a write with the caller's token, and a timeline activity written as the app. */
export default defineLogicFunction({
  universalIdentifier: id('logicFunction.probeCallerWrite'),
  name: 'probe-caller-write',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: { path: '/probe/caller-write', httpMethod: 'POST', isAuthRequired: true },
  handler: async (event: RoutePayload, context: LogicFunctionExecutionContext) => {
    const body = (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) as { recordId: string };
    const who = { userWorkspaceId: event.userWorkspaceId, workspaceMemberId: context.workspaceMemberId };
    const app = new RestApiClient({ runAs: 'application' });
    const read = (await app.get(`/rest/billingInvoices/${body.recordId}`)) as { data: { billingInvoice: { subject: string | null } } };
    let write: unknown;
    try {
      await new RestApiClient({ runAs: 'user' }).patch(`/rest/billingInvoices/${body.recordId}`, { subject: read.data.billingInvoice.subject });
      write = { ok: true };
    } catch (error) {
      write = failure(error);
    }
    let timeline: unknown;
    try {
      const metadata = new MetadataApiClient({ runAs: 'application' });
      const result = (await metadata.query({ timelineActivityTypes: { id: true, universalIdentifier: true, isActive: true } })) as {
        timelineActivityTypes: { id: string; universalIdentifier: string; isActive: boolean | null }[];
      };
      const type = result.timelineActivityTypes.find((t) => t.universalIdentifier === id('timelineActivityType.probe'));
      await app.post('/rest/timelineActivities', {
        timelineActivityTypeId: type?.id,
        targetBillingInvoiceId: body.recordId,
        properties: { message: `Probe by ${who.workspaceMemberId}: a sentence long enough to wrap when the row is expanded, to see how the timeline lays it out.` },
      });
      timeline = { ok: true, type };
    } catch (error) {
      timeline = failure(error);
    }
    return new Response({ who, write, timeline }, { status: 200 });
  },
});
```

- [ ] **Step 5: The probe's button, timeline type and message component**

`src/front-components/probe-button.tsx`:

```tsx
import { defineFrontComponent } from 'twenty-sdk/define';
import { Command, enqueueSnackbar, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { IDS } from '../ids.ts';

const ProbeButton = () => {
  const [recordId] = useSelectedRecordIds();
  const execute = async () => {
    try {
      const answer = await new RestApiClient().post('/s/probe/caller-write', { recordId });
      await enqueueSnackbar({ message: 'Probe answered', detailedMessage: JSON.stringify(answer), variant: 'info' });
    } catch (error) {
      await enqueueSnackbar({ message: 'Probe failed', detailedMessage: JSON.stringify(error), variant: 'error' });
    }
  };
  return <Command execute={execute} />;
};

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.probeButton'],
  name: 'probe-button',
  isHeadless: true,
  component: ProbeButton,
});
```

`src/front-components/probe-message.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useTimelineActivityId } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { IDS } from '../ids.ts';

const ProbeMessage = () => {
  const activityId = useTimelineActivityId();
  const [text, setText] = useState('…');
  useEffect(() => {
    if (!activityId) return;
    new RestApiClient().get(`/rest/timelineActivities/${activityId}`).then(
      (answer) => setText(JSON.stringify((answer as { data?: { timelineActivity?: { properties?: unknown } } }).data?.timelineActivity?.properties)),
      (error) => setText(`failed: ${JSON.stringify(error)}`),
    );
  }, [activityId]);
  return <p style={{ margin: 0, whiteSpace: 'normal' }}>{text}</p>;
};

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.probeMessage'],
  name: 'probe-message',
  component: ProbeMessage,
});
```

`src/timeline-activity-types/probe.ts`:

```ts
import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';

export default defineTimelineActivityType({
  universalIdentifier: id('timelineActivityType.probe'),
  name: 'billingProbe',
  label: 'probed',
  icon: 'IconFlask',
  frontComponentUniversalIdentifier: id('frontComponent.probeMessage'),
});
```

`src/command-menu-items/probe.command-menu-item.ts`:

```ts
import { defineCommandMenuItem } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.probe'),
  label: 'Probe caller write',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingInvoice'),
  frontComponentUniversalIdentifier: id('frontComponent.probeButton'),
  'conditionalAvailabilityExpression': 'numberOfSelectedRecords == 1',
});
```

The front components' keys are requested by the `.ts` files (`id('frontComponent.probeButton')`, `id('frontComponent.probeMessage')`), so `ids:sync` registers them.

- [ ] **Step 6: Register and deploy the probe**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run ids:sync && npm run deploy -- --remote billing-test --yes`
Expected: 5 new identifiers; the deploy adds 1 logic function, 2 front components, 1 command menu item, 1 timeline activity type and the role's permission, and destroys nothing. Do not commit anything on this branch.

- [ ] **Step 7: Ask the maintainer for a restricted member**

Ask the maintainer to add, on billing-test, a role "Billing viewer" that reads the billing objects and cannot edit them, and to give it to a second member they can sign in as. Wait for it. Meanwhile, create a draft invoice through the MCP server (subject "Probe 4a").

- [ ] **Step 8: Probe as the maintainer, then as the restricted member**

In the in-app browser, as the maintainer, open "Probe 4a" and run **Probe caller write**; read the snackbar's details. Then open the invoice's timeline and expand the "probed" row. Then the maintainer signs in as the restricted member and runs it again.

Record, for the pull request and the memory:

| Question | Expected | Seen |
|---|---|---|
| `who` for the maintainer | both ids set | |
| the maintainer's write | `{ ok: true }` | |
| the restricted member's write | `status: 400`, body with `code: 'PERMISSION_DENIED'` | |
| the timeline row, collapsed | "Twenty probed Probe 4a" (or with the app's name) | |
| the row, expanded | the component shows `{"message":"Probe by …"}`, wrapped | |
| the timeline write | `{ ok: true }` with the type's id | |

- [ ] **Step 9: Decide**

- The refusal is 400 `PERMISSION_DENIED`, as Task 14's `translate` expects: nothing to change. Any other shape (a 403, another code, a message only): change `translate` and its test in Task 14 to recognise it before Task 14 is carried out, and note it in the decisions.
- The restricted member's write succeeds: stop and tell the maintainer. The design's "who may act" (spec §6) does not hold, and the route needs another check before anything else is built.
- The row cannot be expanded, or the expanded component does not show the text: stop and ask the maintainer, since they chose the expandable row. The spec's fallback is a note on the record, which gives the app's role create rights on notes.
- The author reads other than "Twenty" (the app's name, for instance): update the examples in Task 13's comments and Task 18's README text to match.

- [ ] **Step 10: Remove the probe**

Set the probe's uncommitted changes aside, then go back to the plan's branch:

```bash
git stash push --include-untracked --message "issue-path probe"
```

```bash
git checkout feat/issue-path
```

Run: `source ~/.nvm/nvm.sh && nvm use --silent && ./node_modules/.bin/twenty --remote billing-test plan`
Expected: the only removals are the probe's five entities and the role's timeline permission. Anything else: stop, and read the plan with the maintainer.

Run: `source ~/.nvm/nvm.sh && nvm use --silent && ./node_modules/.bin/twenty --remote billing-test apply --force`, then the same `plan` again.
Expected: the second plan has no changes.

```bash
git branch -D spike/issue-path-probe
```

```bash
git stash drop
```

Delete the "Probe 4a" invoice through the MCP server (a soft delete). Add what Step 8 showed to the memory `lifecycle-spike-findings`.

---

### Task 2: The data model

Spec §3: four new fields, and the fields only the app sets made app-only, so that the server refuses them to people and API keys. Nothing is removed or renamed. The app's role gains read and write on timeline activities, for the messages of Task 13.

What Twenty does with these settings, measured by the spike on billing-test:

- `writability: MetadataWritability.APPLICATION` on a field: the server refuses it to users and API keys ("not writable through the API") and accepts it from the app, including a token Twenty mints for the app and a person.
- `isUnique: true` on a TEXT field: a unique index. Blank values do not collide; a soft-deleted record keeps its value; a duplicate is HTTP 400 "A duplicate entry was detected".
- SELECT option values must be upper case.

**Files:**
- Create: `src/schema/app-only.ts`
- Modify: `src/schema/fields.ts` (`unique`), `src/schema/options.ts` (`TEMPLATES`), `src/schema/documents.ts` (`numberKey`), `src/objects/billing-invoice.object.ts`, `src/objects/billing-credit-note.object.ts`, `src/objects/billing-quote.object.ts`, `src/objects/billing-invoice-line.object.ts`, `src/objects/billing-credit-note-line.object.ts`, `src/objects/billing-quote-line.object.ts`, `src/objects/billing-sequence.object.ts`, `src/objects/billing-issuer.object.ts`, `src/roles/billing.role.ts`, `src/ids.ts` (by `npm run ids:sync`)
- Test: `test/issue-fields.test.ts`

**Interfaces:**
- Produces:
  - from `src/schema/app-only.ts`: `APP_ONLY_FIELDS: { billingQuote; billingInvoice; billingCreditNote; billingQuoteLine; billingInvoiceLine; billingCreditNoteLine; billingSequence }` (field names per object), `markAppOnly(object: keyof typeof APP_ONLY_FIELDS, fields: ObjectField[]): ObjectField[]`
  - from `src/schema/fields.ts`: `unique(field: ObjectField): ObjectField`
  - from `src/schema/options.ts`: `TEMPLATES: readonly Option[]`
  - fields `numberKey` (the three documents), `scopeKey` (billingSequence), `version` (billingQuote), `template` (billingIssuer)

- [ ] **Step 1: Write the failing test**

`test/issue-fields.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetadataWritability, STANDARD_OBJECT } from 'twenty-sdk/define';
import role from '../src/roles/billing.role.ts';
import { APP_ONLY_FIELDS } from '../src/schema/app-only.ts';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const byName = new Map(objects.map(({ result }) => [result.config.nameSingular, result.config]));
const field = (object: string, name: string) => byName.get(object)?.fields.find((f: any) => f.name === name);
const DOCUMENTS = ['billingQuote', 'billingInvoice', 'billingCreditNote'];
const APPLICATION = MetadataWritability.APPLICATION;

test('every object still validates', () => {
  for (const { file, result } of objects) assert.equal(result.success, true, `${file}: ${result.errors.join('; ')}`);
});

test('a document’s number key is unique text that only the app sets', () => {
  for (const doc of DOCUMENTS) {
    const key = field(doc, 'numberKey');
    assert.deepEqual([key?.type, key?.isUnique, key?.writability], ['TEXT', true, APPLICATION], doc);
  }
});

test('a ledger row’s scope key is unique and the app’s; the rest of the row stays editable', () => {
  const key = field('billingSequence', 'scopeKey');
  assert.deepEqual([key?.type, key?.isUnique, key?.writability], ['TEXT', true, APPLICATION]);
  for (const name of ['issuer', 'documentType', 'periodKey', 'lastValue']) assert.equal(field('billingSequence', name)?.writability, undefined, name);
  assert.doesNotMatch(byName.get('billingSequence')?.description ?? '', /never edit/i);
});

test('a quote counts its PDF versions in a whole number only the app sets', () => {
  const version = field('billingQuote', 'version');
  assert.deepEqual([version?.type, version?.universalSettings?.dataType, version?.writability], ['NUMBER', 'int', APPLICATION]);
});

test('an issuer picks one of the five templates, classic by default', () => {
  const template = field('billingIssuer', 'template');
  assert.equal(template?.type, 'SELECT');
  assert.deepEqual(template?.options.map((o: any) => o.value), ['CLASSIC', 'MODERN', 'COMPACT', 'LETTERHEAD', 'RECEIPT']);
  assert.equal(template?.defaultValue, "'CLASSIC'");
});

test('exactly the fields of spec §3 are app-only, and status is not one of them', () => {
  const expected = Object.entries(APP_ONLY_FIELDS).flatMap(([object, names]) => names.map((name) => `${object}.${name}`)).sort();
  const actual = [...byName.values()]
    .flatMap((config: any) => config.fields.filter((f: any) => f.writability === APPLICATION).map((f: any) => `${config.nameSingular}.${f.name}`))
    .sort();
  assert.deepEqual(actual, expected);
  for (const doc of DOCUMENTS) {
    for (const name of ['number', 'numberKey', 'snapshot', 'documentHash', 'pdf', 'subtotal', 'discountTotal', 'taxTotal', 'total']) {
      assert.ok(expected.includes(`${doc}.${name}`), `${doc}.${name}`);
    }
    assert.equal(field(doc, 'status')?.writability, undefined, doc);
  }
  assert.ok(expected.includes('billingInvoice.issuedAt') && expected.includes('billingCreditNote.issuedAt') && expected.includes('billingQuote.version'));
  for (const line of ['billingQuoteLine', 'billingInvoiceLine', 'billingCreditNoteLine']) assert.ok(expected.includes(`${line}.lineTotal`), line);
});

test('the app writes timeline messages, and never deletes them', () => {
  const permission = role.config.objectPermissions?.find((p) => p.objectUniversalIdentifier === STANDARD_OBJECT.timelineActivity.universalIdentifier);
  assert.deepEqual(
    [permission?.canReadObjectRecords, permission?.canUpdateObjectRecords, permission?.canSoftDeleteObjectRecords, permission?.canDestroyObjectRecords],
    [true, true, false, false],
  );
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/issue-fields.test.ts`
Expected: FAIL: `Cannot find module '.../src/schema/app-only.ts'`.

- [ ] **Step 3: A builder for unique fields**

In `src/schema/fields.ts`, after `files`:

```ts
/** A field no two records share. Blank values do not collide; a soft-deleted record keeps its value. */
export const unique = (f: ObjectField): ObjectField => ({ ...f, isUnique: true }) as unknown as ObjectField;
```

- [ ] **Step 4: The templates**

In `src/schema/options.ts`, after `QR_MODES`:

```ts
/** The Renderer's five layouts (Rendering §12), read in lower case: the server only takes upper-case values. */
export const TEMPLATES: readonly Option[] = [
  ['CLASSIC', 'Classic', 'blue'],
  ['MODERN', 'Modern', 'purple'],
  ['COMPACT', 'Compact', 'gray'],
  ['LETTERHEAD', 'Letterhead', 'orange'],
  ['RECEIPT', 'Receipt', 'green'],
];
```

- [ ] **Step 5: The app-only list**

`src/schema/app-only.ts`:

```ts
import { MetadataWritability } from 'twenty-sdk/define';
import type { ObjectField } from './fields.ts';

const DOCUMENT = ['number', 'numberKey', 'snapshot', 'documentHash', 'pdf', 'subtotal', 'discountTotal', 'taxTotal', 'total'] as const;

/**
 * The fields only the app sets (spec §3). The server refuses them to people and
 * API keys and accepts them from the app, a token Twenty mints for the app and
 * a person included. Lifecycle's tests read this list to make the memory store
 * refuse the same writes.
 */
export const APP_ONLY_FIELDS = {
  billingQuote: [...DOCUMENT, 'version'],
  billingInvoice: [...DOCUMENT, 'issuedAt'],
  billingCreditNote: [...DOCUMENT, 'issuedAt'],
  billingQuoteLine: ['lineTotal'],
  billingInvoiceLine: ['lineTotal'],
  billingCreditNoteLine: ['lineTotal'],
  billingSequence: ['scopeKey'],
} as const satisfies Record<string, readonly string[]>;

/** The object's fields, its app-only ones marked so. */
export function markAppOnly(object: keyof typeof APP_ONLY_FIELDS, fields: ObjectField[]): ObjectField[] {
  const appOnly: readonly string[] = APP_ONLY_FIELDS[object];
  return fields.map((f) =>
    appOnly.includes((f as unknown as { name: string }).name) ? ({ ...f, writability: MetadataWritability.APPLICATION } as unknown as ObjectField) : f,
  );
}
```

- [ ] **Step 6: The number key**

In `src/schema/documents.ts`, import `unique` with the other builders, and add after the `number` field:

```ts
    unique(text(O, 'numberKey', { label: 'Number key', description: 'Issuer and number, so that no number is held twice. Set by the app.', icon: 'IconKey' })),
```

- [ ] **Step 7: Mark the objects**

In each of `billing-invoice.object.ts`, `billing-credit-note.object.ts`, `billing-quote.object.ts`, `billing-invoice-line.object.ts`, `billing-credit-note-line.object.ts` and `billing-quote-line.object.ts`, import `markAppOnly` from `../schema/app-only.ts` and wrap the object's fields: `fields: markAppOnly(O, [ …the existing entries… ])` for the documents, `fields: markAppOnly(O, lineFields({ … }))` for the lines.

In `billing-quote.object.ts`, import `integer`, and add after `acceptedAt`:

```ts
    integer(O, 'version', { label: 'PDF version', description: 'Empty before the first PDF, then 1, 2, 3.', icon: 'IconVersions' }),
```

In `billing-sequence.object.ts`, import `markAppOnly` and `unique`, replace the description, and wrap the fields with the scope key added:

```ts
  description: 'The last number given out, per issuer, document type and period. Create one to continue from an older system’s numbers; once a number is given out, it only rises.',
```

```ts
  fields: markAppOnly(O, [
    text(O, 'periodKey', { label: 'Period', description: 'ALL, a year (2026) or a month (2026-09), per the profile’s numbering reset.', icon: 'IconCalendar' }),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'sequences', onDelete: OnDeleteAction.SET_NULL }),
    select(O, 'documentType', { label: 'Document type', icon: 'IconFiles' }, DOCUMENT_TYPES, 'INVOICE'),
    integer(O, 'lastValue', { label: 'Last number', icon: 'IconHash' }),
    unique(text(O, 'scopeKey', { label: 'Scope key', description: 'Issuer, document type and period, so that a scope has one row. Set by the app.', icon: 'IconKey' })),
  ]),
```

In `billing-issuer.object.ts`, import `select` and `TEMPLATES` (from `../schema/options.ts`), and add after `accentColor`:

```ts
    select(O, 'template', { label: 'Template', description: 'The layout of the PDFs.', icon: 'IconLayout' }, TEMPLATES, 'CLASSIC'),
```

- [ ] **Step 8: Timeline activities for the app's role**

In `src/roles/billing.role.ts`, add to `objectPermissions`, after the standard targets:

```ts
    {
      // The messages the app leaves on a record's timeline, written as the app so their author reads as the app.
      objectUniversalIdentifier: STANDARD_OBJECT.timelineActivity.universalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    },
```

and change the description to: `'Reads and writes the app’s own records, reads companies, people and opportunities, writes timeline messages, and uploads PDFs. Never destroys a record.'`

- [ ] **Step 9: Register the identifiers**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run ids:sync`
Expected: `ids:sync registered 11 new identifier(s).`: the fields `numberKey` (three), `scopeKey`, `version`, `template`, and the five template options.

- [ ] **Step 10: Run the whole suite and the typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm test && npm run typecheck`
Expected: PASS, the existing schema, role and option tests included; a clean typecheck.

- [ ] **Step 11: Commit**

```bash
git add src/schema src/objects src/roles/billing.role.ts src/ids.ts test/issue-fields.test.ts
```

```bash
git commit -m "feat: number and scope keys, quote versions, issuer templates, and the fields only the app sets"
```

- [ ] **Step 12: Deploy, and check that Twenty's own forms still work**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run deploy -- --remote billing-test --yes`
Expected: 6 fields and 5 options added; 29 existing fields made app-only (8 on each document, `issuedAt` on two, `lineTotal` on three); the sequence's description and the role changed; nothing destroyed; the plan empty after apply. Commit the lock:

```bash
git add ids.lock.json
```

```bash
git commit -m "chore: lock the data model's new identifiers"
```

In the in-app browser, as the maintainer: create an invoice from the Invoices list, type a subject, add a line with a description. Both saves succeed. Then try to type in the invoice's Number field: Twenty refuses it or shows it read-only.

If creating a record fails because the form sends an app-only field (a currency total, the PDF field), stop: report what the form sent (the browser's network panel) to the maintainer before anything else is built.

---

### Task 3: Lifecycle's words, and the rules of its folder

> **French typography.** Every French message puts a non-breaking space (U+00A0, written `\u00a0` in the source) before `:` `;` `?` `!` and inside `« »`, as `render/lang/fr.ts` does, and a pack test enforces it. The code blocks below predate that rule: where they show a plain space in French prose, the committed `lifecycle/lang/fr.ts` is the reference.

Lifecycle words everything a person reads, in English and French (spec §10): its own problems, the Renderer's problems (Rendering does not word them), the unit names, the field and status names a guard mentions, and every message. This task also creates the folder's purity rules, so every later file is checked from its first line.

**Files:**
- Modify: `tsconfig.json`
- Create: `lifecycle/lang/pack.ts`, `lifecycle/lang/en.ts`, `lifecycle/lang/fr.ts`
- Test: `test/lifecycle/packs.test.ts`, `test/lifecycle/purity.test.ts`

**Interfaces:**
- Consumes: `Problem` from `engine/index.ts`; `describeProblem`, `DocumentKind`, `Language` from `render/lang/pack.ts`; `RenderProblem`, `RenderProblemCode` from `render/types.ts`.
- Produces, from `lifecycle/lang/pack.ts`:
  - `type LifecycleProblemCode` (the eighteen codes of spec §10)
  - `type LifecycleProblem = { code: LifecycleProblemCode; field?: string; value?: string }`
  - `class LifecycleError extends Error { readonly problems: readonly LifecycleProblem[] }`
  - `type AnyProblem = ({ source: 'lifecycle' } & LifecycleProblem) | { source: 'engine'; problem: Problem; field?: string } | { source: 'render'; problem: RenderProblem }`
  - `type WordedProblem = { code: string; message: string; field?: string }`
  - `type UnitKey`, `type FieldKey`, `type StatusKey`, `type StatusRule = 'ISSUE' | 'DRAFT' | 'CANCEL' | 'INVOICED'`
  - `type LifecyclePack` (below), `PACKS: Record<Language, LifecyclePack>`
  - `packFor(locale: string | null | undefined): LifecyclePack` (French for any `fr` locale, English otherwise)
  - `describe(problem: AnyProblem, language: Language, lineNumbers?: ReadonlyMap<string, number>): WordedProblem`
  - `describeAll(problems: readonly AnyProblem[], language: Language, lineNumbers?: ReadonlyMap<string, number>): WordedProblem[]`
  - `re-export type { DocumentKind, Language }`

- [ ] **Step 1: Add `lifecycle/` to the typecheck**

In `tsconfig.json`, change the `include` line to:

```json
  "include": ["src/**/*.ts", "engine/**/*.ts", "render/**/*.ts", "lifecycle/**/*.ts", "test/**/*.ts"]
```

- [ ] **Step 2: Write the failing purity test**

`test/lifecycle/purity.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const LIFECYCLE = fileURLToPath(new URL('../../lifecycle/', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

// Import and export statements over as many lines as they take, side-effect imports, dynamic imports.
const FROM = /^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT = /^\s*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;

const specifiers = (source: string): string[] =>
  [...source.matchAll(FROM), ...source.matchAll(SIDE_EFFECT), ...source.matchAll(DYNAMIC)].map((match) => match[1]!);

test('there is lifecycle code to check', () => {
  assert.ok(sources(LIFECYCLE).length > 0);
});

test('lifecycle imports its own files, the Engine and the Renderer, and nothing from Twenty or Node', () => {
  for (const file of sources(LIFECYCLE)) {
    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      const local = specifier.startsWith('./') || specifier.startsWith('../');
      assert.ok(local, `${file} imports ${specifier}`);
      const outside = join(file, '..', specifier);
      assert.ok(
        outside.includes('/lifecycle/') || outside.includes('/engine/') || outside.includes('/render/'),
        `${file} reaches ${specifier}, outside lifecycle, engine and render`,
      );
    }
  }
});

test('only the actions import the Renderer’s entry point, which bundles pdfmake', () => {
  for (const file of sources(LIFECYCLE)) {
    if (file.endsWith('/lifecycle/actions.ts')) continue;
    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      const target = join(file, '..', specifier);
      const allowed = !target.includes('/render/') || target.endsWith('/render/types.ts') || target.endsWith('/render/lang/pack.ts');
      assert.ok(allowed, `${file} imports ${specifier}: only render/types.ts and render/lang/pack.ts are allowed outside actions.ts`);
    }
  }
});

test('lifecycle never reads the clock or draws a random number: both are passed in', () => {
  for (const file of sources(LIFECYCLE)) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bDate\.now\b|new Date\(\s*\)|Math\.random\b|crypto\./, `${file} reads the clock, randomness or crypto`);
  }
});
```

- [ ] **Step 3: Write the failing packs test**

`test/lifecycle/packs.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, describe, describeAll, packFor, type LifecyclePack } from '../../lifecycle/lang/pack.ts';

const LIFECYCLE_CODES = [
  'NOT_ALLOWED', 'WRONG_STATUS', 'ALREADY_ISSUED', 'MISSING_ISSUER', 'MISSING_PROFILE', 'MISSING_BUYER',
  'MISSING_CURRENCY', 'MISSING_IDENTIFIER', 'INVALID_IDENTIFIER', 'IDENTIFIER_OWNER', 'MISSING_INVOICE',
  'INVOICE_NOT_ISSUED', 'INVOICE_MISMATCH', 'DATE_IN_FUTURE', 'DATE_BEFORE_LAST', 'DUE_BEFORE_ISSUE',
  'CLOCK_SKEW', 'LEDGER_BEHIND',
];
const RENDER_CODES = [
  'UNSUPPORTED_SCRIPT', 'UNSUPPORTED_IMAGE', 'UNKNOWN_TEMPLATE', 'UNKNOWN_LANGUAGE', 'QR_PAYLOAD_TOO_LONG',
  'MISSING_TAX_NAME', 'INVALID_LOCALE', 'INVALID_DATE', 'INVALID_CURRENCY', 'QR_BASE_URL_MISSING', 'QR_PAYLOAD_EMPTY',
];
const UNITS = ['UNIT', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR', 'KG', 'G', 'TONNE', 'M', 'KM', 'M2', 'M3', 'LITRE', 'KWH', 'FLAT_FEE', 'PACKAGE'];
const DETAILS = { field: 'seller', value: 'SIREN' };

const filled = (text: string, where: string) => assert.ok(text.trim().length > 0, `${where} is empty`);

function everyMessage(pack: LifecyclePack): string[] {
  const m = pack.messages;
  return [
    m.previewReady, m.issued('INVOICE', 'F2026-0001'), m.issued('CREDIT_NOTE', 'AV2026-0001'), m.quotePdf('D2026-0001', 2), m.unexpected('7f3a09'),
    ...(['INVOICE', 'CREDIT_NOTE'] as const).flatMap((kind) => [
      m.fieldsPutBack(kind, ['Subject']), m.fieldsPutBack(kind, ['Subject', 'Notes', 'Due date']),
      m.lineChangePutBack(kind), m.lineAddedRemoved(kind), m.lineDeletedRestored(kind), m.lineMoveReverted(kind),
      m.documentRestored(kind, 'F2026-0001'), m.createdAsDraft(kind, 'Paid'),
      m.statusPutBack('ISSUE', kind, 'Draft'), m.statusPutBack('DRAFT', kind, 'Issued'), m.statusPutBack('CANCEL', kind, 'Paid'),
    ]),
    m.documentRestored('QUOTE', 'D2026-0001'), m.createdAsDraft('QUOTE', 'Sent'), m.statusPutBack('INVOICED', 'QUOTE', 'Accepted'),
    m.ledgerDuplicateRemoved, m.ledgerChangePutBack(['Last number']), m.ledgerRestored,
  ];
}

test('both packs word every Lifecycle problem, and every Rendering problem', () => {
  for (const pack of [PACKS.EN, PACKS.FR]) {
    assert.deepEqual(Object.keys(pack.problems).sort(), [...LIFECYCLE_CODES].sort(), pack.code);
    assert.deepEqual(Object.keys(pack.renderProblems).sort(), [...RENDER_CODES].sort(), pack.code);
    for (const code of LIFECYCLE_CODES) filled(pack.problems[code as 'NOT_ALLOWED'](DETAILS), `${pack.code} ${code}`);
    for (const code of RENDER_CODES) filled(pack.renderProblems[code as 'UNSUPPORTED_SCRIPT'](DETAILS), `${pack.code} ${code}`);
  }
});

test('both packs name every unit, field, status and document kind, and carry every message', () => {
  const [en, fr] = [PACKS.EN, PACKS.FR];
  assert.deepEqual(Object.keys(en.units).sort(), [...UNITS].sort());
  for (const group of ['units', 'fields', 'statuses', 'kinds'] as const) {
    assert.deepEqual(Object.keys(en[group]).sort(), Object.keys(fr[group]).sort(), group);
    for (const pack of [en, fr]) for (const [key, value] of Object.entries(pack[group])) filled(value, `${pack.code} ${group}.${key}`);
  }
  for (const pack of [en, fr]) everyMessage(pack).forEach((message, index) => filled(message, `${pack.code} message ${index}`));
});

test('the two packs are different languages', () => {
  assert.equal(PACKS.EN.units.DAY, 'day');
  assert.equal(PACKS.FR.units.DAY, 'jour');
  assert.notEqual(PACKS.EN.messages.previewReady, PACKS.FR.messages.previewReady);
});

test('a French locale gets French, any other locale English', () => {
  for (const locale of ['fr', 'fr-FR', 'fr-CA', 'fr_FR', 'FR-be']) assert.equal(packFor(locale).code, 'FR', locale);
  for (const locale of ['en', 'en-US', 'de-DE', 'fra', '', null, undefined]) assert.equal(packFor(locale).code, 'EN', String(locale));
});

test('a guard’s message names the fields it put back and says how to correct', () => {
  assert.equal(
    PACKS.EN.messages.fieldsPutBack('INVOICE', ['Subject']),
    'This invoice is issued: the change to Subject was put back. Correct it with a credit note.',
  );
  assert.match(PACKS.EN.messages.fieldsPutBack('INVOICE', ['Subject', 'Notes', 'Due date']), /the changes to Subject, Notes and Due date were put back/);
  assert.match(PACKS.FR.messages.fieldsPutBack('INVOICE', ['Objet']), /Cette facture est émise/);
});

test('a problem of each origin is worded, with the field it names', () => {
  assert.deepEqual(describe({ source: 'lifecycle', code: 'MISSING_IDENTIFIER', field: 'seller', value: 'SIREN' }, 'EN'), {
    code: 'MISSING_IDENTIFIER', message: 'The seller has no SIREN.', field: 'seller',
  });
  const engine = describe({ source: 'engine', problem: { code: 'INVALID_PATTERN', value: '{SEQ}' }, field: 'invoiceNumberPattern' }, 'FR');
  assert.equal(engine.code, 'INVALID_PATTERN');
  assert.equal(engine.field, 'invoiceNumberPattern');
  assert.match(engine.message, /format de numérotation/);
  const render = describe({ source: 'render', problem: { code: 'UNSUPPORTED_IMAGE', field: 'brand.logo.bytes', value: 'image/png' } }, 'EN');
  assert.equal(render.code, 'UNSUPPORTED_IMAGE');
  assert.match(render.message, /logo/i);
});

test('an engine problem names its line by position, not by record id', () => {
  const worded = describe({ source: 'engine', problem: { code: 'MISSING_TAX_CODE', line: 'a1b2-line-id' } }, 'EN', new Map([['a1b2-line-id', 3]]));
  assert.match(worded.message, /line 3/);
  assert.doesNotMatch(worded.message, /a1b2-line-id/);
});

test('a status in a problem is shown by its name in the language', () => {
  assert.match(describe({ source: 'lifecycle', code: 'WRONG_STATUS', value: 'ISSUED' }, 'EN').message, /Issued/);
  assert.match(describe({ source: 'lifecycle', code: 'WRONG_STATUS', value: 'ISSUED' }, 'FR').message, /Émise/);
});

test('describeAll keeps the order of the problems', () => {
  const worded = describeAll([
    { source: 'lifecycle', code: 'MISSING_ISSUER' },
    { source: 'lifecycle', code: 'MISSING_BUYER' },
  ], 'EN');
  assert.deepEqual(worded.map((problem) => problem.code), ['MISSING_ISSUER', 'MISSING_BUYER']);
});
```

- [ ] **Step 4: Run both tests to see them fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/packs.test.ts test/lifecycle/purity.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/lang/pack.ts'`, and the purity test fails on `there is lifecycle code to check` (the folder does not exist yet).

- [ ] **Step 5: Write `lifecycle/lang/pack.ts`**

```ts
import type { Problem } from '../../engine/index.ts';
import { describeProblem, type DocumentKind, type Language } from '../../render/lang/pack.ts';
import type { RenderProblem, RenderProblemCode } from '../../render/types.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

export type { DocumentKind, Language };

export type LifecycleProblemCode =
  | 'NOT_ALLOWED' | 'WRONG_STATUS' | 'ALREADY_ISSUED'
  | 'MISSING_ISSUER' | 'MISSING_PROFILE' | 'MISSING_BUYER' | 'MISSING_CURRENCY'
  | 'MISSING_IDENTIFIER' | 'INVALID_IDENTIFIER' | 'IDENTIFIER_OWNER'
  | 'MISSING_INVOICE' | 'INVOICE_NOT_ISSUED' | 'INVOICE_MISMATCH'
  | 'DATE_IN_FUTURE' | 'DATE_BEFORE_LAST' | 'DUE_BEFORE_ISSUE' | 'CLOCK_SKEW' | 'LEDGER_BEHIND';

/** A problem is data: `field` names what to fix, `value` what was found. The packs word it. */
export type LifecycleProblem = { code: LifecycleProblemCode; field?: string; value?: string };

/** A refusal found part-way through, such as a sequence too far behind: it carries its problems to the action. */
export class LifecycleError extends Error {
  readonly problems: readonly LifecycleProblem[];

  constructor(problems: readonly LifecycleProblem[]) {
    super(`Lifecycle refused: ${problems.map((problem) => problem.code).join(', ')}`);
    this.name = 'LifecycleError';
    this.problems = problems;
  }
}

/** Any problem an action reports, tagged with who found it. */
export type AnyProblem =
  | ({ source: 'lifecycle' } & LifecycleProblem)
  | { source: 'engine'; problem: Problem; field?: string }
  | { source: 'render'; problem: RenderProblem };

/** What a button shows: the code, the sentence, and the field to fix when there is one. */
export type WordedProblem = { code: string; message: string; field?: string };

export type UnitKey =
  | 'UNIT' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'KG' | 'G' | 'TONNE'
  | 'M' | 'KM' | 'M2' | 'M3' | 'LITRE' | 'KWH' | 'FLAT_FEE' | 'PACKAGE';

/** The fields a guard may put back, by the names Twenty's REST API gives them. */
export type FieldKey =
  | 'subject' | 'issuerId' | 'companyId' | 'personId' | 'issueDate' | 'dueDate' | 'currencyCode'
  | 'pricesIncludeTax' | 'language' | 'notes' | 'buyerReference' | 'invoiceId' | 'reason'
  | 'documentType' | 'periodKey' | 'lastValue';

export type StatusKey = 'DRAFT' | 'ISSUED' | 'SENT' | 'PAID' | 'CANCELLED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'INVOICED';

/** Which status rule a move broke (spec §7): issuing, returning to draft, cancelling, or invoicing a quote. */
export type StatusRule = 'ISSUE' | 'DRAFT' | 'CANCEL' | 'INVOICED';

type Details = { field?: string; value?: string };

export type LifecyclePack = {
  code: Language;
  problems: Record<LifecycleProblemCode, (details: Details) => string>;
  renderProblems: Record<RenderProblemCode, (details: Details) => string>;
  units: Record<UnitKey, string>;
  fields: Record<FieldKey, string>;
  statuses: Record<StatusKey, string>;
  kinds: Record<DocumentKind, string>;
  messages: {
    previewReady: string;
    issued: (kind: DocumentKind, number: string) => string;
    quotePdf: (number: string, version: number) => string;
    unexpected: (ref: string) => string;
    fieldsPutBack: (kind: DocumentKind, fields: readonly string[]) => string;
    lineChangePutBack: (kind: DocumentKind) => string;
    lineAddedRemoved: (kind: DocumentKind) => string;
    lineDeletedRestored: (kind: DocumentKind) => string;
    lineMoveReverted: (kind: DocumentKind) => string;
    documentRestored: (kind: DocumentKind, number: string) => string;
    statusPutBack: (rule: StatusRule, kind: DocumentKind, back: string) => string;
    createdAsDraft: (kind: DocumentKind, status: string) => string;
    ledgerDuplicateRemoved: string;
    ledgerChangePutBack: (fields: readonly string[]) => string;
    ledgerRestored: string;
  };
};

export const PACKS: Record<Language, LifecyclePack> = { EN: en, FR: fr };

/** The pack for a Twenty locale ('fr-FR', 'en', 'de-DE'): French for any French locale, English otherwise. */
export function packFor(locale: string | null | undefined): LifecyclePack {
  return /^fr(?:[-_]|$)/i.test(locale ?? '') ? fr : en;
}

/** One problem, worded. An engine problem's line is its position on the document, never a record id. */
export function describe(problem: AnyProblem, language: Language, lineNumbers?: ReadonlyMap<string, number>): WordedProblem {
  const pack = PACKS[language];
  if (problem.source === 'engine') {
    const { line } = problem.problem;
    const position = line === undefined ? undefined : lineNumbers?.get(line);
    const engineProblem = position === undefined ? problem.problem : { ...problem.problem, line: String(position) };
    return { code: problem.problem.code, message: describeProblem(engineProblem, language), ...(problem.field ? { field: problem.field } : {}) };
  }
  if (problem.source === 'render') {
    const { code, field, value } = problem.problem;
    return { code, message: pack.renderProblems[code]({ field, value }), ...(field ? { field } : {}) };
  }
  const { code, field, value } = problem;
  return { code, message: pack.problems[code]({ field, value }), ...(field ? { field } : {}) };
}

export function describeAll(problems: readonly AnyProblem[], language: Language, lineNumbers?: ReadonlyMap<string, number>): WordedProblem[] {
  return problems.map((problem) => describe(problem, language, lineNumbers));
}
```

- [ ] **Step 6: Write `lifecycle/lang/en.ts`**

```ts
import type { LifecyclePack, StatusKey } from './pack.ts';

const statuses: Record<StatusKey, string> = {
  DRAFT: 'Draft', ISSUED: 'Issued', SENT: 'Sent', PAID: 'Paid', CANCELLED: 'Cancelled',
  ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired', INVOICED: 'Invoiced',
};

const statusName = (value?: string): string => (value && value in statuses ? statuses[value as StatusKey] : value ?? '');
const party = (field?: string): string => (field === 'buyer' ? 'The buyer' : 'The seller');
const kinds = { QUOTE: 'quote', INVOICE: 'invoice', CREDIT_NOTE: 'credit note' } as const;
const list = (names: readonly string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
const correct = (kind: keyof typeof kinds): string =>
  kind === 'CREDIT_NOTE' ? 'An issued credit note cannot change.' : 'Correct it with a credit note.';

export const en: LifecyclePack = {
  code: 'EN',
  problems: {
    NOT_ALLOWED: () => 'Your role cannot edit this document, so it cannot run this action.',
    WRONG_STATUS: ({ value }) => `This action needs a draft; this document is ${statusName(value)}.`,
    ALREADY_ISSUED: ({ value }) => `This document is already issued, as ${value}.`,
    MISSING_ISSUER: () => 'Choose the issuer.',
    MISSING_PROFILE: () => 'The issuer has no billing profile: choose one on the issuer.',
    MISSING_BUYER: () => 'Choose the company or the person to bill.',
    MISSING_CURRENCY: () => 'Set a currency on the document, on the issuer or on its profile.',
    MISSING_IDENTIFIER: ({ field, value }) => `${party(field)} has no ${value}.`,
    INVALID_IDENTIFIER: ({ field, value }) => `${party(field)}’s ${value} does not have the expected format.`,
    IDENTIFIER_OWNER: ({ value }) => `The identifier ${value} is attached to more than one record: keep one.`,
    MISSING_INVOICE: () => 'Choose the invoice this credit note corrects.',
    INVOICE_NOT_ISSUED: () => 'The invoice this credit note corrects is not issued.',
    INVOICE_MISMATCH: ({ field }) =>
      field === 'currencyCode'
        ? 'The invoice this credit note corrects is in another currency.'
        : 'The invoice this credit note corrects has another issuer.',
    DATE_IN_FUTURE: ({ value }) => `The issue date, ${value}, is later than today.`,
    DATE_BEFORE_LAST: ({ value }) => `The issue date is earlier than ${value}, the date of the last numbered document in its sequence.`,
    DUE_BEFORE_ISSUE: () => 'The due date is earlier than the issue date.',
    CLOCK_SKEW: () => 'Your computer’s date is more than a day away from the server’s: check its date and time.',
    LEDGER_BEHIND: ({ value }) => `The numbering sequence ${value} is far behind the numbers already given: raise its last number.`,
  },
  renderProblems: {
    UNSUPPORTED_SCRIPT: ({ field, value }) => `Some characters cannot be printed with the PDF’s font (${field}): ${value}`,
    UNSUPPORTED_IMAGE: () => 'The issuer’s logo is not a PNG or JPEG image, or the file is damaged.',
    UNKNOWN_TEMPLATE: ({ value }) => `The issuer’s template, ${value}, is not one this app knows.`,
    UNKNOWN_LANGUAGE: ({ value }) => `Documents cannot be printed in ${value} yet.`,
    QR_PAYLOAD_TOO_LONG: ({ value }) => `The QR code holds too much to be printed legibly (${value}).`,
    MISSING_TAX_NAME: () => 'A tax code on this document has no name.',
    INVALID_LOCALE: ({ value }) => `The profile’s locale, ${value}, is not a valid language tag such as fr-FR.`,
    INVALID_DATE: ({ field, value }) => `${value} is not a valid date (${field}).`,
    INVALID_CURRENCY: ({ value }) => `${value} is not a currency code.`,
    QR_BASE_URL_MISSING: () => 'The profile prints a QR link, but the issuer has no verification link.',
    QR_PAYLOAD_EMPTY: () => 'The QR code would be empty.',
  },
  units: {
    UNIT: 'unit', HOUR: 'hour', DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year',
    KG: 'kg', G: 'g', TONNE: 't', M: 'm', KM: 'km', M2: 'm²', M3: 'm³', LITRE: 'L', KWH: 'kWh',
    FLAT_FEE: 'flat fee', PACKAGE: 'package',
  },
  fields: {
    subject: 'Subject', issuerId: 'Issuer', companyId: 'Company', personId: 'Person', issueDate: 'Issue date',
    dueDate: 'Due date', currencyCode: 'Currency', pricesIncludeTax: 'Prices include tax', language: 'Language',
    notes: 'Notes', buyerReference: 'Buyer reference', invoiceId: 'Invoice', reason: 'Reason',
    documentType: 'Document type', periodKey: 'Period', lastValue: 'Last number',
  },
  statuses,
  kinds: { QUOTE: 'quote', INVOICE: 'invoice', CREDIT_NOTE: 'credit note' },
  messages: {
    previewReady: 'Preview ready: it is in the PDF field.',
    issued: (_kind, number) => `Issued as ${number}.`,
    quotePdf: (number, version) => `Quote ${number}, version ${version}: it is in the PDF field.`,
    unexpected: (ref) => `Something went wrong (ref ${ref}).`,
    fieldsPutBack: (kind, fields) =>
      `This ${kinds[kind]} is issued: the change${fields.length > 1 ? 's' : ''} to ${list(fields)} ${fields.length > 1 ? 'were' : 'was'} put back. ${correct(kind)}`,
    lineChangePutBack: (kind) => `This ${kinds[kind]} is issued: the change to a line was put back. ${correct(kind)}`,
    lineAddedRemoved: (kind) => `This ${kinds[kind]} is issued: the line added to it was removed. ${correct(kind)}`,
    lineDeletedRestored: (kind) => `This ${kinds[kind]} is issued: the deleted line was restored. ${correct(kind)}`,
    lineMoveReverted: (kind) => `This ${kinds[kind]} is issued: the line moved in or out was moved back. ${correct(kind)}`,
    documentRestored: (kind, number) => `This ${kinds[kind]} holds the number ${number}, so it cannot be deleted: it was restored.`,
    statusPutBack: (rule, kind, back) => {
      const why = {
        ISSUE: `Only the Issue action issues a ${kinds[kind]}.`,
        DRAFT: `A numbered ${kinds[kind]} cannot return to Draft.`,
        CANCEL: `A numbered ${kinds[kind]} is cancelled through a credit note.`,
        INVOICED: 'A quote becomes Invoiced when it is turned into an invoice.',
      }[rule];
      return `${why} The status was put back to ${back}.`;
    },
    createdAsDraft: (kind, status) => `A new ${kinds[kind]} starts as a draft: its status ${status} was set to Draft.`,
    ledgerDuplicateRemoved: 'A numbering sequence already exists for this issuer, document type and period: this one was removed.',
    ledgerChangePutBack: (fields) =>
      `This sequence has given out numbers: its issuer, document type and period are fixed, and its last number can only rise. The change to ${list(fields)} was put back.`,
    ledgerRestored: 'This sequence has given out numbers, so it cannot be deleted: it was restored.',
  },
};
```

- [ ] **Step 7: Write `lifecycle/lang/fr.ts`**

```ts
import type { LifecyclePack, StatusKey } from './pack.ts';

const statuses: Record<StatusKey, string> = {
  DRAFT: 'Brouillon', ISSUED: 'Émise', SENT: 'Envoyée', PAID: 'Payée', CANCELLED: 'Annulée',
  ACCEPTED: 'Accepté', DECLINED: 'Refusé', EXPIRED: 'Expiré', INVOICED: 'Facturé',
};

const statusName = (value?: string): string => (value && value in statuses ? statuses[value as StatusKey] : value ?? '');
const party = (field?: string): string => (field === 'buyer' ? 'Le client' : 'L’émetteur');
const list = (names: readonly string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
const kinds = { QUOTE: 'devis', INVOICE: 'facture', CREDIT_NOTE: 'avoir' } as const;
/** "Cette facture est émise", "Cet avoir est émis", "Ce devis". */
const thisOne = { QUOTE: 'Ce devis', INVOICE: 'Cette facture', CREDIT_NOTE: 'Cet avoir' } as const;
const issued = { QUOTE: 'émis', INVOICE: 'émise', CREDIT_NOTE: 'émis' } as const;
const correct = (kind: keyof typeof kinds): string =>
  kind === 'CREDIT_NOTE' ? 'Un avoir émis ne peut plus changer.' : 'Corrigez-la par un avoir.';

export const fr: LifecyclePack = {
  code: 'FR',
  problems: {
    NOT_ALLOWED: () => 'Votre rôle ne permet pas de modifier ce document\u00a0: vous ne pouvez donc pas lancer cette action.',
    WRONG_STATUS: ({ value }) => `Cette action demande un brouillon ; ce document est au statut ${statusName(value)}.`,
    ALREADY_ISSUED: ({ value }) => `Ce document est déjà émis, sous le numéro ${value}.`,
    MISSING_ISSUER: () => 'Choisissez l’émetteur.',
    MISSING_PROFILE: () => 'L’émetteur n’a pas de profil de facturation : choisissez-en un sur l’émetteur.',
    MISSING_BUYER: () => 'Choisissez la société ou la personne à facturer.',
    MISSING_CURRENCY: () => 'Indiquez une devise sur le document, sur l’émetteur ou sur son profil.',
    MISSING_IDENTIFIER: ({ field, value }) => `${party(field)} n’a pas de ${value}.`,
    INVALID_IDENTIFIER: ({ field, value }) => `${party(field)} a un ${value} qui n’a pas le format attendu.`,
    IDENTIFIER_OWNER: ({ value }) => `L’identifiant ${value} est rattaché à plus d’un enregistrement : n’en gardez qu’un.`,
    MISSING_INVOICE: () => 'Choisissez la facture que cet avoir corrige.',
    INVOICE_NOT_ISSUED: () => 'La facture que cet avoir corrige n’est pas émise.',
    INVOICE_MISMATCH: ({ field }) =>
      field === 'currencyCode'
        ? 'La facture que cet avoir corrige est dans une autre devise.'
        : 'La facture que cet avoir corrige a un autre émetteur.',
    DATE_IN_FUTURE: ({ value }) => `La date d’émission, ${value}, est postérieure à aujourd’hui.`,
    DATE_BEFORE_LAST: ({ value }) => `La date d’émission est antérieure au ${value}, date du dernier document numéroté de sa séquence.`,
    DUE_BEFORE_ISSUE: () => 'L’échéance est antérieure à la date d’émission.',
    CLOCK_SKEW: () => 'La date de votre ordinateur s’écarte de plus d’un jour de celle du serveur : vérifiez sa date et son heure.',
    LEDGER_BEHIND: ({ value }) => `La séquence de numérotation ${value} est très en retard sur les numéros déjà attribués : augmentez son dernier numéro.`,
  },
  renderProblems: {
    UNSUPPORTED_SCRIPT: ({ field, value }) => `Certains caractères ne peuvent pas être imprimés avec la police du PDF (${field}) : ${value}`,
    UNSUPPORTED_IMAGE: () => 'Le logo de l’émetteur n’est pas une image PNG ou JPEG, ou le fichier est endommagé.',
    UNKNOWN_TEMPLATE: ({ value }) => `Le modèle de l’émetteur, ${value}, n’est pas connu de cette application.`,
    UNKNOWN_LANGUAGE: ({ value }) => `Les documents ne peuvent pas encore être imprimés en ${value}.`,
    QR_PAYLOAD_TOO_LONG: ({ value }) => `Le code QR contient trop de données pour rester lisible (${value}).`,
    MISSING_TAX_NAME: () => 'Un code de taxe de ce document n’a pas de nom.',
    INVALID_LOCALE: ({ value }) => `La locale du profil, ${value}, n’est pas une balise de langue valide comme fr-FR.`,
    INVALID_DATE: ({ field, value }) => `${value} n’est pas une date valide (${field}).`,
    INVALID_CURRENCY: ({ value }) => `${value} n’est pas un code de devise.`,
    QR_BASE_URL_MISSING: () => 'Le profil imprime un lien QR, mais l’émetteur n’a pas de lien de vérification.',
    QR_PAYLOAD_EMPTY: () => 'Le code QR serait vide.',
  },
  units: {
    UNIT: 'unité', HOUR: 'heure', DAY: 'jour', WEEK: 'semaine', MONTH: 'mois', YEAR: 'an',
    KG: 'kg', G: 'g', TONNE: 't', M: 'm', KM: 'km', M2: 'm²', M3: 'm³', LITRE: 'L', KWH: 'kWh',
    FLAT_FEE: 'forfait', PACKAGE: 'lot',
  },
  fields: {
    subject: 'Objet', issuerId: 'Émetteur', companyId: 'Société', personId: 'Personne', issueDate: 'Date d’émission',
    dueDate: 'Échéance', currencyCode: 'Devise', pricesIncludeTax: 'Prix TTC', language: 'Langue',
    notes: 'Notes', buyerReference: 'Référence client', invoiceId: 'Facture', reason: 'Motif',
    documentType: 'Type de document', periodKey: 'Période', lastValue: 'Dernier numéro',
  },
  statuses,
  kinds,
  messages: {
    previewReady: 'Aperçu prêt : il est dans le champ PDF.',
    issued: (kind, number) => `${kind === 'INVOICE' ? 'Émise' : 'Émis'} sous le numéro ${number}.`,
    quotePdf: (number, version) => `Devis ${number}, version ${version} : il est dans le champ PDF.`,
    unexpected: (ref) => `Une erreur s’est produite (réf. ${ref}).`,
    fieldsPutBack: (kind, fields) =>
      `${thisOne[kind]} est ${issued[kind]} : ${fields.length > 1 ? `les modifications de ${list(fields)} ont été annulées` : `la modification de ${list(fields)} a été annulée`}. ${correct(kind)}`,
    lineChangePutBack: (kind) => `${thisOne[kind]} est ${issued[kind]} : la modification d’une ligne a été annulée. ${correct(kind)}`,
    lineAddedRemoved: (kind) => `${thisOne[kind]} est ${issued[kind]} : la ligne ajoutée a été retirée. ${correct(kind)}`,
    lineDeletedRestored: (kind) => `${thisOne[kind]} est ${issued[kind]} : la ligne supprimée a été restaurée. ${correct(kind)}`,
    lineMoveReverted: (kind) => `${thisOne[kind]} est ${issued[kind]} : la ligne déplacée a été remise en place. ${correct(kind)}`,
    documentRestored: (kind, number) =>
      `${thisOne[kind]} porte le numéro ${number} et ne peut pas être ${kind === 'INVOICE' ? 'supprimée : elle a été restaurée' : 'supprimé : il a été restauré'}.`,
    statusPutBack: (rule, kind, back) => {
      const why = {
        ISSUE: `Seule l’action Issue émet ${kind === 'INVOICE' ? 'une facture' : 'un avoir'}.`,
        DRAFT: `${kind === 'INVOICE' ? 'Une facture numérotée' : 'Un avoir numéroté'} ne peut pas revenir au statut Brouillon.`,
        CANCEL: 'Une facture numérotée s’annule par un avoir.',
        INVOICED: 'Un devis passe au statut Facturé quand il devient une facture.',
      }[rule];
      return `${why} Le statut a été remis à ${back}.`;
    },
    createdAsDraft: (kind, status) => `${thisOne[kind]} commence comme brouillon : son statut ${status} a été remis à Brouillon.`,
    ledgerDuplicateRemoved: 'Une séquence de numérotation existe déjà pour cet émetteur, ce type de document et cette période : celle-ci a été supprimée.',
    ledgerChangePutBack: (fields) =>
      `Cette séquence a déjà attribué des numéros : son émetteur, son type et sa période sont fixés, et son dernier numéro ne peut que monter. La modification de ${list(fields)} a été annulée.`,
    ledgerRestored: 'Cette séquence a déjà attribué des numéros et ne peut pas être supprimée : elle a été restaurée.',
  },
};
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/packs.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS, and the typecheck is clean.

- [ ] **Step 9: Commit**

```bash
git add tsconfig.json lifecycle/lang test/lifecycle/packs.test.ts test/lifecycle/purity.test.ts
```

```bash
git commit -m "feat: Lifecycle words its problems, units and messages in English and French"
```

---

### Task 4: The Store, and its twin in memory

Everything Lifecycle reads and writes goes through a `Store` (spec §4). This task defines it, and builds the in-memory database every later test runs against. The memory store behaves like Twenty where Lifecycle depends on it: unique keys that let blanks coexist and keep a soft-deleted holder's value, soft deletes that leave `updatedBy` alone, fields only the app may write, a role that can refuse a write, and an event for every write, shaped like the ones the triggers receive. Two helpers make the platform's timing testable: `drain` feeds recorded events to the triggers until nothing more is written (and fails on a loop), and `lockstep` runs two flows' store calls in an order the test chooses.

**Files:**
- Create: `lifecycle/store.ts`, `test/lifecycle/helpers/memory-store.ts`
- Test: `test/lifecycle/store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `lifecycle/store.ts`:
  - `type Row = { id: string; [field: string]: unknown }`
  - `type Condition = string | number | boolean | null | { notNull: true } | { gte?: string; lte?: string }`, `type Where = Readonly<Record<string, Condition>>`
  - `type ListOptions = { deleted?: 'exclude' | 'include' | 'only'; orderBy?: { field: string; direction: 'asc' | 'desc' }; limit?: number }`
  - `type FileRef = { fileId: string; label: string }`
  - `type Upload = { bytes: Uint8Array; name: string; mime: string; object: string; field: string }`
  - `type TimelineEntry = { object: string; recordId: string; kind: 'ISSUED' | 'CORRECTION'; text: string }`
  - `type RecordEvent = { name: 'created' | 'updated' | 'deleted' | 'restored' | 'destroyed' | 'upserted'; recordId: string; before: Row | null; after: Row | null; updatedFields: readonly string[] }`
  - `type Store` with `get`, `list`, `create`, `update`, `softDelete`, `restore`, `upload`, `download`, `timeline` (below)
  - `type CallerStore = Pick<Store, 'update'>`
  - `class DuplicateError extends Error`, `class NotAllowedError extends Error`
  - `sourceOf(row: Row | null | undefined): string | null` (the `updatedBy.source` of a record)
- Produces, from `test/lifecycle/helpers/memory-store.ts`:
  - `memoryDb(options?: { unique?: Record<string, readonly string[]>; appOnly?: Record<string, readonly string[]> })` returning `MemoryDb`:
    `store(source?: 'APPLICATION' | 'MANUAL', permissions?: { canUpdate?: (plural: string) => boolean }): Store`,
    `seed(plural, data): Row`, `row(plural, id): Row | undefined`, `rows(plural): Row[]`, `addFile(bytes, type): string`,
    `failNext(when: (op, plural, data?) => boolean, error?: Error): void`, `takeEvents(): MemoryEvent[]`,
    and the arrays `timeline: TimelineEntry[]`, `writes: MemoryWrite[]`
  - `type MemoryEvent = RecordEvent & { plural: string }`, `type MemoryWrite = { op: string; plural: string; id: string; data?: Record<string, unknown>; source: string }`
  - `class NotWritableError extends Error`
  - `drain(db: MemoryDb, handle: (event: MemoryEvent) => Promise<void>, limit?: number): Promise<MemoryEvent[]>`
  - `lockstep(db: MemoryDb): { flow(name: string): Store; step(name: string): Promise<boolean>; finish(...flows: Promise<unknown>[]): Promise<void> }`

- [ ] **Step 1: Write the failing test**

`test/lifecycle/store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuplicateError, NotAllowedError, sourceOf } from '../../lifecycle/store.ts';
import { NotWritableError, drain, lockstep, memoryDb } from './helpers/memory-store.ts';

const db = () => memoryDb({ unique: { billingInvoices: ['numberKey'] }, appOnly: { billingInvoices: ['number', 'numberKey'] } });

test('a list leaves soft-deleted rows out, unless asked for them or for them alone', async () => {
  const memory = db();
  const store = memory.store();
  const kept = await store.create('billingInvoices', { subject: 'kept' });
  const gone = await store.create('billingInvoices', { subject: 'gone' });
  await store.softDelete('billingInvoices', gone.id);
  assert.deepEqual((await store.list('billingInvoices', {})).map((row) => row.id), [kept.id]);
  assert.deepEqual((await store.list('billingInvoices', {}, { deleted: 'only' })).map((row) => row.id), [gone.id]);
  assert.equal((await store.list('billingInvoices', {}, { deleted: 'include' })).length, 2);
  assert.equal(await store.get('billingInvoices', gone.id), null);
  assert.equal((await store.get('billingInvoices', gone.id, { deleted: true }))?.id, gone.id);
});

test('a where clause matches a value, an empty field, a filled field and a date range', async () => {
  const memory = db();
  const store = memory.store();
  await store.create('billingInvoices', { issuerId: 'a', numberKey: 'a:1', issueDate: '2026-03-01' });
  await store.create('billingInvoices', { issuerId: 'a', numberKey: '', issueDate: '2026-04-01' });
  await store.create('billingInvoices', { issuerId: 'b', numberKey: 'b:1', issueDate: '2025-12-31' });
  const subjects = async (where: Parameters<typeof store.list>[1]) => (await store.list('billingInvoices', where)).length;
  assert.equal(await subjects({ issuerId: 'a' }), 2);
  assert.equal(await subjects({ numberKey: null }), 1);
  assert.equal(await subjects({ numberKey: { notNull: true } }), 2);
  assert.equal(await subjects({ issueDate: { gte: '2026-01-01', lte: '2026-12-31' } }), 2);
  assert.equal(await subjects({ issuerId: 'a', numberKey: { notNull: true }, issueDate: { gte: '2026-01-01' } }), 1);
});

test('a list is ordered and limited when asked', async () => {
  const store = db().store();
  for (const date of ['2026-02-01', '2026-05-01', '2026-03-01']) await store.create('billingInvoices', { issueDate: date });
  const latest = await store.list('billingInvoices', {}, { orderBy: { field: 'issueDate', direction: 'desc' }, limit: 2 });
  assert.deepEqual(latest.map((row) => row.issueDate), ['2026-05-01', '2026-03-01']);
});

test('a unique field refuses a second holder, lets blanks coexist, and keeps a soft-deleted holder’s value', async () => {
  const memory = db();
  const store = memory.store();
  const first = await store.create('billingInvoices', { numberKey: 'i:F1' });
  await store.create('billingInvoices', { numberKey: '' });
  await store.create('billingInvoices', { numberKey: null });
  await assert.rejects(store.create('billingInvoices', { numberKey: 'i:F1' }), DuplicateError);
  await store.softDelete('billingInvoices', first.id);
  await assert.rejects(store.create('billingInvoices', { numberKey: 'i:F1' }), DuplicateError);
  // Writing a record's own value again is not a duplicate.
  const second = await store.create('billingInvoices', { numberKey: 'i:F2' });
  await store.update('billingInvoices', second.id, { numberKey: 'i:F2' });
});

test('a role that cannot edit refuses the write, and a person cannot write an app-only field', async () => {
  const memory = db();
  const invoice = await memory.store().create('billingInvoices', { subject: 'x' });
  const reader = memory.store('MANUAL', { canUpdate: () => false });
  await assert.rejects(reader.update('billingInvoices', invoice.id, { subject: 'y' }), NotAllowedError);
  await assert.rejects(memory.store('MANUAL').update('billingInvoices', invoice.id, { number: 'F1' }), NotWritableError);
  await memory.store('APPLICATION').update('billingInvoices', invoice.id, { number: 'F1' });
  assert.equal(memory.row('billingInvoices', invoice.id)?.number, 'F1');
});

test('every write is an event with the record before and after, the fields that changed, and who made it', async () => {
  const memory = db();
  const created = await memory.store().create('billingInvoices', { subject: 'a' });
  await memory.store('MANUAL').update('billingInvoices', created.id, { subject: 'b' });
  await memory.store('MANUAL').softDelete('billingInvoices', created.id);
  await memory.store().restore('billingInvoices', created.id);
  const events = memory.takeEvents();
  assert.deepEqual(events.map((event) => event.name), ['created', 'updated', 'deleted', 'restored']);
  const update = events[1]!;
  assert.equal(update.before?.subject, 'a');
  assert.equal(update.after?.subject, 'b');
  assert.ok(update.updatedFields.includes('subject'));
  assert.equal(sourceOf(update.after), 'MANUAL');
  // A soft delete does not change updatedBy: its event cannot say who deleted.
  assert.equal(sourceOf(events[2]!.after), 'MANUAL');
  assert.deepEqual(memory.takeEvents(), []);
});

test('like Twenty, a write that changes nothing emits nothing, unless another actor made it', async () => {
  const memory = db();
  const created = await memory.store().create('billingInvoices', { subject: 'a' });
  memory.takeEvents();
  await memory.store().update('billingInvoices', created.id, { subject: 'a' });
  assert.deepEqual(memory.takeEvents(), []);
  await memory.store('MANUAL').update('billingInvoices', created.id, { subject: 'a' });
  assert.deepEqual(memory.takeEvents().map((event) => event.updatedFields), [['updatedBy']]);
});

test('an injected failure hits the next matching operation once', async () => {
  const memory = db();
  const store = memory.store();
  memory.failNext((op, plural) => op === 'create' && plural === 'billingInvoices');
  await assert.rejects(store.create('billingInvoices', {}), /injected/);
  await store.create('billingInvoices', {});
});

test('files are uploaded and read back, and timeline entries are kept', async () => {
  const memory = db();
  const store = memory.store();
  const file = await store.upload({ bytes: new Uint8Array([37, 80, 68, 70]), name: 'a.pdf', mime: 'application/pdf', object: 'billingInvoice', field: 'pdf' });
  assert.equal(file.label, 'a.pdf');
  assert.deepEqual((await store.download(file))?.bytes, new Uint8Array([37, 80, 68, 70]));
  assert.equal(await store.download({ fileId: 'missing' }), null);
  await store.timeline({ object: 'billingInvoice', recordId: 'r', kind: 'ISSUED', text: 'Issued as F1.' });
  assert.deepEqual(memory.timeline, [{ object: 'billingInvoice', recordId: 'r', kind: 'ISSUED', text: 'Issued as F1.' }]);
});

test('drain hands every event to the triggers until nothing more is written', async () => {
  const memory = db();
  const store = memory.store();
  const invoice = await store.create('billingInvoices', { count: 0 });
  const seen = await drain(memory, async (event) => {
    const count = Number(event.after?.count ?? 0);
    if (count < 3) await store.update('billingInvoices', invoice.id, { count: count + 1 });
  });
  assert.equal(seen.length, 4);
  assert.equal(memory.row('billingInvoices', invoice.id)?.count, 3);
});

test('drain fails on a trigger that never stops writing', async () => {
  const memory = db();
  const store = memory.store();
  const invoice = await store.create('billingInvoices', { count: 0 });
  await assert.rejects(
    drain(memory, async (event) => { await store.update('billingInvoices', invoice.id, { count: Number(event.after?.count) + 1 }); }, 20),
    /loop/,
  );
});

test('lockstep runs two flows’ store calls in the order the test names', async () => {
  const memory = db();
  const lock = lockstep(memory);
  const order: string[] = [];
  const run = async (name: string) => {
    const store = lock.flow(name);
    await store.create('billingInvoices', { by: name });
    order.push(`${name}1`);
    await store.create('billingInvoices', { by: name });
    order.push(`${name}2`);
  };
  const both = Promise.all([run('A'), run('B')]);
  for (const name of ['B', 'A', 'A', 'B']) assert.equal(await lock.step(name), true, name);
  await lock.finish();
  await both;
  assert.deepEqual(order, ['B1', 'A1', 'A2', 'B2']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/store.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/store.ts'`.

- [ ] **Step 3: Write `lifecycle/store.ts`**

```ts
/**
 * Everything Lifecycle reads and writes goes through a Store: Twenty's REST API
 * in production (src/lib/rest-store.ts), memory in tests
 * (test/lifecycle/helpers/memory-store.ts). Records are the shapes the REST API
 * returns: fields by name, a relation as `<name>Id`, a composite field as an object.
 */

export type Row = { id: string; [field: string]: unknown };

/**
 * A condition on one field: equal to a value, empty (null), filled
 * (`{ notNull: true }`), or inside a range of YYYY-MM-DD dates.
 */
export type Condition = string | number | boolean | null | { notNull: true } | { gte?: string; lte?: string };
export type Where = Readonly<Record<string, Condition>>;

export type ListOptions = {
  /** Soft-deleted rows: left out (the default), included, or alone. */
  deleted?: 'exclude' | 'include' | 'only';
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
};

/** A file as a FILES field holds it. */
export type FileRef = { fileId: string; label: string };

/** A PDF to store: its bytes, and the object and field it is uploaded for. */
export type Upload = { bytes: Uint8Array; name: string; mime: string; object: string; field: string };

/**
 * A message left on a record's timeline, in the document's language. `kind` picks the
 * timeline activity type, whose label is what the collapsed row says: "issued" or
 * "put back a change to"; the text shows when the row is expanded.
 */
export type TimelineEntry = { object: string; recordId: string; kind: 'ISSUED' | 'CORRECTION'; text: string };

/** A database event, as a trigger hands it to Lifecycle. */
export type RecordEvent = {
  name: 'created' | 'updated' | 'deleted' | 'restored' | 'destroyed' | 'upserted';
  recordId: string;
  before: Row | null;
  after: Row | null;
  updatedFields: readonly string[];
};

export type Store = {
  /** A record by id; a soft-deleted one only when asked. Null when there is none. */
  get(plural: string, id: string, options?: { deleted?: boolean }): Promise<Row | null>;
  /** Every record matching `where`, following pages. */
  list(plural: string, where: Where, options?: ListOptions): Promise<Row[]>;
  create(plural: string, data: Record<string, unknown>): Promise<Row>;
  update(plural: string, id: string, data: Record<string, unknown>): Promise<Row>;
  softDelete(plural: string, id: string): Promise<void>;
  restore(plural: string, id: string): Promise<void>;
  upload(file: Upload): Promise<FileRef>;
  /** The bytes of a file a FILES field holds, or null when it cannot be read. */
  download(file: unknown): Promise<{ bytes: Uint8Array; type: string } | null>;
  timeline(entry: TimelineEntry): Promise<void>;
};

/** The caller's side of the route: one write, with the caller's own token. */
export type CallerStore = Pick<Store, 'update'>;

/** A unique key refused a value another record holds. */
export class DuplicateError extends Error {
  constructor(message = 'A duplicate entry was detected') {
    super(message);
    this.name = 'DuplicateError';
  }
}

/** Twenty's role check refused the write. */
export class NotAllowedError extends Error {
  constructor(message = 'Not allowed') {
    super(message);
    this.name = 'NotAllowedError';
  }
}

/** Who last wrote a record, as Twenty records it: 'APPLICATION' for the app, 'MANUAL' for a person. */
export function sourceOf(row: Row | null | undefined): string | null {
  const actor = row?.updatedBy as { source?: unknown } | null | undefined;
  return typeof actor?.source === 'string' ? actor.source : null;
}
```

- [ ] **Step 4: Write `test/lifecycle/helpers/memory-store.ts`**

```ts
import {
  DuplicateError, NotAllowedError,
  type Condition, type ListOptions, type RecordEvent, type Row, type Store, type TimelineEntry, type Upload, type Where,
} from '../../../lifecycle/store.ts';

export type MemoryEvent = RecordEvent & { plural: string };
export type MemoryWrite = { op: string; plural: string; id: string; data?: Record<string, unknown>; source: string };

/** Twenty refuses a person's write of a field whose writability is APPLICATION. */
export class NotWritableError extends Error {
  constructor(field: string) {
    super(`field "${field}" is not writable through the API`);
    this.name = 'NotWritableError';
  }
}

type Options = {
  /** Fields no two rows may share, soft-deleted rows included. Blank values never collide. */
  unique?: Readonly<Record<string, readonly string[]>>;
  /** Fields only the app may write. */
  appOnly?: Readonly<Record<string, readonly string[]>>;
};

type FailureTest = (op: string, plural: string, data?: Record<string, unknown>) => boolean;

const blank = (value: unknown): boolean => value === null || value === undefined || value === '';
const copy = <T>(value: T): T => structuredClone(value);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function matches(value: unknown, condition: Condition): boolean {
  if (condition === null) return blank(value);
  if (typeof condition === 'object') {
    if ('notNull' in condition) return !blank(value);
    if (blank(value)) return false;
    const text = String(value);
    return (condition.gte === undefined || text >= condition.gte) && (condition.lte === undefined || text <= condition.lte);
  }
  return value === condition;
}

/** An in-memory stand-in for a workspace, with Twenty's behaviour where Lifecycle depends on it. */
export function memoryDb(options: Options = {}) {
  const tables = new Map<string, Row[]>();
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  const timeline: TimelineEntry[] = [];
  const writes: MemoryWrite[] = [];
  const events: MemoryEvent[] = [];
  const failures: { when: FailureTest; error: Error }[] = [];
  let tick = 0;
  let serial = 0;

  const table = (plural: string): Row[] => {
    if (!tables.has(plural)) tables.set(plural, []);
    return tables.get(plural)!;
  };
  const stamp = (): string => new Date(Date.UTC(2026, 8, 1) + ++tick * 1000).toISOString();
  const newId = (): string => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;

  function injected(op: string, plural: string, data?: Record<string, unknown>): void {
    const index = failures.findIndex((failure) => failure.when(op, plural, data));
    if (index === -1) return;
    const [failure] = failures.splice(index, 1);
    throw failure!.error;
  }

  function checkUnique(plural: string, row: Row): void {
    for (const field of options.unique?.[plural] ?? []) {
      if (blank(row[field])) continue;
      if (table(plural).some((other) => other.id !== row.id && other[field] === row[field])) {
        throw new DuplicateError(`A duplicate entry was detected: unique constraint ${plural}.${field} was violated`);
      }
    }
  }

  /**
   * Like Twenty: `updatedAt` never counts as a change, and an update, delete or
   * restore that changes nothing emits no event. A write of the same values by
   * another actor still changes `updatedBy`, so it does emit one.
   */
  function emit(name: RecordEvent['name'], plural: string, before: Row | null, after: Row): void {
    const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
    fields.delete('updatedAt');
    const updatedFields = before === null ? [] : [...fields].filter((field) => !same(before[field], after[field]));
    if (name !== 'created' && updatedFields.length === 0) return;
    events.push({ name, plural, recordId: after.id, before: before && copy(before), after: copy(after), updatedFields });
  }

  function store(source: 'APPLICATION' | 'MANUAL' = 'APPLICATION', permissions: { canUpdate?: (plural: string) => boolean } = {}): Store {
    const actor = { source, workspaceMemberId: source === 'MANUAL' ? 'member-1' : null, name: source === 'APPLICATION' ? 'Billing Documents' : 'A person' };

    function allowed(plural: string, data: Record<string, unknown> = {}): void {
      if (permissions.canUpdate && !permissions.canUpdate(plural)) throw new NotAllowedError(`This role cannot edit ${plural}`);
      if (source === 'APPLICATION') return;
      for (const field of Object.keys(data)) if (options.appOnly?.[plural]?.includes(field)) throw new NotWritableError(field);
    }

    function live(plural: string, id: string): [Row[], number] {
      const rows = table(plural);
      const index = rows.findIndex((row) => row.id === id && !row.deletedAt);
      if (index === -1) throw new Error(`No ${plural} record ${id}`);
      return [rows, index];
    }

    return {
      async get(plural, id, getOptions) {
        const row = table(plural).find((candidate) => candidate.id === id);
        if (!row || (row.deletedAt && !getOptions?.deleted)) return null;
        return copy(row);
      },

      async list(plural, where: Where, listOptions: ListOptions = {}) {
        const deleted = listOptions.deleted ?? 'exclude';
        let rows = table(plural).filter((row) => {
          if (deleted === 'exclude' && row.deletedAt) return false;
          if (deleted === 'only' && !row.deletedAt) return false;
          return Object.entries(where).every(([field, condition]) => matches(row[field], condition));
        });
        if (listOptions.orderBy) {
          const { field, direction } = listOptions.orderBy;
          const sign = direction === 'asc' ? 1 : -1;
          rows = [...rows].sort((a, b) => sign * String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
        }
        return copy(rows.slice(0, listOptions.limit ?? rows.length));
      },

      async create(plural, data) {
        injected('create', plural, data);
        allowed(plural, data);
        const now = stamp();
        const row: Row = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, ...copy(data), createdBy: actor, updatedBy: actor };
        checkUnique(plural, row);
        table(plural).push(row);
        writes.push({ op: 'create', plural, id: row.id, data: copy(data), source });
        emit('created', plural, null, row);
        return copy(row);
      },

      async update(plural, id, data) {
        injected('update', plural, data);
        allowed(plural, data);
        const [rows, index] = live(plural, id);
        const before = rows[index]!;
        const after: Row = { ...before, ...copy(data), updatedAt: stamp(), updatedBy: actor };
        checkUnique(plural, after);
        rows[index] = after;
        writes.push({ op: 'update', plural, id, data: copy(data), source });
        emit('updated', plural, before, after);
        return copy(after);
      },

      async softDelete(plural, id) {
        injected('softDelete', plural);
        allowed(plural);
        const [rows, index] = live(plural, id);
        const before = rows[index]!;
        // Twenty leaves updatedBy alone on a soft delete.
        const after: Row = { ...before, deletedAt: stamp() };
        rows[index] = after;
        writes.push({ op: 'softDelete', plural, id, source });
        emit('deleted', plural, before, after);
      },

      async restore(plural, id) {
        injected('restore', plural);
        allowed(plural);
        const rows = table(plural);
        const index = rows.findIndex((row) => row.id === id && row.deletedAt);
        if (index === -1) throw new Error(`No deleted ${plural} record ${id}`);
        const before = rows[index]!;
        const after: Row = { ...before, deletedAt: null };
        rows[index] = after;
        writes.push({ op: 'restore', plural, id, source });
        emit('restored', plural, before, after);
      },

      async upload(file: Upload) {
        injected('upload', file.object);
        const fileId = `file-${++serial}`;
        files.set(fileId, { bytes: file.bytes, type: file.mime });
        writes.push({ op: 'upload', plural: file.object, id: fileId, source });
        return { fileId, label: file.name };
      },

      async download(file) {
        const fileId = (file as { fileId?: unknown } | null)?.fileId;
        return typeof fileId === 'string' ? (files.get(fileId) ?? null) : null;
      },

      async timeline(entry) {
        injected('timeline', entry.object);
        timeline.push(copy(entry));
      },
    };
  }

  return {
    timeline,
    writes,
    store,
    /** Puts a record in place, with no event: the state a test starts from. */
    seed(plural: string, data: Record<string, unknown>): Row {
      const now = stamp();
      const actor = { source: 'MANUAL', workspaceMemberId: 'member-1', name: 'A person' };
      const row: Row = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, createdBy: actor, updatedBy: actor, ...copy(data) };
      table(plural).push(row);
      return copy(row);
    },
    row: (plural: string, id: string): Row | undefined => copy(table(plural).find((row) => row.id === id)),
    rows: (plural: string): Row[] => copy(table(plural)),
    addFile(bytes: Uint8Array, type: string): string {
      const fileId = `file-${++serial}`;
      files.set(fileId, { bytes, type });
      return fileId;
    },
    /** The next operation `when` matches throws `error`, once. */
    failNext(when: FailureTest, error: Error = new Error('injected failure')): void {
      failures.push({ when, error });
    },
    /** The events recorded since the last call, oldest first. */
    takeEvents: (): MemoryEvent[] => events.splice(0),
  };
}

export type MemoryDb = ReturnType<typeof memoryDb>;

/**
 * Hands recorded events to the triggers, as the platform does after each
 * commit, until a round writes nothing. More than `limit` events means a
 * trigger keeps answering its own writes: a loop.
 */
export async function drain(db: MemoryDb, handle: (event: MemoryEvent) => Promise<void>, limit = 200): Promise<MemoryEvent[]> {
  const seen: MemoryEvent[] = [];
  for (;;) {
    const batch = db.takeEvents();
    if (batch.length === 0) return seen;
    if (seen.length + batch.length > limit) throw new Error(`still writing after ${limit} events: a trigger loops`);
    for (const event of batch) {
      seen.push(event);
      await handle(event);
    }
  }
}

/**
 * Runs flows whose store calls wait for the test: `step(name)` lets the named
 * flow's next call run, and waits until the flow has made its following call
 * or finished. `finish(...flows)` releases whatever is left, in arrival order,
 * until the given flows have settled (or, given none, until nothing is waiting).
 */
export function lockstep(db: MemoryDb) {
  type Pending = { name: string; run: () => void };
  const pending: Pending[] = [];
  const settle = async (): Promise<void> => {
    for (let round = 0; round < 50; round++) await new Promise((resolve) => setImmediate(resolve));
  };

  function flow(name: string): Store {
    const base = db.store();
    const wrap = <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      (...args: A): Promise<R> =>
        new Promise<R>((resolve, reject) => {
          pending.push({ name, run: () => void call(...args).then(resolve, reject) });
        });
    return {
      get: wrap(base.get), list: wrap(base.list), create: wrap(base.create), update: wrap(base.update),
      softDelete: wrap(base.softDelete), restore: wrap(base.restore), upload: wrap(base.upload),
      download: wrap(base.download), timeline: wrap(base.timeline),
    };
  }

  async function step(name: string): Promise<boolean> {
    await settle();
    const index = pending.findIndex((call) => call.name === name);
    if (index === -1) return false;
    const [call] = pending.splice(index, 1);
    call!.run();
    await settle();
    return true;
  }

  async function finish(...flows: Promise<unknown>[]): Promise<void> {
    let settled = false;
    void Promise.allSettled(flows).then(() => {
      settled = true;
    });
    for (;;) {
      await settle();
      const call = pending.shift();
      if (call) {
        call.run();
        continue;
      }
      if (settled || flows.length === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  return { flow, step, finish };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/store.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add lifecycle/store.ts test/lifecycle/helpers/memory-store.ts test/lifecycle/store.test.ts
```

```bash
git commit -m "feat: the Store Lifecycle reads and writes through, and its twin in memory"
```

---

### Task 5: Loading a document and everything it needs

`lifecycle/load.ts` reads a document and every record its figures, its gate and its PDF depend on, into one plain shape (spec §12). It also holds the table of the three document kinds, which every later module uses: object names, line objects, the line's key to its document, which profile fields apply, and which fields an issued document locks (spec §7).

This task also creates the workspace fixture every later test starts from: a French seller on the `fr` profile, a French company buyer with its SIREN, VAT at 20 %, and a draft invoice of three lines (spec §11, acceptance step 2).

**Files:**
- Create: `lifecycle/load.ts`, `test/lifecycle/helpers/fixtures.ts`
- Test: `test/lifecycle/load.test.ts`

**Interfaces:**
- Consumes: `Store`, `Row` from `lifecycle/store.ts`; `DocumentKind`, `FieldKey` from `lifecycle/lang/pack.ts`; `APP_ONLY_FIELDS` from `src/schema/app-only.ts` (fixtures only); `memoryDb` from the memory store.
- Produces, from `lifecycle/load.ts`:
  - `type DocumentObject = 'billingQuote' | 'billingInvoice' | 'billingCreditNote'`
  - `type Kind = { kind: DocumentKind; object: DocumentObject; plural: string; lineObject: string; linePlural: string; parentKey: string; patternField: string; mentionsField: string; titleField: string | null; lockedFields: readonly FieldKey[] }`
  - `KINDS: Record<DocumentObject, Kind>`, `kindOf(object: string): Kind | undefined`, `kindOfLine(lineObject: string): Kind | undefined`
  - `LINE_FIELDS: readonly string[]` (a line's fields a person edits, restored from the snapshot)
  - `isIssued(kind: Kind, document: Row): boolean` (an invoice or credit note with a snapshot)
  - `type TaxCode = { row: Row; components: Row[] }`
  - `type Figures = { kind: Kind; document: Row; lines: Row[]; taxCodes: ReadonlyMap<string, TaxCode>; issuer: Row | null; profile: Row | null }`
  - `type Loaded = Figures & { company: Row | null; person: Row | null; invoice: Row | null; sellerIdentifiers: Row[]; buyerIdentifiers: Row[]; identifierTypes: ReadonlyMap<string, Row>; profileTypes: Row[] }`
  - `loadFigures(store: Store, kind: Kind, id: string, options?: { deleted?: boolean }): Promise<Figures | null>` (`deleted` lets a guard look at a soft-deleted document)
  - `loadDocument(store: Store, kind: Kind, id: string): Promise<Loaded | null>`
  - `loadLogo(store: Store, issuer: Row | null): Promise<{ bytes: Uint8Array; type: string } | null>`
- Produces, from `test/lifecycle/helpers/fixtures.ts`:
  - `TODAY = '2026-09-26'`, `now(): Date` (2026-09-26 09:30 UTC), `money(amountMicros, currencyCode?)`, `markdown(text)`, `address(street, city, postcode, country)`
  - `workspace(): Workspace` with `db`, `app` (the app's Store), `user` (a person's Store), the seeded rows `profile`, `siren`, `tva`, `issuer`, `company`, `person`, `vat20`, `franchise`, `invoice`, `lines`, and builders `addInvoice(over?)`, `addCreditNote(over?)`, `addQuote(over?)`, `addLine(kind, documentId, over?)`

- [ ] **Step 1: Write the fixtures**

`test/lifecycle/helpers/fixtures.ts`:

```ts
import { APP_ONLY_FIELDS } from '../../../src/schema/app-only.ts';
import type { Kind } from '../../../lifecycle/load.ts';
import type { Row } from '../../../lifecycle/store.ts';
import { memoryDb } from './memory-store.ts';

/** The day every test runs on, as the clicking user's browser gives it. */
export const TODAY = '2026-09-26';
export const now = (): Date => new Date('2026-09-26T09:30:00.000Z');

const PLURAL: Record<string, string> = {
  billingQuote: 'billingQuotes', billingInvoice: 'billingInvoices', billingCreditNote: 'billingCreditNotes',
  billingQuoteLine: 'billingQuoteLines', billingInvoiceLine: 'billingInvoiceLines', billingCreditNoteLine: 'billingCreditNoteLines',
  billingSequence: 'billingSequences',
};

export const UNIQUE = {
  billingQuotes: ['numberKey'], billingInvoices: ['numberKey'], billingCreditNotes: ['numberKey'], billingSequences: ['scopeKey'],
};
export const APP_ONLY = Object.fromEntries(Object.entries(APP_ONLY_FIELDS).map(([object, fields]) => [PLURAL[object]!, fields]));

export const money = (amountMicros: number | null, currencyCode = 'EUR') => ({ amountMicros, currencyCode });
export const markdown = (text: string) => ({ blocknote: null, markdown: text });
export const address = (street: string, city: string, postcode: string, country: string) => ({
  addressStreet1: street, addressStreet2: '', addressCity: city, addressPostcode: postcode, addressState: '', addressCountry: country,
  addressLat: null, addressLng: null,
});

const EMPTY_MONEY = { amountMicros: null, currencyCode: '' };

const DOCUMENT = {
  subject: '', number: '', numberKey: '', status: 'DRAFT', issuerId: null, companyId: null, personId: null, issueDate: null,
  currencyCode: 'EUR', pricesIncludeTax: false, language: null, notes: markdown(''), subtotal: EMPTY_MONEY,
  discountTotal: EMPTY_MONEY, taxTotal: EMPTY_MONEY, total: EMPTY_MONEY, pdf: [], snapshot: null, documentHash: '',
};

/**
 * A French seller on the fr profile, a French company buyer with its SIREN,
 * VAT at 20 % and a franchise code, and a draft invoice of three lines
 * (spec §11, acceptance step 2). Nothing here names a real business.
 */
export function workspace() {
  const db = memoryDb({ unique: UNIQUE, appOnly: APP_ONLY });
  const profile = db.seed('billingProfiles', {
    name: 'France', presetKey: 'fr', countryCode: 'FR', language: 'FR', locale: 'fr-FR', defaultCurrency: 'EUR',
    roundingMode: 'PER_RATE_ON_TOTAL', amountInWords: false, invoiceTitle: '', creditNoteTitle: '',
    quoteNumberPattern: 'D{YYYY}-{SEQ:4}', invoiceNumberPattern: 'F{YYYY}-{SEQ:4}', creditNoteNumberPattern: 'AV{YYYY}-{SEQ:4}',
    numberingReset: 'YEARLY', defaultPaymentTermDays: 30, defaultQuoteValidityDays: 30,
    quoteMentions: markdown(''), invoiceMentions: markdown('Pénalités de retard : trois fois le taux d’intérêt légal.'),
    creditNoteMentions: markdown(''), qrMode: 'NONE',
  });
  const siren = db.seed('billingIdentifierTypes', {
    name: 'SIREN', key: 'fr.siren', profileId: profile.id, appliesTo: 'BOTH', requiredForSeller: true,
    requiredForBusinessBuyer: true, printOnDocuments: true, includeInQr: false, validationPattern: '^\\d{9}$', sortOrder: 0,
  });
  const tva = db.seed('billingIdentifierTypes', {
    name: 'N° TVA intracommunautaire', key: 'fr.tva', profileId: profile.id, appliesTo: 'BOTH', requiredForSeller: false,
    requiredForBusinessBuyer: false, printOnDocuments: true, includeInQr: false, validationPattern: '^FR[0-9A-Z]{2}\\d{9}$', sortOrder: 3,
  });
  const issuer = db.seed('billingIssuers', {
    name: 'Verdal Studio', legalName: 'Verdal Studio SARL', legalForm: 'SARL au capital de 10 000 €', profileId: profile.id,
    postalAddress: address('12 rue des Peupliers', 'Paris', '75013', 'France'),
    emails: { primaryEmail: 'bonjour@verdal.example', additionalEmails: null },
    phones: { primaryPhoneNumber: '123456789', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: null },
    website: { primaryLinkUrl: 'https://verdal.example', primaryLinkLabel: '', secondaryLinks: null },
    logo: [], defaultCurrency: '', paymentDetails: markdown('IBAN FR76 0000 0000 0000 0000 0000 000'), accentColor: '#2f6f4e',
    footerNote: 'Verdal Studio SARL, Paris', verificationBaseUrl: { primaryLinkUrl: '', primaryLinkLabel: '', secondaryLinks: null },
    isDefault: true, template: 'CLASSIC',
  });
  db.seed('billingIdentifiers', { value: '000000000', identifierTypeId: siren.id, issuerId: issuer.id, companyId: null, personId: null });
  db.seed('billingIdentifiers', { value: 'FR12000000000', identifierTypeId: tva.id, issuerId: issuer.id, companyId: null, personId: null });
  const company = db.seed('companies', { name: 'Maison Calibre', address: address('48 avenue du Port', 'Bordeaux', '33000', 'France') });
  db.seed('billingIdentifiers', { value: '111111111', identifierTypeId: siren.id, issuerId: null, companyId: company.id, personId: null });
  const person = db.seed('people', {
    name: { firstName: 'Camille', lastName: 'Durand' }, emails: { primaryEmail: 'camille@calibre.example', additionalEmails: null },
    phones: { primaryPhoneNumber: '612345678', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: null },
  });
  const vat20 = db.seed('billingTaxCodes', { name: 'TVA 20 %', code: 'fr.tva.20', countryCode: 'FR', category: 'STANDARD', printNote: '', isActive: true });
  db.seed('billingTaxComponents', { name: 'TVA', taxCodeId: vat20.id, rate: 20, compound: false, sortOrder: 0 });
  const franchise = db.seed('billingTaxCodes', {
    name: 'Franchise en base de TVA', code: 'fr.franchise', countryCode: 'FR', category: 'EXEMPT',
    printNote: 'TVA non applicable, article 293 B du CGI.', isActive: true,
  });
  db.seed('billingTaxComponents', { name: 'TVA', taxCodeId: franchise.id, rate: 0, compound: false, sortOrder: 0 });

  const addLine = (kind: Kind, documentId: string, over: Record<string, unknown> = {}): Row => db.seed(kind.linePlural, {
    [kind.parentKey]: documentId, sortOrder: 1, description: 'Prestation', quantity: 1, unit: 'DAY', unitPrice: money(100_000_000),
    discountPercent: null, taxCodeId: vat20.id, catalogItemId: null, periodStart: null, periodEnd: null, lineTotal: EMPTY_MONEY, ...over,
  });
  const addInvoice = (over: Record<string, unknown> = {}): Row => db.seed('billingInvoices', {
    ...DOCUMENT, subject: 'Identité visuelle', issuerId: issuer.id, companyId: company.id, dueDate: null, buyerReference: 'BC-7781',
    opportunityId: null, quoteId: null, issuedAt: null, sentAt: null, paidAt: null, ...over,
  });
  const addCreditNote = (over: Record<string, unknown> = {}): Row => db.seed('billingCreditNotes', {
    ...DOCUMENT, subject: 'Atelier annulé', issuerId: issuer.id, companyId: company.id, invoiceId: null, reason: 'Atelier annulé', issuedAt: null, ...over,
  });
  const addQuote = (over: Record<string, unknown> = {}): Row => db.seed('billingQuotes', {
    ...DOCUMENT, subject: 'Identité visuelle, proposition', issuerId: issuer.id, companyId: company.id, validUntil: null,
    acceptedAt: null, opportunityId: null, version: null, ...over,
  });

  const invoice = addInvoice();
  const invoiceKind = { linePlural: 'billingInvoiceLines', parentKey: 'invoiceId' } as Kind;
  const lines = [
    addLine(invoiceKind, invoice.id, { sortOrder: 1, description: 'Direction artistique', quantity: 4, unitPrice: money(780_000_000) }),
    addLine(invoiceKind, invoice.id, { sortOrder: 2, description: 'Système de design', quantity: 6, unitPrice: money(640_000_000) }),
    addLine(invoiceKind, invoice.id, { sortOrder: 3, description: 'Atelier', quantity: 1, unitPrice: money(1_200_000_000) }),
  ];

  return {
    db, app: db.store('APPLICATION'), user: db.store('MANUAL'),
    profile, siren, tva, issuer, company, person, vat20, franchise, invoice, lines,
    addInvoice, addCreditNote, addQuote, addLine,
  };
}

export type Workspace = ReturnType<typeof workspace>;
```

- [ ] **Step 2: Write the failing test**

`test/lifecycle/load.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, isIssued, kindOf, kindOfLine, loadDocument, loadFigures, loadLogo } from '../../lifecycle/load.ts';
import { money, workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;

test('the three kinds name their objects, lines, profile fields and locked fields', () => {
  assert.equal(kindOf('billingInvoice'), INVOICE);
  assert.equal(kindOfLine('billingCreditNoteLine'), KINDS.billingCreditNote);
  assert.equal(kindOf('company'), undefined);
  assert.deepEqual(
    [KINDS.billingQuote.parentKey, INVOICE.parentKey, KINDS.billingCreditNote.parentKey],
    ['quoteId', 'invoiceId', 'creditNoteId'],
  );
  assert.deepEqual([...INVOICE.lockedFields].sort(), [
    'buyerReference', 'companyId', 'currencyCode', 'dueDate', 'issueDate', 'issuerId', 'language', 'notes', 'personId',
    'pricesIncludeTax', 'subject',
  ]);
  assert.deepEqual([...KINDS.billingCreditNote.lockedFields].sort(), [
    'companyId', 'currencyCode', 'invoiceId', 'issueDate', 'issuerId', 'language', 'notes', 'personId', 'pricesIncludeTax',
    'reason', 'subject',
  ]);
  assert.deepEqual(KINDS.billingQuote.lockedFields, []);
});

test('an invoice or credit note is issued once it holds a snapshot; a quote never is', () => {
  assert.equal(isIssued(INVOICE, { id: 'a', snapshot: null }), false);
  assert.equal(isIssued(INVOICE, { id: 'a', snapshot: { printed: {}, record: {} } }), true);
  assert.equal(isIssued(KINDS.billingQuote, { id: 'a', snapshot: { printed: {}, record: {} } }), false);
});

test('a draft invoice loads with its lines in order, their tax codes, the issuer, its profile and the buyer', async () => {
  const w = workspace();
  const loaded = await loadDocument(w.app, INVOICE, w.invoice.id);
  assert.ok(loaded);
  assert.equal(loaded.document.id, w.invoice.id);
  assert.deepEqual(loaded.lines.map((line) => line.description), ['Direction artistique', 'Système de design', 'Atelier']);
  assert.equal(loaded.issuer?.id, w.issuer.id);
  assert.equal(loaded.profile?.id, w.profile.id);
  assert.equal(loaded.company?.id, w.company.id);
  assert.equal(loaded.person, null);
  assert.equal(loaded.invoice, null);
  assert.deepEqual(loaded.taxCodes.get(w.vat20.id)?.components.map((component) => component.rate), [20]);
  assert.deepEqual(loaded.sellerIdentifiers.map((identifier) => identifier.value).sort(), ['000000000', 'FR12000000000']);
  assert.deepEqual(loaded.buyerIdentifiers.map((identifier) => identifier.value), ['111111111']);
  assert.deepEqual(loaded.profileTypes.map((type) => type.key).sort(), ['fr.siren', 'fr.tva']);
  assert.equal(loaded.identifierTypes.get(w.siren.id)?.name, 'SIREN');
});

test('lines follow their order, then their creation; deleted lines and deleted tax components are left out', async () => {
  const w = workspace();
  const invoice = w.addInvoice();
  const late = w.addLine(INVOICE, invoice.id, { sortOrder: 2, description: 'second, created first' });
  w.addLine(INVOICE, invoice.id, { sortOrder: 1, description: 'first' });
  w.addLine(INVOICE, invoice.id, { sortOrder: 2, description: 'second, created later' });
  w.addLine(INVOICE, invoice.id, { sortOrder: null, description: 'unordered, last' });
  const gone = w.addLine(INVOICE, invoice.id, { sortOrder: 0, description: 'deleted' });
  await w.app.softDelete(INVOICE.linePlural, gone.id);
  const component = w.db.seed('billingTaxComponents', { name: 'extra', taxCodeId: w.vat20.id, rate: 5, compound: false, sortOrder: 1 });
  await w.app.softDelete('billingTaxComponents', component.id);
  const loaded = await loadDocument(w.app, INVOICE, invoice.id);
  assert.deepEqual(loaded?.lines.map((line) => line.description), ['first', 'second, created first', 'second, created later', 'unordered, last']);
  assert.equal(loaded?.lines[1]?.id, late.id);
  assert.deepEqual(loaded?.taxCodes.get(w.vat20.id)?.components.map((c) => c.name), ['TVA']);
});

test('the buyer’s identifiers are the company’s when a company is billed, else the person’s', async () => {
  const w = workspace();
  w.db.seed('billingIdentifiers', { value: '222222222', identifierTypeId: w.siren.id, issuerId: null, companyId: null, personId: w.person.id });
  const both = await loadDocument(w.app, INVOICE, w.addInvoice({ personId: w.person.id }).id);
  assert.deepEqual(both?.buyerIdentifiers.map((identifier) => identifier.value), ['111111111']);
  const personOnly = await loadDocument(w.app, INVOICE, w.addInvoice({ companyId: null, personId: w.person.id }).id);
  assert.deepEqual(personOnly?.buyerIdentifiers.map((identifier) => identifier.value), ['222222222']);
  assert.equal(personOnly?.person?.id, w.person.id);
});

test('a credit note loads the invoice it corrects', async () => {
  const w = workspace();
  const note = w.addCreditNote({ invoiceId: w.invoice.id });
  const loaded = await loadDocument(w.app, KINDS.billingCreditNote, note.id);
  assert.equal(loaded?.invoice?.id, w.invoice.id);
});

test('a document that does not exist loads as nothing; a missing issuer or profile loads empty, for the gate to name', async () => {
  const w = workspace();
  assert.equal(await loadDocument(w.app, INVOICE, 'no-such-id'), null);
  const orphan = await loadDocument(w.app, INVOICE, w.addInvoice({ issuerId: null }).id);
  assert.equal(orphan?.issuer, null);
  assert.equal(orphan?.profile, null);
  assert.deepEqual(orphan?.sellerIdentifiers, []);
  const bare = w.db.seed('billingIssuers', { name: 'No profile', profileId: null });
  const unprofiled = await loadDocument(w.app, INVOICE, w.addInvoice({ issuerId: bare.id }).id);
  assert.equal(unprofiled?.profile, null);
  assert.deepEqual(unprofiled?.profileTypes, []);
});

test('an identifier whose type belongs to another profile still brings its type, to be printed', async () => {
  const w = workspace();
  const other = w.db.seed('billingProfiles', { name: 'Elsewhere' });
  const ein = w.db.seed('billingIdentifierTypes', { name: 'EIN', key: 'us.ein', profileId: other.id, appliesTo: 'SELLER', printOnDocuments: true, sortOrder: 0 });
  w.db.seed('billingIdentifiers', { value: '12-3456789', identifierTypeId: ein.id, issuerId: w.issuer.id, companyId: null, personId: null });
  const loaded = await loadDocument(w.app, INVOICE, w.invoice.id);
  assert.equal(loaded?.identifierTypes.get(ein.id)?.name, 'EIN');
  assert.ok(!loaded?.profileTypes.some((type) => type.id === ein.id));
});

test('the figures alone load the lines, tax codes, issuer and profile, not the parties', async () => {
  const w = workspace();
  const figures = await loadFigures(w.app, INVOICE, w.invoice.id);
  assert.equal(figures?.lines.length, 3);
  assert.equal(figures?.profile?.id, w.profile.id);
  assert.equal('company' in (figures ?? {}), false);
});

test('a soft-deleted document still loads its figures, for a guard to look at', async () => {
  const w = workspace();
  await w.app.softDelete(INVOICE.plural, w.invoice.id);
  assert.equal(await loadFigures(w.app, INVOICE, w.invoice.id), null);
  assert.equal((await loadFigures(w.app, INVOICE, w.invoice.id, { deleted: true }))?.document.id, w.invoice.id);
});

test('the logo is the issuer’s first file, with its type; no logo is nothing', async () => {
  const w = workspace();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const fileId = w.db.addFile(png, 'image/png');
  assert.deepEqual(await loadLogo(w.app, { ...w.issuer, logo: [{ fileId, label: 'logo.png' }] }), { bytes: png, type: 'image/png' });
  assert.equal(await loadLogo(w.app, w.issuer), null);
  assert.equal(await loadLogo(w.app, null), null);
  const jpg = w.db.addFile(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpg');
  assert.equal((await loadLogo(w.app, { ...w.issuer, logo: [{ fileId: jpg, label: 'logo.jpg' }] }))?.type, 'image/jpeg');
});

test('a line whose tax code was deleted loads without it, so the Engine reports the missing code', async () => {
  const w = workspace();
  const invoice = w.addInvoice();
  const code = w.db.seed('billingTaxCodes', { name: 'Gone', category: 'STANDARD' });
  w.addLine(INVOICE, invoice.id, { taxCodeId: code.id, unitPrice: money(1_000_000) });
  await w.app.softDelete('billingTaxCodes', code.id);
  const loaded = await loadDocument(w.app, INVOICE, invoice.id);
  assert.equal(loaded?.taxCodes.has(code.id), false);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/load.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/load.ts'`.

- [ ] **Step 4: Write `lifecycle/load.ts`**

```ts
import type { DocumentKind, FieldKey } from './lang/pack.ts';
import type { Row, Store } from './store.ts';

export type DocumentObject = 'billingQuote' | 'billingInvoice' | 'billingCreditNote';

export type Kind = {
  kind: DocumentKind;
  object: DocumentObject;
  plural: string;
  lineObject: string;
  linePlural: string;
  /** The line's key to its document: `quoteId`, `invoiceId`, `creditNoteId`. */
  parentKey: string;
  /** The profile fields that apply to this kind. */
  patternField: 'quoteNumberPattern' | 'invoiceNumberPattern' | 'creditNoteNumberPattern';
  mentionsField: 'quoteMentions' | 'invoiceMentions' | 'creditNoteMentions';
  titleField: 'invoiceTitle' | 'creditNoteTitle' | null;
  /** What an issued document depends on (spec §7): a guard puts back any change. Quotes lock nothing. */
  lockedFields: readonly FieldKey[];
};

const SHARED_LOCKS = ['subject', 'issuerId', 'companyId', 'personId', 'issueDate', 'currencyCode', 'pricesIncludeTax', 'language', 'notes'] as const;

export const KINDS: Record<DocumentObject, Kind> = {
  billingQuote: {
    kind: 'QUOTE', object: 'billingQuote', plural: 'billingQuotes', lineObject: 'billingQuoteLine',
    linePlural: 'billingQuoteLines', parentKey: 'quoteId', patternField: 'quoteNumberPattern',
    mentionsField: 'quoteMentions', titleField: null, lockedFields: [],
  },
  billingInvoice: {
    kind: 'INVOICE', object: 'billingInvoice', plural: 'billingInvoices', lineObject: 'billingInvoiceLine',
    linePlural: 'billingInvoiceLines', parentKey: 'invoiceId', patternField: 'invoiceNumberPattern',
    mentionsField: 'invoiceMentions', titleField: 'invoiceTitle', lockedFields: [...SHARED_LOCKS, 'dueDate', 'buyerReference'],
  },
  billingCreditNote: {
    kind: 'CREDIT_NOTE', object: 'billingCreditNote', plural: 'billingCreditNotes', lineObject: 'billingCreditNoteLine',
    linePlural: 'billingCreditNoteLines', parentKey: 'creditNoteId', patternField: 'creditNoteNumberPattern',
    mentionsField: 'creditNoteMentions', titleField: 'creditNoteTitle', lockedFields: [...SHARED_LOCKS, 'invoiceId', 'reason'],
  },
};

export const kindOf = (object: string): Kind | undefined => KINDS[object as DocumentObject];
export const kindOfLine = (lineObject: string): Kind | undefined =>
  Object.values(KINDS).find((kind) => kind.lineObject === lineObject);

/** A line's fields a person edits: the snapshot keeps them, and a guard puts them back. */
export const LINE_FIELDS = [
  'description', 'sortOrder', 'catalogItemId', 'quantity', 'unit', 'unitPrice', 'discountPercent', 'taxCodeId',
  'periodStart', 'periodEnd',
] as const;

/** An invoice or credit note is issued once it holds a snapshot (spec §7). */
export const isIssued = (kind: Kind, document: Row): boolean => kind.kind !== 'QUOTE' && Boolean(document.snapshot);

export type TaxCode = { row: Row; components: Row[] };

export type Figures = {
  kind: Kind;
  document: Row;
  lines: Row[];
  /** Each tax code the lines use, by id, with its live components. A deleted code is left out. */
  taxCodes: ReadonlyMap<string, TaxCode>;
  issuer: Row | null;
  profile: Row | null;
};

export type Loaded = Figures & {
  company: Row | null;
  person: Row | null;
  /** A credit note's invoice. */
  invoice: Row | null;
  sellerIdentifiers: Row[];
  /** The printed buyer's: the company's when one is billed, else the person's. */
  buyerIdentifiers: Row[];
  /** Every identifier type involved, the profile's and those the identifiers use, by id. */
  identifierTypes: ReadonlyMap<string, Row>;
  /** The profile's own types, whose requirements the gate checks. */
  profileTypes: Row[];
};

const idOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

async function getLive(store: Store, plural: string, id: unknown): Promise<Row | null> {
  const key = idOf(id);
  return key ? store.get(plural, key) : null;
}

/** By `sortOrder`, empty last, then by creation. */
function byOrder(a: Row, b: Row): number {
  const [x, y] = [a.sortOrder, b.sortOrder].map((value) => (typeof value === 'number' ? value : Number.POSITIVE_INFINITY));
  if (x !== y) return x! < y! ? -1 : 1;
  return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
}

/** The document, its live lines in order, their tax codes, the issuer and its profile: what totals need. */
export async function loadFigures(store: Store, kind: Kind, id: string, options: { deleted?: boolean } = {}): Promise<Figures | null> {
  const document = await store.get(kind.plural, id, options);
  if (!document) return null;
  const lines = (await store.list(kind.linePlural, { [kind.parentKey]: id })).sort(byOrder);
  const taxCodes = new Map<string, TaxCode>();
  for (const codeId of new Set(lines.map((line) => idOf(line.taxCodeId)).filter((key): key is string => key !== null))) {
    const row = await store.get('billingTaxCodes', codeId);
    if (!row) continue;
    const components = (await store.list('billingTaxComponents', { taxCodeId: codeId })).sort(byOrder);
    taxCodes.set(codeId, { row, components });
  }
  const issuer = await getLive(store, 'billingIssuers', document.issuerId);
  const profile = issuer ? await getLive(store, 'billingProfiles', issuer.profileId) : null;
  return { kind, document, lines, taxCodes, issuer, profile };
}

/** Everything an action needs: the figures, the parties, their identifiers and the identifier types. */
export async function loadDocument(store: Store, kind: Kind, id: string): Promise<Loaded | null> {
  const figures = await loadFigures(store, kind, id);
  if (!figures) return null;
  const { document, issuer, profile } = figures;
  const company = await getLive(store, 'companies', document.companyId);
  const person = await getLive(store, 'people', document.personId);
  const invoice = kind.kind === 'CREDIT_NOTE' ? await getLive(store, 'billingInvoices', document.invoiceId) : null;
  const sellerIdentifiers = issuer ? await store.list('billingIdentifiers', { issuerId: issuer.id }) : [];
  const buyerIdentifiers = company
    ? await store.list('billingIdentifiers', { companyId: company.id })
    : person ? await store.list('billingIdentifiers', { personId: person.id }) : [];
  const profileTypes = profile ? await store.list('billingIdentifierTypes', { profileId: profile.id }) : [];
  const identifierTypes = new Map(profileTypes.map((type) => [type.id, type]));
  for (const identifier of [...sellerIdentifiers, ...buyerIdentifiers]) {
    const typeId = idOf(identifier.identifierTypeId);
    if (!typeId || identifierTypes.has(typeId)) continue;
    const type = await store.get('billingIdentifierTypes', typeId);
    if (type) identifierTypes.set(typeId, type);
  }
  return { ...figures, company, person, invoice, sellerIdentifiers, buyerIdentifiers, identifierTypes, profileTypes };
}

/** The issuer's logo: its first file's bytes, with the type the Renderer knows ('image/jpg' read as 'image/jpeg'). */
export async function loadLogo(store: Store, issuer: Row | null): Promise<{ bytes: Uint8Array; type: string } | null> {
  const first = Array.isArray(issuer?.logo) ? issuer.logo[0] : undefined;
  if (!first) return null;
  const file = await store.download(first);
  if (!file) return null;
  return { bytes: file.bytes, type: file.type === 'image/jpg' ? 'image/jpeg' : file.type };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/load.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add lifecycle/load.ts test/lifecycle/helpers/fixtures.ts test/lifecycle/load.test.ts
```

```bash
git commit -m "feat: Lifecycle loads a document with everything its figures, gate and PDF need"
```

---

### Task 6: From records to the Engine's and the Renderer's inputs

`lifecycle/map.ts` turns the loaded records into the Engine's `DocumentInput` and the Renderer's `RenderInput` (spec §9): lines in order, tax codes by record id, the parties with their addresses printed the way their country writes them, identifiers in their type's order, units in the document's language, rich text as plain text, and the generic QR payload. It also holds the small readers every later module uses for Twenty's field shapes.

Twenty stores an address's country as its English name, the one `Intl.DisplayNames(['en'], { type: 'region' })` gives ("France", "United States"), so the country code is found by the same means; a two-letter code is accepted too. A person has no address in Twenty 2.41: a person buyer prints a name and contacts only. When a company is billed and a person is set too, the person's email and phone are the company's contact on the document.

**Files:**
- Create: `lifecycle/map.ts`
- Test: `test/lifecycle/map.test.ts`

**Interfaces:**
- Consumes: `minorDigits`, `DocumentInput`, `DocumentResult`, `TaxCategory`, `TaxCodeInput` from `engine/index.ts`; `Party`, `PrintedIdentifier`, `RenderInput`, `TemplateKey` from `render/types.ts`; `PACKS`, `Language`, `LifecyclePack`, `UnitKey` from `lifecycle/lang/pack.ts`; `Figures`, `Loaded`, `TaxCode` from `lifecycle/load.ts`; `FileRef`, `Row` from `lifecycle/store.ts`.
- Produces, from `lifecycle/map.ts`:
  - `textOf(value: unknown): string`, `idOf(value: unknown): string | null`
  - `microsOf(value: unknown): number` (NaN when empty), `currencyOf(value: unknown): string`, `moneyOf(amountMicros: number | null, currencyCode: string): { amountMicros: number | null; currencyCode: string }`
  - `effectiveCurrency(figures: Pick<Figures, 'document' | 'issuer' | 'profile'>): string`
  - `languageOf(document: Row, profile: Row | null): Language`
  - `countryCode(value: unknown): string | null`
  - `addressLines(value: unknown, printCountry: boolean): string[]`
  - `plainText(value: unknown): string`
  - `unitName(pack: LifecyclePack, unit: unknown): string`
  - `decimalAmount(micros: number, currencyCode: string): string`
  - `fileInputs(value: unknown): FileRef[]` (a FILES value as Twenty accepts it on write)
  - `toDocumentInput(figures: Figures, currencyCode?: string): DocumentInput`
  - `type RenderOptions = { number: string | null; version?: number | null; issueDate: string; logo: { bytes: Uint8Array; type: string } | null }`
  - `toRenderInput(loaded: Loaded, totals: DocumentResult, options: RenderOptions): RenderInput`

- [ ] **Step 1: Write the failing test**

`test/lifecycle/map.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDocument } from '../../engine/index.ts';
import { checkRender } from '../../render/document.ts';
import { PACKS } from '../../lifecycle/lang/pack.ts';
import { KINDS, loadDocument, type Loaded } from '../../lifecycle/load.ts';
import {
  addressLines, countryCode, decimalAmount, effectiveCurrency, fileInputs, microsOf, plainText, toDocumentInput, toRenderInput,
  unitName,
} from '../../lifecycle/map.ts';
import { TODAY, address, markdown, money, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;

async function loaded(w: Workspace, id = w.invoice.id, kind = INVOICE): Promise<Loaded> {
  const result = await loadDocument(w.app, kind, id);
  assert.ok(result);
  return result;
}

const render = (l: Loaded, number: string | null = 'F2026-0001') =>
  toRenderInput(l, computeDocument(toDocumentInput(l)), { number, issueDate: TODAY, logo: null });

test('the Engine’s input carries each line in order, with its tax code by record id and its live components', async () => {
  const w = workspace();
  const input = toDocumentInput(await loaded(w));
  assert.deepEqual({ ...input, lines: input.lines.length }, { currencyCode: 'EUR', pricesIncludeTax: false, roundingMode: 'PER_RATE_ON_TOTAL', lines: 3 });
  assert.deepEqual(input.lines[0], {
    key: w.lines[0]!.id, quantity: 4, unitPrice: { amountMicros: 780_000_000, currencyCode: 'EUR' }, discountPercent: null,
    tax: { code: w.vat20.id, name: 'TVA 20 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 20, compound: false, sortOrder: 0 }] },
  });
});

test('empty values reach the Engine as the problems they are, and an amount given as text is read as a number', async () => {
  const w = workspace();
  const invoice = w.addInvoice();
  w.addLine(INVOICE, invoice.id, { quantity: null, unitPrice: money(null, ''), taxCodeId: null, discountPercent: '' });
  w.addLine(INVOICE, invoice.id, { sortOrder: 2, unitPrice: { amountMicros: '1500000', currencyCode: 'EUR' } });
  const [empty, text] = toDocumentInput(await loaded(w, invoice.id)).lines;
  assert.ok(Number.isNaN(empty!.quantity));
  assert.ok(Number.isNaN(empty!.unitPrice.amountMicros));
  assert.equal(empty!.tax, null);
  assert.equal(empty!.discountPercent, null);
  assert.equal(text!.unitPrice.amountMicros, 1_500_000);
});

test('a profile rounding per line is passed on, and the currency can be given for a document that has none yet', async () => {
  const w = workspace();
  const l = await loaded(w);
  const input = toDocumentInput({ ...l, profile: { ...l.profile!, roundingMode: 'PER_LINE' } }, 'CHF');
  assert.equal(input.roundingMode, 'PER_LINE');
  assert.equal(input.currencyCode, 'CHF');
});

test('the currency a document will carry: its own, else the issuer’s, else the profile’s', () => {
  const profile = { id: 'p', defaultCurrency: 'EUR' };
  assert.equal(effectiveCurrency({ document: { id: 'd', currencyCode: 'USD' }, issuer: { id: 'i', defaultCurrency: 'GBP' }, profile }), 'USD');
  assert.equal(effectiveCurrency({ document: { id: 'd', currencyCode: '' }, issuer: { id: 'i', defaultCurrency: 'GBP' }, profile }), 'GBP');
  assert.equal(effectiveCurrency({ document: { id: 'd', currencyCode: '' }, issuer: { id: 'i', defaultCurrency: '' }, profile }), 'EUR');
  assert.equal(effectiveCurrency({ document: { id: 'd' }, issuer: null, profile: null }), '');
});

test('the Renderer’s input for an invoice, field by field', async () => {
  const w = workspace();
  const input = render(await loaded(w));
  assert.equal(input.template, 'classic');
  assert.equal(input.language, 'FR');
  assert.equal(input.locale, 'fr-FR');
  assert.equal(input.kind, 'INVOICE');
  assert.equal(input.title, null);
  assert.equal(input.number, 'F2026-0001');
  assert.equal(input.version, null);
  assert.equal(input.issueDate, TODAY);
  assert.equal(input.corrects, null);
  assert.equal(input.subject, 'Identité visuelle');
  assert.equal(input.notes, null);
  assert.equal(input.buyerReference, 'BC-7781');
  assert.deepEqual(input.seller, {
    name: 'Verdal Studio', legalName: 'Verdal Studio SARL', legalForm: 'SARL au capital de 10 000 €',
    addressLines: ['12 rue des Peupliers', '75013 Paris'], email: 'bonjour@verdal.example', phone: '+33 123456789',
    website: 'verdal.example',
  });
  assert.deepEqual(input.buyer, {
    name: 'Maison Calibre', legalName: null, legalForm: null, addressLines: ['48 avenue du Port', '33000 Bordeaux'],
    email: null, phone: null, website: null,
  });
  assert.deepEqual(input.identifiers, [
    { label: 'SIREN', value: '000000000', side: 'SELLER' },
    { label: 'N° TVA intracommunautaire', value: 'FR12000000000', side: 'SELLER' },
    { label: 'SIREN', value: '111111111', side: 'BUYER' },
  ]);
  assert.deepEqual(input.lines[0], {
    key: w.lines[0]!.id, description: 'Direction artistique', quantity: 4, unit: 'jour', unitPriceMicros: 780_000_000,
    discountPercent: null, taxLabel: 'TVA 20 %', lineTotalMicros: 3_120_000_000, periodStart: null, periodEnd: null,
  });
  assert.deepEqual(input.taxNames, { [w.vat20.id]: 'TVA 20 %' });
  assert.deepEqual(input.taxNotes, []);
  assert.equal(input.mentions, 'Pénalités de retard : trois fois le taux d’intérêt légal.');
  assert.equal(input.amountInWords, false);
  assert.deepEqual(input.brand, { accentColor: '#2f6f4e', footerNote: 'Verdal Studio SARL, Paris', paymentDetails: 'IBAN FR76 0000 0000 0000 0000 0000 000', logo: null });
  assert.equal(input.qr, null);
  assert.equal(input.totals.totalMicros, 9_792_000_000);
  assert.deepEqual(checkRender(input), []);
});

test('the document’s own language wins over the profile’s, and a profile title replaces the default one', async () => {
  const w = workspace();
  const l = await loaded(w, w.addInvoice({ language: 'EN' }).id);
  w.addLine(INVOICE, l.document.id);
  const input = render({ ...(await loaded(w, l.document.id)), profile: { ...l.profile!, invoiceTitle: 'Facture acquittée' } });
  assert.equal(input.language, 'EN');
  assert.equal(input.lines[0]?.unit, 'day');
  assert.equal(input.title, 'Facture acquittée');
});

test('an issuer’s template is read in lower case, the Renderer’s keys', async () => {
  const w = workspace();
  const l = await loaded(w);
  assert.equal(render({ ...l, issuer: { ...l.issuer!, template: 'RECEIPT' } }).template, 'receipt');
  assert.equal(render({ ...l, issuer: { ...l.issuer!, template: null } }).template, 'classic');
});

test('a credit note names the invoice it corrects; a quote carries its validity and version', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ number: 'F2026-0001', numberKey: `${w.issuer.id}:F2026-0001`, issueDate: '2026-09-01', snapshot: { printed: {}, record: {} } });
  const note = w.addCreditNote({ invoiceId: invoice.id });
  w.addLine(KINDS.billingCreditNote, note.id);
  const noteInput = render(await loaded(w, note.id, KINDS.billingCreditNote), 'AV2026-0001');
  assert.deepEqual(noteInput.corrects, { number: 'F2026-0001', issueDate: '2026-09-01' });
  assert.equal(noteInput.kind, 'CREDIT_NOTE');
  const quote = w.addQuote({ validUntil: '2026-10-26' });
  w.addLine(KINDS.billingQuote, quote.id);
  const l = await loaded(w, quote.id, KINDS.billingQuote);
  const quoteInput = toRenderInput(l, computeDocument(toDocumentInput(l)), { number: 'D2026-0001', version: 2, issueDate: TODAY, logo: null });
  assert.equal(quoteInput.validUntil, '2026-10-26');
  assert.equal(quoteInput.version, 2);
  assert.equal(quoteInput.dueDate, null);
});

test('a person billed alone prints a name and contacts; with a company, the person is its contact', async () => {
  const w = workspace();
  const alone = w.addInvoice({ companyId: null, personId: w.person.id });
  w.addLine(INVOICE, alone.id);
  assert.deepEqual(render(await loaded(w, alone.id)).buyer, {
    name: 'Camille Durand', legalName: null, legalForm: null, addressLines: [], email: 'camille@calibre.example',
    phone: '+33 612345678', website: null,
  });
  const both = w.addInvoice({ personId: w.person.id });
  w.addLine(INVOICE, both.id);
  const buyer = render(await loaded(w, both.id)).buyer;
  assert.equal(buyer.name, 'Maison Calibre');
  assert.equal(buyer.email, 'camille@calibre.example');
});

test('a buyer abroad gets its country printed, in its own address order', async () => {
  const w = workspace();
  const us = w.db.seed('companies', { name: 'Harbor Goods', address: { ...address('1600 Main Street', 'Springfield', '62704', 'United States'), addressState: 'IL' } });
  const invoice = w.addInvoice({ companyId: us.id });
  w.addLine(INVOICE, invoice.id);
  assert.deepEqual(render(await loaded(w, invoice.id)).buyer.addressLines, ['1600 Main Street', 'Springfield, IL 62704', 'United States']);
});

test('addresses follow their country’s order', () => {
  const lines = (country: string, over: Record<string, string> = {}) => addressLines({ ...address('1 High Street', 'Town', '12345', country), ...over }, false);
  assert.deepEqual(lines('France'), ['1 High Street', '12345 Town']);
  assert.deepEqual(lines('Morocco'), ['1 High Street', '12345 Town']);
  assert.deepEqual(lines('Germany'), ['1 High Street', '12345 Town']);
  assert.deepEqual(lines('United States', { addressState: 'NY' }), ['1 High Street', 'Town, NY 12345']);
  assert.deepEqual(lines('Canada', { addressState: 'QC' }), ['1 High Street', 'Town, QC 12345']);
  assert.deepEqual(lines('India', { addressState: 'KA' }), ['1 High Street', 'Town, KA 12345']);
  assert.deepEqual(lines('United Kingdom', { addressPostcode: 'SW1A 1AA' }), ['1 High Street', 'Town', 'SW1A 1AA']);
  assert.deepEqual(lines(''), ['1 High Street', '12345 Town']);
  assert.deepEqual(addressLines({ ...address('1 High Street', 'Town', '12345', 'France'), addressStreet2: 'Bât. B' }, true), ['1 High Street', 'Bât. B', '12345 Town', 'France']);
  assert.deepEqual(addressLines(null, true), []);
});

test('a country is known by its English name, as Twenty stores it, or by its code', () => {
  assert.equal(countryCode('France'), 'FR');
  assert.equal(countryCode('united kingdom'), 'GB');
  assert.equal(countryCode('Côte d’Ivoire'), 'CI');
  assert.equal(countryCode('ma'), 'MA');
  assert.equal(countryCode('Atlantis'), null);
  assert.equal(countryCode(''), null);
  assert.equal(countryCode(null), null);
});

test('units are named in the document’s language, and an unknown unit is printed as it is', () => {
  assert.equal(unitName(PACKS.FR, 'FLAT_FEE'), 'forfait');
  assert.equal(unitName(PACKS.EN, 'M2'), 'm²');
  assert.equal(unitName(PACKS.EN, 'CRATE'), 'crate');
  assert.equal(unitName(PACKS.EN, null), '');
});

test('rich text is printed as plain text: the markdown Twenty stores, markup removed', () => {
  assert.equal(plainText(markdown('# Terms\n\nSome **bold**, *italic* and _underlined_ text.')), 'Terms\n\nSome bold, italic and underlined text.');
  assert.equal(plainText(markdown('- one\n* two\n+ three\n- [x] done')), '- one\n- two\n- three\n- done');
  assert.equal(plainText(markdown('See [the site](https://x.example) and ![logo](a.png).')), 'See the site and logo.');
  assert.equal(plainText(markdown('snake_case_name and 2 * 3 * 4')), 'snake_case_name and 2 * 3 * 4');
  assert.equal(plainText(markdown('> quoted\n`code` ~~gone~~ 1\\. not a list')), 'quoted\ncode gone 1. not a list');
  assert.equal(plainText({ markdown: null, blocknote: JSON.stringify([
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }, { type: 'link', content: [{ type: 'text', text: ' world' }] }], children: [] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Again' }], children: [] },
  ]) }), 'Hello world\nAgain');
  assert.equal(plainText({ markdown: null, blocknote: 'not json' }), '');
  assert.equal(plainText(null), '');
});

test('the QR code carries the number, the date, the total, the currency and the seller’s first printed identifier', async () => {
  const w = workspace();
  const l = await loaded(w);
  const withQr = (mode: string, url = '') => ({ ...l, profile: { ...l.profile!, qrMode: mode }, issuer: { ...l.issuer!, verificationBaseUrl: { primaryLinkUrl: url } } });
  assert.deepEqual(render(withQr('PAYLOAD')).qr, { mode: 'PAYLOAD', payload: 'F2026-0001;2026-09-26;9792.00;EUR;000000000' });
  assert.deepEqual(render(withQr('URL_WITH_PAYLOAD', 'https://verify.example/check')).qr, {
    mode: 'URL_WITH_PAYLOAD', payload: 'F2026-0001;2026-09-26;9792.00;EUR;000000000', baseUrl: 'https://verify.example/check',
  });
  assert.equal(render(withQr('URL_WITH_PAYLOAD')).qr?.baseUrl, null);
  assert.equal(render(withQr('PAYLOAD'), null).qr, null, 'a preview has no number, so no QR code');
  assert.equal(render(withQr('NONE')).qr, null);
});

test('an amount in the QR code keeps its currency’s decimals', () => {
  assert.equal(decimalAmount(9_792_000_000, 'EUR'), '9792.00');
  assert.equal(decimalAmount(1_500_000_000, 'JPY'), '1500');
  assert.equal(decimalAmount(1_234_567_000, 'KWD'), '1234.567');
  assert.equal(decimalAmount(-1_000_000, 'EUR'), '-1.00');
});

test('a FILES value keeps only what Twenty accepts on write', () => {
  assert.deepEqual(fileInputs([{ fileId: 'a', label: 'A.pdf', extension: '.pdf', url: 'https://x/file/a?token=t' }, { label: 'no id' }]), [{ fileId: 'a', label: 'A.pdf' }]);
  assert.deepEqual(fileInputs(null), []);
});

test('an amount is read from a CURRENCY value, as a number or as digits', () => {
  assert.equal(microsOf(money(12_000_000)), 12_000_000);
  assert.equal(microsOf({ amountMicros: '-3000000', currencyCode: 'EUR' }), -3_000_000);
  assert.ok(Number.isNaN(microsOf({ amountMicros: '1.5', currencyCode: 'EUR' })));
  assert.ok(Number.isNaN(microsOf(null)));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/map.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/map.ts'`.

- [ ] **Step 3: Write `lifecycle/map.ts`**

```ts
import { minorDigits, type DocumentInput, type DocumentResult, type TaxCategory, type TaxCodeInput } from '../engine/index.ts';
import type { Party, PrintedIdentifier, RenderInput, TemplateKey } from '../render/types.ts';
import { PACKS, type Language, type LifecyclePack, type UnitKey } from './lang/pack.ts';
import type { Figures, Loaded, TaxCode } from './load.ts';
import type { FileRef, Row } from './store.ts';

/** Readers for the shapes Twenty's REST API returns. */

export const textOf = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');
export const idOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const numberOf = (value: unknown): number =>
  typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
const field = (value: unknown, key: string): unknown => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined);

/** A CURRENCY value's micros; NaN when there are none, which the Engine reports as INVALID_AMOUNT. */
export function microsOf(value: unknown): number {
  const amount = field(value, 'amountMicros');
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string' && /^-?\d+$/.test(amount)) return Number(amount);
  return Number.NaN;
}

export const currencyOf = (value: unknown): string => textOf(field(value, 'currencyCode'));
export const moneyOf = (amountMicros: number | null, currencyCode: string) => ({ amountMicros, currencyCode });

/** The currency the document will carry: its own, else the issuer's default, else the profile's (spec §6). */
export function effectiveCurrency(figures: Pick<Figures, 'document' | 'issuer' | 'profile'>): string {
  return (
    textOf(figures.document.currencyCode).trim() ||
    textOf(figures.issuer?.defaultCurrency).trim() ||
    textOf(figures.profile?.defaultCurrency).trim()
  );
}

/** The document's language, else the profile's. The Renderer refuses one it has no pack for. */
export const languageOf = (document: Row, profile: Row | null): Language =>
  (textOf(document.language) || textOf(profile?.language) || 'EN') as Language;

const packOf = (language: Language): LifecyclePack => PACKS[language] ?? PACKS.EN;

let regionCodes: Map<string, string> | undefined;
const fold = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").trim().toLowerCase();

/** The ISO 3166 code of a country as Twenty stores it (its English name), or as a code. Null when unknown. */
export function countryCode(value: unknown): string | null {
  const text = textOf(value).trim();
  if (text === '') return null;
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  if (!regionCodes) {
    regionCodes = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let first = 65; first <= 90; first++) {
      for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        const name = names.of(code);
        if (name && name !== code) regionCodes.set(fold(name), code);
      }
    }
  }
  return regionCodes.get(fold(text)) ?? null;
}

/** "Springfield, IL 62704". */
const CITY_STATE_POSTCODE = new Set(['US', 'CA', 'IN']);
/** City and postcode on lines of their own. */
const CITY_THEN_POSTCODE = new Set(['GB']);

/** An address in the order its country writes it: "75013 Paris" in most of Europe and in Morocco, the default. */
export function addressLines(value: unknown, printCountry: boolean): string[] {
  const part = (key: string): string => textOf(field(value, key)).trim();
  const [city, postcode, state, country] = [part('addressCity'), part('addressPostcode'), part('addressState'), part('addressCountry')];
  const code = countryCode(country);
  let place: string[];
  if (code && CITY_STATE_POSTCODE.has(code)) place = [[city, [state, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')];
  else if (code && CITY_THEN_POSTCODE.has(code)) place = [city, postcode];
  else place = [[postcode, city].filter(Boolean).join(' '), state];
  return [part('addressStreet1'), part('addressStreet2'), ...place, printCountry ? country : ''].filter((line) => line !== '');
}

function blocknoteText(json: string): string {
  let blocks: unknown;
  try {
    blocks = JSON.parse(json);
  } catch {
    return '';
  }
  const inline = (items: unknown): string =>
    Array.isArray(items) ? items.map((item) => (typeof field(item, 'text') === 'string' ? String(field(item, 'text')) : inline(field(item, 'content')))).join('') : '';
  const lines: string[] = [];
  const walk = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const block of list) {
      lines.push(inline(field(block, 'content')));
      walk(field(block, 'children'));
    }
  };
  walk(blocks);
  return lines.join('\n');
}

function markdownOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const markdown = field(value, 'markdown');
  if (typeof markdown === 'string' && markdown.trim() !== '') return markdown;
  const blocknote = field(value, 'blocknote');
  return typeof blocknote === 'string' && blocknote !== '' ? blocknoteText(blocknote) : '';
}

/** Rich text printed as plain text: the markdown Twenty stores, with its markup removed (spec §9). */
export function plainText(value: unknown): string {
  return markdownOf(value)
    .replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    .replace(/^([ \t]*)[-*+][ \t]+(?:\[[ xX]\][ \t]+)?/gm, '$1- ')
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A unit in the document's language; a unit outside the list is printed as it is. */
export function unitName(pack: LifecyclePack, unit: unknown): string {
  const key = textOf(unit);
  return key in pack.units ? pack.units[key as UnitKey] : key.toLowerCase();
}

/** Micros as a plain decimal in the currency's minor unit: 9792.00 EUR, 1500 JPY. */
export function decimalAmount(micros: number, currencyCode: string): string {
  const digits = minorDigits(currencyCode);
  const minor = BigInt(Math.round(micros)) / 10n ** BigInt(6 - digits);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const scale = 10n ** BigInt(digits);
  const fraction = (absolute % scale).toString().padStart(digits, '0');
  return `${negative ? '-' : ''}${absolute / scale}${digits > 0 ? `.${fraction}` : ''}`;
}

/** A FILES value as Twenty accepts it on write: `fileId` and `label` only (a read adds `extension` and `url`). */
export function fileInputs(value: unknown): FileRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof field(item, 'fileId') === 'string' ? [{ fileId: String(field(item, 'fileId')), label: textOf(field(item, 'label')) }] : []));
}

function taxInput(code: TaxCode | undefined): TaxCodeInput | null {
  if (!code) return null;
  return {
    code: code.row.id,
    name: textOf(code.row.name),
    category: (textOf(code.row.category) || 'STANDARD') as TaxCategory,
    components: code.components.map((component) => {
      const order = numberOf(component.sortOrder);
      return { name: textOf(component.name), rate: numberOf(component.rate), compound: component.compound === true, sortOrder: Number.isFinite(order) ? order : 0 };
    }),
  };
}

/** The Engine's input. `currencyCode` is the document's unless given: totals use the currency the document will carry. */
export function toDocumentInput(figures: Figures, currencyCode: string = textOf(figures.document.currencyCode)): DocumentInput {
  return {
    currencyCode,
    pricesIncludeTax: figures.document.pricesIncludeTax === true,
    roundingMode: figures.profile?.roundingMode === 'PER_LINE' ? 'PER_LINE' : 'PER_RATE_ON_TOTAL',
    lines: figures.lines.map((line) => {
      const discount = numberOf(line.discountPercent);
      return {
        key: line.id,
        quantity: numberOf(line.quantity),
        unitPrice: { amountMicros: microsOf(line.unitPrice), currencyCode: currencyOf(line.unitPrice) },
        discountPercent: Number.isNaN(discount) ? null : discount,
        tax: taxInput(figures.taxCodes.get(idOf(line.taxCodeId) ?? '')),
      };
    }),
  };
}

const linkOf = (value: unknown): string => textOf(field(value, 'primaryLinkUrl')).trim();
const emailOf = (value: unknown): string | null => orNull(textOf(field(value, 'primaryEmail')));

function phoneOf(value: unknown): string | null {
  const number = textOf(field(value, 'primaryPhoneNumber')).trim();
  if (number === '') return null;
  const calling = textOf(field(value, 'primaryPhoneCallingCode')).trim();
  return calling !== '' && !number.startsWith('+') ? `${calling} ${number}` : number;
}

const countryOf = (address: unknown): string => {
  const name = textOf(field(address, 'addressCountry')).trim();
  return countryCode(name) ?? name;
};

function sellerParty(issuer: Row | null): Party {
  return {
    name: textOf(issuer?.name).trim() || textOf(issuer?.legalName).trim(),
    legalName: orNull(textOf(issuer?.legalName)),
    legalForm: orNull(textOf(issuer?.legalForm)),
    addressLines: addressLines(issuer?.postalAddress, false),
    email: emailOf(issuer?.emails),
    phone: phoneOf(issuer?.phones),
    website: orNull(linkOf(issuer?.website).replace(/^https?:\/\//i, '').replace(/\/+$/, '')),
  };
}

/** The company when one is billed, with the person as its contact; else the person (spec §9). */
function buyerParty(loaded: Loaded): Party {
  const { company, person } = loaded;
  const contact = { email: emailOf(person?.emails), phone: phoneOf(person?.phones) };
  if (company) {
    const country = countryOf(company.address);
    const printCountry = country !== '' && country !== countryOf(loaded.issuer?.postalAddress);
    return { name: textOf(company.name).trim(), legalName: null, legalForm: null, addressLines: addressLines(company.address, printCountry), ...contact, website: null };
  }
  const name = `${textOf(field(person?.name, 'firstName'))} ${textOf(field(person?.name, 'lastName'))}`.trim();
  return { name, legalName: null, legalForm: null, addressLines: [], ...contact, website: null };
}

/** The identifiers whose type is printed, seller first, each side in its types' order. */
function printedIdentifiers(loaded: Loaded): PrintedIdentifier[] {
  const side = (rows: Row[], which: 'SELLER' | 'BUYER'): PrintedIdentifier[] =>
    rows
      .flatMap((identifier) => {
        const type = loaded.identifierTypes.get(idOf(identifier.identifierTypeId) ?? '');
        const value = textOf(identifier.value).trim();
        if (!type || type.printOnDocuments === false || value === '') return [];
        const order = numberOf(type.sortOrder);
        return [{ order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY, printed: { label: textOf(type.name).trim(), value, side: which } }];
      })
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.printed);
  return [...side(loaded.sellerIdentifiers, 'SELLER'), ...side(loaded.buyerIdentifiers, 'BUYER')];
}

function qrOf(loaded: Loaded, number: string | null, issueDate: string, totals: DocumentResult, identifiers: PrintedIdentifier[]): RenderInput['qr'] {
  const mode = textOf(loaded.profile?.qrMode);
  if (number === null || (mode !== 'PAYLOAD' && mode !== 'URL_WITH_PAYLOAD')) return null;
  const currencyCode = textOf(loaded.document.currencyCode);
  const seller = identifiers.find((identifier) => identifier.side === 'SELLER')?.value ?? '';
  const payload = [number, issueDate, decimalAmount(totals.totalMicros, currencyCode), currencyCode, seller].join(';');
  if (mode === 'PAYLOAD') return { mode: 'PAYLOAD', payload };
  return { mode: 'URL_WITH_PAYLOAD', payload, baseUrl: orNull(linkOf(loaded.issuer?.verificationBaseUrl)) };
}

export type RenderOptions = { number: string | null; version?: number | null; issueDate: string; logo: { bytes: Uint8Array; type: string } | null };

/** The Renderer's input (spec §9). `number` null prints the draft marker. */
export function toRenderInput(loaded: Loaded, totals: DocumentResult, options: RenderOptions): RenderInput {
  const { document, kind, issuer, profile } = loaded;
  const language = languageOf(document, profile);
  const pack = packOf(language);
  const identifiers = printedIdentifiers(loaded);
  const taxName = (code: string): string => textOf(loaded.taxCodes.get(code)?.row.name).trim();
  return {
    template: (textOf(issuer?.template).trim().toLowerCase() || 'classic') as TemplateKey,
    language,
    locale: textOf(profile?.locale).trim() || (language === 'FR' ? 'fr-FR' : 'en-GB'),
    kind: kind.kind,
    title: kind.titleField ? orNull(textOf(profile?.[kind.titleField])) : null,
    number: options.number,
    version: kind.kind === 'QUOTE' ? (options.version ?? null) : null,
    issueDate: options.issueDate,
    corrects: kind.kind === 'CREDIT_NOTE' && loaded.invoice ? { number: textOf(loaded.invoice.number), issueDate: textOf(loaded.invoice.issueDate) } : null,
    dueDate: kind.kind === 'INVOICE' ? orNull(textOf(document.dueDate)) : null,
    validUntil: kind.kind === 'QUOTE' ? orNull(textOf(document.validUntil)) : null,
    subject: orNull(textOf(document.subject)),
    notes: orNull(plainText(document.notes)),
    currencyCode: textOf(document.currencyCode),
    pricesIncludeTax: document.pricesIncludeTax === true,
    seller: sellerParty(issuer),
    buyer: buyerParty(loaded),
    buyerReference: kind.kind === 'INVOICE' ? orNull(textOf(document.buyerReference)) : null,
    identifiers,
    lines: loaded.lines.map((line) => {
      const discount = numberOf(line.discountPercent);
      return {
        key: line.id,
        description: textOf(line.description),
        quantity: numberOf(line.quantity),
        unit: unitName(pack, line.unit),
        unitPriceMicros: microsOf(line.unitPrice),
        discountPercent: Number.isNaN(discount) ? null : discount,
        taxLabel: taxName(idOf(line.taxCodeId) ?? ''),
        lineTotalMicros: totals.lines.find((result) => result.key === line.id)?.lineTotalMicros ?? 0,
        periodStart: orNull(textOf(line.periodStart)),
        periodEnd: orNull(textOf(line.periodEnd)),
      };
    }),
    totals,
    taxNames: Object.fromEntries(totals.taxCodesUsed.map((code) => [code, taxName(code)])),
    taxNotes: [...new Set(totals.taxCodesUsed.map((code) => textOf(loaded.taxCodes.get(code)?.row.printNote).trim()).filter(Boolean))],
    mentions: orNull(plainText(profile?.[kind.mentionsField])),
    amountInWords: profile?.amountInWords === true,
    brand: {
      accentColor: orNull(textOf(issuer?.accentColor)),
      footerNote: orNull(textOf(issuer?.footerNote)),
      paymentDetails: orNull(plainText(issuer?.paymentDetails)),
      logo: options.logo as RenderInput['brand']['logo'],
    },
    qr: qrOf(loaded, options.number, options.issueDate, totals, identifiers),
  };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/map.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add lifecycle/map.ts test/lifecycle/map.test.ts
```

```bash
git commit -m "feat: records become the Engine's and the Renderer's inputs, addresses in their country's order"
```

---

### Task 7: The gate

`lifecycle/gate.ts` holds checks 1 to 7 of spec §6: every one runs, and every problem is reported, not the first. Check 8, a trial render, needs the Renderer and belongs to the actions (Task 11). The gate reads a document already loaded after the defaults write, so the issue date, the currency and the language it sees are the ones the document will carry.

**Files:**
- Create: `lifecycle/gate.ts`
- Test: `test/lifecycle/gate.test.ts`

**Interfaces:**
- Consumes: `checkDocument`, `validatePattern`, `NumberingReset` from `engine/index.ts`; `AnyProblem`, `LifecycleProblemCode` from `lifecycle/lang/pack.ts`; `Loaded` from `lifecycle/load.ts`; `countryCode`, `idOf`, `textOf`, `toDocumentInput` from `lifecycle/map.ts`; `Row` from `lifecycle/store.ts`; the fixtures.
- Produces, from `lifecycle/gate.ts`:
  - `type GateAction = 'preview' | 'issue' | 'quotePdf'`
  - `type GateContext = { action: GateAction; localDate: string; latestIssueDate: string | null }`
  - `resetOf(profile: Row | null): NumberingReset` (the profile's reset, `YEARLY` when unset, as the field's default)
  - `checkGate(loaded: Loaded, context: GateContext): AnyProblem[]`

- [ ] **Step 1: Write the failing test**

`test/lifecycle/gate.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGate, resetOf, type GateContext } from '../../lifecycle/gate.ts';
import { KINDS, loadDocument, type Loaded } from '../../lifecycle/load.ts';
import { TODAY, address, money, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const ISSUE: GateContext = { action: 'issue', localDate: TODAY, latestIssueDate: null };

async function loaded(w: Workspace, id: string, kind = INVOICE): Promise<Loaded> {
  const result = await loadDocument(w.app, kind, id);
  assert.ok(result);
  return result;
}

/** A draft invoice as the action sees it after the defaults write. */
async function draft(w: Workspace, over: Record<string, unknown> = {}): Promise<Loaded> {
  const invoice = w.addInvoice({ issueDate: TODAY, ...over });
  w.addLine(INVOICE, invoice.id, { quantity: 2, unitPrice: money(500_000_000) });
  return loaded(w, invoice.id);
}

const codes = (loadedDocument: Loaded, context: GateContext = ISSUE) =>
  checkGate(loadedDocument, context).map((problem) => (problem.source === 'lifecycle' ? problem.code : problem.problem.code));

test('a complete draft passes', async () => {
  const w = workspace();
  assert.deepEqual(checkGate(await draft(w), ISSUE), []);
});

test('preview and issue need a draft; a quote PDF takes any status', async () => {
  const w = workspace();
  const sent = await draft(w, { status: 'SENT' });
  assert.deepEqual(checkGate(sent, ISSUE), [{ source: 'lifecycle', code: 'WRONG_STATUS', value: 'SENT' }]);
  assert.deepEqual(codes(sent, { ...ISSUE, action: 'preview' }), ['WRONG_STATUS']);
  const quote = w.addQuote({ status: 'SENT', issueDate: TODAY });
  w.addLine(KINDS.billingQuote, quote.id);
  assert.deepEqual(checkGate(await loaded(w, quote.id, KINDS.billingQuote), { ...ISSUE, action: 'quotePdf' }), []);
});

test('the issuer is set', async () => {
  const w = workspace();
  assert.deepEqual(codes(await draft(w, { issuerId: null })), ['MISSING_ISSUER']);
});

test('the issuer has a profile', async () => {
  const w = workspace();
  const bare = w.db.seed('billingIssuers', { name: 'No profile', profileId: null });
  assert.deepEqual(codes(await draft(w, { issuerId: bare.id })), ['MISSING_PROFILE']);
});

test('the currency is known', async () => {
  const w = workspace();
  assert.deepEqual(codes(await draft(w, { currencyCode: '' })), ['MISSING_CURRENCY']);
});

test('the profile’s pattern for the type is valid, and the problem names the profile field', async () => {
  const w = workspace();
  await w.app.update('billingProfiles', w.profile.id, { invoiceNumberPattern: 'F-{SEQ}' });
  const problems = checkGate(await draft(w), ISSUE);
  assert.ok(problems.length > 0);
  for (const problem of problems) {
    assert.equal(problem.source, 'engine');
    if (problem.source === 'engine') assert.equal(problem.field, 'invoiceNumberPattern');
  }
});

test('an empty numbering reset reads as the field’s default, yearly', () => {
  assert.equal(resetOf({ id: 'p', numberingReset: 'MONTHLY' }), 'MONTHLY');
  assert.equal(resetOf({ id: 'p', numberingReset: '' }), 'YEARLY');
  assert.equal(resetOf(null), 'YEARLY');
});

test('a buyer is set: a company, a person, or both', async () => {
  const w = workspace();
  assert.deepEqual(codes(await draft(w, { companyId: null, personId: null })), ['MISSING_BUYER']);
  assert.deepEqual(codes(await draft(w, { companyId: null, personId: w.person.id })), []);
  assert.deepEqual(codes(await draft(w, { personId: w.person.id })), []);
});

test('a credit note names an issued invoice with the same issuer and currency', async () => {
  const w = workspace();
  const note = async (over: Record<string, unknown>) => {
    const created = w.addCreditNote({ issueDate: TODAY, ...over });
    w.addLine(KINDS.billingCreditNote, created.id);
    return codes(await loaded(w, created.id, KINDS.billingCreditNote));
  };
  const issued = w.addInvoice({ number: 'F2026-0001', snapshot: { printed: {}, record: {} } });
  assert.deepEqual(await note({ invoiceId: null }), ['MISSING_INVOICE']);
  assert.deepEqual(await note({ invoiceId: w.invoice.id }), ['INVOICE_NOT_ISSUED']);
  assert.deepEqual(await note({ invoiceId: issued.id }), []);
  const other = w.db.seed('billingIssuers', { name: 'Second', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: '333333333', identifierTypeId: w.siren.id, issuerId: other.id, companyId: null, personId: null });
  assert.deepEqual(await note({ invoiceId: issued.id, issuerId: other.id }), ['INVOICE_MISMATCH']);
  const usd = w.addInvoice({ number: 'F2026-0002', currencyCode: 'USD', snapshot: { printed: {}, record: {} } });
  assert.deepEqual(await note({ invoiceId: usd.id }), ['INVOICE_MISMATCH']);
});

test('the seller has every identifier its profile requires', async () => {
  const w = workspace();
  const bare = w.db.seed('billingIssuers', { name: 'No identifiers', profileId: w.profile.id });
  assert.deepEqual(checkGate(await draft(w, { issuerId: bare.id }), ISSUE), [
    { source: 'lifecycle', code: 'MISSING_IDENTIFIER', field: 'seller', value: 'SIREN' },
  ]);
});

test('an identifier matches its type’s pattern, once trimmed', async () => {
  const w = workspace();
  const seller = w.db.seed('billingIssuers', { name: 'Typo', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: '12345', identifierTypeId: w.siren.id, issuerId: seller.id, companyId: null, personId: null });
  assert.deepEqual(checkGate(await draft(w, { issuerId: seller.id }), ISSUE), [
    { source: 'lifecycle', code: 'INVALID_IDENTIFIER', field: 'seller', value: 'SIREN' },
  ]);
  const spaced = w.db.seed('billingIssuers', { name: 'Spaced', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: ' 123456789 ', identifierTypeId: w.siren.id, issuerId: spaced.id, companyId: null, personId: null });
  assert.deepEqual(codes(await draft(w, { issuerId: spaced.id })), []);
});

test('a domestic company buyer, or one of unknown country, has the identifiers required of a business buyer', async () => {
  const w = workspace();
  const domestic = w.db.seed('companies', { name: 'Sans SIREN', address: address('1 rue', 'Lyon', '69001', 'France') });
  assert.deepEqual(checkGate(await draft(w, { companyId: domestic.id }), ISSUE), [
    { source: 'lifecycle', code: 'MISSING_IDENTIFIER', field: 'buyer', value: 'SIREN' },
  ]);
  const unknown = w.db.seed('companies', { name: 'Nowhere', address: address('', '', '', '') });
  assert.deepEqual(codes(await draft(w, { companyId: unknown.id })), ['MISSING_IDENTIFIER']);
});

test('a foreign company buyer and a person buyer are never required to have one', async () => {
  const w = workspace();
  const foreign = w.db.seed('companies', { name: 'Harbor Goods', address: address('1 Main St', 'Boston', '02110', 'United States') });
  assert.deepEqual(codes(await draft(w, { companyId: foreign.id })), []);
  assert.deepEqual(codes(await draft(w, { companyId: null, personId: w.person.id })), []);
});

test('every identifier involved has exactly one owner, reported once', async () => {
  const w = workspace();
  const shared = w.db.seed('billingIssuers', { name: 'Shared', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: '444444444', identifierTypeId: w.siren.id, issuerId: shared.id, companyId: w.company.id, personId: null });
  assert.deepEqual(checkGate(await draft(w, { issuerId: shared.id }), ISSUE), [
    { source: 'lifecycle', code: 'IDENTIFIER_OWNER', value: 'SIREN 444444444' },
  ]);
});

test('the Engine’s problems are the gate’s problems', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ issueDate: TODAY });
  w.addLine(INVOICE, invoice.id, { taxCodeId: null });
  assert.deepEqual(codes(await loaded(w, invoice.id)), ['MISSING_TAX_CODE']);
  assert.deepEqual(codes(await loaded(w, w.addInvoice({ issueDate: TODAY }).id)), ['NO_LINES']);
});

test('an issue date may not be later than the caller’s today, nor earlier than the sequence’s last', async () => {
  const w = workspace();
  const future = await draft(w, { issueDate: '2026-09-27' });
  assert.deepEqual(checkGate(future, ISSUE), [{ source: 'lifecycle', code: 'DATE_IN_FUTURE', field: 'issueDate', value: '2026-09-27' }]);
  const today = await draft(w);
  assert.deepEqual(checkGate(today, { ...ISSUE, latestIssueDate: '2026-09-27' }), [
    { source: 'lifecycle', code: 'DATE_BEFORE_LAST', field: 'issueDate', value: '2026-09-27' },
  ]);
  assert.deepEqual(checkGate(today, { ...ISSUE, latestIssueDate: TODAY }), []);
});

test('the date rules are the issue’s alone: a preview and a quote PDF skip them', async () => {
  const w = workspace();
  const future = await draft(w, { issueDate: '2026-12-01' });
  assert.deepEqual(checkGate(future, { ...ISSUE, action: 'preview', latestIssueDate: '2027-01-01' }), []);
});

test('a due date may not be earlier than the issue date, for every action', async () => {
  const w = workspace();
  const late = await draft(w, { dueDate: '2026-09-25' });
  assert.deepEqual(codes(late), ['DUE_BEFORE_ISSUE']);
  assert.deepEqual(codes(late, { ...ISSUE, action: 'preview' }), ['DUE_BEFORE_ISSUE']);
});

test('all problems are reported together, in the order of the checks', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ status: 'SENT', issuerId: null, companyId: null, currencyCode: '', issueDate: '2026-12-01', dueDate: '2026-11-01' });
  assert.deepEqual(codes(await loaded(w, invoice.id)), [
    'WRONG_STATUS', 'MISSING_ISSUER', 'MISSING_CURRENCY', 'MISSING_BUYER', 'DATE_IN_FUTURE', 'DUE_BEFORE_ISSUE',
  ]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/gate.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/gate.ts'`.

- [ ] **Step 3: Write `lifecycle/gate.ts`**

```ts
import { checkDocument, validatePattern, type NumberingReset } from '../engine/index.ts';
import type { AnyProblem, LifecycleProblemCode } from './lang/pack.ts';
import type { Loaded } from './load.ts';
import { countryCode, idOf, textOf, toDocumentInput } from './map.ts';
import type { Row } from './store.ts';

export type GateAction = 'preview' | 'issue' | 'quotePdf';

export type GateContext = {
  action: GateAction;
  /** The clicking user's date, YYYY-MM-DD. */
  localDate: string;
  /** The latest issue date among the other numbered documents of the scope; used by an issue only. */
  latestIssueDate: string | null;
};

const lifecycle = (code: LifecycleProblemCode, details: { field?: string; value?: string } = {}): AnyProblem => ({ source: 'lifecycle', code, ...details });

const RESETS: readonly NumberingReset[] = ['NEVER', 'YEARLY', 'MONTHLY'];

/** The profile's numbering reset; an empty one reads as the field's default, YEARLY. */
export const resetOf = (profile: Row | null): NumberingReset => {
  const value = textOf(profile?.numberingReset) as NumberingReset;
  return RESETS.includes(value) ? value : 'YEARLY';
};

const appliesTo = (type: Row, side: 'SELLER' | 'BUYER'): boolean => type.appliesTo === side || type.appliesTo === 'BOTH';
const valueOf = (identifier: Row): string => textOf(identifier.value).trim();

function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

/** Check 5: required identifiers, their format, and one owner each (Foundation §1). */
function identifierProblems(loaded: Loaded): AnyProblem[] {
  const problems: AnyProblem[] = [];
  const { identifierTypes, profileTypes, sellerIdentifiers, buyerIdentifiers, company, profile } = loaded;
  const typeName = (identifier: Row): string => textOf(identifierTypes.get(idOf(identifier.identifierTypeId) ?? '')?.name).trim();
  const has = (identifiers: Row[], type: Row): boolean => identifiers.some((identifier) => identifier.identifierTypeId === type.id && valueOf(identifier) !== '');

  // An identifier attached to the issuer and to the buyer is in both lists: report it once.
  const involved = [...new Map([...sellerIdentifiers, ...buyerIdentifiers].map((identifier) => [identifier.id, identifier])).values()];
  for (const identifier of involved) {
    const owners = [identifier.issuerId, identifier.companyId, identifier.personId].filter((owner) => idOf(owner) !== null).length;
    if (owners !== 1) problems.push(lifecycle('IDENTIFIER_OWNER', { value: `${typeName(identifier)} ${valueOf(identifier)}`.trim() }));
  }

  for (const type of profileTypes) {
    if (type.requiredForSeller === true && appliesTo(type, 'SELLER') && !has(sellerIdentifiers, type)) {
      problems.push(lifecycle('MISSING_IDENTIFIER', { field: 'seller', value: textOf(type.name) }));
    }
  }

  // A company buyer in the profile's country, or of unknown country, is a domestic business buyer.
  const profileCountry = textOf(profile?.countryCode).trim().toUpperCase();
  const buyerCountry = company ? countryCode((company.address as { addressCountry?: unknown } | null)?.addressCountry) : null;
  const domestic = company !== null && (buyerCountry === null || profileCountry === '' || buyerCountry === profileCountry);
  if (domestic) {
    for (const type of profileTypes) {
      if (type.requiredForBusinessBuyer === true && appliesTo(type, 'BUYER') && !has(buyerIdentifiers, type)) {
        problems.push(lifecycle('MISSING_IDENTIFIER', { field: 'buyer', value: textOf(type.name) }));
      }
    }
  }

  for (const [side, identifiers] of [['seller', sellerIdentifiers], ['buyer', buyerIdentifiers]] as const) {
    for (const identifier of identifiers) {
      const type = identifierTypes.get(idOf(identifier.identifierTypeId) ?? '');
      const pattern = textOf(type?.validationPattern).trim();
      if (pattern === '' || valueOf(identifier) === '') continue;
      if (!matches(pattern, valueOf(identifier))) problems.push(lifecycle('INVALID_IDENTIFIER', { field: side, value: textOf(type?.name) }));
    }
  }
  return problems;
}

/** Checks 1 to 7 of spec §6, all of them, in order. */
export function checkGate(loaded: Loaded, context: GateContext): AnyProblem[] {
  const { document, kind, issuer, profile } = loaded;
  const problems: AnyProblem[] = [];

  // 1. The status allows the action.
  if (context.action !== 'quotePdf' && document.status !== 'DRAFT') problems.push(lifecycle('WRONG_STATUS', { value: textOf(document.status) }));

  // 2. Issuer, profile, currency, pattern.
  if (!issuer) problems.push(lifecycle('MISSING_ISSUER', { field: 'issuerId' }));
  else if (!profile) problems.push(lifecycle('MISSING_PROFILE', { field: 'profileId' }));
  const currencyCode = textOf(document.currencyCode).trim();
  if (currencyCode === '') problems.push(lifecycle('MISSING_CURRENCY', { field: 'currencyCode' }));
  if (profile) {
    for (const problem of validatePattern(textOf(profile[kind.patternField]), resetOf(profile))) {
      problems.push({ source: 'engine', problem, field: kind.patternField });
    }
  }

  // 3. A buyer.
  if (!idOf(document.companyId) && !idOf(document.personId)) problems.push(lifecycle('MISSING_BUYER', { field: 'companyId' }));

  // 4. A credit note's invoice: issued, with the same issuer and the same currency.
  if (kind.kind === 'CREDIT_NOTE') {
    const invoice = loaded.invoice;
    if (!invoice) problems.push(lifecycle('MISSING_INVOICE', { field: 'invoiceId' }));
    else {
      if (!invoice.snapshot) problems.push(lifecycle('INVOICE_NOT_ISSUED', { field: 'invoiceId' }));
      if (idOf(invoice.issuerId) !== idOf(document.issuerId)) problems.push(lifecycle('INVOICE_MISMATCH', { field: 'issuerId' }));
      if (textOf(invoice.currencyCode).trim() !== currencyCode) problems.push(lifecycle('INVOICE_MISMATCH', { field: 'currencyCode' }));
    }
  }

  // 5. Identifiers.
  problems.push(...identifierProblems(loaded));

  // 6. The Engine. Without a currency every line would also mismatch it: MISSING_CURRENCY says it once.
  if (currencyCode !== '') problems.push(...checkDocument(toDocumentInput(loaded)).map((problem): AnyProblem => ({ source: 'engine', problem })));

  // 7. Dates.
  const issueDate = textOf(document.issueDate);
  if (context.action === 'issue' && issueDate !== '') {
    if (issueDate > context.localDate) problems.push(lifecycle('DATE_IN_FUTURE', { field: 'issueDate', value: issueDate }));
    else if (context.latestIssueDate !== null && issueDate < context.latestIssueDate) {
      problems.push(lifecycle('DATE_BEFORE_LAST', { field: 'issueDate', value: context.latestIssueDate }));
    }
  }
  const dueDate = kind.kind === 'INVOICE' ? textOf(document.dueDate) : '';
  if (dueDate !== '' && issueDate !== '' && dueDate < issueDate) problems.push(lifecycle('DUE_BEFORE_ISSUE', { field: 'dueDate', value: dueDate }));

  return problems;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/gate.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add lifecycle/gate.ts test/lifecycle/gate.test.ts
```

```bash
git commit -m "feat: the gate reports every problem that stands between a draft and its PDF"
```

---

### Task 8: Numbering: allocation, and the dates it guards

`lifecycle/numbering.ts` gives a document its number (spec §5). The unique `numberKey` is the guarantee that no number is held twice; the ledger only says where to start looking. This task covers allocation and the date rules. Task 9 adds the ledger's own rules to the same file.

A soft-deleted record keeps its unique value, so a ledger row deleted before its scope's first number would block the scope for ever: when a creation is refused as a duplicate and the holder turns out to be deleted, its key is freed first.

**Files:**
- Create: `lifecycle/numbering.ts`
- Test: `test/lifecycle/numbering.test.ts`

**Interfaces:**
- Consumes: `formatNumber`, `periodKey`, `validatePattern`, `EngineError`, `NumberingReset` from `engine/index.ts`; `Store`, `Row`, `Where`, `DuplicateError` from `lifecycle/store.ts`; `KINDS`, `Kind` from `lifecycle/load.ts`; `LifecycleError`, `DocumentKind` from `lifecycle/lang/pack.ts`; `lockstep` from the memory store; the fixtures.
- Produces, from `lifecycle/numbering.ts`:
  - `type Scope = { issuerId: string; documentType: DocumentKind; periodKey: string }`
  - `scopeKeyOf(scope: Scope): string` (`<issuerId>:<documentType>:<periodKey>`), `numberKeyOf(issuerId: string, number: string): string` (`<issuerId>:<number>`)
  - `scopeOf(kind: Kind, issuerId: string, reset: NumberingReset, issueDate: string): Scope`
  - `periodBounds(periodKey: string): { gte: string; lte: string } | null`
  - `sequenceOf(pattern: string, number: string): number | null`
  - `lastValueOf(ledger: Row | null | undefined): number` (a positive integer, else 0)
  - `findLedger(store: Store, scope: Scope): Promise<Row | null>`
  - `ensureLedger(store: Store, scope: Scope): Promise<Row>`
  - `releaseDeletedHolder(store: Store, scopeKey: string): Promise<boolean>`
  - `nextNumber(store: Store, scope: Scope, pattern: string, issueDate: string): Promise<{ n: number; number: string }>`
  - `type ClaimInput = { kind: Kind; documentId: string; issuerId: string; pattern: string; reset: NumberingReset; issueDate: string }`
  - `type Claim = { number: string; n: number | null; reused: boolean }`
  - `claimNumber(store: Store, input: ClaimInput): Promise<Claim>` (throws `LifecycleError` `LEDGER_BEHIND` after 50 refusals, `EngineError` for a bad pattern)
  - `raiseLedger(store: Store, scope: Scope, n: number): Promise<void>`
  - `latestIssueDate(store: Store, kind: Kind, scope: Scope, exceptId: string): Promise<string | null>`
  - `scopeHasNumbers(store: Store, scope: Scope): Promise<boolean>`
  - `MAX_REFUSALS = 50`

- [ ] **Step 1: Write the failing test**

`test/lifecycle/numbering.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineError } from '../../engine/index.ts';
import { LifecycleError } from '../../lifecycle/lang/pack.ts';
import { KINDS } from '../../lifecycle/load.ts';
import {
  claimNumber, ensureLedger, latestIssueDate, nextNumber, numberKeyOf, periodBounds, raiseLedger, scopeHasNumbers, scopeKeyOf,
  scopeOf, sequenceOf, type ClaimInput,
} from '../../lifecycle/numbering.ts';
import type { Store } from '../../lifecycle/store.ts';
import { lockstep } from './helpers/memory-store.ts';
import { TODAY, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const PATTERN = 'F{YYYY}-{SEQ:4}';

const input = (w: Workspace, documentId: string, over: Partial<ClaimInput> = {}): ClaimInput => ({
  kind: INVOICE, documentId, issuerId: w.issuer.id, pattern: PATTERN, reset: 'YEARLY', issueDate: TODAY, ...over,
});
const claim = (w: Workspace, documentId: string, over: Partial<ClaimInput> = {}, store: Store = w.app) =>
  claimNumber(store, input(w, documentId, over));
const scope2026 = (w: Workspace) => scopeOf(INVOICE, w.issuer.id, 'YEARLY', TODAY);
const numbered = (w: Workspace, number: string, over: Record<string, unknown> = {}) =>
  w.addInvoice({ number, numberKey: numberKeyOf(w.issuer.id, number), issueDate: TODAY, ...over });

test('a period runs from its first day to its last', () => {
  assert.equal(periodBounds('ALL'), null);
  assert.deepEqual(periodBounds('2026'), { gte: '2026-01-01', lte: '2026-12-31' });
  assert.deepEqual(periodBounds('2026-09'), { gte: '2026-09-01', lte: '2026-09-30' });
  assert.deepEqual(periodBounds('2028-02'), { gte: '2028-02-01', lte: '2028-02-29' });
  assert.deepEqual(periodBounds('2026-02'), { gte: '2026-02-01', lte: '2026-02-28' });
  assert.throws(() => periodBounds('2026-13'), /period/);
});

test('a number’s sequence is read back through its pattern', () => {
  assert.equal(sequenceOf(PATTERN, 'F2026-0017'), 17);
  assert.equal(sequenceOf(PATTERN, 'F2026-12345'), 12345);
  assert.equal(sequenceOf('INV-{SEQ:5}', 'INV-00001'), 1);
  assert.equal(sequenceOf('{YY}{MM}-{SEQ:3}', '2609-120'), 120);
  assert.equal(sequenceOf('A.{SEQ:2}(x)', 'A.07(x)'), 7);
  assert.equal(sequenceOf(PATTERN, 'Q-2026-0001'), null);
});

test('the scope is the issuer, the document type and the period of the issue date', () => {
  const w = workspace();
  assert.deepEqual(scope2026(w), { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026' });
  assert.equal(scopeKeyOf(scope2026(w)), `${w.issuer.id}:INVOICE:2026`);
  assert.equal(scopeOf(KINDS.billingQuote, 'i', 'MONTHLY', '2026-09-26').periodKey, '2026-09');
  assert.equal(scopeOf(INVOICE, 'i', 'NEVER', '2026-09-26').periodKey, 'ALL');
});

test('the first number of a scope is 1, and the scope’s ledger row is created on the way', async () => {
  const w = workspace();
  assert.deepEqual(await claim(w, w.invoice.id), { number: 'F2026-0001', n: 1, reused: false });
  const invoice = w.db.row('billingInvoices', w.invoice.id)!;
  assert.equal(invoice.number, 'F2026-0001');
  assert.equal(invoice.numberKey, `${w.issuer.id}:F2026-0001`);
  const [ledger, ...others] = w.db.rows('billingSequences');
  assert.equal(others.length, 0);
  assert.equal(ledger?.issuerId, w.issuer.id);
  assert.equal(ledger?.documentType, 'INVOICE');
  assert.equal(ledger?.periodKey, '2026');
  assert.equal(ledger?.lastValue, 1);
  assert.equal(ledger?.scopeKey, `${w.issuer.id}:INVOICE:2026`);
});

test('a number another document holds is stepped over', async () => {
  const w = workspace();
  numbered(w, 'F2026-0001');
  assert.equal((await claim(w, w.invoice.id)).number, 'F2026-0002');
  assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 2);
});

test('after fifty refusals the claim stops with LEDGER_BEHIND, naming the sequence, and holds no number', async () => {
  const w = workspace();
  for (let n = 1; n <= 50; n++) numbered(w, `F2026-${String(n).padStart(4, '0')}`);
  await assert.rejects(claim(w, w.invoice.id), (error: unknown) => {
    assert.ok(error instanceof LifecycleError);
    assert.deepEqual(error.problems, [{ code: 'LEDGER_BEHIND', value: 'INVOICE 2026' }]);
    return true;
  });
  assert.equal(w.db.row('billingInvoices', w.invoice.id)?.number, '');
});

test('forty-nine refusals still end with a number', async () => {
  const w = workspace();
  for (let n = 1; n <= 49; n++) numbered(w, `F2026-${String(n).padStart(4, '0')}`);
  assert.equal((await claim(w, w.invoice.id)).number, 'F2026-0050');
});

test('a document that already holds a number keeps it', async () => {
  const w = workspace();
  const held = numbered(w, 'F2026-0007', { status: 'DRAFT' });
  assert.deepEqual(await claim(w, held.id), { number: 'F2026-0007', n: 7, reused: true });
});

test('two requests for the same draft, interleaved step by step, end with one number', async () => {
  const orders = [['A', 'B'], ['B', 'A'], ['A', 'A', 'B'], ['B', 'B', 'A'], ['A', 'B', 'B', 'A']];
  for (const order of orders) {
    const w = workspace();
    const lock = lockstep(w.db);
    const both = Promise.all([claim(w, w.invoice.id, {}, lock.flow('A')), claim(w, w.invoice.id, {}, lock.flow('B'))]);
    for (let round = 0; round < 12; round++) for (const name of order) await lock.step(name);
    await lock.finish();
    const [a, b] = await both;
    assert.equal(a.number, 'F2026-0001', order.join(''));
    assert.equal(b.number, 'F2026-0001', order.join(''));
    assert.equal(w.db.rows('billingSequences').length, 1, order.join(''));
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1, order.join(''));
  }
});

test('two drafts claimed at the same moment end with two consecutive numbers', async () => {
  for (const order of [['A', 'B'], ['B', 'A'], ['A', 'A', 'B']]) {
    const w = workspace();
    const second = w.addInvoice();
    const lock = lockstep(w.db);
    const both = Promise.all([claim(w, w.invoice.id, {}, lock.flow('A')), claim(w, second.id, {}, lock.flow('B'))]);
    for (let round = 0; round < 12; round++) for (const name of order) await lock.step(name);
    await lock.finish();
    const numbers = (await both).map((result) => result.number).sort();
    assert.deepEqual(numbers, ['F2026-0001', 'F2026-0002'], order.join(''));
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 2, order.join(''));
  }
});

test('a ledger row a business created with a starting value continues from it', async () => {
  const w = workspace();
  w.db.seed('billingSequences', { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 1233, scopeKey: scopeKeyOf(scope2026(w)) });
  assert.equal((await claim(w, w.invoice.id)).number, 'F2026-1234');
});

test('a row a business just created, not keyed yet, is found by its issuer, type and period', async () => {
  const w = workspace();
  w.db.seed('billingSequences', { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 99, scopeKey: '' });
  assert.equal((await claim(w, w.invoice.id)).number, 'F2026-0100');
  assert.equal(w.db.rows('billingSequences').length, 1);
});

test('a ledger row deleted before its first number, still holding its key, does not block the scope', async () => {
  const w = workspace();
  const old = w.db.seed('billingSequences', { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 99, scopeKey: scopeKeyOf(scope2026(w)) });
  await w.app.softDelete('billingSequences', old.id);
  assert.equal((await claim(w, w.invoice.id)).number, 'F2026-0001');
  const live = w.db.rows('billingSequences').filter((row) => !row.deletedAt);
  assert.equal(live.length, 1);
  assert.equal(live[0]?.scopeKey, scopeKeyOf(scope2026(w)));
  assert.ok(w.db.row('billingSequences', old.id)?.deletedAt);
  assert.equal(w.db.row('billingSequences', old.id)?.scopeKey, null);
});

test('each year has its own sequence, and the number carries the issue date’s year', async () => {
  const w = workspace();
  assert.equal((await claim(w, w.invoice.id, { issueDate: '2025-12-31' })).number, 'F2025-0001');
  assert.equal((await claim(w, w.addInvoice().id)).number, 'F2026-0001');
  assert.deepEqual(w.db.rows('billingSequences').map((row) => row.periodKey).sort(), ['2025', '2026']);
});

test('two issuers can both hold F2026-0001', async () => {
  const w = workspace();
  const other = w.db.seed('billingIssuers', { name: 'Second', profileId: w.profile.id });
  const theirs = w.addInvoice({ issuerId: other.id });
  assert.equal((await claim(w, w.invoice.id)).number, 'F2026-0001');
  assert.equal((await claim(w, theirs.id, { issuerId: other.id })).number, 'F2026-0001');
});

test('a pattern the Engine refuses is refused before anything is written', async () => {
  const w = workspace();
  await assert.rejects(claim(w, w.invoice.id, { pattern: 'F-{SEQ}' }), EngineError);
  assert.deepEqual(w.db.writes, []);
});

test('the next number is read without creating anything', async () => {
  const w = workspace();
  assert.deepEqual(await nextNumber(w.app, scope2026(w), PATTERN, TODAY), { n: 1, number: 'F2026-0001' });
  assert.deepEqual(w.db.writes, []);
  await ensureLedger(w.app, scope2026(w));
  await raiseLedger(w.app, scope2026(w), 5);
  assert.equal((await nextNumber(w.app, scope2026(w), PATTERN, TODAY)).number, 'F2026-0006');
});

test('the ledger only ever rises', async () => {
  const w = workspace();
  await raiseLedger(w.app, scope2026(w), 5);
  await raiseLedger(w.app, scope2026(w), 3);
  assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 5);
});

test('the latest issue date of a scope counts deleted documents, and nothing outside the scope', async () => {
  const w = workspace();
  const other = w.db.seed('billingIssuers', { name: 'Second', profileId: w.profile.id });
  numbered(w, 'F2026-0001', { issueDate: '2026-03-01' });
  const deleted = numbered(w, 'F2026-0002', { issueDate: '2026-05-01' });
  await w.app.softDelete('billingInvoices', deleted.id);
  w.addInvoice({ issuerId: other.id, number: 'F2026-0001', numberKey: numberKeyOf(other.id, 'F2026-0001'), issueDate: '2026-08-01' });
  numbered(w, 'F2025-0009', { issueDate: '2025-12-30' });
  w.addInvoice({ issueDate: '2026-09-01' });
  const self = numbered(w, 'F2026-0003', { issueDate: '2026-06-01' });
  assert.equal(await latestIssueDate(w.app, INVOICE, scope2026(w), self.id), '2026-05-01');
  assert.equal(await latestIssueDate(w.app, INVOICE, scope2026(w), 'none'), '2026-06-01');
  assert.equal(await latestIssueDate(w.app, INVOICE, { ...scope2026(w), periodKey: '2024' }, 'none'), null);
});

test('a scope has given out a number once a document of its issuer and type holds a key dated inside it', async () => {
  const w = workspace();
  assert.equal(await scopeHasNumbers(w.app, scope2026(w)), false);
  w.addQuote({ number: 'D2026-0001', numberKey: numberKeyOf(w.issuer.id, 'D2026-0001'), issueDate: TODAY });
  assert.equal(await scopeHasNumbers(w.app, scope2026(w)), false);
  numbered(w, 'F2025-0001', { issueDate: '2025-06-01' });
  assert.equal(await scopeHasNumbers(w.app, scope2026(w)), false);
  const held = numbered(w, 'F2026-0001');
  await w.app.softDelete('billingInvoices', held.id);
  assert.equal(await scopeHasNumbers(w.app, scope2026(w)), true);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/numbering.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/numbering.ts'`.

- [ ] **Step 3: Write `lifecycle/numbering.ts`**

```ts
import { EngineError, formatNumber, periodKey, validatePattern, type NumberingReset } from '../engine/index.ts';
import { LifecycleError, type DocumentKind } from './lang/pack.ts';
import { KINDS, type Kind } from './load.ts';
import { DuplicateError, type Row, type Store, type Where } from './store.ts';

/**
 * Allocation (spec §5). The unique numberKey is the guarantee that no number is
 * held twice; the ledger only says where to start. A number, once claimed, stays
 * with its document.
 */

const LEDGER = 'billingSequences';
export const MAX_REFUSALS = 50;

/** One issuer, one document type, one period: each has its own sequence. */
export type Scope = { issuerId: string; documentType: DocumentKind; periodKey: string };

export const scopeKeyOf = (scope: Scope): string => `${scope.issuerId}:${scope.documentType}:${scope.periodKey}`;
export const numberKeyOf = (issuerId: string, number: string): string => `${issuerId}:${number}`;

export const scopeOf = (kind: Kind, issuerId: string, reset: NumberingReset, issueDate: string): Scope => ({
  issuerId, documentType: kind.kind, periodKey: periodKey(reset, issueDate),
});

const kindOfType = (type: DocumentKind): Kind => Object.values(KINDS).find((kind) => kind.kind === type)!;

/** The first and last day of a period: '2026' is the year, '2026-09' the month, 'ALL' has no bounds. */
export function periodBounds(key: string): { gte: string; lte: string } | null {
  if (key === 'ALL') return null;
  const year = /^(\d{4})$/.exec(key);
  if (year) return { gte: `${key}-01-01`, lte: `${key}-12-31` };
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!month) throw new Error(`A period is ALL, YYYY or YYYY-MM, not "${key}"`);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).getUTCDate();
  return { gte: `${key}-01`, lte: `${key}-${String(last).padStart(2, '0')}` };
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The sequence a number was formatted from, read back through its pattern; null when the number does not fit it. */
export function sequenceOf(pattern: string, number: string): number | null {
  let group = 0;
  let sequenceGroup = 0;
  const source = pattern.split(/(\{[^{}]*\})/).map((part) => {
    const token = /^\{([^{}]*)\}$/.exec(part)?.[1];
    if (token === undefined) return escape(part);
    group += 1;
    if (token === 'YYYY') return '(\\d{4})';
    if (token === 'YY' || token === 'MM') return '(\\d{2})';
    sequenceGroup = group;
    return '(\\d+)';
  }).join('');
  const match = new RegExp(`^${source}$`).exec(number);
  return match && sequenceGroup > 0 ? Number(match[sequenceGroup]) : null;
}

/** A ledger's last value as a positive integer; anything else (empty, a typo, a negative number) counts as 0. */
export function lastValueOf(ledger: Row | null | undefined): number {
  const value = Number(ledger?.lastValue ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

const scopeFields = (scope: Scope) => ({ issuerId: scope.issuerId, documentType: scope.documentType, periodKey: scope.periodKey });

/** The scope's ledger row, found by its issuer, type and period; the one holding the scope's key first. */
export async function findLedger(store: Store, scope: Scope): Promise<Row | null> {
  const rows = await store.list(LEDGER, scopeFields(scope));
  return rows.find((row) => row.scopeKey === scopeKeyOf(scope)) ?? rows[0] ?? null;
}

/**
 * Twenty keeps a soft-deleted row's values, its unique key included, so a
 * ledger row deleted before its scope gave out a number would block the
 * scope for ever. Frees the key: the row comes back just long enough to
 * lose it. True when a row was freed.
 */
export async function releaseDeletedHolder(store: Store, scopeKey: string): Promise<boolean> {
  const [holder] = await store.list(LEDGER, { scopeKey }, { deleted: 'only', limit: 1 });
  if (!holder) return false;
  await store.restore(LEDGER, holder.id);
  await store.update(LEDGER, holder.id, { scopeKey: null });
  await store.softDelete(LEDGER, holder.id);
  return true;
}

/** The scope's ledger row, created at 0 when it has none (spec §5, step 2). */
export async function ensureLedger(store: Store, scope: Scope): Promise<Row> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await findLedger(store, scope);
    if (found) return found;
    try {
      return await store.create(LEDGER, { ...scopeFields(scope), lastValue: 0, scopeKey: scopeKeyOf(scope) });
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
      // Someone created it at the same moment (the next read finds it), or a deleted row still holds the key.
      await releaseDeletedHolder(store, scopeKeyOf(scope));
    }
  }
  throw new Error(`The ledger of ${scopeKeyOf(scope)} could be neither found nor created`);
}

/** The number the next allocation would give, for the trial render. Reads only. */
export async function nextNumber(store: Store, scope: Scope, pattern: string, issueDate: string): Promise<{ n: number; number: string }> {
  const n = lastValueOf(await findLedger(store, scope)) + 1;
  return { n, number: formatNumber(pattern, n, issueDate) };
}

/** Raises the ledger to n, from a fresh read; never lowers it (spec §5, step 6). */
export async function raiseLedger(store: Store, scope: Scope, n: number): Promise<void> {
  const ledger = await ensureLedger(store, scope);
  if (n > lastValueOf(ledger)) await store.update(LEDGER, ledger.id, { lastValue: n });
}

export type ClaimInput = { kind: Kind; documentId: string; issuerId: string; pattern: string; reset: NumberingReset; issueDate: string };

/** The number the document holds; `n` is its sequence when the pattern still reads it back. */
export type Claim = { number: string; n: number | null; reused: boolean };

/**
 * Spec §5, steps 1 to 6. The ledger is read before the document, so two
 * requests for the same draft converge: whichever reads the document second
 * sees the first one's claim, or claims the same number on the same record.
 */
export async function claimNumber(store: Store, input: ClaimInput): Promise<Claim> {
  const { kind, documentId, issuerId, pattern, reset, issueDate } = input;
  const problems = validatePattern(pattern, reset);
  if (problems.length > 0) throw new EngineError(problems);
  const scope = scopeOf(kind, issuerId, reset, issueDate);
  const ledger = await ensureLedger(store, scope);
  const document = await store.get(kind.plural, documentId);
  if (!document) throw new Error(`${kind.object} ${documentId} no longer exists`);
  if (typeof document.number === 'string' && document.number !== '' && document.numberKey) {
    return { number: document.number, n: sequenceOf(pattern, document.number), reused: true };
  }
  let refusals = 0;
  for (let n = lastValueOf(ledger) + 1; ; n += 1) {
    const number = formatNumber(pattern, n, issueDate);
    try {
      await store.update(kind.plural, documentId, { number, numberKey: numberKeyOf(issuerId, number) });
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
      refusals += 1;
      if (refusals >= MAX_REFUSALS) {
        throw new LifecycleError([{ code: 'LEDGER_BEHIND', value: `${scope.documentType} ${scope.periodKey}` }]);
      }
      continue;
    }
    await raiseLedger(store, scope, n);
    return { number, n, reused: false };
  }
}

const numberedIn = (scope: Scope): Where => {
  const bounds = periodBounds(scope.periodKey);
  return { issuerId: scope.issuerId, numberKey: { notNull: true }, ...(bounds ? { issueDate: bounds } : {}) };
};

/** The latest issue date among the scope's numbered documents, deleted ones included, other than `exceptId`. */
export async function latestIssueDate(store: Store, kind: Kind, scope: Scope, exceptId: string): Promise<string | null> {
  const rows = await store.list(kind.plural, numberedIn(scope), {
    deleted: 'include', orderBy: { field: 'issueDate', direction: 'desc' }, limit: 2,
  });
  const latest = rows.find((row) => row.id !== exceptId && typeof row.issueDate === 'string' && row.issueDate !== '');
  return latest ? String(latest.issueDate) : null;
}

/** Whether the scope has given out a number: a document of its issuer and type holds a key dated inside the period. */
export async function scopeHasNumbers(store: Store, scope: Scope): Promise<boolean> {
  const rows = await store.list(kindOfType(scope.documentType).plural, numberedIn(scope), { deleted: 'include', limit: 1 });
  return rows.length > 0;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/numbering.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add lifecycle/numbering.ts test/lifecycle/numbering.test.ts
```

```bash
git commit -m "feat: numbers are claimed through a unique key, with no double and no gap"
```

---

### Task 9: The ledger's rules

The ledger stays editable, so a business can create the row for a scope before its first document and continue from its old system's numbers (spec §5). Its trigger keeps it sound. The rules, in the order the trigger applies them:

| Event on a ledger row | Condition | What the trigger does |
|---|---|---|
| created or updated by the app | | Nothing: the app keyed and raised it itself. |
| created or restored | the row is live and its scope complete | Gives it its `scopeKey`. A live row already holding the key: this row is soft-deleted, with a timeline message. A deleted row holding the key: that row's key is freed first, and this row takes it. |
| updated | the scope has given out a number and this row holds the scope's key | Scope fields put back; a lowered `lastValue` put back; a raised one kept. A timeline message. |
| updated | otherwise | Free: the key follows a changed scope, by the same rule as a created row. |
| deleted | the scope has given out a number and this row holds the scope's key | Restored, with a timeline message. |
| deleted | otherwise | Nothing. A key it still holds is freed when another row needs it (Tasks 8 and 9): cleared on the deleted row, which stays deleted. |

A scope has given out a number when a document of that issuer and type holds a `numberKey` and an issue date inside the period. Timeline messages on a ledger row are in its issuer's profile language. A message that cannot be written never undoes the correction it explains: `leaveMessage` swallows its failure (the REST store logs it).

**Files:**
- Modify: `lifecycle/store.ts` (add `leaveMessage`), `lifecycle/numbering.ts` (add the ledger's trigger)
- Test: `test/lifecycle/ledger.test.ts`

**Interfaces:**
- Consumes: everything Task 8 produced; `sourceOf`, `RecordEvent`, `TimelineEntry` from `lifecycle/store.ts`; `PACKS`, `Language`, `LifecyclePack` from `lifecycle/lang/pack.ts`; `drain` from the memory store.
- Produces:
  - from `lifecycle/store.ts`: `leaveMessage(store: Store, entry: TimelineEntry): Promise<void>`
  - from `lifecycle/numbering.ts`: `scopeOfRow(row: Row): Scope | null` (null when a scope field is empty or malformed), `packForIssuer(store: Store, issuerId: unknown): Promise<LifecyclePack>`, `guardSequence(store: Store, event: RecordEvent): Promise<void>`

- [ ] **Step 1: Write the failing test**

`test/lifecycle/ledger.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../../lifecycle/load.ts';
import { claimNumber, guardSequence, numberKeyOf, scopeKeyOf, scopeOfRow } from '../../lifecycle/numbering.ts';
import { drain, type MemoryEvent } from './helpers/memory-store.ts';
import { TODAY, workspace, type Workspace } from './helpers/fixtures.ts';

const LEDGER = 'billingSequences';

const scope = (w: Workspace, periodKey = '2026') => ({ issuerId: w.issuer.id, documentType: 'INVOICE' as const, periodKey });
const keyed = (w: Workspace, over: Record<string, unknown> = {}) =>
  w.db.seed(LEDGER, { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 5, scopeKey: scopeKeyOf(scope(w)), ...over });
/** A numbered invoice dated in 2026: the scope has given out a number. */
const numbered = (w: Workspace) => w.addInvoice({ number: 'F2026-0005', numberKey: numberKeyOf(w.issuer.id, 'F2026-0005'), issueDate: TODAY });

const triggers = (w: Workspace) => (event: MemoryEvent) => (event.plural === LEDGER ? guardSequence(w.app, event) : Promise.resolve());
const settle = (w: Workspace) => drain(w.db, triggers(w));

test('a scope is read from a complete row only', () => {
  assert.deepEqual(scopeOfRow({ id: 'r', issuerId: 'i', documentType: 'INVOICE', periodKey: '2026-09' }), { issuerId: 'i', documentType: 'INVOICE', periodKey: '2026-09' });
  assert.equal(scopeOfRow({ id: 'r', issuerId: '', documentType: 'INVOICE', periodKey: '2026' }), null);
  assert.equal(scopeOfRow({ id: 'r', issuerId: 'i', documentType: 'RECEIPT', periodKey: '2026' }), null);
  assert.equal(scopeOfRow({ id: 'r', issuerId: 'i', documentType: 'INVOICE', periodKey: 'twenty-six' }), null);
});

test('a row a person creates gets its scope key', async () => {
  const w = workspace();
  const row = await w.user.create(LEDGER, { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 1233 });
  await settle(w);
  assert.equal(w.db.row(LEDGER, row.id)?.scopeKey, scopeKeyOf(scope(w)));
  assert.equal(w.db.row(LEDGER, row.id)?.lastValue, 1233);
});

test('a second row for a scope that has one is soft-deleted, with a message in the issuer’s language', async () => {
  const w = workspace();
  keyed(w);
  const second = await w.user.create(LEDGER, { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 9 });
  await settle(w);
  assert.ok(w.db.row(LEDGER, second.id)?.deletedAt);
  assert.deepEqual(w.db.timeline, [{ object: 'billingSequence', recordId: second.id, kind: 'CORRECTION', text: w.db.timeline[0]!.text }]);
  assert.match(w.db.timeline[0]!.text, /existe déjà/);
});

test('a new row for a scope whose only row was deleted before its first number takes the key', async () => {
  const w = workspace();
  const first = keyed(w);
  await w.user.softDelete(LEDGER, first.id);
  await settle(w);
  assert.ok(w.db.row(LEDGER, first.id)?.deletedAt, 'deleting before the first number is allowed');
  const second = await w.user.create(LEDGER, { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 1233 });
  await settle(w);
  assert.equal(w.db.row(LEDGER, second.id)?.deletedAt, null);
  assert.equal(w.db.row(LEDGER, second.id)?.scopeKey, scopeKeyOf(scope(w)));
  assert.equal(w.db.row(LEDGER, first.id)?.scopeKey, null);
  assert.ok(w.db.row(LEDGER, first.id)?.deletedAt);
  assert.deepEqual(w.db.timeline, []);
});

test('before the scope’s first number, a row changes freely, and its key follows its scope', async () => {
  const w = workspace();
  const row = keyed(w);
  await w.user.update(LEDGER, row.id, { lastValue: 50 });
  await w.user.update(LEDGER, row.id, { periodKey: '2027' });
  await settle(w);
  assert.equal(w.db.row(LEDGER, row.id)?.lastValue, 50);
  assert.equal(w.db.row(LEDGER, row.id)?.scopeKey, scopeKeyOf(scope(w, '2027')));
  assert.deepEqual(w.db.timeline, []);
});

test('after the first number, a lowered last number is put back, and a raised one kept', async () => {
  const w = workspace();
  const row = keyed(w);
  numbered(w);
  await w.user.update(LEDGER, row.id, { lastValue: 3 });
  await settle(w);
  assert.equal(w.db.row(LEDGER, row.id)?.lastValue, 5);
  assert.equal(w.db.timeline.length, 1);
  assert.match(w.db.timeline[0]!.text, /Dernier numéro/);
  await w.user.update(LEDGER, row.id, { lastValue: 9 });
  await settle(w);
  assert.equal(w.db.row(LEDGER, row.id)?.lastValue, 9);
  assert.equal(w.db.timeline.length, 1);
});

test('after the first number, the scope fields are put back', async () => {
  const w = workspace();
  const row = keyed(w);
  numbered(w);
  await w.user.update(LEDGER, row.id, { periodKey: '2027', documentType: 'QUOTE' });
  await settle(w);
  const back = w.db.row(LEDGER, row.id)!;
  assert.deepEqual([back.periodKey, back.documentType, back.scopeKey], ['2026', 'INVOICE', scopeKeyOf(scope(w))]);
  assert.match(w.db.timeline[0]!.text, /Type de document et Période/);
});

test('after the first number, the scope’s row cannot be deleted: it is restored', async () => {
  const w = workspace();
  const row = keyed(w);
  numbered(w);
  await w.user.softDelete(LEDGER, row.id);
  await settle(w);
  assert.equal(w.db.row(LEDGER, row.id)?.deletedAt, null);
  assert.match(w.db.timeline[0]!.text, /restaurée/);
});

test('a duplicate the guard removed stays removed, even once the scope has given out numbers', async () => {
  const w = workspace();
  keyed(w);
  numbered(w);
  const second = await w.user.create(LEDGER, { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 9 });
  await settle(w);
  assert.ok(w.db.row(LEDGER, second.id)?.deletedAt);
});

test('the app’s own writes are left alone: an allocation brings no correction', async () => {
  const w = workspace();
  await claimNumber(w.app, { kind: KINDS.billingInvoice, documentId: w.invoice.id, issuerId: w.issuer.id, pattern: 'F{YYYY}-{SEQ:4}', reset: 'YEARLY', issueDate: TODAY });
  const before = w.db.writes.length;
  await settle(w);
  assert.equal(w.db.writes.length, before);
});

test('a guard’s own write brings no further write, and a retried event changes nothing', async () => {
  const w = workspace();
  const row = keyed(w);
  numbered(w);
  await w.user.update(LEDGER, row.id, { lastValue: 3 });
  const seen = await settle(w);
  const writes = w.db.writes.length;
  const userEvent = seen.find((event) => event.name === 'updated' && event.after?.lastValue === 3)!;
  await guardSequence(w.app, userEvent);
  await settle(w);
  assert.equal(w.db.writes.length, writes);
  assert.equal(w.db.timeline.length, 1);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/ledger.test.ts`
Expected: FAIL: `guardSequence` and `scopeOfRow` are not exported by `lifecycle/numbering.ts`.

- [ ] **Step 3: Add `leaveMessage` to `lifecycle/store.ts`**

Append:

```ts
/**
 * Leaves a timeline message after a correction. A message that cannot be
 * written (a muted timeline type, a network fault) never undoes the correction
 * it explains; the REST store logs the failure.
 */
export async function leaveMessage(store: Store, entry: TimelineEntry): Promise<void> {
  try {
    await store.timeline(entry);
  } catch {
    // The correction stands without its message.
  }
}
```

- [ ] **Step 4: Add the ledger's trigger to `lifecycle/numbering.ts`**

Change the imports at the top of `lifecycle/numbering.ts` to:

```ts
import { EngineError, formatNumber, periodBounds, periodKey, sequenceOf, validatePattern, type NumberingReset } from '../engine/index.ts';
import { LifecycleError, PACKS, type DocumentKind, type Language, type LifecyclePack } from './lang/pack.ts';
import { KINDS, type Kind } from './load.ts';
import { DuplicateError, leaveMessage, sourceOf, type RecordEvent, type Row, type Store, type Where } from './store.ts';
```

Then append:

```ts
const TYPES: readonly DocumentKind[] = ['QUOTE', 'INVOICE', 'CREDIT_NOTE'];
const PERIOD = /^(?:ALL|\d{4}|\d{4}-(?:0[1-9]|1[0-2]))$/;

/** The scope a ledger row names; null while one of its three fields is empty or malformed. */
export function scopeOfRow(row: Row): Scope | null {
  const { issuerId, documentType, periodKey: period } = row;
  if (typeof issuerId !== 'string' || issuerId === '') return null;
  if (!TYPES.includes(documentType as DocumentKind)) return null;
  if (typeof period !== 'string' || !PERIOD.test(period)) return null;
  return { issuerId, documentType: documentType as DocumentKind, periodKey: period };
}

/** The pack of an issuer's profile language: a ledger row has no language of its own. */
export async function packForIssuer(store: Store, issuerId: unknown): Promise<LifecyclePack> {
  const issuer = typeof issuerId === 'string' && issuerId !== '' ? await store.get('billingIssuers', issuerId) : null;
  const profileId = issuer?.profileId;
  const profile = typeof profileId === 'string' && profileId !== '' ? await store.get('billingProfiles', profileId) : null;
  return PACKS[profile?.language as Language] ?? PACKS.EN;
}

async function tellLedger(store: Store, row: Row, text: (pack: LifecyclePack) => string): Promise<void> {
  const pack = await packForIssuer(store, row.issuerId);
  await leaveMessage(store, { object: 'billingSequence', recordId: row.id, kind: 'CORRECTION', text: text(pack) });
}

/**
 * Frees the scope's key from a deleted row whose scope never gave out a
 * number: the key is cleared on the row while it stays deleted, as
 * resolveDuplicateLedger does, so its stale lastValue never comes back.
 * True when it did. A live holder, or a deleted one whose scope has numbers
 * (its own guard restores it), keeps the key.
 */
async function freeDeletedKey(store: Store, scope: Scope): Promise<boolean> {
  const [holder] = await store.list(LEDGER, { scopeKey: scopeKeyOf(scope) }, { deleted: 'include', limit: 1 });
  if (!holder?.deletedAt || (await scopeHasNumbers(store, scope))) return false;
  await store.update(LEDGER, holder.id, { scopeKey: null });
  return true;
}

/** Gives a live row its scope's key; a live holder makes this row the duplicate, a deleted numberless one gives way. */
async function keyRow(store: Store, row: Row, scope: Scope): Promise<void> {
  const key = scopeKeyOf(scope);
  if (row.scopeKey === key) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await store.update(LEDGER, row.id, { scopeKey: key });
      return;
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
      if (attempt === 0 && (await freeDeletedKey(store, scope))) continue;
      await store.softDelete(LEDGER, row.id);
      await tellLedger(store, row, (pack) => pack.messages.ledgerDuplicateRemoved);
      return;
    }
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The ledger's trigger (spec §5): see the table above. It reads the row afresh: events may arrive late or twice. */
export async function guardSequence(store: Store, event: RecordEvent): Promise<void> {
  if (event.name === 'destroyed' || event.name === 'upserted') return;
  if ((event.name === 'created' || event.name === 'updated') && sourceOf(event.after) === 'APPLICATION') return;
  const row = await store.get(LEDGER, event.recordId, { deleted: true });
  if (!row) return;
  const scope = scopeOfRow(row);

  if (event.name === 'created' || event.name === 'restored') {
    if (!row.deletedAt && scope) await keyRow(store, row, scope);
    return;
  }

  if (event.name === 'deleted') {
    if (row.deletedAt && scope && row.scopeKey === scopeKeyOf(scope) && (await scopeHasNumbers(store, scope))) {
      await store.restore(LEDGER, row.id);
      await tellLedger(store, row, (pack) => pack.messages.ledgerRestored);
    }
    return;
  }

  // updated
  if (row.deletedAt) return;
  const before = event.before;
  const was = before ? scopeOfRow(before) : null;
  if (before && was && before.scopeKey === scopeKeyOf(was) && (await scopeHasNumbers(store, was))) {
    const patch: Record<string, unknown> = {};
    for (const field of ['issuerId', 'documentType', 'periodKey'] as const) if (!same(row[field], before[field])) patch[field] = before[field];
    if (lastValueOf(row) < lastValueOf(before)) patch.lastValue = before.lastValue;
    const fields = Object.keys(patch);
    if (fields.length === 0) return;
    await store.update(LEDGER, row.id, patch);
    await tellLedger(store, row, (pack) => pack.messages.ledgerChangePutBack(fields.map((name) => pack.fields[name as keyof LifecyclePack['fields']])));
    return;
  }
  if (scope) await keyRow(store, row, scope);
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/ledger.test.ts test/lifecycle/numbering.test.ts test/lifecycle/store.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add lifecycle/store.ts lifecycle/numbering.ts test/lifecycle/ledger.test.ts
```

```bash
git commit -m "feat: the numbering ledger stays editable until its scope gives out a number, then only rises"
```

---

### Task 10: Totals, and the catalog fill

`lifecycle/totals.ts` keeps a draft's totals current (spec §8): it loads the document's figures, runs the Engine, and writes every `lineTotal` and document total that differs, as the app. With a problem, the totals are emptied rather than left misleading. It also fills a line from its catalog item. The triggers decide when to call it (Task 12); this task gives them the two tests they need: whether a line event or a document event can change the totals at all.

Two readings the spec leaves open, pinned here by tests:

- While a draft has no currency yet, its totals use the currency it will carry (its issuer's, else its profile's), the one the actions fill in. Otherwise the totals could not appear as lines are typed (acceptance step 2) until the first preview.
- A line created with a catalog item takes the item's unit when its own is still the default, `UNIT`: Twenty sets that default on every new line, so it cannot mean the person chose it.

When a line's catalog item changes, the item's description, unit, price and tax code replace the line's; a value the item leaves empty does not erase the line's.

**Files:**
- Create: `lifecycle/totals.ts`
- Test: `test/lifecycle/totals.test.ts`

**Interfaces:**
- Consumes: `checkDocument`, `computeDocument` from `engine/index.ts`; `isIssued`, `loadFigures`, `Kind`, `KINDS` from `lifecycle/load.ts`; `currencyOf`, `effectiveCurrency`, `idOf`, `microsOf`, `moneyOf`, `toDocumentInput` from `lifecycle/map.ts`; `RecordEvent`, `Store` from `lifecycle/store.ts`; the fixtures.
- Produces, from `lifecycle/totals.ts`:
  - `EMPTY_MONEY = { amountMicros: null, currencyCode: '' }`
  - `sameMoney(value: unknown, wanted: { amountMicros: number | null; currencyCode: string }): boolean`
  - `lineChangeMatters(event: RecordEvent): boolean`, `documentChangeMatters(event: RecordEvent): boolean`
  - `recomputeTotals(store: Store, kind: Kind, documentId: string): Promise<void>`
  - `fillFromCatalog(store: Store, kind: Kind, event: RecordEvent): Promise<boolean>` (true when it wrote)

- [ ] **Step 1: Write the failing test**

`test/lifecycle/totals.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../../lifecycle/load.ts';
import type { RecordEvent } from '../../lifecycle/store.ts';
import { EMPTY_MONEY, documentChangeMatters, fillFromCatalog, lineChangeMatters, recomputeTotals, sameMoney } from '../../lifecycle/totals.ts';
import { money, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const eur = (micros: number) => money(micros, 'EUR');

const totalsOf = (w: Workspace, id: string) => {
  const row = w.db.row('billingInvoices', id)!;
  return { subtotal: row.subtotal, discountTotal: row.discountTotal, taxTotal: row.taxTotal, total: row.total };
};
const lineTotals = (w: Workspace) => w.lines.map((line) => w.db.row('billingInvoiceLines', line.id)!.lineTotal);

const event = (over: Partial<RecordEvent>): RecordEvent => ({ name: 'updated', recordId: 'r', before: null, after: null, updatedFields: [], ...over });

test('a draft’s totals are computed and written: each line, then the document', async () => {
  const w = workspace();
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.deepEqual(lineTotals(w), [eur(3_120_000_000), eur(3_840_000_000), eur(1_200_000_000)]);
  assert.deepEqual(totalsOf(w, w.invoice.id), {
    subtotal: eur(8_160_000_000), discountTotal: eur(0), taxTotal: eur(1_632_000_000), total: eur(9_792_000_000),
  });
});

test('only the values that differ are written, so a second run writes nothing', async () => {
  const w = workspace();
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  const writes = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.equal(w.db.writes.length, writes);
  await w.user.update('billingInvoiceLines', w.lines[2]!.id, { quantity: 2 });
  const before = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  const written = w.db.writes.slice(before).map((write) => `${write.plural}:${Object.keys(write.data ?? {}).sort().join(',')}`);
  assert.deepEqual(written, ['billingInvoiceLines:lineTotal', 'billingInvoices:subtotal,taxTotal,total']);
});

test('a problem empties the totals: a total that ignores an incomplete line would mislead', async () => {
  const w = workspace();
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  await w.user.update('billingInvoiceLines', w.lines[1]!.id, { taxCodeId: null });
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.deepEqual(lineTotals(w), [EMPTY_MONEY, EMPTY_MONEY, EMPTY_MONEY]);
  assert.deepEqual(totalsOf(w, w.invoice.id), { subtotal: EMPTY_MONEY, discountTotal: EMPTY_MONEY, taxTotal: EMPTY_MONEY, total: EMPTY_MONEY });
  const writes = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.equal(w.db.writes.length, writes);
});

test('a draft without a currency yet is totalled in the currency it will carry', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ currencyCode: '' });
  w.addLine(INVOICE, invoice.id, { quantity: 1, unitPrice: eur(100_000_000) });
  await recomputeTotals(w.app, INVOICE, invoice.id);
  assert.deepEqual(w.db.row('billingInvoices', invoice.id)!.total, eur(120_000_000));
  assert.equal(w.db.row('billingInvoices', invoice.id)!.currencyCode, '', 'the currency itself is filled by an action, not here');
});

test('the rounding follows the issuer’s profile', async () => {
  const w = workspace();
  const reduced = w.db.seed('billingTaxCodes', { name: 'TVA 5,5 %', category: 'REDUCED' });
  w.db.seed('billingTaxComponents', { name: 'TVA', taxCodeId: reduced.id, rate: 5.5, compound: false, sortOrder: 0 });
  const invoice = w.addInvoice();
  for (let n = 1; n <= 3; n++) w.addLine(INVOICE, invoice.id, { sortOrder: n, quantity: 1, unitPrice: eur(100_000), taxCodeId: reduced.id });
  await recomputeTotals(w.app, INVOICE, invoice.id);
  assert.deepEqual(w.db.row('billingInvoices', invoice.id)!.taxTotal, eur(20_000), 'on the total: 0.30 × 5.5 % = 0.0165, rounded to 0.02');
  await w.app.update('billingProfiles', w.profile.id, { roundingMode: 'PER_LINE' });
  await recomputeTotals(w.app, INVOICE, invoice.id);
  assert.deepEqual(w.db.row('billingInvoices', invoice.id)!.taxTotal, eur(30_000), 'per line: 3 × 0.01');
});

test('an issued document and a deleted one are left alone', async () => {
  const w = workspace();
  const issued = w.addInvoice({ snapshot: { printed: {}, record: {} } });
  w.addLine(INVOICE, issued.id);
  await recomputeTotals(w.app, INVOICE, issued.id);
  await w.app.softDelete('billingInvoices', w.invoice.id);
  const writes = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.equal(w.db.writes.length, writes);
  assert.deepEqual(w.db.row('billingInvoices', issued.id)!.total, EMPTY_MONEY);
});

test('a quote’s totals are kept too, whatever its status', async () => {
  const w = workspace();
  const quote = w.addQuote({ status: 'SENT' });
  w.addLine(KINDS.billingQuote, quote.id, { quantity: 2, unitPrice: eur(50_000_000) });
  await recomputeTotals(w.app, KINDS.billingQuote, quote.id);
  assert.deepEqual(w.db.row('billingQuotes', quote.id)!.total, eur(120_000_000));
});

test('an empty amount equals an empty amount, whatever its currency', () => {
  assert.equal(sameMoney({ amountMicros: null, currencyCode: 'EUR' }, EMPTY_MONEY), true);
  assert.equal(sameMoney(eur(1), eur(1)), true);
  assert.equal(sameMoney(eur(1), money(1, 'USD')), false);
  assert.equal(sameMoney(null, eur(0)), false);
});

test('a line event matters unless it changed lineTotal alone', () => {
  for (const name of ['created', 'deleted', 'restored'] as const) assert.equal(lineChangeMatters(event({ name })), true, name);
  assert.equal(lineChangeMatters(event({ updatedFields: ['lineTotal', 'updatedBy'] })), false);
  assert.equal(lineChangeMatters(event({ updatedFields: ['updatedBy'] })), false);
  assert.equal(lineChangeMatters(event({ updatedFields: ['quantity', 'updatedBy'] })), true);
  assert.equal(lineChangeMatters(event({ updatedFields: ['invoice', 'invoiceId'] })), true);
  assert.equal(lineChangeMatters(event({ name: 'destroyed' })), false);
});

test('a document event matters when its currency, price basis or issuer changed', () => {
  assert.equal(documentChangeMatters(event({ updatedFields: ['currencyCode'] })), true);
  assert.equal(documentChangeMatters(event({ updatedFields: ['pricesIncludeTax', 'updatedBy'] })), true);
  assert.equal(documentChangeMatters(event({ updatedFields: ['issuer', 'issuerId'] })), true);
  assert.equal(documentChangeMatters(event({ updatedFields: ['subject'] })), false);
  assert.equal(documentChangeMatters(event({ name: 'created' })), false);
});

test('a line created with a catalog item takes the item’s values into its empty fields, the default unit included', async () => {
  const w = workspace();
  const item = w.db.seed('billingCatalogItems', { name: 'Atelier', description: 'Atelier d’une journée', unit: 'DAY', unitPrice: eur(900_000_000), taxCodeId: w.vat20.id });
  const invoice = w.addInvoice();
  const line = await w.user.create('billingInvoiceLines', { invoiceId: invoice.id, catalogItemId: item.id, description: '', unit: 'UNIT', unitPrice: money(null, ''), taxCodeId: null, quantity: 1 });
  const created = w.db.takeEvents().find((recorded) => recorded.recordId === line.id)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, created), true);
  const filled = w.db.row('billingInvoiceLines', line.id)!;
  assert.deepEqual([filled.description, filled.unit, filled.unitPrice, filled.taxCodeId], ['Atelier d’une journée', 'DAY', eur(900_000_000), w.vat20.id]);
});

test('what the person typed on a new line is kept', async () => {
  const w = workspace();
  const item = w.db.seed('billingCatalogItems', { description: 'Atelier', unit: 'DAY', unitPrice: eur(900_000_000), taxCodeId: w.vat20.id });
  const line = await w.user.create('billingInvoiceLines', { invoiceId: w.invoice.id, catalogItemId: item.id, description: 'Atelier, tarif négocié', unit: 'HOUR', unitPrice: eur(80_000_000), taxCodeId: w.franchise.id });
  const created = w.db.takeEvents().find((recorded) => recorded.recordId === line.id)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, created), false);
});

test('a changed catalog item replaces the four fields; an emptied one changes nothing', async () => {
  const w = workspace();
  const item = w.db.seed('billingCatalogItems', { description: 'Conseil', unit: 'HOUR', unitPrice: eur(120_000_000), taxCodeId: w.vat20.id });
  const line = w.lines[0]!;
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: item.id });
  const changed = w.db.takeEvents().find((recorded) => recorded.recordId === line.id)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, changed), true);
  const replaced = w.db.row('billingInvoiceLines', line.id)!;
  assert.deepEqual([replaced.description, replaced.unit, replaced.unitPrice], ['Conseil', 'HOUR', eur(120_000_000)]);
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: null });
  const cleared = w.db.takeEvents().find((recorded) => recorded.recordId === line.id && recorded.name === 'updated' && recorded.after?.catalogItemId === null)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, cleared), false);
});

test('an item changed again before the fill ran is left to its own event', async () => {
  const w = workspace();
  const first = w.db.seed('billingCatalogItems', { description: 'First', unit: 'DAY', unitPrice: eur(1_000_000), taxCodeId: w.vat20.id });
  const second = w.db.seed('billingCatalogItems', { description: 'Second', unit: 'DAY', unitPrice: eur(2_000_000), taxCodeId: w.vat20.id });
  const line = w.lines[0]!;
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: first.id });
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: second.id });
  const [toFirst] = w.db.takeEvents().filter((recorded) => recorded.recordId === line.id);
  assert.equal(await fillFromCatalog(w.app, INVOICE, toFirst!), false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/totals.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/totals.ts'`.

- [ ] **Step 3: Write `lifecycle/totals.ts`**

```ts
import { checkDocument, computeDocument } from '../engine/index.ts';
import { isIssued, loadFigures, type Kind } from './load.ts';
import { currencyOf, effectiveCurrency, idOf, microsOf, moneyOf, toDocumentInput } from './map.ts';
import type { RecordEvent, Store } from './store.ts';

/** An emptied CURRENCY value, as Twenty stores it. */
export const EMPTY_MONEY = { amountMicros: null, currencyCode: '' };

type Money = { amountMicros: number | null; currencyCode: string };

/** Whether a stored CURRENCY value already holds the wanted one. Empty equals empty, whatever its currency. */
export function sameMoney(value: unknown, wanted: Money): boolean {
  const micros = microsOf(value);
  if (wanted.amountMicros === null) return Number.isNaN(micros);
  return micros === wanted.amountMicros && currencyOf(value) === wanted.currencyCode;
}

/** Fields that change on every write, or that a recomputation writes itself. */
const QUIET = new Set(['updatedAt', 'updatedBy', 'position', 'searchVector', 'lineTotal']);

/** Spec §8: a line created, restored, deleted, or changed in a field other than lineTotal. */
export function lineChangeMatters(event: RecordEvent): boolean {
  if (event.name === 'updated') return event.updatedFields.some((field) => !QUIET.has(field));
  return event.name === 'created' || event.name === 'deleted' || event.name === 'restored';
}

const BASIS = new Set(['currencyCode', 'pricesIncludeTax', 'issuerId', 'issuer']);

/** Spec §8: a change of the currency, the price basis, or the issuer (whose profile sets the rounding). */
export function documentChangeMatters(event: RecordEvent): boolean {
  return event.name === 'updated' && event.updatedFields.some((field) => BASIS.has(field));
}

/**
 * Recomputes a document that is not issued: an issued one is left to the guards.
 * Writes, as the app, only the values that differ: a second run writes nothing,
 * and a change of lineTotal alone triggers no recomputation, so nothing loops.
 */
export async function recomputeTotals(store: Store, kind: Kind, documentId: string): Promise<void> {
  const figures = await loadFigures(store, kind, documentId);
  if (!figures || figures.document.deletedAt || isIssued(kind, figures.document)) return;
  const currency = effectiveCurrency(figures);
  const input = toDocumentInput(figures, currency);
  const result = checkDocument(input).length === 0 ? computeDocument(input) : null;
  const want = (micros: number | undefined): Money => (micros === undefined ? EMPTY_MONEY : moneyOf(micros, currency));

  for (const line of figures.lines) {
    const wanted = want(result?.lines.find((entry) => entry.key === line.id)?.lineTotalMicros);
    if (!sameMoney(line.lineTotal, wanted)) await store.update(kind.linePlural, line.id, { lineTotal: wanted });
  }

  const totals: Record<string, Money> = {
    subtotal: want(result?.subtotalMicros),
    discountTotal: want(result?.discountTotalMicros),
    taxTotal: want(result?.taxTotalMicros),
    total: want(result?.totalMicros),
  };
  const patch = Object.fromEntries(Object.entries(totals).filter(([field, wanted]) => !sameMoney(figures.document[field], wanted)));
  if (Object.keys(patch).length > 0) await store.update(kind.plural, documentId, patch);
}

const blank = (value: unknown): boolean => value === null || value === undefined || value === '';
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A line field the catalog may fill: empty, or for the unit still Twenty's default. */
function emptyOnLine(field: string, value: unknown): boolean {
  if (field === 'unit') return blank(value) || value === 'UNIT';
  if (field === 'unitPrice') return Number.isNaN(microsOf(value));
  return blank(value);
}

/**
 * Spec §8: a line created with a catalog item takes the item's description,
 * unit, price and tax code into its empty fields; a changed item replaces them.
 * A value the item leaves empty never erases the line's. True when it wrote.
 */
export async function fillFromCatalog(store: Store, kind: Kind, event: RecordEvent): Promise<boolean> {
  if (event.name !== 'created' && event.name !== 'updated') return false;
  const itemId = idOf(event.after?.catalogItemId);
  if (!itemId) return false;
  const replacing = event.name === 'updated';
  if (replacing && (!event.updatedFields.includes('catalogItemId') || idOf(event.before?.catalogItemId) === itemId)) return false;
  const line = await store.get(kind.linePlural, event.recordId);
  // Changed again since: the later event does the fill.
  if (!line || idOf(line.catalogItemId) !== itemId) return false;
  const item = await store.get('billingCatalogItems', itemId);
  if (!item) return false;
  const values: Record<string, unknown> = {
    description: item.description,
    unit: item.unit,
    unitPrice: Number.isNaN(microsOf(item.unitPrice)) ? null : moneyOf(microsOf(item.unitPrice), currencyOf(item.unitPrice)),
    taxCodeId: item.taxCodeId,
  };
  const patch: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (blank(value)) continue;
    if (!replacing && !emptyOnLine(field, line[field])) continue;
    if (!same(line[field], value)) patch[field] = value;
  }
  if (Object.keys(patch).length === 0) return false;
  await store.update(kind.linePlural, line.id, patch);
  return true;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/totals.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add lifecycle/totals.ts test/lifecycle/totals.test.ts
```

```bash
git commit -m "feat: a draft's totals follow its lines, and a catalog item fills the line that picks it"
```

---

### Task 11: The actions: preview, issue, quote PDF

`lifecycle/actions.ts` runs what a button asks for (spec §6). It checks the request, reads the document, makes its first write with the caller's token so that Twenty's role check decides who may act, runs the gate, then previews, issues or makes a quote's PDF, writing everything else as the app. It is the only Lifecycle file that imports the Renderer's entry point.

The order inside Issue is the spec's: a trial render with the number the document is about to get (the ledger's next, or the number it already holds), then the claim, then the final PDF (the trial's bytes when the number did not change), the upload and its hash, each line's `lineTotal`, one write on the document, the ledger raised and a timeline message. A step that fails leaves the document DRAFT with its number, and the next Issue resumes: the claim returns the number the document holds. A second Issue running at the same moment (a double click) converges on the same number, and whichever loads the document after the other has issued it answers `ALREADY_ISSUED`.

Tests replace the Renderer and SHA-256 with fast stand-ins, so that `lockstep` can interleave two whole actions; one test issues with the real Renderer.

**Files:**
- Create: `lifecycle/actions.ts`
- Test: `test/lifecycle/actions.test.ts`

**Interfaces:**
- Consumes: `computeDocument`, `EngineError` from `engine/index.ts`; `renderDocument` from `render/document.ts`; `RenderError`, `RenderInput`, `RenderResult` from `render/types.ts`; `checkGate`, `resetOf` from `lifecycle/gate.ts`; `describeAll`, `LifecycleError`, `packFor`, `PACKS`, `AnyProblem`, `LifecyclePack`, `WordedProblem` from `lifecycle/lang/pack.ts`; `isIssued`, `kindOf`, `LINE_FIELDS`, `loadDocument`, `loadLogo`, `DocumentObject`, `Kind`, `Loaded` from `lifecycle/load.ts`; `effectiveCurrency`, `fileInputs`, `idOf`, `languageOf`, `moneyOf`, `textOf`, `toDocumentInput`, `toRenderInput` from `lifecycle/map.ts`; `claimNumber`, `latestIssueDate`, `nextNumber`, `raiseLedger`, `scopeOf`, `Scope` from `lifecycle/numbering.ts`; `leaveMessage`, `NotAllowedError`, `CallerStore`, `Row`, `Store` from `lifecycle/store.ts`; `sameMoney` from `lifecycle/totals.ts`.
- Produces, from `lifecycle/actions.ts`:
  - `type ActionName = 'preview' | 'issue' | 'quotePdf'`
  - `type ActionRequest = { action: ActionName; object: DocumentObject; recordId: string; localDate: string; locale: string }`
  - `type ActionResponse = { ok: true; number?: string; version?: number; message: string } | { ok: false; problems: WordedProblem[] }`
  - `type ActionOutcome = { status: 200 | 403 | 422 | 500; body: ActionResponse }`
  - `type ActionDeps = { app: Store; caller: CallerStore; now: () => Date; sha256: (bytes: Uint8Array) => Promise<string>; reference: () => string; log: (entry: Record<string, unknown>) => void; render?: (input: RenderInput) => Promise<RenderResult> }`
  - `parseRequest(raw: unknown): ActionRequest | null`
  - `addDays(date: string, days: number): string`
  - `recordOf(kind: Kind, loaded: Loaded): { document: Record<string, unknown>; lines: Record<string, Record<string, unknown>> }`
  - `runAction(raw: unknown, deps: ActionDeps): Promise<ActionOutcome>`

- [ ] **Step 1: Write the failing test**

`test/lifecycle/actions.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RenderError, type RenderInput, type RenderResult } from '../../render/types.ts';
import { addDays, parseRequest, runAction, type ActionDeps, type ActionOutcome } from '../../lifecycle/actions.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { numberKeyOf } from '../../lifecycle/numbering.ts';
import { lockstep } from './helpers/memory-store.ts';
import { TODAY, money, now, workspace, type Workspace } from './helpers/fixtures.ts';

const sha = async (bytes: Uint8Array): Promise<string> => createHash('sha256').update(bytes).digest('hex');

/** A stand-in Renderer: deterministic bytes naming the number and version it printed, and a record of every input. */
function renderer() {
  const inputs: RenderInput[] = [];
  const render = async (input: RenderInput): Promise<RenderResult> => {
    inputs.push(input);
    return { bytes: new TextEncoder().encode(`%PDF ${input.number ?? 'DRAFT'} v${input.version ?? ''}`), pages: 1 };
  };
  return { inputs, render };
}

function setup(w: Workspace, over: Partial<ActionDeps> = {}) {
  const logs: Record<string, unknown>[] = [];
  const { inputs, render } = renderer();
  const deps: ActionDeps = {
    app: w.app, caller: w.db.store('MANUAL'), now, sha256: sha, reference: () => 'ref-7f3a', log: (entry) => logs.push(entry), render, ...over,
  };
  return { deps, logs, inputs };
}

const request = (w: Workspace, over: Record<string, unknown> = {}) => ({
  action: 'issue', object: 'billingInvoice', recordId: w.invoice.id, localDate: TODAY, locale: 'en', ...over,
});
const invoiceRow = (w: Workspace, id = w.invoice.id) => w.db.row('billingInvoices', id)!;
const problemCodes = (outcome: ActionOutcome) => (outcome.body.ok ? [] : outcome.body.problems.map((problem) => problem.code));

test('a request is read only when it is one of the three actions on its own kind of document', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assert.deepEqual(parseRequest({ action: 'issue', object: 'billingInvoice', recordId: id, localDate: TODAY, locale: 'fr-FR' }), {
    action: 'issue', object: 'billingInvoice', recordId: id, localDate: TODAY, locale: 'fr-FR',
  });
  assert.equal(parseRequest({ action: 'issue', object: 'billingQuote', recordId: id, localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'quotePdf', object: 'billingInvoice', recordId: id, localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'delete', object: 'billingInvoice', recordId: id, localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'issue', object: 'billingInvoice', recordId: '../x', localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'issue', object: 'billingInvoice', recordId: id, localDate: '2026-02-30' }), null);
  assert.equal(parseRequest(null), null);
  assert.equal(parseRequest({ action: 'preview', object: 'billingCreditNote', recordId: id, localDate: TODAY })?.locale, 'en');
});

test('days are added on the calendar, across months and years', () => {
  assert.equal(addDays('2026-09-26', 30), '2026-10-26');
  assert.equal(addDays('2026-12-15', 30), '2027-01-14');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('a request that is not an action is answered as unexpected, with a reference, and logged', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  const outcome = await runAction(request(w, { object: 'billingQuote' }), deps);
  assert.equal(outcome.status, 500);
  assert.deepEqual(outcome.body, { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] });
  assert.equal(logs[0]?.reference, 'ref-7f3a');
  assert.equal(logs[0]?.step, 'request');
  assert.deepEqual(w.db.writes, []);
});

test('a caller whose date is more than a day away from the server’s is refused with CLOCK_SKEW', async () => {
  const w = workspace();
  const { deps } = setup(w);
  const skewed = await runAction(request(w, { localDate: '2026-09-28' }), deps);
  assert.equal(skewed.status, 422);
  assert.deepEqual(problemCodes(skewed), ['CLOCK_SKEW']);
  assert.deepEqual(w.db.writes, []);
  assert.equal((await runAction(request(w, { localDate: '2026-09-25', action: 'preview' }), deps)).status, 200);
});

test('a caller whose role cannot edit the document gets NOT_ALLOWED, and nothing else happens', async () => {
  const w = workspace();
  const { deps } = setup(w, { caller: w.db.store('MANUAL', { canUpdate: () => false }) });
  const outcome = await runAction(request(w), deps);
  assert.equal(outcome.status, 403);
  assert.deepEqual(problemCodes(outcome), ['NOT_ALLOWED']);
  assert.deepEqual(w.db.writes, []);
  assert.equal(invoiceRow(w).number, '');
});

test('the draft’s empty defaults are filled with the caller’s token: date, currency, language, due date', async () => {
  const w = workspace();
  const bare = w.addInvoice({ issueDate: null, currencyCode: '', language: null, dueDate: null });
  w.addLine(KINDS.billingInvoice, bare.id);
  const { deps } = setup(w);
  await runAction(request(w, { action: 'preview', recordId: bare.id }), deps);
  assert.deepEqual(w.db.writes[0], {
    op: 'update', plural: 'billingInvoices', id: bare.id, source: 'MANUAL',
    data: { issueDate: TODAY, currencyCode: 'EUR', language: 'FR', dueDate: '2026-10-26' },
  });
});

test('the issuer’s currency comes before the profile’s, and a quote gets its validity', async () => {
  const w = workspace();
  await w.app.update('billingIssuers', w.issuer.id, { defaultCurrency: 'CHF' });
  const quote = w.addQuote({ issueDate: null, currencyCode: '', validUntil: null });
  w.addLine(KINDS.billingQuote, quote.id, { unitPrice: money(1_000_000, 'CHF') });
  const { deps } = setup(w);
  const before = w.db.writes.length;
  await runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id }), deps);
  assert.deepEqual(w.db.writes[before]?.data, { issueDate: TODAY, currencyCode: 'CHF', language: 'FR', validUntil: '2026-10-26' });
});

test('the caller’s write is made even when nothing is missing, rewriting the issue date as it is', async () => {
  const w = workspace();
  const full = w.addInvoice({ issueDate: '2026-09-20', dueDate: '2026-10-20', language: 'EN' });
  w.addLine(KINDS.billingInvoice, full.id);
  const { deps } = setup(w);
  await runAction(request(w, { action: 'preview', recordId: full.id }), deps);
  assert.deepEqual(w.db.writes[0]?.data, { issueDate: '2026-09-20' });
  assert.equal(w.db.writes[0]?.source, 'MANUAL');
});

test('the gate’s problems are worded in the caller’s language, and nothing is written but the defaults', async () => {
  const w = workspace();
  const orphan = w.addInvoice({ companyId: null, issueDate: TODAY });
  w.addLine(KINDS.billingInvoice, orphan.id);
  const { deps } = setup(w);
  const english = await runAction(request(w, { recordId: orphan.id }), deps);
  assert.equal(english.status, 422);
  assert.deepEqual(english.body, { ok: false, problems: [{ code: 'MISSING_BUYER', message: 'Choose the company or the person to bill.', field: 'companyId' }] });
  const french = await runAction(request(w, { recordId: orphan.id, locale: 'fr-FR' }), deps);
  assert.match(french.body.ok ? '' : french.body.problems[0]!.message, /Choisissez la société/);
  assert.deepEqual(w.db.writes.map((write) => write.source), ['MANUAL', 'MANUAL']);
});

test('an Engine problem names its line by position', async () => {
  const w = workspace();
  await w.app.update('billingInvoiceLines', w.lines[1]!.id, { taxCodeId: null });
  const { deps } = setup(w);
  const outcome = await runAction(request(w), deps);
  assert.deepEqual(problemCodes(outcome), ['MISSING_TAX_CODE']);
  assert.match(outcome.body.ok ? '' : outcome.body.problems[0]!.message, /line 2/);
});

test('a preview is a PDF with no number, replacing the previous preview, labelled with the date', async () => {
  const w = workspace();
  const { deps, inputs } = setup(w);
  const first = await runAction(request(w, { action: 'preview' }), deps);
  assert.deepEqual(first, { status: 200, body: { ok: true, message: 'Preview ready: it is in the PDF field.' } });
  assert.equal(inputs[0]?.number, null);
  const [preview] = invoiceRow(w).pdf as { fileId: string; label: string }[];
  assert.equal(preview?.label, 'Preview 2026-09-26.pdf');
  await runAction(request(w, { action: 'preview' }), deps);
  const after = invoiceRow(w).pdf as { fileId: string }[];
  assert.equal(after.length, 1);
  assert.notEqual(after[0]?.fileId, preview?.fileId);
  assert.equal(invoiceRow(w).number, '');
  assert.equal(invoiceRow(w).status, 'DRAFT');
});

test('Issue gives the number, one PDF, its hash, the totals, the ledger and a timeline message', async () => {
  const w = workspace();
  const { deps } = setup(w);
  const outcome = await runAction(request(w), deps);
  assert.deepEqual(outcome, { status: 200, body: { ok: true, number: 'F2026-0001', message: 'Issued as F2026-0001.' } });
  const issued = invoiceRow(w);
  assert.equal(issued.status, 'ISSUED');
  assert.equal(issued.number, 'F2026-0001');
  assert.equal(issued.numberKey, numberKeyOf(w.issuer.id, 'F2026-0001'));
  assert.equal(issued.issuedAt, '2026-09-26T09:30:00.000Z');
  assert.equal(issued.issueDate, TODAY);
  const pdf = issued.pdf as { fileId: string; label: string }[];
  assert.deepEqual(pdf.map((file) => file.label), ['F2026-0001.pdf']);
  assert.equal(issued.documentHash, await sha(new TextEncoder().encode('%PDF F2026-0001 v')));
  assert.deepEqual(issued.total, money(9_792_000_000));
  assert.deepEqual(w.lines.map((line) => w.db.row('billingInvoiceLines', line.id)!.lineTotal), [
    money(3_120_000_000), money(3_840_000_000), money(1_200_000_000),
  ]);
  assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1);
  assert.deepEqual(w.db.timeline, [{ object: 'billingInvoice', recordId: w.invoice.id, kind: 'ISSUED', text: 'Émise sous le numéro F2026-0001.' }]);
});

test('the snapshot keeps what was printed, the logo by file id and hash, and the record as issued', async () => {
  const w = workspace();
  const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const fileId = w.db.addFile(logo, 'image/png');
  await w.app.update('billingIssuers', w.issuer.id, { logo: [{ fileId, label: 'logo.png' }] });
  const { deps } = setup(w);
  await runAction(request(w), deps);
  const snapshot = invoiceRow(w).snapshot as { printed: Record<string, any>; record: { document: Record<string, unknown>; lines: Record<string, Record<string, unknown>> } };
  assert.equal(snapshot.printed.number, 'F2026-0001');
  assert.deepEqual(snapshot.printed.brand.logo, { fileId, sha256: await sha(logo) });
  assert.equal(snapshot.printed.totals.totalMicros, 9_792_000_000);
  assert.equal(snapshot.record.document.id, w.invoice.id);
  assert.equal(snapshot.record.document.subject, 'Identité visuelle');
  assert.equal(snapshot.record.document.issueDate, TODAY);
  assert.deepEqual(Object.keys(snapshot.record.lines).sort(), w.lines.map((line) => line.id).sort());
  const first = snapshot.record.lines[w.lines[0]!.id]!;
  assert.deepEqual([first.description, first.quantity, first.invoiceId], ['Direction artistique', 4, w.invoice.id]);
  assert.equal(JSON.stringify(snapshot).includes('"bytes"'), false, 'the snapshot holds no image bytes');
});

test('the previews go at issue: the PDF field holds the issued PDF alone', async () => {
  const w = workspace();
  const { deps } = setup(w);
  await runAction(request(w, { action: 'preview' }), deps);
  await runAction(request(w), deps);
  assert.deepEqual((invoiceRow(w).pdf as { label: string }[]).map((file) => file.label), ['F2026-0001.pdf']);
});

test('an issued document answers ALREADY_ISSUED with its number, and nothing is written', async () => {
  const w = workspace();
  const { deps } = setup(w);
  await runAction(request(w), deps);
  const writes = w.db.writes.length;
  const again = await runAction(request(w), deps);
  assert.equal(again.status, 422);
  assert.deepEqual(again.body, { ok: false, problems: [{ code: 'ALREADY_ISSUED', message: 'This document is already issued, as F2026-0001.' }] });
  assert.equal(w.db.writes.length, writes);
});

test('a failure after each step leaves a numbered draft, and the next Issue finishes with the same number', async () => {
  const failures: [string, Parameters<Workspace['db']['failNext']>[0]][] = [
    ['upload', (op) => op === 'upload'],
    ['lines', (op, plural) => op === 'update' && plural === 'billingInvoiceLines'],
    ['document', (op, plural, data) => op === 'update' && plural === 'billingInvoices' && data?.status === 'ISSUED'],
    ['ledger', (op, plural, data) => op === 'update' && plural === 'billingSequences' && data?.lastValue !== undefined],
  ];
  for (const [step, when] of failures) {
    const w = workspace();
    const { deps, logs } = setup(w);
    w.db.failNext(when);
    const failed = await runAction(request(w), deps);
    assert.equal(failed.status, 500, step);
    assert.equal(invoiceRow(w).status, 'DRAFT', step);
    assert.equal(invoiceRow(w).number, 'F2026-0001', step);
    assert.ok(logs[0]?.step, step);
    const resumed = await runAction(request(w), deps);
    assert.deepEqual(resumed.body, { ok: true, number: 'F2026-0001', message: 'Issued as F2026-0001.' }, step);
    assert.equal(invoiceRow(w).status, 'ISSUED', step);
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1, step);
    assert.equal((invoiceRow(w).pdf as unknown[]).length, 1, step);
  }
});

test('a timeline message that cannot be written does not undo the issue', async () => {
  const w = workspace();
  const { deps } = setup(w);
  w.db.failNext((op) => op === 'timeline');
  assert.equal((await runAction(request(w), deps)).status, 200);
  assert.equal(invoiceRow(w).status, 'ISSUED');
});

test('a render problem is refused before any number is claimed', async () => {
  const w = workspace();
  const { deps } = setup(w, { render: async () => { throw new RenderError([{ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo.bytes', value: 'image/png' }]); } });
  const outcome = await runAction(request(w), deps);
  assert.equal(outcome.status, 422);
  assert.deepEqual(problemCodes(outcome), ['UNSUPPORTED_IMAGE']);
  assert.equal(invoiceRow(w).number, '');
  assert.deepEqual(w.db.rows('billingSequences'), []);
});

test('the trial’s bytes are the final bytes; a number taken meanwhile is rendered again', async () => {
  const w = workspace();
  const plain = setup(w);
  await runAction(request(w), plain.deps);
  assert.equal(plain.inputs.length, 1, 'rendered once: the trial was the final render');
  const v = workspace();
  v.addInvoice({ number: 'F2026-0001', numberKey: numberKeyOf(v.issuer.id, 'F2026-0001'), issueDate: TODAY });
  const taken = setup(v);
  const outcome = await runAction(request(v), taken.deps);
  assert.deepEqual(taken.inputs.map((input) => input.number), ['F2026-0001', 'F2026-0002']);
  assert.equal(outcome.body.ok && outcome.body.number, 'F2026-0002');
  assert.deepEqual((invoiceRow(v).pdf as { label: string }[]).map((file) => file.label), ['F2026-0002.pdf']);
});

test('a quote’s first PDF gives its number and version 1; the next keeps the number, version 2, newest first', async () => {
  const w = workspace();
  const quote = w.addQuote();
  w.addLine(KINDS.billingQuote, quote.id);
  const { deps, inputs } = setup(w);
  const ask = () => runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id }), deps);
  assert.deepEqual((await ask()).body, { ok: true, number: 'D2026-0001', version: 1, message: 'Quote D2026-0001, version 1: it is in the PDF field.' });
  assert.deepEqual((await ask()).body, { ok: true, number: 'D2026-0001', version: 2, message: 'Quote D2026-0001, version 2: it is in the PDF field.' });
  assert.deepEqual(inputs.map((input) => [input.number, input.version]), [['D2026-0001', 1], ['D2026-0001', 2]]);
  const row = w.db.row('billingQuotes', quote.id)!;
  assert.deepEqual((row.pdf as { label: string }[]).map((file) => file.label), ['D2026-0001 v2.pdf', 'D2026-0001 v1.pdf']);
  assert.equal(row.version, 2);
  assert.equal(row.status, 'DRAFT', 'a quote has no issue step');
});

test('a quote keeps its ten newest PDFs', async () => {
  const w = workspace();
  const old = Array.from({ length: 10 }, (_, index) => ({ fileId: w.db.addFile(new Uint8Array([index]), 'application/pdf'), label: `v${index + 1}.pdf`, extension: '.pdf', url: 'https://x' }));
  const quote = w.addQuote({ number: 'D2026-0001', numberKey: numberKeyOf(w.issuer.id, 'D2026-0001'), version: 10, pdf: old, issueDate: TODAY });
  w.addLine(KINDS.billingQuote, quote.id);
  const { deps } = setup(w);
  await runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id }), deps);
  const pdf = w.db.row('billingQuotes', quote.id)!.pdf as { fileId: string; label: string }[];
  assert.equal(pdf.length, 10);
  assert.equal(pdf[0]?.label, 'D2026-0001 v11.pdf');
  assert.equal(pdf.at(-1)?.label, 'v9.pdf');
  assert.deepEqual(Object.keys(pdf[1]!).sort(), ['fileId', 'label'], 'a FILES write carries only fileId and label');
});

test('a credit note is numbered in its own sequence and names the invoice it corrects', async () => {
  const w = workspace();
  const { deps, inputs } = setup(w);
  await runAction(request(w), deps);
  const note = w.addCreditNote({ invoiceId: w.invoice.id, issueDate: TODAY });
  w.addLine(KINDS.billingCreditNote, note.id);
  const outcome = await runAction(request(w, { object: 'billingCreditNote', recordId: note.id }), deps);
  assert.equal(outcome.body.ok && outcome.body.number, 'AV2026-0001');
  assert.deepEqual(inputs.at(-1)?.corrects, { number: 'F2026-0001', issueDate: TODAY });
  assert.equal(w.db.timeline.at(-1)?.text, 'Émis sous le numéro AV2026-0001.');
});

test('an unexpected failure is answered with a reference, and logged with the document, the action and the step', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  w.db.failNext((op) => op === 'upload', new Error('storage is full'));
  const outcome = await runAction(request(w, { locale: 'fr-FR' }), deps);
  assert.deepEqual(outcome, { status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Une erreur s’est produite (réf. ref-7f3a).' }] } });
  assert.deepEqual(logs, [{ reference: 'ref-7f3a', object: 'billingInvoice', recordId: w.invoice.id, action: 'issue', step: 'upload', error: 'storage is full' }]);
});

test('the button’s message follows the caller’s locale, the timeline’s the document’s language', async () => {
  const w = workspace();
  const english = w.addInvoice({ language: 'EN', issueDate: TODAY });
  w.addLine(KINDS.billingInvoice, english.id);
  const { deps } = setup(w);
  const outcome = await runAction(request(w, { recordId: english.id, locale: 'fr-FR' }), deps);
  assert.equal(outcome.body.ok && outcome.body.message, 'Émise sous le numéro F2026-0001.');
  assert.equal(w.db.timeline[0]?.text, 'Issued as F2026-0001.');
});

test('two Issues of the same draft at once end with one number and one PDF', async () => {
  for (const order of [['A', 'B'], ['B', 'A'], ['A', 'A', 'B'], ['A', 'B', 'B', 'A', 'A']]) {
    const w = workspace();
    const lock = lockstep(w.db);
    const run = (name: string) => runAction(request(w), { ...setup(w).deps, app: lock.flow(name) });
    const flows = [run('A'), run('B')];
    for (let round = 0; round < 40; round++) for (const name of order) await lock.step(name);
    await lock.finish(...flows);
    const outcomes = await Promise.all(flows);
    for (const outcome of outcomes) {
      const fine = outcome.body.ok ? outcome.body.number === 'F2026-0001' : problemCodes(outcome).join() === 'ALREADY_ISSUED';
      assert.ok(fine, `${order.join('')}: ${JSON.stringify(outcome.body)}`);
    }
    const issued = invoiceRow(w);
    assert.equal(issued.status, 'ISSUED', order.join(''));
    assert.equal(issued.number, 'F2026-0001', order.join(''));
    assert.equal((issued.pdf as unknown[]).length, 1, order.join(''));
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1, order.join(''));
  }
});

test('with the real Renderer, the issued PDF is a PDF and its hash is the hash of its bytes', async () => {
  const w = workspace();
  const uploads: Uint8Array[] = [];
  const app = { ...w.app, upload: async (file: Parameters<typeof w.app.upload>[0]) => { uploads.push(file.bytes); return w.app.upload(file); } };
  const { deps } = setup(w, { app, render: undefined });
  const outcome = await runAction(request(w), deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  assert.equal(Buffer.from(uploads[0]!.slice(0, 5)).toString('latin1'), '%PDF-');
  assert.equal(invoiceRow(w).documentHash, await sha(uploads[0]!));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/actions.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/actions.ts'`.

- [ ] **Step 3: Write `lifecycle/actions.ts`**

```ts
import { computeDocument, EngineError } from '../engine/index.ts';
import { renderDocument } from '../render/document.ts';
import { RenderError, type RenderInput, type RenderResult } from '../render/types.ts';
import { checkGate, resetOf } from './gate.ts';
import { describeAll, LifecycleError, packFor, PACKS, type AnyProblem, type LifecyclePack, type WordedProblem } from './lang/pack.ts';
import { isIssued, kindOf, LINE_FIELDS, loadDocument, loadLogo, type DocumentObject, type Kind, type Loaded } from './load.ts';
import { effectiveCurrency, fileInputs, idOf, languageOf, moneyOf, textOf, toDocumentInput, toRenderInput } from './map.ts';
import { claimNumber, latestIssueDate, nextNumber, raiseLedger, scopeOf, type Scope } from './numbering.ts';
import { leaveMessage, NotAllowedError, type CallerStore, type Row, type Store } from './store.ts';
import { sameMoney } from './totals.ts';

export type ActionName = 'preview' | 'issue' | 'quotePdf';
export type ActionRequest = { action: ActionName; object: DocumentObject; recordId: string; localDate: string; locale: string };
export type ActionResponse = { ok: true; number?: string; version?: number; message: string } | { ok: false; problems: WordedProblem[] };
export type ActionOutcome = { status: 200 | 403 | 422 | 500; body: ActionResponse };

export type ActionDeps = {
  /** Reads and every write after the first, as the app. */
  app: Store;
  /** The first write, with the caller's own token: Twenty's role check decides who may act. */
  caller: CallerStore;
  now: () => Date;
  /** Hex SHA-256 of the PDF's bytes. */
  sha256: (bytes: Uint8Array) => Promise<string>;
  /** A short reference for an unexpected failure, which the person can quote. */
  reference: () => string;
  log: (entry: Record<string, unknown>) => void;
  /** The Renderer; tests replace it. */
  render?: (input: RenderInput) => Promise<RenderResult>;
};

const OBJECTS: Record<ActionName, readonly DocumentObject[]> = {
  preview: ['billingInvoice', 'billingCreditNote'],
  issue: ['billingInvoice', 'billingCreditNote'],
  quotePdf: ['billingQuote'],
};

const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The request a button posts (spec §6), or null when it is not one: an action on its own kind of document. */
export function parseRequest(raw: unknown): ActionRequest | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { action, object, recordId, localDate, locale } = raw as Record<string, unknown>;
  if (typeof action !== 'string' || !(action in OBJECTS)) return null;
  if (typeof object !== 'string' || !OBJECTS[action as ActionName].includes(object as DocumentObject)) return null;
  if (typeof recordId !== 'string' || !RECORD_ID.test(recordId)) return null;
  if (typeof localDate !== 'string' || !isCalendarDate(localDate)) return null;
  return { action: action as ActionName, object: object as DocumentObject, recordId, localDate, locale: typeof locale === 'string' ? locale : 'en' };
}

const dayNumber = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** A calendar date `days` after `date`. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const wholeDays = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;

/**
 * The first write (spec §6, "Who may act"): the draft's empty defaults, and
 * always the issue date, rewritten as it is when set.
 */
async function defaultsFor(store: Store, kind: Kind, document: Row, localDate: string): Promise<Record<string, unknown>> {
  const issuerId = idOf(document.issuerId);
  const issuer = issuerId ? await store.get('billingIssuers', issuerId) : null;
  const profileId = idOf(issuer?.profileId);
  const profile = profileId ? await store.get('billingProfiles', profileId) : null;
  const issueDate = textOf(document.issueDate) || localDate;
  const patch: Record<string, unknown> = { issueDate };
  if (textOf(document.currencyCode).trim() === '') {
    const currency = effectiveCurrency({ document, issuer, profile });
    if (currency !== '') patch.currencyCode = currency;
  }
  if (textOf(document.language) === '' && textOf(profile?.language) !== '') patch.language = profile!.language;
  const term = wholeDays(profile?.defaultPaymentTermDays);
  if (kind.kind === 'INVOICE' && textOf(document.dueDate) === '' && term !== null) patch.dueDate = addDays(issueDate, term);
  const validity = wholeDays(profile?.defaultQuoteValidityDays);
  if (kind.kind === 'QUOTE' && textOf(document.validUntil) === '' && validity !== null) patch.validUntil = addDays(issueDate, validity);
  return patch;
}

/** The snapshot's `record` (spec §6): the fields an issued document locks, and each line's, by record id. */
export function recordOf(kind: Kind, loaded: Loaded): { document: Record<string, unknown>; lines: Record<string, Record<string, unknown>> } {
  const pick = (row: Row, fields: readonly string[]) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
  return {
    document: { id: loaded.document.id, ...pick(loaded.document, kind.lockedFields) },
    lines: Object.fromEntries(loaded.lines.map((line) => [line.id, { ...pick(line, LINE_FIELDS), [kind.parentKey]: loaded.document.id }])),
  };
}

const heldNumber = (document: Row): string | null =>
  typeof document.number === 'string' && document.number !== '' && Boolean(document.numberKey) ? document.number : null;

type Run = {
  request: ActionRequest;
  kind: Kind;
  loaded: Loaded;
  scope: Scope;
  issueDate: string;
  pack: LifecyclePack;
  deps: ActionDeps;
  render: (input: RenderInput) => Promise<RenderResult>;
  step: (name: string) => void;
};

const ok = (message: string, extra: { number?: string; version?: number } = {}): ActionOutcome => ({ status: 200, body: { ok: true, ...extra, message } });

function refuse(status: 403 | 422, pack: LifecyclePack, problems: readonly AnyProblem[], lineNumbers?: ReadonlyMap<string, number>): ActionOutcome {
  return { status, body: { ok: false, problems: describeAll(problems, pack.code, lineNumbers) } };
}

/** The figures, the logo, and the Renderer's input for a number and a version. */
async function prepare(run: Run) {
  const totals = computeDocument(toDocumentInput(run.loaded));
  const logo = await loadLogo(run.deps.app, run.loaded.issuer);
  const inputFor = (number: string | null, version?: number): RenderInput =>
    toRenderInput(run.loaded, totals, { number, version, issueDate: run.issueDate, logo });
  return { totals, logo, inputFor };
}

async function preview(run: Run): Promise<ActionOutcome> {
  const { kind, deps, loaded } = run;
  run.step('render');
  const { inputFor } = await prepare(run);
  const { bytes } = await run.render(inputFor(null));
  run.step('upload');
  const file = await deps.app.upload({ bytes, name: `Preview ${run.request.localDate}.pdf`, mime: 'application/pdf', object: kind.object, field: 'pdf' });
  run.step('store');
  await deps.app.update(kind.plural, loaded.document.id, { pdf: [file] });
  return ok(run.pack.messages.previewReady);
}

async function logoReference(run: Run, logo: { bytes: Uint8Array } | null): Promise<{ fileId: string; sha256: string } | null> {
  const first = Array.isArray(run.loaded.issuer?.logo) ? (run.loaded.issuer.logo[0] as { fileId?: unknown } | undefined) : undefined;
  if (!logo || typeof first?.fileId !== 'string') return null;
  return { fileId: first.fileId, sha256: await run.deps.sha256(logo.bytes) };
}

async function issue(run: Run): Promise<ActionOutcome> {
  const { kind, deps, loaded, scope, issueDate } = run;
  const { document, issuer, profile } = loaded;
  const pattern = textOf(profile![kind.patternField]);
  const currency = textOf(document.currencyCode);

  run.step('trial');
  const { totals, logo, inputFor } = await prepare(run);
  const trialNumber = heldNumber(document) ?? (await nextNumber(deps.app, scope, pattern, issueDate)).number;
  let rendered = await run.render(inputFor(trialNumber));

  run.step('claim');
  const claim = await claimNumber(deps.app, { kind, documentId: document.id, issuerId: issuer!.id, pattern, reset: resetOf(profile), issueDate });

  run.step('render');
  if (claim.number !== trialNumber) rendered = await run.render(inputFor(claim.number));

  run.step('upload');
  const file = await deps.app.upload({ bytes: rendered.bytes, name: `${claim.number}.pdf`, mime: 'application/pdf', object: kind.object, field: 'pdf' });
  const documentHash = await deps.sha256(rendered.bytes);

  run.step('lines');
  for (const line of loaded.lines) {
    const micros = totals.lines.find((entry) => entry.key === line.id)?.lineTotalMicros;
    if (micros === undefined) continue;
    const wanted = moneyOf(micros, currency);
    if (!sameMoney(line.lineTotal, wanted)) await deps.app.update(kind.linePlural, line.id, { lineTotal: wanted });
  }

  run.step('document');
  const printed = inputFor(claim.number);
  const snapshot: Record<string, unknown> = {
    printed: { ...printed, brand: { ...printed.brand, logo: await logoReference(run, logo) } },
    record: recordOf(kind, loaded),
  };
  await deps.app.update(kind.plural, document.id, {
    status: 'ISSUED',
    issuedAt: deps.now().toISOString(),
    issueDate,
    snapshot,
    documentHash,
    pdf: [file],
    subtotal: moneyOf(totals.subtotalMicros, currency),
    discountTotal: moneyOf(totals.discountTotalMicros, currency),
    taxTotal: moneyOf(totals.taxTotalMicros, currency),
    total: moneyOf(totals.totalMicros, currency),
  });

  run.step('ledger');
  if (claim.n !== null) await raiseLedger(deps.app, scope, claim.n);
  const documentPack = PACKS[languageOf(document, profile)] ?? PACKS.EN;
  await leaveMessage(deps.app, { object: kind.object, recordId: document.id, kind: 'ISSUED', text: documentPack.messages.issued(kind.kind, claim.number) });
  return ok(run.pack.messages.issued(kind.kind, claim.number), { number: claim.number });
}

async function quotePdf(run: Run): Promise<ActionOutcome> {
  const { kind, deps, loaded, scope, issueDate } = run;
  const { document, issuer, profile } = loaded;
  const pattern = textOf(profile![kind.patternField]);
  const held = heldNumber(document);
  const version = held ? (wholeDays(document.version) ?? 0) + 1 : 1;

  run.step('trial');
  const { inputFor } = await prepare(run);
  const trialNumber = held ?? (await nextNumber(deps.app, scope, pattern, issueDate)).number;
  let rendered = await run.render(inputFor(trialNumber, version));

  run.step('claim');
  const claim = await claimNumber(deps.app, { kind, documentId: document.id, issuerId: issuer!.id, pattern, reset: resetOf(profile), issueDate });

  run.step('render');
  if (claim.number !== trialNumber) rendered = await run.render(inputFor(claim.number, version));

  run.step('upload');
  const file = await deps.app.upload({ bytes: rendered.bytes, name: `${claim.number} v${version}.pdf`, mime: 'application/pdf', object: kind.object, field: 'pdf' });

  run.step('store');
  await deps.app.update(kind.plural, document.id, { version, pdf: [file, ...fileInputs(document.pdf)].slice(0, 10) });
  return ok(run.pack.messages.quotePdf(claim.number, version), { number: claim.number, version });
}

/** What a button asked for, answered: never a thrown error, always an outcome the route can send. */
export async function runAction(raw: unknown, deps: ActionDeps): Promise<ActionOutcome> {
  const request = parseRequest(raw);
  const locale = (raw as { locale?: unknown } | null)?.locale;
  const pack = packFor(typeof locale === 'string' ? locale : null);
  let step = 'request';
  try {
    if (!request) throw new Error('The request is not one of the actions this route runs');
    const serverDate = deps.now().toISOString().slice(0, 10);
    if (Math.abs(dayNumber(request.localDate) - dayNumber(serverDate)) > 1) {
      return refuse(422, pack, [{ source: 'lifecycle', code: 'CLOCK_SKEW', field: 'localDate', value: request.localDate }]);
    }
    const kind = kindOf(request.object)!;

    step = 'read';
    const document = await deps.app.get(kind.plural, request.recordId);
    if (!document) throw new Error('The document no longer exists');
    if (isIssued(kind, document)) return refuse(422, pack, [{ source: 'lifecycle', code: 'ALREADY_ISSUED', value: textOf(document.number) }]);

    step = 'defaults';
    const defaults = await defaultsFor(deps.app, kind, document, request.localDate);
    try {
      await deps.caller.update(kind.plural, document.id, defaults);
    } catch (error) {
      if (error instanceof NotAllowedError) return refuse(403, pack, [{ source: 'lifecycle', code: 'NOT_ALLOWED' }]);
      throw error;
    }

    step = 'load';
    const loaded = await loadDocument(deps.app, kind, document.id);
    if (!loaded) throw new Error('The document no longer exists');
    // Another request may have issued it meanwhile: a double click is answered as the first read would have been.
    if (isIssued(kind, loaded.document)) return refuse(422, pack, [{ source: 'lifecycle', code: 'ALREADY_ISSUED', value: textOf(loaded.document.number) }]);
    const lineNumbers = new Map(loaded.lines.map((line, index) => [line.id, index + 1]));

    step = 'gate';
    const issueDate = textOf(loaded.document.issueDate);
    const scope = loaded.issuer && loaded.profile ? scopeOf(kind, loaded.issuer.id, resetOf(loaded.profile), issueDate) : null;
    const latest = request.action === 'issue' && scope ? await latestIssueDate(deps.app, scope, document.id) : null;
    const problems = checkGate(loaded, { action: request.action, localDate: request.localDate, latestIssueDate: latest });
    if (problems.length > 0) return refuse(422, pack, problems, lineNumbers);

    const run: Run = {
      request, kind, loaded, scope: scope!, issueDate, pack, deps,
      render: deps.render ?? renderDocument,
      step: (name) => {
        step = name;
      },
    };
    if (request.action === 'preview') return await preview(run);
    if (request.action === 'issue') return await issue(run);
    return await quotePdf(run);
  } catch (error) {
    if (error instanceof LifecycleError) return refuse(422, pack, error.problems.map((problem): AnyProblem => ({ source: 'lifecycle', ...problem })));
    if (error instanceof RenderError) return refuse(422, pack, error.problems.map((problem): AnyProblem => ({ source: 'render', problem })));
    if (error instanceof EngineError) return refuse(422, pack, error.problems.map((problem): AnyProblem => ({ source: 'engine', problem })));
    const reference = deps.reference();
    deps.log({
      reference, object: request?.object ?? null, recordId: request?.recordId ?? null, action: request?.action ?? null, step,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: pack.messages.unexpected(reference) }] } };
  }
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/actions.test.ts test/lifecycle/purity.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 5: Run the whole Lifecycle suite**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test "test/lifecycle/**/*.test.ts"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lifecycle/actions.ts test/lifecycle/actions.test.ts
```

```bash
git commit -m "feat: preview, issue and quote PDF, gated, numbered and frozen, resumable after any failure"
```

---

### Task 12: The guards

`lifecycle/guards.ts` holds what the document and line triggers do (spec §7, §8). A guard re-reads the record, compares it with the state it should have, and writes only the differences, as the app: a retried or late event repeats nothing, and a guard's own write produces an event in which nothing differs.

A document is **numbered** when it holds a `numberKey`, and **issued** when it is an invoice or credit note with a `snapshot`.

| Event | What the guard does |
|---|---|
| A person moves a status | Checks the three rules of spec §7; a move that breaks one is put back to the previous status, with a message. A move the app makes is always allowed. |
| An issued document's locked field differs from `snapshot.record` | Writes the snapshot's value back, whoever changed it, with one message naming every field put back. Rich text is compared by its markdown: Twenty re-derives the editor's JSON on write, and comparing that would make the guard answer its own write for ever. |
| An issued document's line changed, deleted, or moved out | Writes its fields back from the snapshot, restores it, moves it back. |
| A line added to an issued document, or moved into it | Soft-deletes it, or moves it back to the document it came from. Only the line's own event acts on it. |
| A numbered or issued document soft-deleted | Restores it, whoever deleted it: a delete event cannot say who. A quote is numbered too, and its number must not be lost either. |
| A record created with a status other than DRAFT, by a person | Sets it to DRAFT. |
| A draft's line created, restored, deleted, or changed in a field other than `lineTotal`; a draft's currency, price basis or issuer changed | Recomputes the totals (Task 10). A line that picked a catalog item is filled first; its own write brings the recomputation. |

Twenty's soft delete does not cascade: a soft-deleted document's lines stay live, so restoring the document is enough. A destroyed document cannot be brought back, and its lines go with it without an event.

**Files:**
- Create: `lifecycle/guards.ts`, `test/lifecycle/helpers/triggers.ts`
- Test: `test/lifecycle/guards.test.ts`

**Interfaces:**
- Consumes: `PACKS`, `Language`, `LifecyclePack`, `StatusKey`, `StatusRule` from `lifecycle/lang/pack.ts`; `isIssued`, `KINDS`, `Kind` from `lifecycle/load.ts`; `idOf`, `textOf` from `lifecycle/map.ts`; `guardSequence`, `packForIssuer` from `lifecycle/numbering.ts`; `leaveMessage`, `sourceOf`, `RecordEvent`, `Row`, `Store` from `lifecycle/store.ts`; `documentChangeMatters`, `fillFromCatalog`, `lineChangeMatters`, `recomputeTotals` from `lifecycle/totals.ts`; `runAction` (tests only).
- Produces, from `lifecycle/guards.ts`:
  - `statusRuleBroken(kind: Kind, from: string, to: string, state: { numbered: boolean; issued: boolean }): StatusRule | null`
  - `sameField(a: unknown, b: unknown): boolean` (Twenty-round-trip equality: rich text by markdown, empty text as null, money by amount and currency)
  - `onDocumentEvent(store: Store, kind: Kind, event: RecordEvent): Promise<void>`
  - `onLineEvent(store: Store, kind: Kind, event: RecordEvent): Promise<void>`
- Produces, from `test/lifecycle/helpers/triggers.ts`: `dispatcher(store: Store): (event: MemoryEvent) => Promise<void>` (routes an event to the handler its object's trigger runs)

- [ ] **Step 1: Write the dispatcher helper**

`test/lifecycle/helpers/triggers.ts`:

```ts
import { onDocumentEvent, onLineEvent } from '../../../lifecycle/guards.ts';
import { KINDS } from '../../../lifecycle/load.ts';
import { guardSequence } from '../../../lifecycle/numbering.ts';
import type { RecordEvent, Store } from '../../../lifecycle/store.ts';
import type { MemoryEvent } from './memory-store.ts';

/** What the seven triggers do, by object: each event goes to the handler its object's trigger runs. */
export function dispatcher(store: Store): (event: MemoryEvent) => Promise<void> {
  const routes = new Map<string, (event: RecordEvent) => Promise<void>>();
  for (const kind of Object.values(KINDS)) {
    routes.set(kind.plural, (event) => onDocumentEvent(store, kind, event));
    routes.set(kind.linePlural, (event) => onLineEvent(store, kind, event));
  }
  routes.set('billingSequences', (event) => guardSequence(store, event));
  return async (event) => {
    await routes.get(event.plural)?.(event);
  };
}
```

- [ ] **Step 2: Write the failing test**

`test/lifecycle/guards.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runAction } from '../../lifecycle/actions.ts';
import { onDocumentEvent, sameField, statusRuleBroken } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { numberKeyOf } from '../../lifecycle/numbering.ts';
import type { Store } from '../../lifecycle/store.ts';
import { drain } from './helpers/memory-store.ts';
import { dispatcher } from './helpers/triggers.ts';
import { TODAY, markdown, money, now, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const LINES = 'billingInvoiceLines';

const settle = (w: Workspace, store: Store = w.app) => drain(w.db, dispatcher(store));
const invoice = (w: Workspace, id = w.invoice.id) => w.db.row('billingInvoices', id)!;
const corrections = (w: Workspace) => w.db.timeline.filter((entry) => entry.kind === 'CORRECTION').map((entry) => entry.text);

/** Issues the fixture's invoice through the action, then lets its events settle. */
async function issued(w: Workspace, id = w.invoice.id, object = 'billingInvoice'): Promise<void> {
  const outcome = await runAction({ action: 'issue', object, recordId: id, localDate: TODAY, locale: 'en' }, {
    app: w.app, caller: w.db.store('MANUAL'), now, reference: () => 'ref', log: () => {},
    sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex'),
    render: async (input) => ({ bytes: new TextEncoder().encode(`%PDF ${input.number}`), pages: 1 }),
  });
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  await settle(w);
}

test('the status rules, for each kind of document', () => {
  const [quote, credit] = [KINDS.billingQuote, KINDS.billingCreditNote];
  const draft = { numbered: false, issued: false };
  const numberedDraft = { numbered: true, issued: false };
  const done = { numbered: true, issued: true };
  assert.equal(statusRuleBroken(INVOICE, 'DRAFT', 'ISSUED', draft), 'ISSUE');
  assert.equal(statusRuleBroken(INVOICE, 'DRAFT', 'ISSUED', numberedDraft), 'ISSUE');
  assert.equal(statusRuleBroken(INVOICE, 'SENT', 'ISSUED', done), null);
  assert.equal(statusRuleBroken(INVOICE, 'ISSUED', 'SENT', done), null);
  assert.equal(statusRuleBroken(INVOICE, 'SENT', 'PAID', done), null);
  assert.equal(statusRuleBroken(INVOICE, 'PAID', 'SENT', done), null);
  assert.equal(statusRuleBroken(INVOICE, 'PAID', 'DRAFT', done), 'DRAFT');
  assert.equal(statusRuleBroken(INVOICE, 'ISSUED', 'CANCELLED', done), 'CANCEL');
  assert.equal(statusRuleBroken(INVOICE, 'DRAFT', 'CANCELLED', numberedDraft), 'CANCEL');
  assert.equal(statusRuleBroken(INVOICE, 'DRAFT', 'CANCELLED', draft), null);
  assert.equal(statusRuleBroken(INVOICE, 'CANCELLED', 'DRAFT', draft), null);
  assert.equal(statusRuleBroken(credit, 'DRAFT', 'ISSUED', draft), 'ISSUE');
  assert.equal(statusRuleBroken(credit, 'ISSUED', 'DRAFT', done), 'DRAFT');
  assert.equal(statusRuleBroken(quote, 'ACCEPTED', 'INVOICED', numberedDraft), 'INVOICED');
  for (const to of ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'DRAFT']) assert.equal(statusRuleBroken(quote, 'SENT', to, numberedDraft), null, to);
});

test('a field is compared the way it comes back from Twenty', () => {
  assert.equal(sameField(markdown('Hello'), { blocknote: '[{"id":"x"}]', markdown: 'Hello' }), true);
  assert.equal(sameField(markdown('Hello'), markdown('Bye')), false);
  assert.equal(sameField('', null), true);
  assert.equal(sameField(money(1), { amountMicros: 1, currencyCode: 'EUR' }), true);
  assert.equal(sameField('2026-09-26', '2026-09-26'), true);
  assert.equal(sameField(4, 4.5), false);
});

test('issuing an invoice brings no correction', async () => {
  const w = workspace();
  await issued(w);
  assert.deepEqual(corrections(w), []);
  const writes = w.db.writes.length;
  await settle(w);
  assert.equal(w.db.writes.length, writes);
});

test('a locked field changed on an issued invoice is put back, with a message naming it', async () => {
  const w = workspace();
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { subject: 'Autre chose' });
  await settle(w);
  assert.equal(invoice(w).subject, 'Identité visuelle');
  assert.deepEqual(corrections(w), ['Cette facture est émise\u00a0: la modification de Objet a été annulée. Corrigez-la par un avoir.']);
});

test('several locked fields changed at once are put back together, in one message', async () => {
  const w = workspace();
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { subject: 'X', issueDate: '2026-09-01', companyId: null });
  await settle(w);
  assert.deepEqual([invoice(w).subject, invoice(w).issueDate, invoice(w).companyId], ['Identité visuelle', TODAY, w.company.id]);
  assert.equal(corrections(w).length, 1);
  assert.match(corrections(w)[0]!, /les modifications de Objet, Société et Date d’émission ont été annulées/);
});

test('rich text is put back, and Twenty re-deriving its editor JSON does not make the guard loop', async () => {
  const w = workspace();
  // Twenty stores the editor's JSON it derives itself, not the one it was sent.
  const app: Store = {
    ...w.app,
    update: (plural, id, data) => w.app.update(plural, id, data.notes ? { ...data, notes: { ...(data.notes as object), blocknote: '[{"derived":true}]' } } : data),
  };
  await w.app.update('billingInvoices', w.invoice.id, { notes: markdown('Merci de votre confiance.') });
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { notes: { blocknote: '[{"typed":true}]', markdown: 'Autre texte' } });
  await settle(w, app);
  assert.equal((invoice(w).notes as { markdown: string }).markdown, 'Merci de votre confiance.');
  assert.equal(corrections(w).length, 1);
});

test('after issue, sent and paid dates, the opportunity and the quote stay free', async () => {
  const w = workspace();
  await issued(w);
  const opportunity = w.db.seed('opportunities', { name: 'Refonte' });
  await w.user.update('billingInvoices', w.invoice.id, { sentAt: '2026-09-27T08:00:00.000Z', paidAt: '2026-10-01', opportunityId: opportunity.id });
  await settle(w);
  assert.deepEqual([invoice(w).paidAt, invoice(w).opportunityId], ['2026-10-01', opportunity.id]);
  assert.deepEqual(corrections(w), []);
});

test('an issued invoice moves freely between Issued, Sent and Paid, never back to Draft', async () => {
  const w = workspace();
  await issued(w);
  for (const status of ['PAID', 'SENT', 'ISSUED']) {
    await w.user.update('billingInvoices', w.invoice.id, { status });
    await settle(w);
    assert.equal(invoice(w).status, status);
  }
  await w.user.update('billingInvoices', w.invoice.id, { status: 'DRAFT' });
  await settle(w);
  assert.equal(invoice(w).status, 'ISSUED');
  assert.deepEqual(corrections(w), ['Une facture numérotée ne peut pas revenir au statut Brouillon. Le statut a été remis à Émise.']);
});

test('only the app issues or cancels; a person’s move there is put back', async () => {
  const w = workspace();
  await w.user.update('billingInvoices', w.invoice.id, { status: 'ISSUED' });
  await settle(w);
  assert.equal(invoice(w).status, 'DRAFT');
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { status: 'CANCELLED' });
  await settle(w);
  assert.equal(invoice(w).status, 'ISSUED');
  await w.app.update('billingInvoices', w.invoice.id, { status: 'CANCELLED' });
  await settle(w);
  assert.equal(invoice(w).status, 'CANCELLED', 'the app cancels (sub-project 4b, through a credit note)');
});

test('a draft with no number is cancelled and revived freely', async () => {
  const w = workspace();
  for (const status of ['CANCELLED', 'DRAFT']) {
    await w.user.update('billingInvoices', w.invoice.id, { status });
    await settle(w);
    assert.equal(invoice(w).status, status);
  }
  assert.deepEqual(corrections(w), []);
});

test('a quote’s statuses are free, except Invoiced', async () => {
  const w = workspace();
  const quote = w.addQuote({ number: 'D2026-0001', numberKey: numberKeyOf(w.issuer.id, 'D2026-0001'), status: 'SENT' });
  for (const status of ['ACCEPTED', 'DECLINED', 'EXPIRED', 'DRAFT']) {
    await w.user.update('billingQuotes', quote.id, { status });
    await settle(w);
    assert.equal(w.db.row('billingQuotes', quote.id)?.status, status);
  }
  await w.user.update('billingQuotes', quote.id, { status: 'INVOICED' });
  await settle(w);
  assert.equal(w.db.row('billingQuotes', quote.id)?.status, 'DRAFT');
});

test('a line of an issued invoice changed, deleted or moved out is put back', async () => {
  const w = workspace();
  const other = w.addInvoice();
  await issued(w);
  const [first, second, third] = w.lines;
  await w.user.update(LINES, first!.id, { description: 'Changée', quantity: 40 });
  await w.user.softDelete(LINES, second!.id);
  await w.user.update(LINES, third!.id, { invoiceId: other.id });
  await settle(w);
  assert.deepEqual([w.db.row(LINES, first!.id)!.description, w.db.row(LINES, first!.id)!.quantity], ['Direction artistique', 4]);
  assert.equal(w.db.row(LINES, second!.id)!.deletedAt, null);
  assert.equal(w.db.row(LINES, third!.id)!.invoiceId, w.invoice.id);
  assert.equal(corrections(w).length, 3);
});

test('a line added to an issued invoice is removed; a line moved into it goes back where it came from', async () => {
  const w = workspace();
  const draft = w.addInvoice();
  const wanderer = w.addLine(INVOICE, draft.id, { description: 'Ailleurs' });
  await issued(w);
  const added = await w.user.create(LINES, { invoiceId: w.invoice.id, description: 'Ajoutée', quantity: 1, unit: 'DAY', unitPrice: money(1_000_000), taxCodeId: w.vat20.id });
  await w.user.update(LINES, wanderer.id, { invoiceId: w.invoice.id });
  await settle(w);
  assert.ok(w.db.row(LINES, added.id)!.deletedAt);
  assert.equal(w.db.row(LINES, wanderer.id)!.invoiceId, draft.id);
  assert.deepEqual(corrections(w).length, 2);
});

test('an issued invoice, a numbered draft and a numbered quote cannot be deleted; an unnumbered draft can', async () => {
  const w = workspace();
  await issued(w);
  const numberedDraft = w.addInvoice({ number: 'F2026-0002', numberKey: numberKeyOf(w.issuer.id, 'F2026-0002') });
  const quote = w.addQuote({ number: 'D2026-0001', numberKey: numberKeyOf(w.issuer.id, 'D2026-0001') });
  const plain = w.addInvoice();
  for (const [plural, id] of [['billingInvoices', w.invoice.id], ['billingInvoices', numberedDraft.id], ['billingQuotes', quote.id], ['billingInvoices', plain.id]] as const) {
    await w.user.softDelete(plural, id);
  }
  await settle(w);
  assert.equal(invoice(w).deletedAt, null);
  assert.equal(invoice(w, numberedDraft.id).deletedAt, null);
  assert.equal(w.db.row('billingQuotes', quote.id)!.deletedAt, null);
  assert.ok(invoice(w, plain.id).deletedAt);
  assert.match(corrections(w).join('\n'), /porte le numéro F2026-0001 et ne peut pas être supprimée/);
});

test('a deletion is restored whoever made it, the app included: its event cannot say who', async () => {
  const w = workspace();
  await issued(w);
  await w.app.softDelete('billingInvoices', w.invoice.id);
  await settle(w);
  assert.equal(invoice(w).deletedAt, null);
});

test('a document created by a person with another status than Draft is set to Draft', async () => {
  const w = workspace();
  const imported = await w.user.create('billingInvoices', { subject: 'Importée', status: 'PAID', issuerId: w.issuer.id, companyId: w.company.id, currencyCode: 'EUR' });
  await settle(w);
  assert.equal(invoice(w, imported.id).status, 'DRAFT');
  assert.deepEqual(corrections(w), ['Cette facture commence comme brouillon\u00a0: son statut Payée a été remis à Brouillon.']);
});

test('a guard speaks the document’s language', async () => {
  const w = workspace();
  await w.app.update('billingInvoices', w.invoice.id, { language: 'EN' });
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { subject: 'Other' });
  await settle(w);
  assert.deepEqual(corrections(w), ['This invoice is issued: the change to Subject was put back. Correct it with a credit note.']);
});

test('a retried event changes nothing', async () => {
  const w = workspace();
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { subject: 'Autre chose' });
  const seen = await settle(w);
  const writes = w.db.writes.length;
  const personal = seen.find((event) => event.plural === 'billingInvoices' && event.after?.subject === 'Autre chose')!;
  await onDocumentEvent(w.app, INVOICE, personal);
  await settle(w);
  assert.equal(w.db.writes.length, writes);
  assert.equal(corrections(w).length, 1);
});

test('a draft’s totals follow its lines, and a change of lineTotal alone moves nothing', async () => {
  const w = workspace();
  await settle(w);
  await w.user.update(LINES, w.lines[2]!.id, { quantity: 2 });
  await settle(w);
  assert.deepEqual(invoice(w).total, money(11_232_000_000));
  const writes = w.db.writes.length;
  await w.app.update(LINES, w.lines[2]!.id, { lineTotal: money(1) });
  await settle(w);
  assert.equal(w.db.writes.length, writes + 1, 'only the test’s own write');
});

test('a draft’s totals follow its currency, and a line moved between drafts recomputes both', async () => {
  const w = workspace();
  const other = w.addInvoice();
  await w.user.update(LINES, w.lines[2]!.id, { invoiceId: other.id });
  await settle(w);
  assert.deepEqual(invoice(w).total, money(8_352_000_000));
  assert.deepEqual(invoice(w, other.id).total, money(1_440_000_000));
  await w.user.update('billingInvoices', other.id, { currencyCode: 'USD' });
  await settle(w);
  assert.deepEqual(invoice(w, other.id).total, { amountMicros: null, currencyCode: '' }, 'a EUR line on a USD invoice: no total');
});

test('a line created with a catalog item is filled, and the totals follow', async () => {
  const w = workspace();
  const item = w.db.seed('billingCatalogItems', { description: 'Atelier', unit: 'DAY', unitPrice: money(1_000_000_000), taxCodeId: w.vat20.id });
  const line = await w.user.create(LINES, { invoiceId: w.invoice.id, catalogItemId: item.id, quantity: 1, unit: 'UNIT', unitPrice: money(null, ''), description: '', taxCodeId: null });
  await settle(w);
  assert.equal(w.db.row(LINES, line.id)!.description, 'Atelier');
  assert.deepEqual(invoice(w).total, money(10_992_000_000));
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/guards.test.ts`
Expected: FAIL: `Cannot find module '.../lifecycle/guards.ts'`.

- [ ] **Step 4: Write `lifecycle/guards.ts`**

```ts
import { PACKS, type Language, type LifecyclePack, type StatusKey, type StatusRule } from './lang/pack.ts';
import { isIssued, type Kind } from './load.ts';
import { idOf, textOf } from './map.ts';
import { packForIssuer } from './numbering.ts';
import { leaveMessage, sourceOf, type RecordEvent, type Row, type Store } from './store.ts';
import { documentChangeMatters, fillFromCatalog, lineChangeMatters, recomputeTotals } from './totals.ts';

/**
 * The three status rules of spec §7. Only a person's move is checked: the app's
 * are always allowed. Null when the move is free.
 */
export function statusRuleBroken(kind: Kind, from: string, to: string, state: { numbered: boolean; issued: boolean }): StatusRule | null {
  if (from === to) return null;
  if (kind.kind === 'QUOTE') return to === 'INVOICED' ? 'INVOICED' : null;
  if (to === 'ISSUED' && !state.issued) return 'ISSUE';
  if (state.numbered && to === 'DRAFT') return 'DRAFT';
  if (state.numbered && to === 'CANCELLED') return 'CANCEL';
  return null;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A value as it survives Twenty's round trip: rich text by its markdown, money by amount and currency, empty as null. */
function canonical(value: unknown): string {
  if (isObject(value) && 'markdown' in value) return JSON.stringify(textOf(value.markdown).trim());
  if (isObject(value) && 'amountMicros' in value) {
    const amount = value.amountMicros === null || value.amountMicros === undefined || value.amountMicros === '' ? null : Number(value.amountMicros);
    return JSON.stringify({ amount, currency: amount === null ? '' : textOf(value.currencyCode) });
  }
  if (value === '' || value === undefined) return 'null';
  return JSON.stringify(value);
}

export const sameField = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

type SnapshotRecord = { document?: Record<string, unknown>; lines?: Record<string, Record<string, unknown>> };

function recordOf(document: Row): SnapshotRecord {
  const record = isObject(document.snapshot) ? document.snapshot.record : undefined;
  return isObject(record) ? (record as SnapshotRecord) : {};
}

/** Messages are in the document's language, else its issuer's profile's. */
async function packForDocument(store: Store, document: Row): Promise<LifecyclePack> {
  return PACKS[textOf(document.language) as Language] ?? packForIssuer(store, document.issuerId);
}

async function tell(store: Store, kind: Kind, document: Row, text: (pack: LifecyclePack) => string): Promise<void> {
  const pack = await packForDocument(store, document);
  await leaveMessage(store, { object: kind.object, recordId: document.id, kind: 'CORRECTION', text: text(pack) });
}

const statusName = (pack: LifecyclePack, status: string): string => pack.statuses[status as StatusKey] ?? status;

/** The trigger of a document object (spec §7, §8). */
export async function onDocumentEvent(store: Store, kind: Kind, event: RecordEvent): Promise<void> {
  if (event.name === 'destroyed' || event.name === 'upserted') return;
  const document = await store.get(kind.plural, event.recordId, { deleted: true });
  if (!document) return;
  const issued = isIssued(kind, document);
  const numbered = Boolean(document.numberKey);

  if (event.name === 'deleted') {
    if (document.deletedAt && (issued || numbered)) {
      await store.restore(kind.plural, document.id);
      await tell(store, kind, document, (pack) => pack.messages.documentRestored(kind.kind, textOf(document.number)));
    }
    return;
  }
  if (event.name === 'restored' || document.deletedAt) return;

  if (event.name === 'created') {
    const status = textOf(document.status);
    if (sourceOf(event.after) !== 'APPLICATION' && status !== '' && status !== 'DRAFT' && !issued) {
      await store.update(kind.plural, document.id, { status: 'DRAFT' });
      await tell(store, kind, document, (pack) => pack.messages.createdAsDraft(kind.kind, statusName(pack, status)));
    }
    return;
  }

  const patch: Record<string, unknown> = {};
  const messages: ((pack: LifecyclePack) => string)[] = [];

  if (sourceOf(event.after) !== 'APPLICATION' && event.updatedFields.includes('status')) {
    const from = textOf(event.before?.status) || 'DRAFT';
    const rule = statusRuleBroken(kind, from, textOf(document.status), { numbered, issued });
    if (rule) {
      patch.status = from;
      messages.push((pack) => pack.messages.statusPutBack(rule, kind.kind, statusName(pack, from)));
    }
  }

  if (issued) {
    const record = recordOf(document).document ?? {};
    const changed = kind.lockedFields.filter((field) => field in record && !sameField(document[field], record[field]));
    for (const field of changed) patch[field] = record[field];
    if (changed.length > 0) messages.push((pack) => pack.messages.fieldsPutBack(kind.kind, changed.map((field) => pack.fields[field])));
  }

  if (Object.keys(patch).length > 0) {
    await store.update(kind.plural, document.id, patch);
    for (const message of messages) await tell(store, kind, document, message);
  }
  if (!issued && documentChangeMatters(event)) await recomputeTotals(store, kind, document.id);
}

type LineCorrection = 'changed' | 'added' | 'deleted' | 'moved';

/** An issued document's lines, put back to its snapshot (spec §7). */
async function reconcileIssuedLines(store: Store, kind: Kind, document: Row, event: RecordEvent, line: Row | null): Promise<void> {
  const key = kind.parentKey;
  const snapshotLines = recordOf(document).lines ?? {};
  const corrections = new Set<LineCorrection>();
  const held = new Map((await store.list(kind.linePlural, { [key]: document.id }, { deleted: 'include' })).map((row) => [row.id, row]));

  for (const [id, fields] of Object.entries(snapshotLines)) {
    let current = held.get(id) ?? (await store.get(kind.linePlural, id, { deleted: true }));
    // Destroyed: nothing can bring it back.
    if (!current) continue;
    if (current.deletedAt) {
      await store.restore(kind.linePlural, id);
      corrections.add('deleted');
      current = { ...current, deletedAt: null };
    }
    const patch = Object.fromEntries(Object.entries(fields).filter(([field, value]) => !sameField(current![field], value)));
    if (Object.keys(patch).length > 0) {
      await store.update(kind.linePlural, id, patch);
      corrections.add(key in patch ? 'moved' : 'changed');
    }
  }

  // A line on the document that the snapshot does not know. Only its own event acts on it:
  // another event cannot tell where it came from.
  if (line && line.id === event.recordId && !line.deletedAt && idOf(line[key]) === document.id && !(line.id in snapshotLines)) {
    const from = idOf(event.before?.[key]);
    if (event.name === 'updated' && from !== null && from !== document.id) {
      await store.update(kind.linePlural, line.id, { [key]: from });
      corrections.add('moved');
    } else {
      await store.softDelete(kind.linePlural, line.id);
      corrections.add('added');
    }
  }

  for (const correction of corrections) {
    await tell(store, kind, document, (pack) => {
      const words = { changed: pack.messages.lineChangePutBack, added: pack.messages.lineAddedRemoved, deleted: pack.messages.lineDeletedRestored, moved: pack.messages.lineMoveReverted };
      return words[correction](kind.kind);
    });
  }
}

/** The trigger of a line object: guards for issued documents, the catalog and totals for drafts. */
export async function onLineEvent(store: Store, kind: Kind, event: RecordEvent): Promise<void> {
  if (event.name === 'destroyed' || event.name === 'upserted') return;
  const key = kind.parentKey;
  const line = await store.get(kind.linePlural, event.recordId, { deleted: true });
  const parentIds = [...new Set([event.before?.[key], event.after?.[key], line?.[key]].map(idOf).filter((id): id is string => id !== null))];
  const parents: Row[] = [];
  for (const id of parentIds) {
    const parent = await store.get(kind.plural, id, { deleted: true });
    if (parent) parents.push(parent);
  }

  for (const parent of parents) if (isIssued(kind, parent)) await reconcileIssuedLines(store, kind, parent, event, line);

  const drafts = parents.filter((parent) => !isIssued(kind, parent) && !parent.deletedAt);
  if (drafts.length === 0) return;
  const home = line && !line.deletedAt ? idOf(line[key]) : null;
  // The fill's own write brings the next event, which recomputes the totals.
  if (home !== null && drafts.some((draft) => draft.id === home) && (await fillFromCatalog(store, kind, event))) return;
  if (!lineChangeMatters(event)) return;
  for (const draft of drafts) await recomputeTotals(store, kind, draft.id);
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test "test/lifecycle/**/*.test.ts" && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add lifecycle/guards.ts test/lifecycle/helpers/triggers.ts test/lifecycle/guards.test.ts
```

```bash
git commit -m "feat: issued documents are guarded: every change is put back and explained on the timeline"
```

---

### Task 13: The Billing timeline

Each guard correction, and each issue, leaves a message on the record's timeline (spec §7), in the document's language. Twenty 2.41 shows an app's timeline row as "<author> <type label> <record>", on one line; the text of the message appears when the person expands the row, rendered by a visible front component the type names. The maintainer chose that, over a note on the record and over a linked message record.

Two types share that component, so that the collapsed row already says what happened: "Twenty issued Identité visuelle" and "Twenty put back a change to Identité visuelle". Neither has an `emit`: an emitting type would take over the automatic "updated" row of the app's objects.

This task also sets up front components, which the buttons (Task 17) reuse: a front component is a `.tsx` browser bundle, which `tsc` checks only with `"jsx": "react-jsx"` and React's types, and which `node --test` cannot import. Its logic therefore lives in a plain `.ts` module that tests import, and the `.tsx` gets a bundle test built with the options the Twenty CLI uses. A browser bundle cannot import `src/lib/id.ts` (it uses `node:crypto`): the component reads `src/ids.ts` directly, and its key is requested with `id()` from the `.ts` type definitions, so `npm run ids:sync` registers it.

**Files:**
- Modify: `package.json`, `package-lock.json` (React and its types, pinned), `tsconfig.json`
- Create: `src/timeline-activity-types/billing-issued.ts`, `src/timeline-activity-types/billing-correction.ts`, `src/front-components/timeline-message.ts`, `src/front-components/billing-timeline-message.tsx`, `test/helpers/front-component-build.ts`
- Modify: `src/ids.ts` (by `npm run ids:sync`)
- Test: `test/timeline.test.ts`

**Interfaces:**
- Consumes: `defineTimelineActivityType`, `defineFrontComponent` from `twenty-sdk/define`; `useTimelineActivityId` from `twenty-sdk/front-component`; `RestApiClient` from `twenty-client-sdk/rest`; `getFrontComponentBuildPlugins` from `twenty-sdk/front-component-renderer/build`; `id` from `src/lib/id.ts`; `IDS` from `src/ids.ts`.
- Produces:
  - identifier keys `timelineActivityType.billingIssued`, `timelineActivityType.billingCorrection`, `frontComponent.billingTimelineMessage`
  - `TIMELINE_TYPE_KEYS: { ISSUED: string; CORRECTION: string }` from `src/front-components/timeline-message.ts` (the registry key of each timeline type, for the REST store)
  - `messageOf(response: unknown): string | null` from `src/front-components/timeline-message.ts`
  - from `test/helpers/front-component-build.ts`: `bundleFrontComponent(entry: string): Promise<{ exports: string[]; inputs: string[] }>`

- [ ] **Step 1: Add React's types, and React pinned as the CLI resolves it**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm install --save-dev --save-exact @types/react@19.3.0 react@19.3.0 react-dom@19.3.0
```

- [ ] **Step 2: Let `tsc` check front components**

In `tsconfig.json`, add `"jsx": "react-jsx"` to `compilerOptions` (after `"erasableSyntaxOnly": true`), and change the `include` line to:

```json
  "include": ["src/**/*.ts", "src/**/*.tsx", "engine/**/*.ts", "render/**/*.ts", "lifecycle/**/*.ts", "test/**/*.ts"]
```

- [ ] **Step 3: Write the bundle helper**

`test/helpers/front-component-build.ts`:

```ts
import { build } from 'esbuild';
import { getFrontComponentBuildPlugins } from 'twenty-sdk/front-component-renderer/build';

/**
 * What twenty-sdk 2.41 passes esbuild for a front component: one ES module for
 * the browser (no platform, so esbuild's browser default), JSX in automatic
 * mode, React and the SDK bundled, and the SDK's plugins, which turn the
 * defineFrontComponent default export into a render function.
 */
const FRONT_COMPONENT = {
  bundle: true,
  splitting: false,
  format: 'esm' as const,
  external: ['twenty-client-sdk/core', 'twenty-client-sdk/metadata', 'twenty:front-component-shared-dependencies'],
  jsx: 'automatic' as const,
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
  write: false,
  logLevel: 'silent' as const,
};

/** Bundles a front component as the CLI would; rejects on any import a browser cannot resolve, `node:` ones included. */
export async function bundleFrontComponent(entry: string): Promise<{ exports: string[]; inputs: string[] }> {
  const result = await build({ ...FRONT_COMPONENT, entryPoints: [entry], outdir: '/virtual-front-component-out', plugins: getFrontComponentBuildPlugins() });
  const outputs = Object.values(result.metafile!.outputs);
  return { exports: outputs.flatMap((output) => output.exports), inputs: Object.keys(result.metafile!.inputs) };
}
```

- [ ] **Step 4: Write the failing test**

`test/timeline.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import issued from '../src/timeline-activity-types/billing-issued.ts';
import correction from '../src/timeline-activity-types/billing-correction.ts';
import { TIMELINE_TYPE_KEYS, messageOf } from '../src/front-components/timeline-message.ts';
import { IDS } from '../src/ids.ts';
import { bundleFrontComponent } from './helpers/front-component-build.ts';

const COMPONENT = fileURLToPath(new URL('../src/front-components/billing-timeline-message.tsx', import.meta.url));

test('the two timeline types validate, emit nothing by themselves, and name the message component', () => {
  for (const type of [issued, correction]) {
    assert.equal(type.success, true, type.errors.join('\n'));
    assert.equal(type.config.emit, undefined);
    assert.equal(type.config.frontComponentUniversalIdentifier, IDS['frontComponent.billingTimelineMessage']);
  }
  assert.deepEqual([issued.config.name, issued.config.label], ['billingIssued', 'issued']);
  assert.deepEqual([correction.config.name, correction.config.label], ['billingCorrection', 'put back a change to']);
  assert.equal(issued.config.universalIdentifier, IDS[TIMELINE_TYPE_KEYS.ISSUED]);
  assert.equal(correction.config.universalIdentifier, IDS[TIMELINE_TYPE_KEYS.CORRECTION]);
});

test('the message is read from the timeline activity’s properties', () => {
  assert.equal(messageOf({ data: { timelineActivity: { properties: { message: 'Issued as F2026-0001.' } } } }), 'Issued as F2026-0001.');
  assert.equal(messageOf({ data: { timelineActivity: { properties: null } } }), null);
  assert.equal(messageOf({ data: { timelineActivity: { properties: { message: 42 } } } }), null);
  assert.equal(messageOf(null), null);
});

test('the message component bundles for the browser as the CLI builds it, with a render function as its default export', async () => {
  const { exports, inputs } = await bundleFrontComponent(COMPONENT);
  assert.deepEqual(exports, ['default']);
  assert.ok(!inputs.some((input) => input.startsWith('node:')), inputs.filter((input) => input.startsWith('node:')).join(', '));
  assert.ok(!inputs.some((input) => input.endsWith('src/lib/id.ts')), 'a browser bundle cannot import src/lib/id.ts');
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/timeline.test.ts`
Expected: FAIL: `Cannot find module '.../src/timeline-activity-types/billing-issued.ts'`.

- [ ] **Step 6: Write the message module**

`src/front-components/timeline-message.ts`:

```ts
/**
 * The pure part of the timeline's message component, which node --test can
 * import (it cannot import a .tsx file). Nothing here imports Twenty.
 */

/** The registry key of each timeline type: "issued", and "put back a change to". */
export const TIMELINE_TYPE_KEYS = {
  ISSUED: 'timelineActivityType.billingIssued',
  CORRECTION: 'timelineActivityType.billingCorrection',
} as const;

/** The message of a timeline activity, from `GET /rest/timelineActivities/<id>`; null when it holds none. */
export function messageOf(response: unknown): string | null {
  const activity = (response as { data?: { timelineActivity?: { properties?: { message?: unknown } | null } } } | null)?.data?.timelineActivity;
  const message = activity?.properties?.message;
  return typeof message === 'string' ? message : null;
}
```

- [ ] **Step 7: Write the two timeline types**

`src/timeline-activity-types/billing-issued.ts`:

```ts
import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/** The row an issue leaves: "Twenty issued <document>". Expanded, it reads "Issued as F2026-0001." in the document's language. */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.ISSUED),
  name: 'billingIssued',
  label: 'issued',
  icon: 'IconFileCheck',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
```

`src/timeline-activity-types/billing-correction.ts`:

```ts
import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/**
 * The row a guard leaves when it puts something back: "Twenty put back a change
 * to <document>". Expanded, it says what was put back and why, in the
 * document's language.
 */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.CORRECTION),
  name: 'billingCorrection',
  label: 'put back a change to',
  icon: 'IconArrowBackUp',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
```

- [ ] **Step 8: Write the message component**

`src/front-components/billing-timeline-message.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useTimelineActivityId } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { messageOf } from './timeline-message.ts';

/**
 * Shown when a Billing timeline row is expanded. It reads the activity as the
 * viewing person (the default token in a front component), and prints its
 * message. The timeline row sets `white-space: nowrap`; the text undoes it.
 */
const BillingTimelineMessage = () => {
  const activityId = useTimelineActivityId();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activityId === null) return;
    let current = true;
    new RestApiClient()
      .get(`/rest/timelineActivities/${activityId}`)
      .then((response) => {
        if (current) setMessage(messageOf(response));
      })
      .catch(() => {
        if (current) setMessage(null);
      });
    return () => {
      current = false;
    };
  }, [activityId]);

  if (message === null) return null;
  return <p style={{ margin: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{message}</p>;
};

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.billingTimelineMessage'],
  name: 'billing-timeline-message',
  description: 'Shows the text of a Billing timeline message.',
  component: BillingTimelineMessage,
});
```

- [ ] **Step 9: Register the identifiers**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run ids:sync`
Expected: `ids:sync registered 3 new identifier(s).` listing `frontComponent.billingTimelineMessage`, `timelineActivityType.billingCorrection`, `timelineActivityType.billingIssued`.

- [ ] **Step 10: Run the tests and the typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/timeline.test.ts test/ids.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean (it now covers the `.tsx`).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/ids.ts src/timeline-activity-types src/front-components test/helpers/front-component-build.ts test/timeline.test.ts
```

```bash
git commit -m "feat: a Billing timeline, whose rows expand to say what was issued or put back"
```

---

### Task 14: The Store over Twenty's REST API

`src/lib/rest-store.ts` implements Lifecycle's `Store` with Twenty's REST API, and `src/lib/twenty-stores.ts` builds it from Twenty's clients on each run. The REST API's behaviour this depends on was read in the server source at `twenty/v2.41.0`:

- A plain `DELETE /rest/<objects>/<id>` destroys the record. A soft delete needs `?soft_delete=true`, and a restore is `PATCH /rest/<objects>/<id>/restore`.
- `GET /rest/<objects>/<id>` answers 404 for a soft-deleted record: a record that may be deleted is read with a list filtered on its id and on `deletedAt` (a condition on `deletedAt` widens the query to soft-deleted rows; `or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)` takes both).
- A filter is `field[op]:value` conditions joined by commas (AND). A text field's `[is]:NULL` also matches `''`. The parser has no escape: a quote, a bracket or a parenthesis in a value silently corrupts the conditions after it, so the store refuses one.
- Lists page at 200 at most (`limit`), with `starting_after` taking the previous page's `endCursor`.
- Every answer is an envelope with one key under `data`: `data.<singular>`, `data.create<Singular>`, `data.update<Singular>`, `data.restore<Singular>`, `data.<plural>` with `pageInfo` for a list.
- A refusal by the role, a field restriction, or `writability` comes back as HTTP 400 with `code: 'PERMISSION_DENIED'` (never 403); a unique key as 400 "A duplicate entry was detected"; a record hidden from the caller as 404.
- A FILES read carries a signed `url` (a day) that a plain `fetch` downloads, with no token; the client cannot download binary itself.
- A timeline activity is written as the app, so that its author shows as "Twenty": `POST /rest/timelineActivities` with the type's id (looked up through the metadata API by universal identifier) and `target<ObjectSingular>Id`. A muted or missing type makes the write fail: the store logs it and carries on.
- Clients cache their token: they are built inside each run, never at module scope, where a warm process would reuse another person's token.

**Files:**
- Create: `src/lib/rest-store.ts`, `src/lib/twenty-stores.ts`
- Test: `test/lifecycle/rest-store.test.ts`

**Interfaces:**
- Consumes: `DuplicateError`, `NotAllowedError`, `CallerStore`, `Condition`, `FileRef`, `ListOptions`, `Row`, `Store`, `TimelineEntry`, `Upload`, `Where` from `lifecycle/store.ts`; `RestApiClient` from `twenty-client-sdk/rest`; `MetadataApiClient` from `twenty-client-sdk/metadata`; `fieldId` from `src/schema/fields.ts`; `id` from `src/lib/id.ts`; `TIMELINE_TYPE_KEYS` from `src/front-components/timeline-message.ts`.
- Produces, from `src/lib/rest-store.ts`:
  - `type RestLike` (the four calls of `RestApiClient` the store makes)
  - `type TimelineType = { id: string; universalIdentifier: string; isActive?: boolean | null }`
  - `type RestStoreDeps = { rest: RestLike; uploadFile: (bytes: Uint8Array, name: string, mime: string, fieldUniversalIdentifier: string) => Promise<{ id: string }>; fetchFile: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>; timelineTypes: () => Promise<TimelineType[]>; fieldId: (object: string, field: string) => string; timelineTypeIds: Record<TimelineEntry['kind'], string>; log: (entry: Record<string, unknown>) => void }`
  - `literal(value: string | number | boolean): string`, `toFilter(where: Where, deleted?: 'exclude' | 'include' | 'only'): string | undefined`
  - `translate(error: unknown): unknown` (a `RestApiClientError` as `DuplicateError` or `NotAllowedError`; anything else unchanged)
  - `restStore(deps: RestStoreDeps): Store`, `restCallerStore(rest: RestLike): CallerStore`
- Produces, from `src/lib/twenty-stores.ts`: `appStore(log: (entry: Record<string, unknown>) => void): Store`, `callerStore(): CallerStore`

- [ ] **Step 1: Write the failing test**

`test/lifecycle/rest-store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuplicateError, NotAllowedError } from '../../lifecycle/store.ts';
import { literal, restCallerStore, restStore, toFilter, translate, type RestLike, type RestStoreDeps } from '../../src/lib/rest-store.ts';

type Call = { method: string; path: string; body?: unknown; query?: Record<string, unknown> };

/** A REST client that records its calls and answers from a script, like RestApiClient's envelopes and errors. */
function fakeRest(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  const respond = async (call: Call) => {
    calls.push(call);
    const result = answer(call);
    if (result instanceof Error) throw result;
    return result;
  };
  const rest: RestLike = {
    get: (path, options) => respond({ method: 'GET', path, query: options?.query }) as never,
    post: (path, body, options) => respond({ method: 'POST', path, body, query: options?.query }) as never,
    patch: (path, body, options) => respond({ method: 'PATCH', path, body, query: options?.query }) as never,
    delete: (path, options) => respond({ method: 'DELETE', path, query: options?.query }) as never,
  };
  return { rest, calls };
}

const restError = (status: number, body: unknown) => Object.assign(new Error(`Request failed with status ${status}`), { name: 'RestApiClientError', status, body });

function deps(rest: RestLike, over: Partial<RestStoreDeps> = {}): RestStoreDeps & { logs: Record<string, unknown>[] } {
  const logs: Record<string, unknown>[] = [];
  return {
    rest,
    uploadFile: async () => ({ id: 'file-9' }),
    fetchFile: async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer }),
    timelineTypes: async () => [{ id: 'type-issued', universalIdentifier: 'uid-issued', isActive: true }, { id: 'type-fix', universalIdentifier: 'uid-fix', isActive: true }],
    fieldId: (object, field) => `field:${object}.${field}`,
    timelineTypeIds: { ISSUED: 'uid-issued', CORRECTION: 'uid-fix' },
    log: (entry) => logs.push(entry),
    logs,
    ...over,
  };
}

test('a where clause becomes Twenty’s filter: conditions joined by commas', () => {
  assert.equal(toFilter({ issuerId: 'u1', documentType: 'INVOICE', periodKey: '2026' }), 'issuerId[eq]:u1,documentType[eq]:INVOICE,periodKey[eq]:2026');
  assert.equal(toFilter({ numberKey: null }), 'numberKey[is]:NULL');
  assert.equal(toFilter({ numberKey: { notNull: true }, issueDate: { gte: '2026-01-01', lte: '2026-12-31' } }), 'numberKey[is]:NOT_NULL,issueDate[gte]:2026-01-01,issueDate[lte]:2026-12-31');
  assert.equal(toFilter({ scopeKey: 'u1:INVOICE:2026' }), 'scopeKey[eq]:u1:INVOICE:2026');
  assert.equal(toFilter({ id: 'r1' }, 'include'), 'id[eq]:r1,or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)');
  assert.equal(toFilter({}, 'only'), 'deletedAt[is]:NOT_NULL');
  assert.equal(toFilter({}), undefined);
  assert.equal(toFilter({ active: true }), 'active[eq]:true');
});

test('a value is quoted when it holds a comma or a space, and refused when Twenty’s parser cannot carry it', () => {
  assert.equal(literal('a, b'), '"a, b"');
  for (const unsafe of ["O'Brien", 'a"b', '[x]', '(x)', '']) assert.throws(() => literal(unsafe), /cannot carry/, unsafe);
});

test('a list reads every page, two hundred at a time, and honours order and limit', async () => {
  const pages = [
    { data: { billingInvoices: [{ id: 'a' }, { id: 'b' }] }, pageInfo: { hasNextPage: true, endCursor: 'b' } },
    { data: { billingInvoices: [{ id: 'c' }] }, pageInfo: { hasNextPage: false, endCursor: 'c' } },
  ];
  const { rest, calls } = fakeRest(() => pages.shift());
  const store = restStore(deps(rest));
  assert.deepEqual((await store.list('billingInvoices', { issuerId: 'u1' })).map((row) => row.id), ['a', 'b', 'c']);
  assert.deepEqual(calls.map((call) => call.query), [
    { depth: 0, limit: 200, filter: 'issuerId[eq]:u1' },
    { depth: 0, limit: 200, filter: 'issuerId[eq]:u1', starting_after: 'b' },
  ]);
  const ordered = fakeRest(() => ({ data: { billingInvoices: [{ id: 'z' }] }, pageInfo: { hasNextPage: true, endCursor: 'z' } }));
  const rows = await restStore(deps(ordered.rest)).list('billingInvoices', {}, { orderBy: { field: 'issueDate', direction: 'desc' }, limit: 1, deleted: 'include' });
  assert.deepEqual(rows.map((row) => row.id), ['z']);
  assert.deepEqual(ordered.calls[0]?.query, { depth: 0, limit: 1, filter: 'or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)', order_by: 'issueDate[DescNullsLast]' });
});

test('a list that does not come back as one fails loudly', async () => {
  const { rest } = fakeRest(() => ({ error: 'unauthorised' }));
  await assert.rejects(restStore(deps(rest)).list('billingInvoices', {}), /did not return a billingInvoices list/);
});

test('a record is read by its path; one that may be soft-deleted through a list; a 404 is nothing', async () => {
  const { rest, calls } = fakeRest((call) => {
    if (call.path === '/rest/billingInvoices/r1') return { data: { billingInvoice: { id: 'r1' } } };
    if (call.path === '/rest/billingInvoices/r404') return restError(404, { messages: ['Record not found'] });
    return { data: { billingInvoices: [{ id: 'r2', deletedAt: '2026-09-26T10:00:00Z' }] }, pageInfo: { hasNextPage: false } };
  });
  const store = restStore(deps(rest));
  assert.equal((await store.get('billingInvoices', 'r1'))?.id, 'r1');
  assert.equal(await store.get('billingInvoices', 'r404'), null);
  assert.equal((await store.get('billingInvoices', 'r2', { deleted: true }))?.id, 'r2');
  assert.equal(calls[2]?.query?.filter, 'id[eq]:r2,or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)');
});

test('writes unwrap Twenty’s envelopes, and a soft delete is never a destroy', async () => {
  const { rest, calls } = fakeRest((call) => {
    if (call.method === 'POST') return { data: { createBillingSequence: { id: 'new', ...(call.body as object) } } };
    if (call.method === 'PATCH' && call.path.endsWith('/restore')) return { data: { restoreBillingInvoice: { id: 'r1' } } };
    if (call.method === 'PATCH') return { data: { updateBillingInvoice: { id: 'r1', ...(call.body as object) } } };
    return { data: { deleteBillingInvoice: { id: 'r1' } } };
  });
  const store = restStore(deps(rest));
  assert.deepEqual(await store.create('billingSequences', { lastValue: 0 }), { id: 'new', lastValue: 0 });
  assert.deepEqual(await store.update('billingInvoices', 'r1', { subject: 'x' }), { id: 'r1', subject: 'x' });
  await store.softDelete('billingInvoices', 'r1');
  await store.restore('billingInvoices', 'r1');
  assert.deepEqual(calls.slice(2).map((call) => [call.method, call.path, call.query]), [
    ['DELETE', '/rest/billingInvoices/r1', { soft_delete: true }],
    ['PATCH', '/rest/billingInvoices/r1/restore', undefined],
  ]);
});

test('Twenty’s refusals become the Store’s errors', async () => {
  const duplicate = restError(400, { statusCode: 400, error: 'BadRequestException', messages: ['A duplicate entry was detected: unique constraint _billingInvoice.IDX_UNIQUE_x was violated'] });
  const denied = restError(400, { statusCode: 400, error: 'Error', messages: ['Entity performing the request does not have permission'], code: 'PERMISSION_DENIED' });
  assert.ok(translate(duplicate) instanceof DuplicateError);
  assert.ok(translate(denied) instanceof NotAllowedError);
  const other = restError(400, { messages: ['Invalid number value'] });
  assert.equal(translate(other), other);
  const { rest } = fakeRest(() => duplicate);
  await assert.rejects(restStore(deps(rest)).update('billingInvoices', 'r1', { numberKey: 'x' }), DuplicateError);
});

test('the caller’s write is refused as NOT_ALLOWED on a permission refusal or a record hidden from them', async () => {
  for (const error of [restError(400, { code: 'PERMISSION_DENIED', messages: ['Entity performing the request does not have permission'] }), restError(404, { messages: ['Record not found'] })]) {
    const { rest } = fakeRest(() => error);
    await assert.rejects(restCallerStore(rest).update('billingInvoices', 'r1', { issueDate: '2026-09-26' }), NotAllowedError);
  }
});

test('a PDF is uploaded for its field, and the FILES value keeps only its id and label', async () => {
  const uploads: unknown[] = [];
  const { rest } = fakeRest(() => ({}));
  const store = restStore(deps(rest, { uploadFile: async (bytes, name, mime, field) => { uploads.push([bytes.length, name, mime, field]); return { id: 'file-1' }; } }));
  assert.deepEqual(await store.upload({ bytes: new Uint8Array(3), name: 'F2026-0001.pdf', mime: 'application/pdf', object: 'billingInvoice', field: 'pdf' }), { fileId: 'file-1', label: 'F2026-0001.pdf' });
  assert.deepEqual(uploads, [[3, 'F2026-0001.pdf', 'application/pdf', 'field:billingInvoice.pdf']]);
});

test('a file is downloaded from its signed link, its type read from its bytes', async () => {
  const { rest } = fakeRest(() => ({}));
  const fetched: string[] = [];
  const store = restStore(deps(rest, { fetchFile: async (url) => { fetched.push(url); return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer }; } }));
  assert.deepEqual(await store.download({ fileId: 'f', label: 'logo.jpg', extension: '.jpg', url: 'https://x/file/files-field/f?token=t' }), { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), type: 'image/jpeg' });
  assert.deepEqual(fetched, ['https://x/file/files-field/f?token=t']);
  assert.equal(await store.download({ fileId: 'f', label: 'logo.png' }), null);
  const failing = deps(rest, { fetchFile: async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) }) });
  assert.equal(await restStore(failing).download({ fileId: 'f', url: 'https://x' }), null);
  assert.equal(failing.logs[0]?.download, 'failed');
});

test('a timeline message is written as the app, on the record, with the type found by its universal identifier', async () => {
  const { rest, calls } = fakeRest(() => ({ data: { createTimelineActivity: { id: 't1' } } }));
  let lookups = 0;
  const store = restStore(deps(rest, { timelineTypes: async () => { lookups += 1; return [{ id: 'type-fix', universalIdentifier: 'uid-fix', isActive: true }]; } }));
  await store.timeline({ object: 'billingInvoice', recordId: 'r1', kind: 'CORRECTION', text: 'Put back.' });
  await store.timeline({ object: 'billingSequence', recordId: 's1', kind: 'CORRECTION', text: 'Again.' });
  assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [
    ['POST', '/rest/timelineActivities', { timelineActivityTypeId: 'type-fix', targetBillingInvoiceId: 'r1', properties: { message: 'Put back.' } }],
    ['POST', '/rest/timelineActivities', { timelineActivityTypeId: 'type-fix', targetBillingSequenceId: 's1', properties: { message: 'Again.' } }],
  ]);
  assert.equal(lookups, 1);
});

test('a muted or missing timeline type, or a failed write, is logged and never thrown', async () => {
  const { rest, calls } = fakeRest(() => restError(400, { messages: ['Active timeline activity type was not found'] }));
  const muted = deps(rest, { timelineTypes: async () => [{ id: 'type-fix', universalIdentifier: 'uid-fix', isActive: false }] });
  await restStore(muted).timeline({ object: 'billingInvoice', recordId: 'r1', kind: 'CORRECTION', text: 'x' });
  assert.equal(calls.length, 0);
  assert.equal(muted.logs[0]?.timeline, 'skipped');
  const failing = deps(rest);
  await restStore(failing).timeline({ object: 'billingInvoice', recordId: 'r1', kind: 'ISSUED', text: 'x' });
  assert.equal(failing.logs[0]?.timeline, 'failed');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/rest-store.test.ts`
Expected: FAIL: `Cannot find module '.../src/lib/rest-store.ts'`.

- [ ] **Step 3: Write `src/lib/rest-store.ts`**

```ts
import {
  DuplicateError, NotAllowedError,
  type CallerStore, type Condition, type FileRef, type ListOptions, type Row, type Store, type TimelineEntry, type Upload, type Where,
} from '../../lifecycle/store.ts';

type Query = Record<string, string | number | boolean>;

/** The four calls of Twenty's RestApiClient the store makes. Paths, not generated types: a function bundle carries no type map. */
export type RestLike = {
  get<T = unknown>(path: string, options?: { query?: Query }): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, options?: { query?: Query }): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, options?: { query?: Query }): Promise<T>;
  delete<T = unknown>(path: string, options?: { query?: Query }): Promise<T>;
};

export type TimelineType = { id: string; universalIdentifier: string; isActive?: boolean | null };

export type RestStoreDeps = {
  /** A client acting as the app. */
  rest: RestLike;
  uploadFile: (bytes: Uint8Array, name: string, mime: string, fieldUniversalIdentifier: string) => Promise<{ id: string }>;
  fetchFile: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  timelineTypes: () => Promise<TimelineType[]>;
  fieldId: (object: string, field: string) => string;
  timelineTypeIds: Record<TimelineEntry['kind'], string>;
  log: (entry: Record<string, unknown>) => void;
};

const PAGE = 200;
const BOTH_STATES = 'or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)';

/** A value Twenty's filter parser can carry. It has no escape: a quote, bracket or parenthesis would corrupt what follows. */
export function literal(value: string | number | boolean): string {
  const text = String(value);
  if (text === '' || /['"[\]()]/.test(text)) throw new Error(`Twenty's REST filter cannot carry ${JSON.stringify(text)}`);
  return /[,\s]/.test(text) ? `"${text}"` : text;
}

function conditionParts(field: string, condition: Condition): string[] {
  if (condition === null) return [`${field}[is]:NULL`];
  if (typeof condition === 'object') {
    if ('notNull' in condition) return [`${field}[is]:NOT_NULL`];
    return [
      ...(condition.gte !== undefined ? [`${field}[gte]:${literal(condition.gte)}`] : []),
      ...(condition.lte !== undefined ? [`${field}[lte]:${literal(condition.lte)}`] : []),
    ];
  }
  return [`${field}[eq]:${literal(condition)}`];
}

/** A where clause as Twenty's filter: conditions joined by commas, which Twenty reads as AND. */
export function toFilter(where: Where, deleted: 'exclude' | 'include' | 'only' = 'exclude'): string | undefined {
  const parts = Object.entries(where).flatMap(([field, condition]) => conditionParts(field, condition));
  if (deleted === 'only') parts.push('deletedAt[is]:NOT_NULL');
  if (deleted === 'include') parts.push(BOTH_STATES);
  return parts.length > 0 ? parts.join(',') : undefined;
}

const statusOf = (error: unknown): number | undefined => (error as { status?: number } | null)?.status;

/** Twenty's refusals as the Store's errors (400 PERMISSION_DENIED, 400 "A duplicate entry was detected"); anything else unchanged. */
export function translate(error: unknown): unknown {
  const failure = error as { name?: unknown; body?: unknown } | null;
  if (failure?.name !== 'RestApiClientError') return error;
  const body = (failure.body ?? {}) as { code?: unknown; messages?: unknown };
  const message = Array.isArray(body.messages) ? body.messages.map(String).join(' ') : '';
  if (body.code === 'PERMISSION_DENIED' || message.startsWith('Entity performing the request does not have permission')) return new NotAllowedError(message);
  if (statusOf(error) === 400 && message.startsWith('A duplicate entry was detected')) return new DuplicateError(message);
  return error;
}

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw translate(error);
  }
}

/** The one record under `data`, whatever Twenty named its key (`billingInvoice`, `updateBillingInvoice`...). */
function single(response: unknown, what: string): Row {
  const data = (response as { data?: Record<string, unknown> } | null)?.data;
  const row = data ? Object.values(data)[0] : undefined;
  if (!row || typeof row !== 'object' || typeof (row as Row).id !== 'string') {
    throw new Error(`Twenty did not return the ${what}: ${JSON.stringify(response).slice(0, 300)}`);
  }
  return row as Row;
}

const capital = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** The type an image's first bytes prove; the Renderer refuses anything else. */
function imageType(bytes: Uint8Array): string {
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'application/octet-stream';
}

export function restStore(deps: RestStoreDeps): Store {
  const { rest, log } = deps;
  let types: Promise<TimelineType[]> | undefined;

  async function list(plural: string, where: Where, options: ListOptions = {}): Promise<Row[]> {
    const rows: Row[] = [];
    const filter = toFilter(where, options.deleted);
    const orderBy = options.orderBy ? `${options.orderBy.field}[${options.orderBy.direction === 'asc' ? 'AscNullsLast' : 'DescNullsLast'}]` : undefined;
    let cursor: string | undefined;
    for (;;) {
      const query: Query = { depth: 0, limit: options.limit === undefined ? PAGE : Math.min(PAGE, options.limit - rows.length) };
      if (filter) query.filter = filter;
      if (orderBy) query.order_by = orderBy;
      if (cursor) query.starting_after = cursor;
      const response = await call(() => rest.get<{ data?: Record<string, unknown>; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } }>(`/rest/${plural}`, { query }));
      const page = response.data?.[plural];
      if (!Array.isArray(page)) throw new Error(`Twenty did not return a ${plural} list: ${JSON.stringify(response).slice(0, 300)}`);
      rows.push(...(page as Row[]));
      if (options.limit !== undefined && rows.length >= options.limit) return rows.slice(0, options.limit);
      const next = response.pageInfo?.hasNextPage ? response.pageInfo.endCursor : null;
      if (!next) return rows;
      cursor = next;
    }
  }

  return {
    async get(plural, id, options) {
      if (options?.deleted) return (await list(plural, { id }, { deleted: 'include', limit: 1 }))[0] ?? null;
      try {
        return single(await rest.get(`/rest/${plural}/${id}`, { query: { depth: 0 } }), `${plural} record`);
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw translate(error);
      }
    },
    list,
    create: async (plural, data) => single(await call(() => rest.post(`/rest/${plural}`, data)), `created ${plural} record`),
    update: async (plural, id, data) => single(await call(() => rest.patch(`/rest/${plural}/${id}`, data)), `updated ${plural} record`),
    async softDelete(plural, id) {
      // Without soft_delete=true, Twenty destroys the record.
      await call(() => rest.delete(`/rest/${plural}/${id}`, { query: { soft_delete: true } }));
    },
    async restore(plural, id) {
      await call(() => rest.patch(`/rest/${plural}/${id}/restore`));
    },
    async upload(file: Upload): Promise<FileRef> {
      const uploaded = await deps.uploadFile(file.bytes, file.name, file.mime, deps.fieldId(file.object, file.field));
      return { fileId: uploaded.id, label: file.name };
    },
    async download(file) {
      const url = (file as { url?: unknown } | null)?.url;
      if (typeof url !== 'string' || url === '') return null;
      const response = await deps.fetchFile(url);
      if (!response.ok) {
        log({ download: 'failed', status: response.status, fileId: (file as { fileId?: unknown }).fileId ?? null });
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes, type: imageType(bytes) };
    },
    async timeline(entry: TimelineEntry) {
      try {
        types ??= deps.timelineTypes();
        const type = (await types).find((candidate) => candidate.universalIdentifier === deps.timelineTypeIds[entry.kind]);
        if (!type || type.isActive === false) {
          log({ timeline: 'skipped', reason: 'the type is missing or muted', kind: entry.kind, object: entry.object, recordId: entry.recordId });
          return;
        }
        await rest.post('/rest/timelineActivities', {
          timelineActivityTypeId: type.id,
          [`target${capital(entry.object)}Id`]: entry.recordId,
          properties: { message: entry.text },
        });
      } catch (error) {
        log({ timeline: 'failed', kind: entry.kind, object: entry.object, recordId: entry.recordId, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

/** The caller's side: one write with their delegated token. A record hidden from them is refused as well. */
export function restCallerStore(rest: RestLike): CallerStore {
  return {
    async update(plural, id, data) {
      try {
        return single(await rest.patch(`/rest/${plural}/${id}`, data), `updated ${plural} record`);
      } catch (error) {
        if (statusOf(error) === 404) throw new NotAllowedError('Record not found');
        throw translate(error);
      }
    },
  };
}
```

- [ ] **Step 4: Write `src/lib/twenty-stores.ts`**

```ts
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { RestApiClient } from 'twenty-client-sdk/rest';
import type { CallerStore, Store } from '../../lifecycle/store.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';
import { fieldId } from '../schema/fields.ts';
import { id } from './id.ts';
import { restCallerStore, restStore, type TimelineType } from './rest-store.ts';

/**
 * The stores a logic function uses, built on each run: Twenty's clients cache
 * their token, and a warm process shares module state between runs, so a client
 * kept at module scope could act with another person's token.
 */

/** The app's store: reads, and every write after the caller's first. */
export function appStore(log: (entry: Record<string, unknown>) => void): Store {
  const rest = new RestApiClient({ runAs: 'application' });
  const metadata = new MetadataApiClient({ runAs: 'application' });
  return restStore({
    rest,
    uploadFile: (bytes, name, mime, field) => metadata.uploadFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), name, mime, field),
    fetchFile: (url) => fetch(url),
    timelineTypes: async () => {
      const result = await metadata.query({ timelineActivityTypes: { id: true, universalIdentifier: true, isActive: true } });
      return result.timelineActivityTypes as TimelineType[];
    },
    fieldId,
    timelineTypeIds: { ISSUED: id(TIMELINE_TYPE_KEYS.ISSUED), CORRECTION: id(TIMELINE_TYPE_KEYS.CORRECTION) },
    log,
  });
}

/** The caller's store: their delegated token, so Twenty checks the caller's role (intersected with the app's). */
export function callerStore(): CallerStore {
  return restCallerStore(new RestApiClient({ runAs: 'user' }));
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/lifecycle/rest-store.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rest-store.ts src/lib/twenty-stores.ts test/lifecycle/rest-store.test.ts
```

```bash
git commit -m "feat: the Store over Twenty's REST API, soft deletes and refusals included"
```

---

### Task 15: The seven triggers

Seven database event triggers run the guards and the totals (spec §4): `billingInvoice.*`, `billingCreditNote.*`, `billingQuote.*`, their three line objects, and `billingSequence.*`, each with a 30-second timeout. Each is a thin adapter over `src/lib/trigger.ts`: Twenty's event becomes Lifecycle's `RecordEvent`, the app's store is built for this run, and a failure is logged as one line of JSON.

What the platform does with a trigger, read in the server source at `twenty/v2.41.0`:

- `<object>.*` delivers `created`, `updated`, `deleted`, `restored` and `destroyed`; `upserted` never reaches a logic function.
- The event is `{ name: '<object>.<operation>', recordId, properties: { before, after, updatedFields, diff } }` (`created` has `after` only, `destroyed` `before` only). A relation change lists both `invoice` and `invoiceId` in `updatedFields`.
- The app's role must read the object, or the trigger receives nothing: the Billing role reads every app object.
- Events run as separate jobs, up to twenty at once, in no guaranteed order, at least once: the guards re-read and compare (Task 12).
- Only an error named `RetryableLogicFunctionError` is retried (three times, backing off from a second). Any other thrown error is logged and not retried. The adapter asks for a retry on a network failure, a rate limit or a server error, and lets anything else fail: the record's next event re-checks everything.
- When a person's write fires the trigger, the run's default token is that person's delegated token; the app's store always uses `runAs: 'application'` (Task 14).

**Files:**
- Create: `src/lib/trigger.ts`, `src/logic-functions/guard-invoice.ts`, `src/logic-functions/guard-credit-note.ts`, `src/logic-functions/guard-quote.ts`, `src/logic-functions/guard-invoice-line.ts`, `src/logic-functions/guard-credit-note-line.ts`, `src/logic-functions/guard-quote-line.ts`, `src/logic-functions/guard-sequence.ts`, `test/helpers/logic-function-build.ts`
- Modify: `test/render/bundle.test.ts` (use the shared build options), `src/ids.ts` (by `npm run ids:sync`)
- Test: `test/triggers.test.ts`

**Interfaces:**
- Consumes: `onDocumentEvent`, `onLineEvent` from `lifecycle/guards.ts`; `guardSequence` from `lifecycle/numbering.ts`; `KINDS` from `lifecycle/load.ts`; `RecordEvent`, `Row`, `Store` from `lifecycle/store.ts`; `appStore` from `src/lib/twenty-stores.ts`; `RetryableLogicFunctionError` from `twenty-sdk/logic-function`; `defineLogicFunction` from `twenty-sdk/define`.
- Produces:
  - from `src/lib/trigger.ts`: `toRecordEvent(payload: unknown): RecordEvent | null`, `isTransient(error: unknown): boolean`, `runTrigger(handle: (store: Store, event: RecordEvent) => Promise<void>, makeStore?: () => Store): (payload: unknown) => Promise<void>`
  - identifier keys `logicFunction.guardInvoice`, `logicFunction.guardCreditNote`, `logicFunction.guardQuote`, `logicFunction.guardInvoiceLine`, `logicFunction.guardCreditNoteLine`, `logicFunction.guardQuoteLine`, `logicFunction.guardSequence`
  - from `test/helpers/logic-function-build.ts`: `LOGIC_FUNCTION` (esbuild options), `bundleLogicFunction(entry: string, outfile: string): Promise<string[]>` (the bundle's inputs)

- [ ] **Step 1: Share the logic function build options**

`test/helpers/logic-function-build.ts`:

```ts
import { build } from 'esbuild';

/**
 * What twenty-sdk 2.41 passes esbuild for a logic function: one ES module for
 * Node, Node built-ins and two client modules left external, and `require`
 * shimmed by a banner. Nothing defines __dirname, and the bundle runs far from
 * node_modules.
 */
export const LOGIC_FUNCTION = {
  bundle: true,
  splitting: false,
  format: 'esm' as const,
  platform: 'node' as const,
  external: [
    'twenty-client-sdk/core', 'twenty-client-sdk/metadata', 'path', 'fs', 'crypto', 'stream', 'util', 'os', 'url',
    'http', 'https', 'events', 'buffer', 'querystring', 'assert', 'zlib', 'net', 'tls', 'child_process', 'worker_threads',
  ],
  banner: { js: "import { createRequire as __createRequire } from 'module';\nconst require = __createRequire(import.meta.url);" },
  logLevel: 'silent' as const,
};

/** Bundles a logic function as the CLI would, and returns the files that went into it. */
export async function bundleLogicFunction(entry: string, outfile: string): Promise<string[]> {
  const result = await build({ ...LOGIC_FUNCTION, entryPoints: [entry], outfile, metafile: true });
  return Object.keys(result.metafile.inputs);
}
```

In `test/render/bundle.test.ts`, delete the local `LOGIC_FUNCTION` constant and the comment above it, and import the shared one instead:

```ts
import { LOGIC_FUNCTION } from '../helpers/logic-function-build.ts';
```

- [ ] **Step 2: Write the failing test**

`test/triggers.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import guardInvoice from '../src/logic-functions/guard-invoice.ts';
import guardCreditNote from '../src/logic-functions/guard-credit-note.ts';
import guardQuote from '../src/logic-functions/guard-quote.ts';
import guardInvoiceLine from '../src/logic-functions/guard-invoice-line.ts';
import guardCreditNoteLine from '../src/logic-functions/guard-credit-note-line.ts';
import guardQuoteLine from '../src/logic-functions/guard-quote-line.ts';
import guardSequence from '../src/logic-functions/guard-sequence.ts';
import { isTransient, runTrigger, toRecordEvent } from '../src/lib/trigger.ts';
import type { RecordEvent, Store } from '../lifecycle/store.ts';
import { bundleLogicFunction } from './helpers/logic-function-build.ts';

const SRC = fileURLToPath(new URL('../src/logic-functions/', import.meta.url));

const TRIGGERS = [
  [guardInvoice, 'guard-invoice', 'billingInvoice.*'],
  [guardCreditNote, 'guard-credit-note', 'billingCreditNote.*'],
  [guardQuote, 'guard-quote', 'billingQuote.*'],
  [guardInvoiceLine, 'guard-invoice-line', 'billingInvoiceLine.*'],
  [guardCreditNoteLine, 'guard-credit-note-line', 'billingCreditNoteLine.*'],
  [guardQuoteLine, 'guard-quote-line', 'billingQuoteLine.*'],
  [guardSequence, 'guard-sequence', 'billingSequence.*'],
] as const;

const restError = (status: number) => Object.assign(new Error(`status ${status}`), { name: 'RestApiClientError', status });

test('the seven triggers validate, each on every event of its object, within thirty seconds', () => {
  for (const [fn, name, eventName] of TRIGGERS) {
    assert.equal(fn.success, true, `${name}: ${fn.errors.join('; ')}`);
    assert.equal(fn.config.name, name);
    assert.deepEqual(fn.config.databaseEventTriggerSettings, { eventName });
    assert.equal(fn.config.timeoutSeconds, 30);
  }
  assert.equal(new Set(TRIGGERS.map(([fn]) => fn.config.universalIdentifier)).size, 7);
});

test('a Twenty event becomes Lifecycle’s event', () => {
  assert.deepEqual(
    toRecordEvent({ name: 'billingInvoice.updated', recordId: 'r1', workspaceId: 'w', properties: { before: { id: 'r1', subject: 'a' }, after: { id: 'r1', subject: 'b' }, updatedFields: ['subject'], diff: {} } }),
    { name: 'updated', recordId: 'r1', before: { id: 'r1', subject: 'a' }, after: { id: 'r1', subject: 'b' }, updatedFields: ['subject'] },
  );
  assert.deepEqual(toRecordEvent({ name: 'billingInvoiceLine.created', recordId: 'l1', properties: { after: { id: 'l1' } } }), {
    name: 'created', recordId: 'l1', before: null, after: { id: 'l1' }, updatedFields: [],
  });
  assert.equal(toRecordEvent({ name: 'billingInvoice.exploded', recordId: 'r1', properties: {} }), null);
  assert.equal(toRecordEvent({ name: 'billingInvoice.updated' }), null);
  assert.equal(toRecordEvent(null), null);
});

test('a network failure, a rate limit or a server error is worth a retry; a refusal is not', () => {
  assert.equal(isTransient(new TypeError('fetch failed')), true);
  assert.equal(isTransient(restError(429)), true);
  assert.equal(isTransient(restError(503)), true);
  assert.equal(isTransient(restError(400)), false);
  assert.equal(isTransient(new Error('a bug')), false);
});

test('a trigger hands the event to its handler with a store built for the run', async () => {
  const stores: Store[] = [];
  const seen: RecordEvent[] = [];
  const handler = runTrigger(async (store, event) => { stores.push(store); seen.push(event); }, () => ({}) as Store);
  await handler({ name: 'billingQuote.deleted', recordId: 'q1', properties: { before: { id: 'q1' }, after: { id: 'q1' }, updatedFields: ['deletedAt'] } });
  await handler({ name: 'billingQuote.restored', recordId: 'q1', properties: { before: { id: 'q1' }, after: { id: 'q1' }, updatedFields: ['deletedAt'] } });
  assert.deepEqual(seen.map((event) => event.name), ['deleted', 'restored']);
  assert.notEqual(stores[0], stores[1]);
  await handler({ nonsense: true });
  assert.equal(seen.length, 2);
});

test('a transient failure asks the platform for a retry; any other failure fails the run as it is', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const transient = runTrigger(async () => { throw restError(503); }, () => ({}) as Store);
  await assert.rejects(transient({ name: 'billingInvoice.updated', recordId: 'r1', properties: {} }), (error: Error) => error.name === 'RetryableLogicFunctionError');
  const bug = new Error('a bug');
  const failing = runTrigger(async () => { throw bug; }, () => ({}) as Store);
  await assert.rejects(failing({ name: 'billingInvoice.updated', recordId: 'r1', properties: {} }), (error) => error === bug);
  assert.equal(logged.mock.callCount(), 2);
  assert.match(String(logged.mock.calls[1]!.arguments[0]), /"trigger":"failed".*"error":"a bug"/);
});

test('the triggers bundle as logic functions, and none of them carries pdfmake', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'trigger-bundle-'));
  try {
    for (const [, name] of TRIGGERS) {
      const inputs = await bundleLogicFunction(join(SRC, `${name}.ts`), join(folder, `${name}.mjs`));
      assert.ok(inputs.some((input) => input.includes('lifecycle/guards.ts') || input.includes('lifecycle/numbering.ts')), name);
      assert.ok(!inputs.some((input) => input.includes('pdfmake')), `${name} bundles pdfmake`);
      assert.ok(!inputs.some((input) => input.includes('render/document.ts')), `${name} bundles the Renderer`);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/triggers.test.ts`
Expected: FAIL: `Cannot find module '.../src/logic-functions/guard-invoice.ts'`.

- [ ] **Step 4: Write `src/lib/trigger.ts`**

```ts
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';
import type { RecordEvent, Row, Store } from '../../lifecycle/store.ts';
import { appStore } from './twenty-stores.ts';

const OPERATIONS: readonly RecordEvent['name'][] = ['created', 'updated', 'deleted', 'restored', 'destroyed', 'upserted'];

const rowOf = (value: unknown): Row | null => (value !== null && typeof value === 'object' ? (value as Row) : null);

/** A Twenty database event in Lifecycle's shape; null when it is not one. */
export function toRecordEvent(payload: unknown): RecordEvent | null {
  const event = payload as { name?: unknown; recordId?: unknown; properties?: { before?: unknown; after?: unknown; updatedFields?: unknown } } | null;
  const name = typeof event?.name === 'string' ? event.name.slice(event.name.lastIndexOf('.') + 1) : '';
  if (!OPERATIONS.includes(name as RecordEvent['name']) || typeof event?.recordId !== 'string') return null;
  const properties = event.properties ?? {};
  return {
    name: name as RecordEvent['name'],
    recordId: event.recordId,
    before: rowOf(properties.before),
    after: rowOf(properties.after),
    updatedFields: Array.isArray(properties.updatedFields) ? properties.updatedFields.filter((field): field is string => typeof field === 'string') : [],
  };
}

/** A failure the platform's retry can cure: the network, a rate limit, a server error. */
export function isTransient(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const failure = error as { name?: unknown; status?: unknown } | null;
  if (failure?.name !== 'RestApiClientError') return false;
  return failure.status === undefined || failure.status === 429 || (typeof failure.status === 'number' && failure.status >= 500);
}

/** One line of JSON: the platform keeps each output line as one log entry. */
const logLine = (entry: Record<string, unknown>): void => console.error(JSON.stringify(entry));

/** A trigger's handler: Lifecycle's event, a store built for this run, and a retry only when one can help. */
export function runTrigger(
  handle: (store: Store, event: RecordEvent) => Promise<void>,
  makeStore: () => Store = () => appStore(logLine),
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const event = toRecordEvent(payload);
    if (!event) return;
    try {
      await handle(makeStore(), event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logLine({ trigger: 'failed', event: event.name, recordId: event.recordId, error: message });
      if (isTransient(error)) throw new RetryableLogicFunctionError(message);
      throw error;
    }
  };
}
```

- [ ] **Step 5: Write the seven triggers**

`src/logic-functions/guard-invoice.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { onDocumentEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardInvoice'),
  name: 'guard-invoice',
  description: 'Keeps a draft invoice’s totals current, and puts back any change to an issued invoice.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingInvoice.*' },
  handler: runTrigger((store, event) => onDocumentEvent(store, KINDS.billingInvoice, event)),
});
```

`src/logic-functions/guard-credit-note.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { onDocumentEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardCreditNote'),
  name: 'guard-credit-note',
  description: 'Keeps a draft credit note’s totals current, and puts back any change to an issued credit note.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingCreditNote.*' },
  handler: runTrigger((store, event) => onDocumentEvent(store, KINDS.billingCreditNote, event)),
});
```

`src/logic-functions/guard-quote.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { onDocumentEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardQuote'),
  name: 'guard-quote',
  description: 'Keeps a quote’s totals current, and keeps a numbered quote from being deleted.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingQuote.*' },
  handler: runTrigger((store, event) => onDocumentEvent(store, KINDS.billingQuote, event)),
});
```

`src/logic-functions/guard-invoice-line.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { onLineEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardInvoiceLine'),
  name: 'guard-invoice-line',
  description: 'Fills an invoice line from its catalog item and updates the totals; puts back any change to an issued invoice’s lines.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingInvoiceLine.*' },
  handler: runTrigger((store, event) => onLineEvent(store, KINDS.billingInvoice, event)),
});
```

`src/logic-functions/guard-credit-note-line.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { onLineEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardCreditNoteLine'),
  name: 'guard-credit-note-line',
  description: 'Fills a credit note line from its catalog item and updates the totals; puts back any change to an issued credit note’s lines.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingCreditNoteLine.*' },
  handler: runTrigger((store, event) => onLineEvent(store, KINDS.billingCreditNote, event)),
});
```

`src/logic-functions/guard-quote-line.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { onLineEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardQuoteLine'),
  name: 'guard-quote-line',
  description: 'Fills a quote line from its catalog item and updates the quote’s totals.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingQuoteLine.*' },
  handler: runTrigger((store, event) => onLineEvent(store, KINDS.billingQuote, event)),
});
```

`src/logic-functions/guard-sequence.ts`:

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { guardSequence } from '../../lifecycle/numbering.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardSequence'),
  name: 'guard-sequence',
  description: 'Keeps the numbering ledger sound: one row per scope, and once a scope has given out a number, its last number only rises.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingSequence.*' },
  handler: runTrigger((store, event) => guardSequence(store, event)),
});
```

- [ ] **Step 6: Register the identifiers**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run ids:sync`
Expected: `ids:sync registered 7 new identifier(s).`, the seven `logicFunction.guard…` keys.

- [ ] **Step 7: Run the tests to see them pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/triggers.test.ts test/render/bundle.test.ts test/ids.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/trigger.ts src/logic-functions/guard-*.ts src/ids.ts test/helpers/logic-function-build.ts test/render/bundle.test.ts test/triggers.test.ts
```

```bash
git commit -m "feat: seven triggers keep totals current and guard issued documents and the ledger"
```

---

### Task 16: The route

`billing-action` is the one door the buttons knock on (spec §4, §6): `POST /s/billing/action`, authentication required, 60 seconds. It is the only function that bundles pdfmake. It refuses a call that no signed-in person made, then hands the body to `runAction` and answers with the outcome's status.

What the platform does with a route, read in the server source at `twenty/v2.41.0`:

- A route with `isAuthRequired` accepts a user's token and also an API key. With an API key, `userWorkspaceId` is null, and a client built with `runAs: 'user'` falls back to the app's own token: the caller's role check, which decides who may act, would never happen. The route therefore refuses a call without `event.userWorkspaceId` and `context.workspaceMemberId`, as `NOT_ALLOWED`.
- The body arrives parsed when the request was JSON; a raw string (base64 when `isBase64Encoded`) is parsed here.
- A handler that returns the SDK's `Response` sets the HTTP status and body; anything thrown becomes a 500 whose body carries the error's message. `runAction` never throws, and the route catches the one thing outside it: building its dependencies.
- The route never answers 401: the front client takes a 401 for an expired token, refreshes it and posts again.
- `crypto.subtle` (Web Crypto) is a global in the function's Node runtime: SHA-256 needs no import.

**Files:**
- Create: `src/logic-functions/billing-action.ts`
- Modify: `src/ids.ts` (by `npm run ids:sync`)
- Test: `test/route.test.ts`

**Interfaces:**
- Consumes: `runAction`, `ActionDeps` from `lifecycle/actions.ts`; `describeAll`, `packFor` from `lifecycle/lang/pack.ts`; `appStore`, `callerStore` from `src/lib/twenty-stores.ts`; `Response`, `RoutePayload`, `LogicFunctionExecutionContext` from `twenty-sdk/logic-function`; `defineLogicFunction` from `twenty-sdk/define`; `bundleLogicFunction` from `test/helpers/logic-function-build.ts`.
- Produces, from `src/logic-functions/billing-action.ts`:
  - `bodyOf(event: { body: unknown; isBase64Encoded?: boolean }): unknown`
  - `respond(event: RouteEvent, context: RouteContext, makeDeps: () => ActionDeps): Promise<Response>`, where `RouteEvent = { body: unknown; isBase64Encoded?: boolean; userWorkspaceId: string | null }` and `RouteContext = { workspaceMemberId: string | null }`
  - `sha256(bytes: Uint8Array): Promise<string>` (hex)
  - `liveDeps(): ActionDeps`
  - identifier key `logicFunction.billingAction`

- [ ] **Step 1: Write the failing test**

`test/route.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import billingAction, { bodyOf, respond, sha256 } from '../src/logic-functions/billing-action.ts';
import type { ActionDeps } from '../lifecycle/actions.ts';
import { IDS } from '../src/ids.ts';
import { TODAY, now, workspace, type Workspace } from './lifecycle/helpers/fixtures.ts';
import { bundleLogicFunction } from './helpers/logic-function-build.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = async (bytes: Uint8Array): Promise<string> => createHash('sha256').update(bytes).digest('hex');

const depsFor = (w: Workspace, over: Partial<ActionDeps> = {}): ActionDeps => ({
  app: w.app, caller: w.db.store('MANUAL'), now, sha256: sha, reference: () => 'ref-7f3a', log: () => {},
  render: async (input) => ({ bytes: new TextEncoder().encode(`%PDF ${input.number ?? 'DRAFT'}`), pages: 1 }),
  ...over,
});
const issueBody = (w: Workspace, over: Record<string, unknown> = {}) => ({
  action: 'issue', object: 'billingInvoice', recordId: w.invoice.id, localDate: TODAY, locale: 'en', ...over,
});
const SIGNED_IN = { userWorkspaceId: 'user-workspace-1' };
const MEMBER = { workspaceMemberId: 'member-1' };
const noDeps = (): ActionDeps => {
  throw new Error('the route must not build its dependencies for this call');
};

test('the route validates: POST /billing/action, signed in, sixty seconds', () => {
  assert.equal(billingAction.success, true, billingAction.errors.join('\n'));
  assert.equal(billingAction.config.name, 'billing-action');
  assert.equal(billingAction.config.universalIdentifier, IDS['logicFunction.billingAction']);
  assert.deepEqual(billingAction.config.httpRouteTriggerSettings, { path: '/billing/action', httpMethod: 'POST', isAuthRequired: true });
  assert.equal(billingAction.config.timeoutSeconds, 60);
});

test('the body is read parsed, as a JSON string, or as base64', () => {
  assert.deepEqual(bodyOf({ body: { action: 'issue' } }), { action: 'issue' });
  assert.deepEqual(bodyOf({ body: '{"action":"issue"}' }), { action: 'issue' });
  assert.deepEqual(bodyOf({ body: Buffer.from('{"action":"issue"}').toString('base64'), isBase64Encoded: true }), { action: 'issue' });
  assert.equal(bodyOf({ body: 'not json' }), null);
  assert.equal(bodyOf({ body: null }), null);
});

test('a call no signed-in person made is refused as NOT_ALLOWED, in the caller’s language, before anything is read', async () => {
  const w = workspace();
  const apiKey = await respond({ body: issueBody(w, { locale: 'fr-FR' }), userWorkspaceId: null }, { workspaceMemberId: null }, noDeps);
  assert.equal(apiKey.__twentyHttpResponse, true);
  assert.equal(apiKey.status, 403);
  assert.deepEqual(apiKey.body, {
    ok: false,
    problems: [{ code: 'NOT_ALLOWED', message: 'Votre rôle ne permet pas de modifier ce document\u00a0: vous ne pouvez donc pas lancer cette action.' }],
  });
  const noMember = await respond({ body: issueBody(w), ...SIGNED_IN }, { workspaceMemberId: null }, noDeps);
  assert.equal(noMember.status, 403);
  assert.deepEqual(w.db.writes, []);
});

test('a signed-in person’s Issue runs end to end, and the answer carries the outcome’s status', async () => {
  const w = workspace();
  const issued = await respond({ body: JSON.stringify(issueBody(w)), ...SIGNED_IN }, MEMBER, () => depsFor(w));
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  assert.deepEqual(issued.body, { ok: true, number: 'F2026-0001', message: 'Issued as F2026-0001.' });
  assert.equal(w.db.row('billingInvoices', w.invoice.id)!.status, 'ISSUED');

  const again = await respond({ body: issueBody(w), ...SIGNED_IN }, MEMBER, () => depsFor(w));
  assert.equal(again.status, 422);
  assert.equal((again.body as { problems: { code: string }[] }).problems[0]!.code, 'ALREADY_ISSUED');
});

test('dependencies that cannot be built are answered as unexpected, with a reference, and logged', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const w = workspace();
  const failed = await respond({ body: issueBody(w), ...SIGNED_IN }, MEMBER, noDeps);
  assert.equal(failed.status, 500);
  const [problem] = (failed.body as { problems: { code: string; message: string }[] }).problems;
  assert.equal(problem!.code, 'UNEXPECTED');
  assert.match(problem!.message, /^Something went wrong \(ref [0-9a-f]{8}\)\.$/);
  assert.equal(logged.mock.callCount(), 1);
  assert.doesNotMatch(String(logged.mock.calls[0]!.arguments[0]), /\n/);
});

test('SHA-256 comes from Web Crypto, in hex', async () => {
  assert.equal(await sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('bundled as the CLI bundles it, the route issues a real PDF, and it is the one function that carries pdfmake', async () => {
  // Inside node_modules, so that the two client modules left external resolve, as the platform provides them.
  mkdirSync(join(ROOT, 'node_modules/.cache'), { recursive: true });
  const folder = mkdtempSync(join(ROOT, 'node_modules/.cache/route-bundle-'));
  try {
    const inputs = await bundleLogicFunction(join(ROOT, 'src/logic-functions/billing-action.ts'), join(folder, 'route.mjs'));
    assert.ok(inputs.some((input) => input.includes('pdfmake')), 'the route bundles pdfmake');

    const entry = join(folder, 'entry.ts');
    writeFileSync(entry, [
      `import { createHash } from 'node:crypto';`,
      `import { respond } from ${JSON.stringify(join(ROOT, 'src/logic-functions/billing-action.ts'))};`,
      `import { TODAY, now, workspace } from ${JSON.stringify(join(ROOT, 'test/lifecycle/helpers/fixtures.ts'))};`,
      'const w = workspace();',
      'const uploads = [];',
      'const app = { ...w.app, upload: async (file) => { uploads.push(file.bytes); return w.app.upload(file); } };',
      'const deps = () => ({ app, caller: w.db.store("MANUAL"), now, sha256: async (b) => createHash("sha256").update(b).digest("hex"), reference: () => "ref", log: () => {} });',
      'const body = { action: "issue", object: "billingInvoice", recordId: w.invoice.id, localDate: TODAY, locale: "en" };',
      'const response = await respond({ body, userWorkspaceId: "uw" }, { workspaceMemberId: "wm" }, deps);',
      'const row = w.db.row("billingInvoices", w.invoice.id);',
      'console.log(JSON.stringify({ status: response.status, number: row.number, head: Buffer.from(uploads[0].slice(0, 5)).toString("latin1") }));',
    ].join('\n'));
    await bundleLogicFunction(entry, join(folder, 'entry.mjs'));
    const output = execFileSync(process.execPath, [join(folder, 'entry.mjs')], { cwd: folder, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { status: 200, number: 'F2026-0001', head: '%PDF-' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/route.test.ts`
Expected: FAIL: `Cannot find module '.../src/logic-functions/billing-action.ts'`.

- [ ] **Step 3: Write `src/logic-functions/billing-action.ts`**

```ts
import { defineLogicFunction } from 'twenty-sdk/define';
import { Response as TwentyResponse, type LogicFunctionExecutionContext, type RoutePayload } from 'twenty-sdk/logic-function';
import { runAction, type ActionDeps } from '../../lifecycle/actions.ts';
import { describeAll, packFor } from '../../lifecycle/lang/pack.ts';
import { id } from '../lib/id.ts';
import { appStore, callerStore } from '../lib/twenty-stores.ts';

export type RouteEvent = { body: unknown; isBase64Encoded?: boolean; userWorkspaceId: string | null };
export type RouteContext = { workspaceMemberId: string | null };

/** One line of JSON: the platform keeps each output line as one log entry. */
const logLine = (entry: Record<string, unknown>): void => console.error(JSON.stringify({ route: 'billing-action', ...entry }));
const newReference = (): string => crypto.randomUUID().slice(0, 8);

/** The request's body: parsed already when it was JSON, else parsed here; null when it is not JSON. */
export function bodyOf(event: { body: unknown; isBase64Encoded?: boolean }): unknown {
  if (typeof event.body !== 'string') return event.body ?? null;
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return null;
  }
}

/** Hex SHA-256, from Web Crypto. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The route's dependencies in production, built on each call: clients cache their token. */
export function liveDeps(): ActionDeps {
  return { app: appStore(logLine), caller: callerStore(), now: () => new Date(), sha256, reference: newReference, log: logLine };
}

/**
 * Answers a button. A call without a signed-in person (an API key) is refused:
 * the caller's own token is what lets Twenty's role check decide who may act.
 * The answer is never 401, which the front client would take for an expired
 * token and post again.
 */
export async function respond(event: RouteEvent, context: RouteContext, makeDeps: () => ActionDeps): Promise<TwentyResponse> {
  const body = bodyOf(event);
  const locale = (body as { locale?: unknown } | null)?.locale;
  const pack = packFor(typeof locale === 'string' ? locale : null);
  if (!event.userWorkspaceId || !context.workspaceMemberId) {
    return new TwentyResponse({ ok: false, problems: describeAll([{ source: 'lifecycle', code: 'NOT_ALLOWED' }], pack.code) }, { status: 403 });
  }
  try {
    const outcome = await runAction(body, makeDeps());
    return new TwentyResponse(outcome.body, { status: outcome.status });
  } catch (error) {
    // runAction answers every failure itself: this is a failure to build its dependencies.
    const reference = newReference();
    logLine({ reference, step: 'setup', error: error instanceof Error ? error.message : String(error) });
    return new TwentyResponse({ ok: false, problems: [{ code: 'UNEXPECTED', message: pack.messages.unexpected(reference) }] }, { status: 500 });
  }
}

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.billingAction'),
  name: 'billing-action',
  description: 'Runs the billing buttons: previews and issues invoices and credit notes, and generates quote PDFs. The only function that bundles the PDF renderer.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: { path: '/billing/action', httpMethod: 'POST', isAuthRequired: true },
  handler: (event: RoutePayload, context: LogicFunctionExecutionContext) => respond(event, context, liveDeps),
});
```

- [ ] **Step 4: Register the identifier**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run ids:sync`
Expected: `ids:sync registered 1 new identifier(s).`, `logicFunction.billingAction`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/route.test.ts test/triggers.test.ts test/ids.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add src/logic-functions/billing-action.ts src/ids.ts test/route.test.ts
```

```bash
git commit -m "feat: the billing-action route answers the buttons, for signed-in people only"
```

---

### Task 17: The buttons

Five buttons (spec §4, §6): Preview PDF and Issue on invoices and credit notes, shown on one selected DRAFT record; Generate PDF on quotes, shown on one selected record. Each is a command menu item that opens a headless front component, which posts to the route and shows the answer in a snackbar. The front component's context does not name its object, so each button has its own small component; the five share one body, `ActionCommand`, and one pure module for what a person reads.

What the platform does with them, read in `twenty-sdk` 2.41 and the front end at `twenty/v2.41.0`:

- A command menu item's `icon` is ignored (the SDK warns): the app's icon shows.
- `conditionalAvailabilityExpression` is a string that the front end evaluates against the selection. The CLI builds it with a text rewrite of the source: `conditionalAvailabilityExpression: <expression>` gets the expression wrapped in quotes, and a string literal written there is wrapped a second time and the button never shows. The items therefore write the key quoted, `'conditionalAvailabilityExpression': '…'`, which the rewrite does not touch: the string reaches the manifest as written. (The SDK's helper functions for writing the expression throw when node imports them, which the tests do.)
- `everyEquals(selectedRecords, "status", "DRAFT")` reads the selected records' `status`, and `noneDefined(selectedRecords, "deletedAt")` hides the buttons on a deleted record.
- `<Command execute={…} />` runs `execute` when the person picks the item; the host disables the item while it runs, so a second click waits for the first. If `execute` rejects, the host shows its own generic error: it never rejects here.
- `new RestApiClient().post('/s/billing/action', body)` sends the viewing person's token, and resolves with the parsed body of a 2xx answer. Any other answer rejects with a `RestApiClientError` carrying `status` and `body`; a failed network request rejects with no status.
- With logic functions turned off on the server, the route does not exist: the post answers 404 (or 503 behind some proxies). The button says so and points to the README.
- A browser bundle cannot import `src/lib/id.ts` (it uses `node:crypto`): the components read `src/ids.ts`, and their keys are requested with `id()` by the command menu items, which are `.ts`, so `npm run ids:sync` registers them.

**Files:**
- Create: `src/front-components/action-feedback.ts`, `src/front-components/action-command.tsx`, `src/front-components/preview-invoice.tsx`, `src/front-components/issue-invoice.tsx`, `src/front-components/preview-credit-note.tsx`, `src/front-components/issue-credit-note.tsx`, `src/front-components/quote-pdf.tsx`, `src/command-menu-items/preview-invoice.command-menu-item.ts`, `src/command-menu-items/issue-invoice.command-menu-item.ts`, `src/command-menu-items/preview-credit-note.command-menu-item.ts`, `src/command-menu-items/issue-credit-note.command-menu-item.ts`, `src/command-menu-items/quote-pdf.command-menu-item.ts`
- Modify: `test/helpers/entities.ts` (the `command-menu-items` folder), `src/ids.ts` (by `npm run ids:sync`)
- Test: `test/buttons.test.ts`

**Interfaces:**
- Consumes: `defineCommandMenuItem`, `defineFrontComponent` from `twenty-sdk/define`; `Command`, `enqueueSnackbar`, `useLocale`, `useSelectedRecordIds` from `twenty-sdk/front-component`; `RestApiClient` from `twenty-client-sdk/rest`; `id` from `src/lib/id.ts`; `objectId` from `src/schema/fields.ts`; `IDS` from `src/ids.ts`; `bundleFrontComponent` from `test/helpers/front-component-build.ts`; `loadEntities` from `test/helpers/entities.ts`.
- Produces:
  - from `src/front-components/action-feedback.ts`: `type ButtonRequest = { action: 'preview' | 'issue' | 'quotePdf'; object: 'billingInvoice' | 'billingCreditNote' | 'billingQuote'; recordId: string; localDate: string; locale: string }`, `type RouteAnswer = { status: number | null; body: unknown }`, `type Feedback = { message: string; variant: 'success' | 'error' }`, `localDateOf(date: Date): string`, `callRoute(post: (path: string, body: unknown) => Promise<unknown>, request: ButtonRequest): Promise<RouteAnswer>`, `feedbackFor(answer: RouteAnswer, locale: string): Feedback`, `DRAFT_ONE: string`, `ONE: string` (the two availability expressions)
  - from `src/front-components/action-command.tsx`: `ActionCommand(props: { action: ButtonRequest['action']; object: ButtonRequest['object'] })`
  - identifier keys `commandMenuItem.previewInvoice`, `commandMenuItem.issueInvoice`, `commandMenuItem.previewCreditNote`, `commandMenuItem.issueCreditNote`, `commandMenuItem.quotePdf`, `frontComponent.previewInvoice`, `frontComponent.issueInvoice`, `frontComponent.previewCreditNote`, `frontComponent.issueCreditNote`, `frontComponent.quotePdf`

- [ ] **Step 1: Let the entity loader read command menu items**

In `test/helpers/entities.ts`, widen the folder type:

```ts
export async function loadEntities(folder: 'objects' | 'fields' | 'navigation-menu-items' | 'command-menu-items'): Promise<Entity[]> {
```

- [ ] **Step 2: Write the failing test**

`test/buttons.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadEntities } from './helpers/entities.ts';
import { bundleFrontComponent } from './helpers/front-component-build.ts';
import { objectId } from '../src/schema/fields.ts';
import { IDS } from '../src/ids.ts';
import { DRAFT_ONE, ONE, callRoute, feedbackFor, localDateOf, type ButtonRequest } from '../src/front-components/action-feedback.ts';

const COMPONENTS = fileURLToPath(new URL('../src/front-components/', import.meta.url));

const BUTTONS = [
  { file: 'preview-invoice', label: 'Preview PDF', shortLabel: 'Preview', object: 'billingInvoice', expression: DRAFT_ONE },
  { file: 'issue-invoice', label: 'Issue invoice', shortLabel: 'Issue', object: 'billingInvoice', expression: DRAFT_ONE },
  { file: 'preview-credit-note', label: 'Preview PDF', shortLabel: 'Preview', object: 'billingCreditNote', expression: DRAFT_ONE },
  { file: 'issue-credit-note', label: 'Issue credit note', shortLabel: 'Issue', object: 'billingCreditNote', expression: DRAFT_ONE },
  { file: 'quote-pdf', label: 'Generate PDF', shortLabel: 'PDF', object: 'billingQuote', expression: ONE },
] as const;

const camel = (file: string) => file.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
const REQUEST: ButtonRequest = { action: 'issue', object: 'billingInvoice', recordId: 'r1', localDate: '2026-09-26', locale: 'en' };
const restError = (status: number | undefined, body: unknown) => Object.assign(new Error('failed'), { name: 'RestApiClientError', status, body });

test('the two availability expressions are the ones the front end evaluates', () => {
  assert.equal(DRAFT_ONE, 'numberOfSelectedRecords == 1 and everyEquals(selectedRecords, "status", "DRAFT") and noneDefined(selectedRecords, "deletedAt")');
  assert.equal(ONE, 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt")');
});

test('the five buttons validate, each on one record of its object, opening its own component', async () => {
  const items = await loadEntities('command-menu-items');
  assert.deepEqual(items.map((item) => item.file), BUTTONS.map((button) => `${button.file}.command-menu-item.ts`).sort());
  for (const button of BUTTONS) {
    const { result } = items.find((item) => item.file === `${button.file}.command-menu-item.ts`)!;
    assert.equal(result.success, true, `${button.file}: ${result.errors.join('; ')}`);
    assert.deepEqual((result as { warnings?: string[] }).warnings ?? [], [], button.file);
    assert.deepEqual(result.config, {
      universalIdentifier: IDS[`commandMenuItem.${camel(button.file)}`],
      label: button.label,
      shortLabel: button.shortLabel,
      isPinned: true,
      availabilityType: 'RECORD_SELECTION',
      availabilityObjectUniversalIdentifier: objectId(button.object),
      frontComponentUniversalIdentifier: IDS[`frontComponent.${camel(button.file)}`],
      conditionalAvailabilityExpression: button.expression,
    });
  }
});

test('the date sent is the person’s own calendar date, not UTC’s', () => {
  assert.equal(localDateOf(new Date(2026, 8, 26, 23, 30)), '2026-09-26');
  assert.equal(localDateOf(new Date(2027, 0, 1, 0, 5)), '2027-01-01');
});

test('the route’s answer is kept whatever its status, and a network failure has none', async () => {
  const posted: unknown[] = [];
  const ok = await callRoute(async (path, body) => { posted.push([path, body]); return { ok: true, message: 'Issued as F2026-0001.' }; }, REQUEST);
  assert.deepEqual(ok, { status: 200, body: { ok: true, message: 'Issued as F2026-0001.' } });
  assert.deepEqual(posted, [['/s/billing/action', REQUEST]]);
  const refused = { ok: false, problems: [{ code: 'MISSING_BUYER', message: 'Choose a buyer.' }] };
  assert.deepEqual(await callRoute(async () => { throw restError(422, refused); }, REQUEST), { status: 422, body: refused });
  assert.deepEqual(await callRoute(async () => { throw restError(422, JSON.stringify(refused)); }, REQUEST), { status: 422, body: refused });
  assert.deepEqual(await callRoute(async () => { throw new TypeError('Failed to fetch'); }, REQUEST), { status: null, body: null });
});

test('a success shows its message, a refusal the first five problems and how many more', () => {
  assert.deepEqual(feedbackFor({ status: 200, body: { ok: true, message: 'Issued as F2026-0001.' } }, 'en'), { message: 'Issued as F2026-0001.', variant: 'success' });
  const problems = Array.from({ length: 8 }, (_, index) => ({ code: 'X', message: `Problem ${index + 1}.` }));
  assert.deepEqual(feedbackFor({ status: 422, body: { ok: false, problems } }, 'en'), {
    message: 'Problem 1. Problem 2. Problem 3. Problem 4. Problem 5. And 3 more.', variant: 'error',
  });
  assert.equal(feedbackFor({ status: 422, body: { ok: false, problems } }, 'fr-FR').message.endsWith('Et 3 de plus.'), true);
  assert.deepEqual(feedbackFor({ status: 403, body: { ok: false, problems: problems.slice(0, 1) } }, 'en'), { message: 'Problem 1.', variant: 'error' });
});

test('a missing route says logic functions are off; anything else says what failed', () => {
  for (const status of [404, 503]) {
    assert.match(feedbackFor({ status, body: null }, 'en').message, /logic functions.*README/);
    assert.match(feedbackFor({ status, body: null }, 'fr').message, /fonctions logiques.*README/);
  }
  assert.deepEqual(feedbackFor({ status: 502, body: '<html>' }, 'en'), { message: 'The billing action failed (HTTP 502).', variant: 'error' });
  assert.deepEqual(feedbackFor({ status: null, body: null }, 'en'), {
    message: 'The billing action could not reach the server. Check your connection and try again.', variant: 'error',
  });
});

test('each button bundles for the browser as the CLI builds it, around the shared body', async () => {
  for (const { file } of BUTTONS) {
    const { exports, inputs } = await bundleFrontComponent(`${COMPONENTS}${file}.tsx`);
    assert.deepEqual(exports, ['default'], file);
    assert.ok(!inputs.some((input) => input.startsWith('node:')), `${file}: ${inputs.filter((input) => input.startsWith('node:')).join(', ')}`);
    assert.ok(!inputs.some((input) => input.endsWith('src/lib/id.ts')), `${file} imports src/lib/id.ts`);
    assert.ok(inputs.some((input) => input.endsWith('action-command.tsx')), `${file} does not use ActionCommand`);
  }
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/buttons.test.ts`
Expected: FAIL: `Cannot find module '.../src/front-components/action-feedback.ts'`.

- [ ] **Step 4: Write the pure module**

`src/front-components/action-feedback.ts`:

```ts
/**
 * What the five buttons send and what a person reads back, kept apart from
 * React so node --test can import it. Nothing here imports Twenty or node.
 */

export type ButtonRequest = {
  action: 'preview' | 'issue' | 'quotePdf';
  object: 'billingInvoice' | 'billingCreditNote' | 'billingQuote';
  recordId: string;
  localDate: string;
  locale: string;
};
export type RouteAnswer = { status: number | null; body: unknown };
export type Feedback = { message: string; variant: 'success' | 'error' };

/** Invoices and credit notes: one selected draft that is not deleted. */
export const DRAFT_ONE = 'numberOfSelectedRecords == 1 and everyEquals(selectedRecords, "status", "DRAFT") and noneDefined(selectedRecords, "deletedAt")';
/** Quotes: one selected record that is not deleted, whatever its status. */
export const ONE = 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt")';

const SHOWN = 5;

const WORDS = {
  en: {
    more: (count: number) => `And ${count} more.`,
    off: 'The billing actions need logic functions, which are turned off on this server. See “Issuing documents” in the app’s README.',
    failed: (status: number) => `The billing action failed (HTTP ${status}).`,
    unreachable: 'The billing action could not reach the server. Check your connection and try again.',
  },
  fr: {
    more: (count: number) => `Et ${count} de plus.`,
    off: 'Les actions de facturation ont besoin des fonctions logiques, désactivées sur ce serveur. Voir «\u00a0Issuing documents\u00a0» dans le README de l’app.',
    failed: (status: number) => `L’action de facturation a échoué (HTTP ${status}).`,
    unreachable: 'L’action de facturation n’a pas pu joindre le serveur. Vérifiez votre connexion et réessayez.',
  },
};

const wordsFor = (locale: string) => (locale.toLowerCase().startsWith('fr') ? WORDS.fr : WORDS.en);
const pad = (value: number) => String(value).padStart(2, '0');

/** The person's calendar date, from their browser's clock and time zone. */
export function localDateOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const parsed = (body: unknown): unknown => {
  if (typeof body !== 'string') return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

/** Posts the request to the route; every answer is kept, a refusal included, and never thrown. */
export async function callRoute(post: (path: string, body: unknown) => Promise<unknown>, request: ButtonRequest): Promise<RouteAnswer> {
  try {
    return { status: 200, body: await post('/s/billing/action', request) };
  } catch (error) {
    const failure = error as { name?: unknown; status?: unknown; body?: unknown } | null;
    if (failure?.name === 'RestApiClientError' && typeof failure.status === 'number') return { status: failure.status, body: parsed(failure.body) };
    return { status: null, body: null };
  }
}

type Answer = { ok: true; message: string } | { ok: false; problems: { message: string }[] };

const isAnswer = (body: unknown): body is Answer => {
  const answer = body as { ok?: unknown; message?: unknown; problems?: unknown } | null;
  if (answer?.ok === true) return typeof answer.message === 'string';
  return answer?.ok === false && Array.isArray(answer.problems) && answer.problems.every((problem) => typeof problem?.message === 'string');
};

/** The snackbar for an answer: the message, or the first five problems and how many more. */
export function feedbackFor(answer: RouteAnswer, locale: string): Feedback {
  const words = wordsFor(locale);
  if (isAnswer(answer.body)) {
    if (answer.body.ok) return { message: answer.body.message, variant: 'success' };
    const { problems } = answer.body;
    const shown = problems.slice(0, SHOWN).map((problem) => problem.message);
    if (problems.length > SHOWN) shown.push(words.more(problems.length - SHOWN));
    return { message: shown.join(' '), variant: 'error' };
  }
  if (answer.status === null) return { message: words.unreachable, variant: 'error' };
  if (answer.status === 404 || answer.status === 503) return { message: words.off, variant: 'error' };
  return { message: words.failed(answer.status), variant: 'error' };
}
```

- [ ] **Step 5: Write the shared body**

`src/front-components/action-command.tsx`:

```tsx
import { Command, enqueueSnackbar, useLocale, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { callRoute, feedbackFor, localDateOf, type ButtonRequest } from './action-feedback.ts';

/**
 * What the five buttons share: post the action for the one selected record
 * with the person's own token, date and locale, and show the answer. The host
 * disables the button while `execute` runs; `execute` never rejects, or the
 * host would show its own generic error instead.
 */
export function ActionCommand({ action, object }: { action: ButtonRequest['action']; object: ButtonRequest['object'] }) {
  const [recordId] = useSelectedRecordIds();
  const locale = useLocale();
  const execute = async (): Promise<void> => {
    if (!recordId) return;
    try {
      const client = new RestApiClient();
      const answer = await callRoute((path, body) => client.post(path, body), { action, object, recordId, localDate: localDateOf(new Date()), locale });
      await enqueueSnackbar(feedbackFor(answer, locale));
    } catch {
      // The snackbar itself failed: there is nothing left to tell the person with.
    }
  };
  return <Command execute={execute} />;
}
```

- [ ] **Step 6: Write the five components**

`src/front-components/preview-invoice.tsx`:

```tsx
import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.previewInvoice'],
  name: 'preview-invoice',
  description: 'Renders the selected draft invoice as a PDF marked DRAFT, into its PDF field.',
  isHeadless: true,
  component: () => <ActionCommand action="preview" object="billingInvoice" />,
});
```

`src/front-components/issue-invoice.tsx`:

```tsx
import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.issueInvoice'],
  name: 'issue-invoice',
  description: 'Issues the selected draft invoice: its number, its PDF, and the invoice frozen.',
  isHeadless: true,
  component: () => <ActionCommand action="issue" object="billingInvoice" />,
});
```

`src/front-components/preview-credit-note.tsx`:

```tsx
import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.previewCreditNote'],
  name: 'preview-credit-note',
  description: 'Renders the selected draft credit note as a PDF marked DRAFT, into its PDF field.',
  isHeadless: true,
  component: () => <ActionCommand action="preview" object="billingCreditNote" />,
});
```

`src/front-components/issue-credit-note.tsx`:

```tsx
import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.issueCreditNote'],
  name: 'issue-credit-note',
  description: 'Issues the selected draft credit note: its number, its PDF, and the credit note frozen.',
  isHeadless: true,
  component: () => <ActionCommand action="issue" object="billingCreditNote" />,
});
```

`src/front-components/quote-pdf.tsx`:

```tsx
import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.quotePdf'],
  name: 'quote-pdf',
  description: 'Generates the next version of the selected quote’s PDF, numbering the quote on its first.',
  isHeadless: true,
  component: () => <ActionCommand action="quotePdf" object="billingQuote" />,
});
```

- [ ] **Step 7: Write the five command menu items**

`src/command-menu-items/preview-invoice.command-menu-item.ts`:

```ts
import { defineCommandMenuItem } from 'twenty-sdk/define';
import { DRAFT_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.previewInvoice'),
  label: 'Preview PDF',
  shortLabel: 'Preview',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingInvoice'),
  frontComponentUniversalIdentifier: id('frontComponent.previewInvoice'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': DRAFT_ONE,
});
```

The CLI's rewrite reads the source text, not the value: with the key quoted it never looks at what follows, so the constant is safe here. Step 8 checks the manifest the CLI actually builds.

`src/command-menu-items/issue-invoice.command-menu-item.ts`:

```ts
import { defineCommandMenuItem } from 'twenty-sdk/define';
import { DRAFT_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.issueInvoice'),
  label: 'Issue invoice',
  shortLabel: 'Issue',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingInvoice'),
  frontComponentUniversalIdentifier: id('frontComponent.issueInvoice'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': DRAFT_ONE,
});
```

`src/command-menu-items/preview-credit-note.command-menu-item.ts`:

```ts
import { defineCommandMenuItem } from 'twenty-sdk/define';
import { DRAFT_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.previewCreditNote'),
  label: 'Preview PDF',
  shortLabel: 'Preview',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingCreditNote'),
  frontComponentUniversalIdentifier: id('frontComponent.previewCreditNote'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': DRAFT_ONE,
});
```

`src/command-menu-items/issue-credit-note.command-menu-item.ts`:

```ts
import { defineCommandMenuItem } from 'twenty-sdk/define';
import { DRAFT_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.issueCreditNote'),
  label: 'Issue credit note',
  shortLabel: 'Issue',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingCreditNote'),
  frontComponentUniversalIdentifier: id('frontComponent.issueCreditNote'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': DRAFT_ONE,
});
```

`src/command-menu-items/quote-pdf.command-menu-item.ts`:

```ts
import { defineCommandMenuItem } from 'twenty-sdk/define';
import { ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.quotePdf'),
  label: 'Generate PDF',
  shortLabel: 'PDF',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingQuote'),
  frontComponentUniversalIdentifier: id('frontComponent.quotePdf'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': ONE,
});
```

- [ ] **Step 8: Register the identifiers, and check the manifest the CLI builds**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run ids:sync`
Expected: `ids:sync registered 10 new identifier(s).`, the five `commandMenuItem.…` and five `frontComponent.…` keys.

Run: `source ~/.nvm/nvm.sh && nvm use --silent && ./node_modules/.bin/twenty --remote billing-test dev:build`
Expected: the build succeeds and writes `.twenty/output/manifest.json` (git-ignored). Each of the five command menu items there must carry `conditionalAvailabilityExpression` exactly as `DRAFT_ONE` or `ONE`, with no extra quotes:

Run: `node -e "const m=require('./.twenty/output/manifest.json');for(const c of m.commandMenuItems)console.log(c.label,'|',c.conditionalAvailabilityExpression)"`
Expected: five lines, each ending in `numberOfSelectedRecords == 1 and …`, none starting with a quote. If the expression arrives wrapped in quotes, write it inline in each item as a string literal with no space after the colon (`'conditionalAvailabilityExpression':'…'` also works), and note the finding for Task 19.

- [ ] **Step 9: Run the tests and the typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && node --test test/buttons.test.ts test/navigation.test.ts test/ids.test.ts && npm run typecheck`
Expected: PASS; the typecheck is clean.

- [ ] **Step 10: Commit**

```bash
git add src/front-components src/command-menu-items src/ids.ts test/helpers/entities.ts test/buttons.test.ts
```

```bash
git commit -m "feat: five buttons preview, issue and generate PDFs, and say how it went"
```

---

### Task 18: The README

The README gains a section on issuing, and the warning about destroy permissions (spec §7, §12). The status note and the requirements change with it: documents can now be previewed and issued, and logic functions now run the totals, the guards and the buttons, not only the presets.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the status note**

Replace the blockquote under the title with:

```markdown
> **Status: under construction.** Invoices and credit notes can be previewed
> and issued, and quotes printed; turning a quote into an invoice, the
> ready-made views and sending by email are still to come. Do not use it for
> real invoices until the first release.
```

- [ ] **Step 2: Update the requirements**

Replace the second bullet of `## Requirements` with:

```markdown
- On a self-hosted server, logic functions enabled (`LOGIC_FUNCTION_TYPE`).
  They are off by default, and without them nothing works: the presets are not
  seeded, totals are not computed, issued documents are not protected, and the
  buttons answer that logic functions are turned off.
```

- [ ] **Step 3: Add the section on issuing**

Insert before `## Development`:

```markdown
## Issuing documents

Select one draft invoice or credit note: **Preview PDF** and **Issue** appear
at the top of the record and in the command menu. On a quote, **Generate PDF**.

- **Preview PDF** renders the document, marked DRAFT, into its PDF field. It
  numbers nothing and can be run as often as you like.
- **Issue** fills what is left empty (issue date, currency, language, due
  date), checks everything at once and lists every problem it finds, then gives
  the document the next number of its sequence, renders the PDF, and freezes
  the document with a copy of what was printed and the PDF's SHA-256 hash.
- **Generate PDF** numbers a quote on its first PDF, then adds a new version
  (v2, v3…) each time. The quote stays editable; its PDF field keeps the last
  ten.

The buttons act as you: anyone whose role can edit the document can issue it,
and no one else. Messages follow your Twenty language.

**Totals** are computed by the app a moment after a line changes. A line with a
catalog item takes the item's description, unit, price and tax code where it
has none.

**Numbering.** Each issuer has its own sequence per document type and per
period (yearly, monthly or never reset, from the profile), in the pattern the
profile sets, for example `F{YYYY}-{SEQ:4}` for `F2026-0001`. Numbers have no
gaps. To carry on from an older system, create a *Numbering sequence* record
for the issuer, type and period, with *Last number* set to the last number
already used: the next document takes the one after. Once a sequence has given
out a number, its last number can only rise.

**An issued invoice or credit note cannot be changed.** A change to what was
printed (subject, buyer, dates, currency, lines, notes…) is put back a moment
later, and the record's timeline says what was put back and why. Deleting an
issued or numbered document restores it. Its status can still move between
issued, sent and paid, and the sent date, paid date, opportunity and quote stay
free. To correct an issued invoice, issue a credit note that names it.

### Do not let users destroy billing records

Twenty can delete a record permanently ("destroy" it, for example by emptying
the deleted records). The app brings back a deleted invoice, but it cannot
bring back a destroyed one, and a destroyed invoice leaves a gap in your
numbering that your tax authority may ask about. The app never destroys
anything, and its role cannot.

In **Settings → Roles**, turn off the permission to destroy records on the
billing objects, for every role that can edit them (API keys included).
```

- [ ] **Step 4: Link the design and the plan**

In `## Design`, add after the Rendering design line:

```markdown
- [Issue path design](docs/superpowers/specs/2026-09-26-issue-path-design.md)
```

and after the Engine plan line:

```markdown
- [Issue path plan](docs/superpowers/plans/2026-09-26-issue-path.md)
```

- [ ] **Step 5: Check the links and the facts**

Run: `ls docs/superpowers/specs/2026-09-26-issue-path-design.md docs/superpowers/plans/2026-09-26-issue-path.md`
Expected: both paths print.

Read the new section against the spec once: the button labels match Task 17, the fr pattern matches the preset (`F{YYYY}-{SEQ:4}`), the free fields match spec §7 (`sentAt`, `paidAt`, `opportunity`, `quote`).

- [ ] **Step 6: Commit**

```bash
git add README.md
```

```bash
git commit -m "docs: how to issue documents, and why billing records must not be destroyed"
```

---

### Task 19: Deploy, acceptance on billing-test, and the pull request

The spec's acceptance (§11) runs on the test workspace, remote `billing-test` (workspace demo-exceev), with a signed-in person clicking the buttons. The numbers differ from the spec's examples: the `fr` preset's patterns are `F{YYYY}-{SEQ:4}` and `AV{YYYY}-{SEQ:4}`, so the first invoice is `F2026-0001` and the first credit note `AV2026-0001`, not `INV-2026-0001` and `CN-2026-0001`.

Who does what:

- Records are created through the `demo-exceev-crm` MCP server, which signs in with an API key: data only, never on another workspace.
- Every click on a button is made in the in-app browser, in the maintainer's own signed-in session on billing-test. The maintainer signs in; the agent never types a password.
- Acceptance step 1 needs the second member and the restricted role that Task 1 set up. The maintainer signs in as that member.
- Function logs: `./node_modules/.bin/twenty --remote billing-test dev:function:logs` in the background while the steps run. A trigger or route failure prints one JSON line.

**Files:**
- Modify: `ids.lock.json` (by the deploy)

- [ ] **Step 1: The whole suite, once more**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm test && npm run typecheck`
Expected: PASS, and a clean typecheck.

- [ ] **Step 2: Deploy**

Run: `source ~/.nvm/nvm.sh && nvm use --silent && npm run deploy -- --remote billing-test --yes`
Expected: the plan adds 8 logic functions (1 route, 7 triggers), 6 front components, 5 command menu items and 2 timeline activity types (the data model went out with Task 2), and destroys nothing; after apply the plan is empty; `ids:lock` runs and says `ids.lock.json changed: commit it.`

If the deploy stops, read why before anything else: a plan that destroys means a definition changed an existing field in a way Twenty recreates it, which must be fixed in the definition, never applied by hand.

- [ ] **Step 3: Commit the lock**

```bash
git add ids.lock.json
```

```bash
git commit -m "chore: lock the issue path's identifiers"
```

- [ ] **Step 4: Presets**

Through the `demo-exceev-crm` MCP server, run the tool `app_create_missing_presets`.
Expected: a report; it creates only what is missing and changes nothing that exists. The `fr` profile is there, with the patterns above and `numberingReset` `YEARLY`.

- [ ] **Step 5: Acceptance, in the spec's order**

Create the records for step 2 through the MCP server, with names that belong to no real business: an issuer "Atelier Recette 4a" on the `fr` profile, with a SIREN and a VAT number; a buyer company "Client Recette 4a SAS" with its SIREN; a person at that company. The issuer is new, so its sequences start empty. Then, in the in-app browser:

| # | Do | Expect |
|---|---|---|
| 1 | Signed in as the restricted member, open a draft invoice of the new issuer and click **Issue invoice**. Then, as the maintainer, click it again. | First: a snackbar with the NOT_ALLOWED message; the invoice is unchanged (no issue date filled, no number). Second: allowed (it continues as in step 3). |
| 2 | Create a draft invoice for the buyer and type three lines, one from a catalog item. | The catalog line fills its description, unit, price and tax code. The totals appear a moment after each line. |
| 3 | **Preview PDF**, then **Issue invoice**. | The preview is a PDF marked DRAFT in the PDF field. Issue answers "Issued as F2026-0001."; one PDF, a snapshot and a hash; status ISSUED; a timeline row "issued", which expands to the message. |
| 4 | On the issued invoice: change the subject; change a line's quantity; add a line; delete the invoice; set the status to DRAFT. Then set it to PAID. | Each change is put back within about a second, each with a timeline row "put back a change to" whose expanded text says what and why. The added line is deleted; the invoice comes back. PAID stays. |
| 5 | A quote for the buyer: **Generate PDF** twice. | One number, `D2026-0001`; two PDFs, v1 then v2, newest first. |
| 6 | A draft credit note naming the invoice: **Issue credit note**. | "Issued as AV2026-0001."; its PDF prints that it corrects F2026-0001. |
| 7 | A second new issuer, "Atelier Recette 4a bis": before any invoice, create its *Numbering sequence* (INVOICE, period 2026, *Last number* 1233); then issue a draft invoice for it. | `F2026-1234`, and the sequence's last number is 1234. |
| 8 | Two drafts of the same issuer, issued at the same moment: in the in-app browser, run two `POST /s/billing/action` requests at once from the page (`Promise.all`, with the page's own token), one per draft. | Two consecutive numbers, one each, and the sequence's last number equals the higher. If the page's token cannot be read, click **Issue invoice** on both drafts in two tabs within a second; the unit tests cover the true interleaving (Tasks 8 and 11). |

Record what each step showed (the snackbar text, the number, the timeline text, anything unexpected) for the pull request. A step that fails is a bug to fix test-first before the pull request: write the failing test in the task it belongs to, fix, redeploy, and run the step again.

- [ ] **Step 6: Push the branch**

```bash
git push https://github.com/exceev-technology/twenty-app-billing-documents.git feat/issue-path-part-2
```

- [ ] **Step 7: Open the pull request**

Title: `feat: the issue path (sub-project 4a)`. The body, with no attribution line:

- what the branch adds, by task group (Lifecycle, the REST store, the triggers, the route, the buttons, the timeline, the README);
- the acceptance table of Step 5, with what each step showed;
- the decisions taken on the maintainer's behalf (see *Decisions* at the top of this plan);
- what the platform turned out to do that the spec did not know (Task 1's findings).

Write the body to `.git/ISSUE_PATH_PR.md` (inside `.git`, so it is never committed), then:

```bash
gh pr create --repo exceev-technology/twenty-app-billing-documents --base main --head feat/issue-path-part-2 --title "feat: the issue path, part 2 (sub-project 4a)" --body-file .git/ISSUE_PATH_PR.md
```

- [ ] **Step 8: Watch it, without archiving on merge**

Call the `ccd_pr` tools: `get_status`, and `bind_pr` if it does not report the pull request; then `set_monitor` with `auto_archive_on_close: false`, so that merging does not archive the session. Report the pull request's link and CI state to the maintainer, who merges.
