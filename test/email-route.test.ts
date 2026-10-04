import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import billingEmail, { respond, runEmail, scrubbed, scrubbedLog, type EmailDeps, type EmailOutcome } from '../src/logic-functions/billing-email.ts';
import { EmailNotAllowedError, SendFailedError, type Mailbox, type Mailer, type OutgoingEmail } from '../lifecycle/mailer.ts';
import type { Row, Store } from '../lifecycle/store.ts';
import { metadataMailer } from '../src/lib/mailer.ts';
import { restStore, type RestLike } from '../src/lib/rest-store.ts';
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

test('a call with only one of the two signs of a signed-in person is refused too: the user workspace alone, or the member alone', async () => {
  const w = workspace();
  const noDeps = (): EmailDeps => {
    throw new Error('the route must not build its dependencies for this call');
  };
  const calls = [
    [{ userWorkspaceId: 'uw-1' }, { workspaceMemberId: null }],
    [{ userWorkspaceId: null }, { workspaceMemberId: 'member-1' }],
    [{ userWorkspaceId: '' }, { workspaceMemberId: 'member-1' }],
  ] as const;
  for (const [event, context] of calls) {
    const answer = await respond({ body: prepareBody(w), ...event }, context, noDeps);
    assert.equal(answer.status, 403, JSON.stringify([event, context]));
    assert.deepEqual((answer.body as { problems: { code: string }[] }).problems.map((problem) => problem.code), ['NOT_ALLOWED']);
  }
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

test('a caller who cannot see the person billed gets the form with no recipient, and no name or address of theirs', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const blind = [
    w.db.store('MANUAL', { canRead: (plural) => plural !== 'people' }),
    { ...w.db.store('MANUAL'), get: async (plural: string, id: string) => (plural === 'people' ? null : w.db.store('MANUAL').get(plural, id)) },
  ];
  for (const caller of blind) {
    const outcome = await runEmail(prepareBody(w), setup(w, { caller }).deps);
    assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
    assert.deepEqual(formOf(outcome), {
      number: 'F2026-0001', mailboxes: MAILBOXES, from: 'mailbox-studio', to: '', cc: '',
      subject: 'Facture F2026-0001 de Verdal Studio',
      message: 'Bonjour,\n\nVeuillez trouver ci-joint la facture F2026-0001 d’un montant de 9\u00a0792,00\u00a0€, à régler au plus tard le 26/10/2026.\n\nCordialement,\nVerdal Studio',
      attachment: 'F2026-0001.pdf',
    });
    assert.doesNotMatch(JSON.stringify(outcome.body), /camille|durand|calibre\.example/i);
  }
});

test('a person the caller’s read fails on, for another reason than the role, is unexpected: the failure is not read as an empty To', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, logs } = setup(w, {
    caller: {
      ...w.db.store('MANUAL'),
      get: async (plural, id) => {
        if (plural === 'people') throw new Error('connection reset');
        return w.db.store('MANUAL').get(plural, id);
      },
    },
  });
  const outcome = await runEmail(prepareBody(w), deps);
  assert.equal(outcome.status, 500);
  assert.deepEqual(logs.map((entry) => [entry.emailStep, entry.step, entry.error]), [['prepare', 'prefill', 'connection reset']]);
});

test('on a refused Prepare the mailboxes are never asked for: nothing of the caller’s mail is touched for a document they may not see', async () => {
  const w = workspace();
  await issuedInvoice(w);
  let asked = 0;
  const mailer: Mailer = {
    accounts: async () => {
      asked++;
      return MAILBOXES;
    },
    send: async () => {},
  };
  for (const caller of [w.db.store('MANUAL', { canRead: () => false }), { ...w.db.store('MANUAL'), get: async () => null }]) {
    const outcome = await runEmail(prepareBody(w), setup(w, { caller, mailer }).deps);
    assert.equal(outcome.status, 403);
  }
  assert.equal(asked, 0);
});

test('a caller’s read that fails for another reason than the role is unexpected at the read step, on Prepare and on Send: nothing is asked of the mailboxes, sent or written', async () => {
  for (const body of [prepareBody, sendBody] as const) {
    const w = workspace();
    await issuedInvoice(w);
    const caller = {
      ...w.db.store('MANUAL'),
      get: async (): Promise<Row | null> => {
        throw new Error('connection reset');
      },
    };
    const { mailer, sent } = fakeMailer();
    const { deps, logs } = setup(w, { caller, mailer });
    const before = w.db.writes.length;
    const outcome = await runEmail(body(w), deps);
    assert.equal(outcome.status, 500, body.name);
    assert.deepEqual(outcome.body, { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] }, body.name);
    assert.deepEqual(logs.map((entry) => [entry.emailStep, entry.step, entry.error]), [[body === prepareBody ? 'prepare' : 'send', 'read', 'connection reset']], body.name);
    assert.deepEqual([sent, w.db.writes.length], [[], before], body.name);
  }
});

test('mailboxes that cannot be listed are unexpected at the mailboxes step, on Prepare and on Send: nothing is sent or written', async () => {
  for (const body of [prepareBody, sendBody] as const) {
    const w = workspace();
    await issuedInvoice(w);
    const mailer: Mailer = {
      accounts: async () => {
        throw new Error('metadata unavailable');
      },
      send: async () => {},
    };
    const { deps, logs } = setup(w, { mailer });
    const before = w.db.writes.length;
    const outcome = await runEmail(body(w), deps);
    assert.deepEqual([outcome.status, problemCodes(outcome)], [500, ['UNEXPECTED']], body.name);
    assert.deepEqual(logs.map((entry) => [entry.emailStep, entry.step, entry.error]), [[body === prepareBody ? 'prepare' : 'send', 'mailboxes', 'metadata unavailable']], body.name);
    assert.equal(w.db.writes.length, before, body.name);
  }
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
    assert.ok(!inputs.some((input) => /lifecycle\/(guards|numbering|totals|actions)\.ts$/.test(input)), 'the route bundles the guards, the numbering or the totals');

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

const sendBody = (w: Workspace, over: Record<string, unknown> = {}) => ({
  ...prepareBody(w), step: 'send', from: 'mailbox-studio', to: 'camille@calibre.example', cc: '',
  subject: 'Facture F2026-0001 de Verdal Studio', message: 'Bonjour Camille,\n\nVeuillez trouver ci-joint la facture F2026-0001.', ...over,
});
const sentState = (row: Row): unknown[] => [row.status, row.sentAt];

test('Send checks the message first and lists every problem; nothing is written or sent', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w, { to: 'Camille <camille@calibre.example>', cc: 'compta@calibre', subject: ' ', message: '' }), deps);
  assert.equal(outcome.status, 422);
  assert.ok(!outcome.body.ok);
  assert.deepEqual(outcome.body.problems.map((problem) => problem.message), [
    'Camille <camille@calibre.example> is not an email address.', 'compta@calibre is not an email address.', 'Write a subject.', 'Write a message.',
  ]);
  assert.deepEqual(problemCodes(await runEmail(sendBody(w, { to: '' }), deps)), ['MISSING_RECIPIENT']);
  assert.deepEqual([w.db.writes.length, sent.length], [before, 0]);
});

test('Send refuses as Prepare does when the document changed while the form was open', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  await w.app.update('billingInvoices', w.invoice.id, { status: 'CANCELLED' });
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 422);
  assert.deepEqual(problemCodes(outcome), ['NOT_SENDABLE']);
  assert.deepEqual([w.db.writes.length, sent.length], [before, 0]);
});

test('a document hidden from the caller, or one their role cannot read, is NOT_ALLOWED on Send, and nothing of it is revealed', async () => {
  const w = workspace();
  // Cancelled and with no PDF: were the caller's read skipped, Send would answer NOT_SENDABLE, and name the status.
  await issuedInvoice(w, { status: 'CANCELLED', pdf: [] });
  const callers = [w.db.store('MANUAL', { canRead: () => false }), { ...w.db.store('MANUAL'), get: async () => null }];
  for (const caller of callers) {
    const { deps, sent } = setup(w, { caller });
    const before = w.db.writes.length;
    const outcome = await runEmail(sendBody(w), deps);
    assert.equal(outcome.status, 403);
    assert.deepEqual(outcome.body, {
      ok: false, problems: [{ code: 'NOT_ALLOWED', message: 'Your role cannot edit this document, so it cannot run this action.' }],
    });
    assert.doesNotMatch(JSON.stringify(outcome.body), /NOT_SENDABLE|NO_PDF|cancel|F2026|camille/i);
    assert.deepEqual([sent, w.db.writes.length, w.db.timeline], [[], before, []], 'no email, no write, no timeline row');
  }
});

test('a mailbox no longer connected, or not the caller’s, is NO_MAILBOX: nothing is written or sent', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w, { from: 'mailbox-of-someone-else' }), deps);
  assert.equal(outcome.status, 422);
  assert.deepEqual(outcome.body, {
    ok: false,
    problems: [{ code: 'NO_MAILBOX', field: 'from', message: 'The mailbox chosen is no longer connected to Twenty: close this form and open it again.' }],
  });
  assert.deepEqual([w.db.writes.length, sent.length], [before, 0]);
});

test('a caller whose role cannot edit the document gets NOT_ALLOWED, and nothing is sent', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w, { caller: w.db.store('MANUAL', { canUpdate: () => false }) });
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 403);
  assert.deepEqual(problemCodes(outcome), ['NOT_ALLOWED']);
  assert.deepEqual([sent, w.db.writes.length, w.db.timeline], [[], before, []], 'no email, no write as the app, no timeline row');
  assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['ISSUED', null]);
});

test('an issued invoice goes from the chosen mailbox as the person: the recipients, the subject on one line, the message as HTML, its PDF', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w, {
    to: 'camille@calibre.example, ', cc: 'compta@calibre.example', subject: 'Facture F2026-0001\nde Verdal Studio', message: 'Bonjour <Camille>,\r\n\r\nCi-joint & merci.',
  }), deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  assert.deepEqual(outcome.body, { ok: true, message: 'Sent to camille@calibre.example.', marked: true });
  assert.deepEqual(sent, [{
    mailboxId: 'mailbox-studio', to: ['camille@calibre.example'], cc: ['compta@calibre.example'], subject: 'Facture F2026-0001 de Verdal Studio',
    html: '<p>Bonjour &lt;Camille&gt;,</p><p>Ci-joint &amp; merci.</p>', files: [{ id: 'file-pdf-1', name: 'F2026-0001.pdf' }],
  }]);
  assert.deepEqual(w.db.writes.slice(before).map((write) => [write.op, write.plural, write.source, write.data]), [
    ['update', 'billingInvoices', 'MANUAL', { sentAt: null }],
    ['update', 'billingInvoices', 'APPLICATION', { status: 'SENT', sentAt: '2026-09-26T09:30:00.000Z' }],
  ]);
  const after = w.db.row('billingInvoices', w.invoice.id)!;
  assert.deepEqual([...sentState(after), after.pdf], ['SENT', '2026-09-26T09:30:00.000Z', [PDF]]);
  assert.deepEqual(w.db.timeline.map((entry) => [entry.kind, entry.recordId, entry.text]), [
    ['SENT', w.invoice.id, 'E-mail envoyé depuis Bonjour@Verdal.example à camille@calibre.example, en copie à compta@calibre.example.'],
  ]);
});

test('a second send keeps the first send’s date, and leaves a second row', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps } = setup(w);
  assert.equal((await runEmail(sendBody(w), deps)).status, 200);
  const before = w.db.writes.length;
  const later = { ...deps, now: () => new Date('2026-09-27T08:00:00.000Z') };
  assert.equal((await runEmail(sendBody(w), later)).status, 200);
  assert.deepEqual(w.db.writes.slice(before).map((write) => write.source), ['MANUAL'], 'the caller’s write only: nothing left to mark');
  assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['SENT', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(w.db.timeline.map((entry) => entry.kind), ['SENT', 'SENT']);
});

test('a Paid invoice stays Paid, a Draft quote becomes Sent, an Accepted one stays Accepted, an issued credit note gets its date', async () => {
  const w = workspace();
  await issuedInvoice(w, { status: 'PAID', sentAt: '2026-09-01T08:00:00.000Z' });
  const { deps, sent } = setup(w);
  assert.equal((await runEmail(sendBody(w), deps)).status, 200);
  assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['PAID', '2026-09-01T08:00:00.000Z']);

  const draft = w.addQuote({ status: 'DRAFT', number: 'D2026-0004', version: 2, pdf: QUOTE_PDFS, total: money(600_000_000), personId: w.person.id });
  const accepted = w.addQuote({ status: 'ACCEPTED', number: 'D2026-0005', version: 1, pdf: [{ fileId: 'file-q5', label: 'D2026-0005 v1.pdf' }], total: money(600_000_000) });
  const note = w.addCreditNote({
    status: 'ISSUED', number: 'AV2026-0001', invoiceId: w.invoice.id, snapshot: { printed: {}, record: {} },
    pdf: [{ fileId: 'file-cn', label: 'AV2026-0001.pdf' }], total: money(1_440_000_000),
  });
  const documents = [['billingQuote', draft.id], ['billingQuote', accepted.id], ['billingCreditNote', note.id]] as const;
  for (const [object, recordId] of documents) {
    const outcome = await runEmail(sendBody(w, { object, recordId }), deps);
    assert.equal(outcome.status, 200, `${object}: ${JSON.stringify(outcome.body)}`);
  }
  assert.deepEqual(sentState(w.db.row('billingQuotes', draft.id)!), ['SENT', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(sentState(w.db.row('billingQuotes', accepted.id)!), ['ACCEPTED', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(sentState(w.db.row('billingCreditNotes', note.id)!), ['ISSUED', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(sent.map((email) => email.files), [
    [{ id: 'file-pdf-1', name: 'F2026-0001.pdf' }], [{ id: 'file-q2', name: 'D2026-0004 v2.pdf' }],
    [{ id: 'file-q5', name: 'D2026-0005 v1.pdf' }], [{ id: 'file-cn', name: 'AV2026-0001.pdf' }],
  ]);
});

test('a refused permission is EMAIL_NOT_ALLOWED, a refused email SEND_FAILED with Twenty’s reason, and neither marks the document', async () => {
  const cases = [
    [new EmailNotAllowedError('Forbidden resource'), 403, 'EMAIL_NOT_ALLOWED', /Settings → Roles, under your role, “Send email”/],
    [new SendFailedError('Invalid recipients: camille@calibre.example'), 502, 'SEND_FAILED', /^The email could not be sent: Invalid recipients: camille@calibre\.example$/],
  ] as const;
  for (const [error, status, code, message] of cases) {
    const w = workspace();
    await issuedInvoice(w);
    const { mailer } = fakeMailer({
      send: async () => {
        throw error;
      },
    });
    const outcome = await runEmail(sendBody(w), setup(w, { mailer }).deps);
    assert.equal(outcome.status, status, code);
    assert.ok(!outcome.body.ok);
    assert.deepEqual(outcome.body.problems.map((problem) => problem.code), [code]);
    assert.match(outcome.body.problems[0]!.message, message);
    assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['ISSUED', null], code);
    assert.deepEqual(w.db.timeline, [], code);
  }
});

test('a failure after the send is answered as sent, says the document is not marked, and is logged with its reference', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent, logs } = setup(w);
  w.db.failNext((op, plural, data) => op === 'update' && plural === 'billingInvoices' && data?.status === 'SENT');
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, {
    ok: true, message: 'Sent to camille@calibre.example, but the invoice could not be marked as sent (ref ref-7f3a).', marked: false,
  });
  assert.equal(sent.length, 1);
  // The layout runEmail's own log has: the request's step as `emailStep`, the stage that failed as `step`.
  assert.deepEqual(logs, [{
    reference: 'ref-7f3a', object: 'billingInvoice', recordId: w.invoice.id, emailStep: 'send', step: 'record', errorName: 'Error', error: 'injected failure',
  }]);
  assert.equal(w.db.row('billingInvoices', w.invoice.id)!.status, 'ISSUED');
});

test('a send that fails in transit may have gone: SEND_UNCONFIRMED says to check the Sent folder, in either language, and writes nothing as the app', async () => {
  const cases = [
    ['en', 'The email may have gone: check your Sent folder before trying again (ref ref-7f3a).'],
    ['fr-FR', 'L’e-mail est peut-être parti\u00a0: vérifiez vos éléments envoyés avant de réessayer (réf. ref-7f3a).'],
  ] as const;
  for (const [locale, message] of cases) {
    const w = workspace();
    await issuedInvoice(w);
    const { mailer, sent } = fakeMailer({
      send: async () => {
        throw new Error('socket hang up');
      },
    });
    const { deps, logs } = setup(w, { mailer });
    const before = w.db.writes.length;
    const outcome = await runEmail(sendBody(w, { locale }), deps);
    assert.equal(outcome.status, 500, locale);
    assert.deepEqual(outcome.body, { ok: false, problems: [{ code: 'SEND_UNCONFIRMED', message }] }, locale);
    assert.deepEqual(sent, [], locale);
    assert.deepEqual(w.db.writes.slice(before).map((write) => write.source), ['MANUAL'], `${locale}: the caller’s write only`);
    assert.deepEqual([sentState(w.db.row('billingInvoices', w.invoice.id)!), w.db.timeline], [['ISSUED', null], []], locale);
    assert.deepEqual(logs, [{
      reference: 'ref-7f3a', object: 'billingInvoice', recordId: w.invoice.id, emailStep: 'send', step: 'send', errorName: 'Error', error: 'socket hang up',
    }], locale);
    // A log that holds no address, subject or message.
    assert.doesNotMatch(JSON.stringify(logs), /camille|Bonjour|Facture/);
  }
});

test('a throw at the record step, after the email went, is “may have gone” as well: the form is never told “not sent”', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const logs: Record<string, unknown>[] = [];
  let thrown = false;
  // The record step’s own catch logs first: that log throws once, so the failure escapes it and reaches runEmail’s catch.
  const log = (entry: Record<string, unknown>): void => {
    if (!thrown) {
      thrown = true;
      throw new Error('the log is down');
    }
    logs.push(entry);
  };
  const { deps, sent } = setup(w, { log });
  w.db.failNext((op, plural, data) => op === 'update' && plural === 'billingInvoices' && data?.status === 'SENT');
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(thrown, true);
  assert.equal(outcome.status, 500);
  assert.deepEqual(outcome.body, {
    ok: false, problems: [{ code: 'SEND_UNCONFIRMED', message: 'The email may have gone: check your Sent folder before trying again (ref ref-7f3a).' }],
  });
  assert.equal(sent.length, 1, 'the email did go');
  assert.deepEqual(logs, [{
    reference: 'ref-7f3a', object: 'billingInvoice', recordId: w.invoice.id, emailStep: 'send', step: 'record', errorName: 'Error', error: 'the log is down',
  }]);
});

test('Twenty’s server error on the send is not “not sent”: the form is told the email may have gone, and the mailer’s own refusals stay SEND_FAILED', async () => {
  const serverError = Object.assign(new Error('Internal server error'), { errors: [{ message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
  const badInput = Object.assign(new Error('Invalid recipients'), { errors: [{ message: 'Invalid recipients', extensions: { code: 'BAD_USER_INPUT' } }] });
  const cases = [[serverError, 500, 'SEND_UNCONFIRMED'], [badInput, 502, 'SEND_FAILED']] as const;
  for (const [failure, status, code] of cases) {
    const w = workspace();
    await issuedInvoice(w);
    const mailer = metadataMailer({
      query: async () => ({ myConnectedAccounts: [{ id: 'mailbox-studio', handle: 'bonjour@verdal.example' }] }),
      mutation: async () => {
        throw failure;
      },
    });
    const outcome = await runEmail(sendBody(w), setup(w, { mailer }).deps);
    assert.deepEqual([outcome.status, problemCodes(outcome)], [status, [code]], code);
    assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['ISSUED', null], code);
  }
});

test('a caller with no mailbox gets NO_MAILBOX with no field: nothing is written or sent', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { mailer, sent } = fakeMailer({ accounts: [] });
  const { deps } = setup(w, { mailer });
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 422);
  assert.deepEqual(outcome.body, {
    ok: false,
    problems: [{ code: 'NO_MAILBOX', message: 'You have no mailbox connected to Twenty: connect yours in Settings → Accounts, then open this form again.' }],
  });
  assert.deepEqual([w.db.writes.length, w.db.timeline.length, sent.length], [before, 0, 0]);
});

test('a caller’s write that fails for another reason than the role is unexpected: nothing is sent, and the log names the step', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent, logs } = setup(w);
  const before = w.db.writes.length;
  w.db.failNext((op, plural) => op === 'update' && plural === 'billingInvoices', new Error('connection reset'));
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 500);
  assert.deepEqual(outcome.body, { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] });
  assert.deepEqual([sent, w.db.writes.length, w.db.timeline], [[], before, []]);
  assert.deepEqual(logs.map((entry) => [entry.emailStep, entry.step, entry.error]), [['send', 'caller', 'connection reset']]);
});

/** A mailer whose send first does `during`, as a person or an action does while the email is in flight, then succeeds. */
const mailerDoing = (during: () => Promise<unknown>) => fakeMailer({ send: async () => void (await during()) });

test('an invoice paid or cancelled while the email is in flight keeps its status: only the date is marked, and the answer is still marked', async () => {
  for (const moved of [{ status: 'PAID', paidAt: TODAY }, { status: 'CANCELLED' }]) {
    const w = workspace();
    await issuedInvoice(w);
    const { mailer, sent } = mailerDoing(() => w.app.update('billingInvoices', w.invoice.id, moved));
    const { deps, logs } = setup(w, { mailer });
    const outcome = await runEmail(sendBody(w), deps);
    assert.deepEqual(outcome.body, { ok: true, message: 'Sent to camille@calibre.example.', marked: true }, moved.status);
    assert.equal(sent.length, 1, moved.status);
    assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), [moved.status, '2026-09-26T09:30:00.000Z'], moved.status);
    assert.deepEqual(w.db.writes.at(-1)?.data, { sentAt: '2026-09-26T09:30:00.000Z' }, `${moved.status}: the app’s last write holds no status`);
    assert.deepEqual(w.db.timeline.map((entry) => entry.kind), ['SENT'], moved.status);
    assert.deepEqual(logs, [], moved.status);
  }
});

test('a quote accepted while the email is in flight stays Accepted, and gets its date', async () => {
  const w = workspace();
  const quote = w.addQuote({ status: 'DRAFT', number: 'D2026-0004', version: 2, pdf: QUOTE_PDFS, total: money(600_000_000), personId: w.person.id });
  const { mailer } = mailerDoing(() => w.app.update('billingQuotes', quote.id, { status: 'ACCEPTED', acceptedAt: TODAY }));
  const outcome = await runEmail(sendBody(w, { object: 'billingQuote', recordId: quote.id }), setup(w, { mailer }).deps);
  assert.deepEqual(outcome.body, { ok: true, message: 'Sent to camille@calibre.example.', marked: true });
  assert.deepEqual(sentState(w.db.row('billingQuotes', quote.id)!), ['ACCEPTED', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(w.db.timeline.map((entry) => entry.kind), ['SENT']);
});

test('a document deleted while the email is in flight is answered as sent but not marked, with a reference: nothing is written to it', async () => {
  // A store may hide the deleted row (null) or hand it back with `deletedAt` set: both mean it is gone.
  for (const hides of [true, false]) {
    const w = workspace();
    await issuedInvoice(w);
    const app = hides ? w.app : { ...w.app, get: (plural: string, id: string) => w.app.get(plural, id, { deleted: true }) };
    const { mailer, sent } = mailerDoing(() => w.app.softDelete('billingInvoices', w.invoice.id));
    const { deps, logs } = setup(w, { app, mailer });
    const before = w.db.writes.length;
    const outcome = await runEmail(sendBody(w), deps);
    assert.equal(outcome.status, 200, `hides: ${hides}`);
    assert.deepEqual(outcome.body, {
      ok: true, message: 'Sent to camille@calibre.example, but the invoice could not be marked as sent (ref ref-7f3a).', marked: false,
    }, `hides: ${hides}`);
    assert.equal(sent.length, 1, `hides: ${hides}`);
    assert.deepEqual(w.db.writes.slice(before).map((write) => [write.op, write.source]), [['update', 'MANUAL'], ['softDelete', 'APPLICATION']], 'nothing after the deletion');
    assert.deepEqual(w.db.timeline, []);
    assert.deepEqual(logs.map((entry) => [entry.reference, entry.emailStep, entry.step]), [['ref-7f3a', 'send', 'record']]);
  }
});

/** The recipient, the subject and the message the tests send: nothing of them may reach a log. */
const WRITTEN = { to: 'camille@calibre.example', subject: 'Facture F2026-0001 de Verdal Studio', message: 'Bonjour Camille, voici la facture du mois.' };
const NOT_LOGGED = /camille|calibre|Facture|Verdal|voici/i;

/** An error as Twenty’s clients throw it: the response body in the message, and the body itself with its codes. */
function echoingError(): Error {
  const echoed = `Invalid recipients ${WRITTEN.to} for “${WRITTEN.subject}”: ${WRITTEN.message}`;
  return Object.assign(new Error(`Bad Request: ${JSON.stringify({ errors: [{ message: echoed }] })}`.padEnd(400, '.')), {
    name: 'RestApiClientError', status: 502,
    body: { statusCode: 502, code: 'MAILBOX_UNAVAILABLE', subCode: 'SMTP_REJECTED', messages: [echoed], to: [WRITTEN.to], subject: WRITTEN.subject },
  });
}

test('an error that echoes the address, the subject and the message is logged without them, at every step', async () => {
  // The send step: the email may have gone.
  const w = workspace();
  await issuedInvoice(w);
  const { mailer } = fakeMailer({
    send: async () => {
      throw echoingError();
    },
  });
  const sending = setup(w, { mailer });
  assert.equal((await runEmail(sendBody(w, WRITTEN), sending.deps)).status, 500);
  // The record step: the email has gone, the document is not marked.
  const v = workspace();
  await issuedInvoice(v);
  const recording = setup(v);
  v.db.failNext((op, plural, data) => op === 'update' && plural === 'billingInvoices' && data?.status === 'SENT', echoingError());
  assert.equal((await runEmail(sendBody(v, WRITTEN), recording.deps)).status, 200);
  // The caller's write.
  const x = workspace();
  await issuedInvoice(x);
  const writing = setup(x);
  x.db.failNext((op, plural) => op === 'update' && plural === 'billingInvoices', echoingError());
  assert.equal((await runEmail(sendBody(x, WRITTEN), writing.deps)).status, 500);

  for (const [name, { logs }] of [['send', sending], ['record', recording], ['caller', writing]] as const) {
    assert.equal(logs.length, 1, name);
    assert.doesNotMatch(JSON.stringify(logs), NOT_LOGGED, name);
    assert.equal(logs[0]!.errorName, 'RestApiClientError', name);
    assert.deepEqual([logs[0]!.httpStatus, logs[0]!.code, logs[0]!.subCode], [502, 'MAILBOX_UNAVAILABLE', 'SMTP_REJECTED'], name);
    assert.ok(String(logs[0]!.error).length <= 200, name);
    assert.ok(!('body' in logs[0]!) && !('messages' in logs[0]!), `${name}: never a body`);
  }
});

/** The REST client of an app store whose every call fails with `failure`. */
const failingRest = (failure: Error): RestLike => ({
  get: async () => {
    throw failure;
  },
  post: async () => {
    throw failure;
  },
  patch: async () => {
    throw failure;
  },
  delete: async () => {
    throw failure;
  },
});

test('a timeline write that fails is logged through the scrubber: its message and body echo the address and the subject, and neither reaches the log', async () => {
  const echoed = `Invalid ${WRITTEN.to} for “${WRITTEN.subject}”: ${WRITTEN.message}`;
  // rest-store logs a body that carries `messages` as those messages, and any other body whole.
  const bodies = [
    { statusCode: 400, code: 'BAD_REQUEST', messages: [echoed] },
    { statusCode: 502, code: 'MAILBOX_UNAVAILABLE', subCode: 'SMTP_REJECTED', to: [WRITTEN.to], subject: WRITTEN.subject, message: WRITTEN.message },
  ];
  for (const body of bodies) {
    const w = workspace();
    await issuedInvoice(w);
    const logs: Record<string, unknown>[] = [];
    // What liveDeps does: the app store logs through the scrubber, and runEmail tells it what the person wrote.
    const written: string[] = [];
    const failure = Object.assign(new Error(`Request failed: ${JSON.stringify(body)}`), { name: 'RestApiClientError', status: body.statusCode, body });
    const { timeline } = restStore({
      rest: failingRest(failure),
      uploadFile: async () => ({ id: 'file-9' }),
      fetchFile: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
      timelineTypes: async () => [{ id: 'type-sent', universalIdentifier: 'uid-sent', isActive: true }],
      fieldId: (object, field) => `field:${object}.${field}`,
      timelineTypeIds: { ISSUED: 'uid-issued', CORRECTION: 'uid-fix', INVOICED: 'uid-invoiced', CREDITED: 'uid-credited', CANCELLED: 'uid-cancelled', SENT: 'uid-sent' },
      log: scrubbedLog((entry) => logs.push(entry), written),
    });
    const app: Store = { ...w.app, timeline };
    const outcome = await runEmail(sendBody(w, WRITTEN), setup(w, { app, written }).deps);
    // The timeline row is the one write that failed: the document is marked, and the answer says so.
    assert.deepEqual([outcome.status, outcome.body.ok && 'marked' in outcome.body && outcome.body.marked], [200, true], JSON.stringify(body));
    assert.equal(logs.length, 1, JSON.stringify(body));
    assert.deepEqual([logs[0]!.timeline, logs[0]!.kind, logs[0]!.object, logs[0]!.recordId], ['failed', 'SENT', 'billingInvoice', w.invoice.id]);
    assert.doesNotMatch(JSON.stringify(logs), NOT_LOGGED, JSON.stringify(body));
    assert.ok(String(logs[0]!.error).length <= 200);
    assert.ok(!('body' in logs[0]!) && !('messages' in logs[0]!), 'never a body');
    if (!('messages' in body)) assert.deepEqual([logs[0]!.httpStatus, logs[0]!.code, logs[0]!.subCode], [502, 'MAILBOX_UNAVAILABLE', 'SMTP_REJECTED']);
  }
});

test('the app store’s log lets an entry with no error through as it is, and scrubs every entry that carries one', () => {
  const out: Record<string, unknown>[] = [];
  const log = scrubbedLog((entry) => out.push(entry));
  log({ timeline: 'skipped', reason: 'the type is missing or muted', kind: 'SENT', object: 'billingInvoice', recordId: 'r1' });
  log({ download: 'failed', status: 404, fileId: 'f1' });
  log({ download: 'failed', fileId: 'f2', error: 'fetch failed for camille@calibre.example' });
  assert.deepEqual(out, [
    { timeline: 'skipped', reason: 'the type is missing or muted', kind: 'SENT', object: 'billingInvoice', recordId: 'r1' },
    { download: 'failed', status: 404, fileId: 'f1' },
    { download: 'failed', fileId: 'f2', errorName: 'Error', error: 'fetch failed for [address]' },
  ]);
});

test('a route whose dependencies cannot be built logs a scrubbed error, under the route’s name', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const w = workspace();
  const failing = (): EmailDeps => {
    throw new Error(`The mailbox of ${WRITTEN.to} could not be opened`);
  };
  const answer = await respond({ body: prepareBody(w), userWorkspaceId: 'uw-1' }, { workspaceMemberId: 'member-1' }, failing);
  assert.equal(answer.status, 500);
  assert.equal(logged.mock.callCount(), 1);
  const entry = JSON.parse(String(logged.mock.calls[0]!.arguments[0])) as Record<string, unknown>;
  assert.deepEqual([entry.route, entry.step, entry.errorName, entry.error], ['billing-email', 'setup', 'Error', 'The mailbox of [address] could not be opened']);
});

test('the scrubbed error keeps the name, a numeric status, the codes of a body or of GraphQL errors, and a message of 200 characters at most with each address replaced', () => {
  assert.deepEqual(scrubbed(new TypeError('fetch failed')), { errorName: 'TypeError', error: 'fetch failed' });
  assert.deepEqual(scrubbed('plain text'), { errorName: 'string', error: 'plain text' });
  assert.deepEqual(scrubbed(Object.assign(new Error('Forbidden'), { status: '403', body: { statusCode: 403, code: 'FORBIDDEN', subCode: 7 } })), {
    errorName: 'Error', httpStatus: 403, code: 'FORBIDDEN', error: 'Forbidden',
  });
  const graphql = Object.assign(new Error('x'), { errors: [{ message: 'm' }, { message: 'n', extensions: { code: 'BAD_USER_INPUT', subCode: 'INVALID_RECIPIENT' } }] });
  assert.deepEqual(scrubbed(graphql), { errorName: 'Error', code: 'BAD_USER_INPUT', subCode: 'INVALID_RECIPIENT', error: 'x' });
  // Whatever sticks to an address goes with it: a comma, brackets, quotes.
  assert.equal(scrubbed(new Error('Invalid: a@b.example, <c@d.example> and e@f')).error, 'Invalid: [address] [address] and [address]');
  assert.equal(String(scrubbed(new Error('x'.repeat(500))).error).length, 200);
  // What the person wrote is taken out first, when it is long enough to hide anything; a short text is left alone.
  assert.equal(scrubbed(new Error('Rejected: Hello there. Re: S'), ['Hello there.', 'S']).error, 'Rejected: [removed] Re: S');
});

test('what the person wrote is also taken out as JSON escapes it: a quote, a line break, inside a response body', () => {
  const subject = 'Facture "F2026-0001" de Verdal';
  const message = 'Bonjour Camille,\n\nVoici la facture du mois.';
  // As a Twenty client puts a body in its error’s message: the texts are JSON strings there, quotes and line breaks escaped.
  const body = JSON.stringify({ errors: [{ message: `Rejected ${subject}: ${message}` }] });
  assert.ok(body.includes('Facture \\"F2026-0001\\" de Verdal') && body.includes('Camille,\\n\\nVoici'), 'the fixture is escaped');
  const out = String(scrubbed(new Error(`Bad Request: ${body}`), [subject, message]).error);
  assert.doesNotMatch(out, /F2026|Verdal|Camille|Voici/);
  assert.match(out, /^Bad Request: \{"errors":\[\{"message":"Rejected \[removed\]: \[removed\]/);
  // The same text unescaped is still taken out.
  assert.equal(scrubbed(new Error(`Rejected ${subject}`), [subject]).error, 'Rejected [removed]');
});

test('the scrubber never throws: a message that is not a string, or an error that cannot be printed, is “[unprintable error]”', () => {
  const written = ['Facture F2026-0001'];
  const numeric = Object.assign(new Error('x'), { message: 42 });
  assert.equal(scrubbed(numeric, written).error, '[unprintable error]');
  assert.equal(scrubbed(numeric).error, '[unprintable error]');
  assert.equal(scrubbed({ toString: () => { throw new Error('no text'); } }, written).error, '[unprintable error]');
  assert.equal(scrubbed(Object.create(null), written).error, '[unprintable error]');
  const hostile = Object.defineProperty(new Error('x'), 'message', { get: () => { throw new Error('no message'); } });
  assert.equal(scrubbed(hostile, written).error, '[unprintable error]');
});
