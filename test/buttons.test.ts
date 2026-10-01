import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadEntities } from './helpers/entities.ts';
import { bundleFrontComponent } from './helpers/front-component-build.ts';
import { objectId } from '../src/schema/fields.ts';
import { IDS } from '../src/ids.ts';
import { DRAFT_ONE, ONE, OPEN_QUOTE_ONE, ISSUED_ONE, cancelConfirmation, callRoute, feedbackFor, localDateOf, type ButtonRequest } from '../src/front-components/action-feedback.ts';

const COMPONENTS = fileURLToPath(new URL('../src/front-components/', import.meta.url));

const BUTTONS = [
  { file: 'preview-invoice', label: 'Preview PDF', shortLabel: 'Preview', object: 'billingInvoice', expression: DRAFT_ONE, pinned: true },
  { file: 'issue-invoice', label: 'Issue invoice', shortLabel: 'Issue', object: 'billingInvoice', expression: DRAFT_ONE, pinned: true },
  { file: 'preview-credit-note', label: 'Preview PDF', shortLabel: 'Preview', object: 'billingCreditNote', expression: DRAFT_ONE, pinned: true },
  { file: 'issue-credit-note', label: 'Issue credit note', shortLabel: 'Issue', object: 'billingCreditNote', expression: DRAFT_ONE, pinned: true },
  { file: 'quote-pdf', label: 'Generate PDF', shortLabel: 'PDF', object: 'billingQuote', expression: ONE, pinned: true },
  { file: 'create-invoice', label: 'Create invoice', shortLabel: 'Invoice', object: 'billingQuote', expression: OPEN_QUOTE_ONE, pinned: true },
  { file: 'credit-note', label: 'Credit note', shortLabel: 'Credit', object: 'billingInvoice', expression: ISSUED_ONE, pinned: true },
  { file: 'cancel-invoice', label: 'Cancel invoice', shortLabel: 'Cancel', object: 'billingInvoice', expression: ISSUED_ONE, pinned: false },
] as const;

const camel = (file: string) => file.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
const REQUEST: ButtonRequest = { action: 'issue', object: 'billingInvoice', recordId: 'r1', localDate: '2026-09-26', locale: 'en' };
const restError = (status: number | undefined, body: unknown) => Object.assign(new Error('failed'), { name: 'RestApiClientError', status, body });

test('the two availability expressions are the ones the front end evaluates', () => {
  assert.equal(DRAFT_ONE, 'numberOfSelectedRecords == 1 and everyEquals(selectedRecords, "status", "DRAFT") and noneDefined(selectedRecords, "deletedAt")');
  assert.equal(ONE, 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt")');
});

test('every button validates, each on one record of its object, opening its own component', async () => {
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
      isPinned: button.pinned,
      availabilityType: 'RECORD_SELECTION',
      availabilityObjectUniversalIdentifier: objectId(button.object),
      frontComponentUniversalIdentifier: IDS[`frontComponent.${camel(button.file)}`],
      conditionalAvailabilityExpression: button.expression,
    });
  }
});

test('the flows’ availability expressions are the ones the front end evaluates', () => {
  assert.equal(OPEN_QUOTE_ONE, 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt") and noneEquals(selectedRecords, "status", "DECLINED") and noneEquals(selectedRecords, "status", "EXPIRED") and noneEquals(selectedRecords, "status", "INVOICED")');
  assert.equal(ISSUED_ONE, 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt") and noneEquals(selectedRecords, "status", "DRAFT") and noneEquals(selectedRecords, "status", "CANCELLED")');
});

test('an answer that names the document it made carries it, on success and on refusal', () => {
  const created = { object: 'billingInvoice', recordId: 'inv-9' };
  assert.deepEqual(feedbackFor({ status: 200, body: { ok: true, message: 'Draft invoice created from this quote.', created } }, 'en'), {
    message: 'Draft invoice created from this quote.', variant: 'success', created,
  });
  const refusal = { ok: false, problems: [{ code: 'MISSING_IDENTIFIER', message: 'The buyer has no SIREN.' }], created: { object: 'billingCreditNote', recordId: 'cn-1' } };
  assert.deepEqual(feedbackFor({ status: 422, body: refusal }, 'en').created, { object: 'billingCreditNote', recordId: 'cn-1' });
  assert.equal(feedbackFor({ status: 200, body: { ok: true, message: 'x', created: { object: 'company', recordId: 'c' } } }, 'en').created, undefined);
});

test('Cancel asks first, in the person’s language', () => {
  assert.deepEqual(cancelConfirmation('en'), {
    title: 'Cancel this invoice?',
    subtitle: 'A credit note for everything that remains is issued, and the invoice is marked Cancelled. This cannot be undone.',
    confirm: 'Cancel invoice',
  });
  assert.equal(cancelConfirmation('fr-FR').title, 'Annuler cette facture ?');
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

test('a refusal that names no problem still says what failed, never an empty snackbar', () => {
  assert.deepEqual(feedbackFor({ status: 422, body: { ok: false, problems: [] } }, 'en'), { message: 'The billing action failed (HTTP 422).', variant: 'error' });
  assert.deepEqual(feedbackFor({ status: 422, body: { ok: false, problems: [] } }, 'fr'), { message: 'L’action de facturation a échoué (HTTP 422).', variant: 'error' });
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
