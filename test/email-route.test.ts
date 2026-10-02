import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import billingEmail, { respond, runEmail, type EmailDeps, type EmailOutcome } from '../src/logic-functions/billing-email.ts';
import type { Mailbox, Mailer, OutgoingEmail } from '../lifecycle/mailer.ts';
import type { Row } from '../lifecycle/store.ts';
import { IDS } from '../src/ids.ts';
import { TODAY, money, now, workspace, type Workspace } from './lifecycle/helpers/fixtures.ts';
import { bundleLogicFunction } from './helpers/logic-function-build.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
/** The caller's mailboxes: the issuer's own address comes second, in another case. */
const MAILBOXES: Mailbox[] = [{ id: 'mailbox-me', handle: 'me@verdal.example' }, { id: 'mailbox-studio', handle: 'Bonjour@Verdal.example' }];
const PDF = { fileId: 'file-pdf-1', label: 'F2026-0001.pdf', extension: 'pdf', url: 'https://files.example/file-pdf-1' };
/** A quote's PDF field after two versions: the newest first. */
const QUOTE_PDFS = [{ fileId: 'file-q2', label: 'D2026-0004 v2.pdf' }, { fileId: 'file-q1', label: 'D2026-0004 v1.pdf' }];

/** A Mailer that lists the given mailboxes and records what it sends; `send` may refuse. */
function fakeMailer(over: { accounts?: Mailbox[]; send?: (email: OutgoingEmail) => Promise<void> } = {}) {
  const sent: OutgoingEmail[] = [];
  const mailer: Mailer = {
    accounts: async () => over.accounts ?? MAILBOXES,
    async send(email) {
      if (over.send) await over.send(email);
      sent.push(email);
    },
  };
  return { mailer, sent };
}

function setup(w: Workspace, over: Partial<EmailDeps> = {}) {
  const logs: Record<string, unknown>[] = [];
  const { mailer, sent } = fakeMailer();
  const deps: EmailDeps = {
    app: w.app, caller: w.db.store('MANUAL'), mailer, now, reference: () => 'ref-7f3a', log: (entry) => logs.push(entry), ...over,
  };
  return { deps, sent, logs };
}

/** The fixture's invoice as Issue leaves it, billed to Camille: F2026-0001, 9 792,00 €, due on 26/10/2026, its PDF in place. */
async function issuedInvoice(w: Workspace, over: Record<string, unknown> = {}): Promise<void> {
  await w.app.update('billingInvoices', w.invoice.id, {
    status: 'ISSUED', number: 'F2026-0001', issueDate: TODAY, dueDate: '2026-10-26', personId: w.person.id, total: money(9_792_000_000),
    snapshot: { printed: {}, record: {} }, pdf: [PDF], issuedAt: '2026-09-26T09:30:00.000Z', ...over,
  });
}

const prepareBody = (w: Workspace, over: Record<string, unknown> = {}) => ({
  step: 'prepare', object: 'billingInvoice', recordId: w.invoice.id, localDate: TODAY, locale: 'en', ...over,
});
const problemCodes = (outcome: EmailOutcome): string[] => (outcome.body.ok ? [] : outcome.body.problems.map((problem) => problem.code));

/** The form Prepare answered; the test fails on any other answer. */
function formOf(outcome: EmailOutcome) {
  assert.ok(outcome.body.ok && 'form' in outcome.body, JSON.stringify(outcome.body));
  return outcome.body.form;
}

test('the route validates: POST /billing/email, signed in, thirty seconds', () => {
  assert.equal(billingEmail.success, true, billingEmail.errors.join('\n'));
  assert.equal(billingEmail.config.name, 'billing-email');
  assert.equal(billingEmail.config.universalIdentifier, IDS['logicFunction.billingEmail']);
  assert.deepEqual(billingEmail.config.httpRouteTriggerSettings, { path: '/billing/email', httpMethod: 'POST', isAuthRequired: true });
  assert.equal(billingEmail.config.timeoutSeconds, 30);
});

test('a call no signed-in person made is refused as NOT_ALLOWED, in the caller’s language, before anything is read', async () => {
  const w = workspace();
  const noDeps = (): EmailDeps => {
    throw new Error('the route must not build its dependencies for this call');
  };
  const answer = await respond({ body: prepareBody(w, { locale: 'fr-FR' }), userWorkspaceId: null }, { workspaceMemberId: null }, noDeps);
  assert.equal(answer.status, 403);
  assert.deepEqual(answer.body, {
    ok: false,
    problems: [{ code: 'NOT_ALLOWED', message: 'Votre rôle ne permet pas de modifier ce document\u00a0: vous ne pouvez donc pas lancer cette action.' }],
  });
});

test('a signed-in person’s request runs, its body read as JSON, and the answer carries the outcome’s status', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps } = setup(w);
  const answer = await respond({ body: JSON.stringify(prepareBody(w)), userWorkspaceId: 'uw-1' }, { workspaceMemberId: 'member-1' }, () => deps);
  assert.equal(answer.status, 200);
  assert.equal((answer.body as { form: { attachment: string } }).form.attachment, 'F2026-0001.pdf');
});

test('Prepare fills the form in the document’s language: the person’s address, the issuer’s mailbox, the PDF by its number; it writes and sends nothing', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(prepareBody(w), deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  assert.deepEqual(outcome.body, {
    ok: true,
    form: {
      number: 'F2026-0001', mailboxes: MAILBOXES, from: 'mailbox-studio', to: 'camille@calibre.example', cc: '',
      subject: 'Facture F2026-0001 de Verdal Studio',
      message: 'Bonjour Camille,\n\nVeuillez trouver ci-joint la facture F2026-0001 d’un montant de 9\u00a0792,00\u00a0€, à régler au plus tard le 26/10/2026.\n\nCordialement,\nVerdal Studio',
      attachment: 'F2026-0001.pdf',
    },
  });
  assert.deepEqual([w.db.writes.length, sent.length, w.db.timeline.length], [before, 0, 0]);
});

test('an English invoice billed to a company alone starts with no recipient, and greets no one by name', async () => {
  const w = workspace();
  await issuedInvoice(w, { language: 'EN', personId: null });
  const form = formOf(await runEmail(prepareBody(w), setup(w).deps));
  assert.deepEqual([form.to, form.subject, form.message], [
    '', 'Invoice F2026-0001 from Verdal Studio',
    'Hello,\n\nPlease find attached invoice F2026-0001 for 9\u00a0792,00\u00a0€, due on 26/10/2026.\n\nKind regards,\nVerdal Studio',
  ]);
});

test('an invoice Sent and past its due date is prefilled with a reminder', async () => {
  const w = workspace();
  await issuedInvoice(w, { status: 'SENT', dueDate: '2026-09-20' });
  const form = formOf(await runEmail(prepareBody(w), setup(w).deps));
  assert.equal(form.subject, 'Relance\u00a0: facture F2026-0001 de Verdal Studio');
  assert.match(form.message, /la facture F2026-0001 d’un montant de 9\u00a0792,00\u00a0€, échue le 20\/09\/2026, n’est pas encore réglée/);
});

test('a credit note names the invoice it corrects; a quote its version, its validity and its newest PDF', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps } = setup(w);
  const note = w.addCreditNote({
    status: 'ISSUED', number: 'AV2026-0001', invoiceId: w.invoice.id, personId: w.person.id, language: 'EN', snapshot: { printed: {}, record: {} },
    pdf: [{ fileId: 'file-cn', label: 'AV2026-0001.pdf' }], total: money(1_440_000_000),
  });
  const credit = formOf(await runEmail(prepareBody(w, { object: 'billingCreditNote', recordId: note.id }), deps));
  assert.deepEqual([credit.subject, credit.message, credit.attachment], [
    'Credit note AV2026-0001 from Verdal Studio',
    'Hello Camille,\n\nPlease find attached credit note AV2026-0001 for 1\u00a0440,00\u00a0€, which corrects invoice F2026-0001.\n\nKind regards,\nVerdal Studio',
    'AV2026-0001.pdf',
  ]);
  const quote = w.addQuote({
    status: 'SENT', number: 'D2026-0004', version: 2, personId: w.person.id, language: 'EN', validUntil: '2026-10-26', total: money(600_000_000), pdf: QUOTE_PDFS,
  });
  const quoted = formOf(await runEmail(prepareBody(w, { object: 'billingQuote', recordId: quote.id }), deps));
  assert.deepEqual([quoted.number, quoted.subject, quoted.message, quoted.attachment], [
    'D2026-0004', 'Quote D2026-0004 (version 2) from Verdal Studio',
    'Hello Camille,\n\nPlease find attached our quote D2026-0004 (version 2) for 600,00\u00a0€, valid until 26/10/2026.\n\nKind regards,\nVerdal Studio',
    'D2026-0004 v2.pdf',
  ]);
});

test('Prepare lists every refusal at once, in the person’s language: a draft, a cancelled or deleted document, a quote with no PDF, no mailbox', async () => {
  const w = workspace();
  const noMailbox = setup(w, { mailer: fakeMailer({ accounts: [] }).mailer }).deps;
  const draft = await runEmail(prepareBody(w), noMailbox);
  assert.equal(draft.status, 422);
  assert.ok(!draft.body.ok);
  assert.deepEqual(draft.body.problems.map((problem) => problem.message), [
    'Only an issued invoice can be sent: issue this one first.',
    'You have no mailbox connected to Twenty: connect yours in Settings → Accounts, then open this form again.',
  ]);
  const { deps } = setup(w);
  await issuedInvoice(w, { status: 'CANCELLED' });
  assert.deepEqual(problemCodes(await runEmail(prepareBody(w), deps)), ['NOT_SENDABLE']);
  await w.app.softDelete('billingInvoices', w.invoice.id);
  const deleted = await runEmail(prepareBody(w, { locale: 'fr' }), deps);
  assert.ok(!deleted.body.ok);
  assert.deepEqual(deleted.body.problems.map((problem) => problem.message), ['Ce document est supprimé\u00a0: restaurez-le pour l’envoyer.']);
  const quote = w.addQuote({ number: 'D2026-0004', pdf: [] });
  assert.deepEqual(problemCodes(await runEmail(prepareBody(w, { object: 'billingQuote', recordId: quote.id }), deps)), ['NO_PDF']);
  const note = w.addCreditNote({ invoiceId: w.invoice.id });
  assert.deepEqual(problemCodes(await runEmail(prepareBody(w, { object: 'billingCreditNote', recordId: note.id }), deps)), ['NOT_SENDABLE']);
});

test('a person who cannot read the document, or from whom it is hidden, gets NOT_ALLOWED, and nothing of it', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const refused = await runEmail(prepareBody(w), setup(w, { caller: w.db.store('MANUAL', { canRead: () => false }) }).deps);
  assert.equal(refused.status, 403);
  assert.deepEqual(problemCodes(refused), ['NOT_ALLOWED']);
  assert.doesNotMatch(JSON.stringify(refused.body), /camille|F2026/i);
  const hidden = await runEmail(prepareBody(w), setup(w, { caller: { ...w.db.store('MANUAL'), get: async () => null } }).deps);
  assert.deepEqual([hidden.status, problemCodes(hidden)], [403, ['NOT_ALLOWED']]);
});

test('a request the route does not answer is unexpected: a reference, and a log', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  const odd = await runEmail({ step: 'send', object: 'billingInvoice' }, deps);
  assert.equal(odd.status, 500);
  assert.deepEqual(odd.body, { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] });
  assert.deepEqual([logs[0]?.reference, logs[0]?.step], ['ref-7f3a', 'request']);
});

test('bundled as the CLI bundles it, the route prepares a form, and carries neither pdfmake nor the Renderer’s layouts', async () => {
  // Inside node_modules, so that the two client modules left external resolve, as the platform provides them.
  mkdirSync(join(ROOT, 'node_modules/.cache'), { recursive: true });
  const folder = mkdtempSync(join(ROOT, 'node_modules/.cache/email-bundle-'));
  try {
    const inputs = await bundleLogicFunction(join(ROOT, 'src/logic-functions/billing-email.ts'), join(folder, 'route.mjs'));
    assert.ok(inputs.some((input) => input.endsWith('lifecycle/email.ts')), 'the route bundles lifecycle/email.ts');
    assert.ok(!inputs.some((input) => input.includes('pdfmake')), 'the route bundles pdfmake');
    assert.ok(!inputs.some((input) => input.includes('render/document.ts') || input.includes('render/layouts/') || input.includes('render/pdf.ts')), 'the route bundles the Renderer');

    const entry = join(folder, 'entry.ts');
    writeFileSync(entry, [
      `import { respond } from ${JSON.stringify(join(ROOT, 'src/logic-functions/billing-email.ts'))};`,
      `import { TODAY, money, now, workspace } from ${JSON.stringify(join(ROOT, 'test/lifecycle/helpers/fixtures.ts'))};`,
      'const w = workspace();',
      `await w.app.update('billingInvoices', w.invoice.id, { status: 'ISSUED', number: 'F2026-0001', snapshot: {}, pdf: [{ fileId: 'f1', label: 'F2026-0001.pdf' }], total: money(9792000000), dueDate: '2026-10-26' });`,
      'const mailer = { accounts: async () => [{ id: "m1", handle: "bonjour@verdal.example" }], send: async () => {} };',
      'const deps = () => ({ app: w.app, caller: w.db.store("MANUAL"), mailer, now, reference: () => "ref", log: () => {} });',
      'const body = { step: "prepare", object: "billingInvoice", recordId: w.invoice.id, localDate: TODAY, locale: "en" };',
      'const response = await respond({ body, userWorkspaceId: "uw" }, { workspaceMemberId: "wm" }, deps);',
      'console.log(JSON.stringify({ status: response.status, subject: response.body.form.subject, attachment: response.body.form.attachment }));',
    ].join('\n'));
    await bundleLogicFunction(entry, join(folder, 'entry.mjs'));
    const output = execFileSync(process.execPath, [join(folder, 'entry.mjs')], { cwd: folder, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { status: 200, subject: 'Facture F2026-0001 de Verdal Studio', attachment: 'F2026-0001.pdf' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
