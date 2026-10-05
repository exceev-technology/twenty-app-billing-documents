import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { loadEntities } from './helpers/entities.ts';
import { bundleFrontComponent } from './helpers/front-component-build.ts';
import { objectId } from '../src/schema/fields.ts';
import { IDS } from '../src/ids.ts';
import { DRAFT_ONE, ONE, OPEN_QUOTE_ONE, ISSUED_ONE, ISSUED_CREDIT_NOTE_ONE, cancelConfirmation, callRoute, feedbackFor, localDateOf, type ButtonRequest } from '../src/front-components/action-feedback.ts';

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

/** Send by email, one per document type: each opens the shared form in the side panel. */
const SENDS = [
  { file: 'send-invoice', label: 'Send by email', shortLabel: 'Email', object: 'billingInvoice', expression: ISSUED_ONE, pinned: true },
  { file: 'send-credit-note', label: 'Send by email', shortLabel: 'Email', object: 'billingCreditNote', expression: ISSUED_CREDIT_NOTE_ONE, pinned: true },
  { file: 'send-quote', label: 'Send by email', shortLabel: 'Email', object: 'billingQuote', expression: ONE, pinned: true },
] as const;
const ITEMS = [...BUTTONS, ...SENDS];

const camel = (file: string) => file.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
const REQUEST: ButtonRequest = { action: 'issue', object: 'billingInvoice', recordId: 'r1', localDate: '2026-09-26', locale: 'en' };
const restError = (status: number | undefined, body: unknown) => Object.assign(new Error('failed'), { name: 'RestApiClientError', status, body });

test('the two availability expressions are the ones the front end evaluates', () => {
  assert.equal(DRAFT_ONE, 'numberOfSelectedRecords == 1 and everyEquals(selectedRecords, "status", "DRAFT") and noneDefined(selectedRecords, "deletedAt")');
  assert.equal(ONE, 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt")');
});

test('every command menu item validates, each on one record of its object, opening its own component', async () => {
  const items = await loadEntities('command-menu-items');
  assert.deepEqual(items.map((item) => item.file), ITEMS.map((item) => `${item.file}.command-menu-item.ts`).sort());
  for (const item of ITEMS) {
    const { result } = items.find((entity) => entity.file === `${item.file}.command-menu-item.ts`)!;
    assert.equal(result.success, true, `${item.file}: ${result.errors.join('; ')}`);
    assert.deepEqual((result as { warnings?: string[] }).warnings ?? [], [], item.file);
    assert.deepEqual(result.config, {
      universalIdentifier: IDS[`commandMenuItem.${camel(item.file)}`],
      label: item.label,
      shortLabel: item.shortLabel,
      isPinned: item.pinned,
      availabilityType: 'RECORD_SELECTION',
      availabilityObjectUniversalIdentifier: objectId(item.object),
      frontComponentUniversalIdentifier: IDS[`frontComponent.${camel(item.file)}`],
      conditionalAvailabilityExpression: item.expression,
    });
  }
});

test('a credit note may be sent once issued, selected alone and not deleted', () => {
  assert.equal(ISSUED_CREDIT_NOTE_ONE, 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt") and everyEquals(selectedRecords, "status", "ISSUED")');
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
  assert.deepEqual(cancelConfirmation('fr-FR'), {
    title: 'Annuler cette facture\u00a0?',
    subtitle: 'Un avoir pour tout ce qui reste est émis, et la facture passe au statut Annulée. C’est définitif.',
    confirm: 'Annuler la facture',
  });
  assert.deepEqual(cancelConfirmation('ar-SA'), {
    title: 'إلغاء هذه الفاتورة؟',
    subtitle: 'يصدر إشعار دائن بكل المتبقي وتصبح حالة الفاتورة ملغاة. لا يمكن التراجع عن ذلك.',
    confirm: 'إلغاء الفاتورة',
  });
  assert.equal(feedbackFor({ status: 502, body: null }, 'ar').message, 'فشل إجراء الفوترة (HTTP 502).');
});

test('the buttons’ French words don’t take a plain space before : ; ? ! or inside « »', () => {
  const problems = Array.from({ length: 6 }, (_, index) => ({ code: 'X', message: `Problème ${index + 1}.` }));
  const texts = [
    ...Object.values(cancelConfirmation('fr')),
    ...[{ status: 404, body: null }, { status: 502, body: null }, { status: null, body: null }, { status: 422, body: { ok: false, problems } }]
      .map((answer) => feedbackFor(answer, 'fr').message),
  ];
  for (const text of texts) assert.doesNotMatch(text, / [:;?!]|« | »/, text);
  assert.equal(
    feedbackFor({ status: 404, body: null }, 'fr').message,
    'Les actions de facturation ont besoin des fonctions logiques, désactivées sur ce serveur. Voir «\u00a0Requirements\u00a0» dans le README de l’app.',
  );
});

/**
 * A component file's default export, read from its bundle: React's JSX runtime, the SDK's
 * defineFrontComponent, ActionCommand and SendEmailForm are stand-ins that keep what they are
 * given, and action-feedback.ts is left to Node, so the props hold the very functions this test imports.
 */
async function loadComponent(file: string): Promise<{ isHeadless?: boolean; component: () => { type: unknown; props: Record<string, unknown> } }> {
  const standIns: Record<string, string> = {
    'react/jsx-runtime': 'export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const Fragment = "Fragment";',
    'twenty-sdk/define': 'export const defineFrontComponent = (config) => config;',
    './action-command.tsx': 'export const ActionCommand = "ActionCommand";',
    './send-email-form.tsx': 'export const SendEmailForm = "SendEmailForm";',
  };
  const plugin: Plugin = {
    name: 'stand-ins',
    setup(builder) {
      builder.onResolve({ filter: /^(react\/jsx-runtime|twenty-sdk\/define|\.\/action-command\.tsx|\.\/send-email-form\.tsx)$/ }, ({ path }) => ({ path, namespace: 'stand-in' }));
      builder.onLoad({ filter: /.*/, namespace: 'stand-in' }, ({ path }) => ({ contents: standIns[path], loader: 'js' }));
      builder.onResolve({ filter: /\/action-feedback\.ts$/ }, ({ path, resolveDir }) => ({ path: pathToFileURL(resolve(resolveDir, path)).href, external: true }));
    },
  };
  const { outputFiles } = await build({
    entryPoints: [`${COMPONENTS}${file}.tsx`], bundle: true, format: 'esm', jsx: 'automatic', write: false, logLevel: 'silent', plugins: [plugin],
  });
  const bundled = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0]!.text).toString('base64')}`);
  return bundled.default;
}

const rendered = async (file: string) => (await loadComponent(file)).component();

test('Cancel invoice asks first, with its confirmation, and opens what it made; no other button asks', async () => {
  const opens = ['create-invoice', 'credit-note', 'cancel-invoice'];
  for (const { file } of BUTTONS) {
    const { type, props } = await rendered(file);
    assert.equal(type, 'ActionCommand', file);
    assert.equal(props.opensCreated ?? false, opens.includes(file), `${file} opensCreated`);
    if (file === 'cancel-invoice') assert.equal(props.confirm, cancelConfirmation);
    else assert.equal('confirm' in props, false, `${file} asks for a confirmation`);
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

test('each Send by email shows the shared form for its own object, in the side panel: none is headless', async () => {
  for (const { file, object } of SENDS) {
    const config = await loadComponent(file);
    assert.equal(config.isHeadless ?? false, false, `${file} is headless`);
    const { type, props } = config.component();
    assert.equal(type, 'SendEmailForm', file);
    assert.deepEqual(props, { object }, file);
  }
});

test('each Send by email bundles for the browser as the CLI builds it, around the shared form, with no node module', async () => {
  for (const { file } of SENDS) {
    const { exports, inputs } = await bundleFrontComponent(`${COMPONENTS}${file}.tsx`);
    assert.deepEqual(exports, ['default'], file);
    assert.ok(!inputs.some((input) => input.startsWith('node:')), `${file}: ${inputs.filter((input) => input.startsWith('node:')).join(', ')}`);
    assert.ok(!inputs.some((input) => input.endsWith('src/lib/id.ts')), `${file} imports src/lib/id.ts`);
    assert.ok(inputs.some((input) => input.endsWith('send-email-form.tsx')), `${file} does not use SendEmailForm`);
    assert.ok(inputs.some((input) => input.endsWith('/email-form.ts')), `${file} does not use email-form.ts`);
  }
});
