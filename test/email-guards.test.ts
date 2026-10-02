import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runAction, type ActionDeps } from '../lifecycle/actions.ts';
import { runEmail, type EmailDeps } from '../src/logic-functions/billing-email.ts';
import { drain } from './lifecycle/helpers/memory-store.ts';
import { dispatcher } from './lifecycle/helpers/triggers.ts';
import { KINDS } from '../lifecycle/load.ts';
import { TODAY, money, now, workspace, type Workspace } from './lifecycle/helpers/fixtures.ts';

/**
 * A send writes to documents the earlier sub-projects guard: 4a's status rules and locks on an issued
 * document, 4b's flows. Every database event it records goes through the triggers (as the platform hands
 * them), and none may answer it: no put-back, no correction row, no restored status.
 */

const SENT_AT = '2026-09-26T09:30:00.000Z';
const MAILBOXES = [{ id: 'mailbox-studio', handle: 'bonjour@verdal.example' }];
const QUOTE_PDF = [{ fileId: 'file-q2', label: 'D2026-0004 v2.pdf' }, { fileId: 'file-q1', label: 'D2026-0004 v1.pdf' }];

/** Issue as the button runs it: the number, the lock, the PDF. Its own events are settled before the send. */
async function issue(w: Workspace, object: string, recordId: string): Promise<void> {
  const deps: ActionDeps = {
    app: w.app, caller: w.db.store('MANUAL'), now, reference: () => 'ref', log: () => {},
    sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex'),
    render: async (input) => ({ bytes: new TextEncoder().encode(`%PDF ${input.number}`), pages: 1 }),
  };
  const outcome = await runAction({ action: 'issue', object, recordId, localDate: TODAY, locale: 'en' }, deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  await drain(w.db, dispatcher(w.app));
}

/** A document, ready to send, and what it must be after the send. */
type Case = {
  title: string;
  plural: string;
  object: string;
  make: (w: Workspace) => Promise<string>;
  /** What the send's own write to the app holds, after the caller's: the status only when the send moves it. */
  marked: Record<string, unknown>;
  status: string;
};

const CASES: Case[] = [
  {
    title: 'an issued invoice',
    plural: 'billingInvoices', object: 'billingInvoice',
    make: async (w) => {
      await issue(w, 'billingInvoice', w.invoice.id);
      return w.invoice.id;
    },
    marked: { status: 'SENT', sentAt: SENT_AT }, status: 'SENT',
  },
  {
    title: 'an issued credit note',
    plural: 'billingCreditNotes', object: 'billingCreditNote',
    make: async (w) => {
      await issue(w, 'billingInvoice', w.invoice.id);
      const note = w.addCreditNote({ invoiceId: w.invoice.id, issueDate: TODAY });
      w.addLine(KINDS.billingCreditNote, note.id);
      await issue(w, 'billingCreditNote', note.id);
      return note.id;
    },
    marked: { sentAt: SENT_AT }, status: 'ISSUED',
  },
  {
    title: 'a draft quote',
    plural: 'billingQuotes', object: 'billingQuote',
    make: async (w) => w.addQuote({ status: 'DRAFT', number: 'D2026-0004', version: 2, pdf: QUOTE_PDF, total: money(600_000_000), personId: w.person.id }).id,
    marked: { status: 'SENT', sentAt: SENT_AT }, status: 'SENT',
  },
  {
    title: 'an accepted quote',
    plural: 'billingQuotes', object: 'billingQuote',
    make: async (w) => w.addQuote({ status: 'ACCEPTED', acceptedAt: TODAY, number: 'D2026-0004', version: 2, pdf: QUOTE_PDF, total: money(600_000_000), personId: w.person.id }).id,
    marked: { sentAt: SENT_AT }, status: 'ACCEPTED',
  },
];

for (const scenario of CASES) {
  test(`after a send, ${scenario.title} is left as it is by the guards and the locks: marked ${scenario.status}, with its date, and nothing put back`, async () => {
    const w = workspace();
    const recordId = await scenario.make(w);
    const sent: unknown[] = [];
    const deps: EmailDeps = {
      app: w.app, caller: w.db.store('MANUAL'), now, reference: () => 'ref', log: (entry) => assert.fail(`unexpected log: ${JSON.stringify(entry)}`),
      mailer: { accounts: async () => MAILBOXES, send: async (email) => void sent.push(email) },
    };
    const writesBefore = w.db.writes.length;
    const timelineBefore = w.db.timeline.length;

    const outcome = await runEmail({
      step: 'send', object: scenario.object, recordId, localDate: TODAY, locale: 'en', from: 'mailbox-studio', to: 'camille@calibre.example', cc: '',
      subject: 'Your document', message: 'Please find it attached.',
    }, deps);
    assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
    assert.equal(sent.length, 1);

    // Every event the send recorded goes through the seven triggers, until nothing answers.
    const events = await drain(w.db, dispatcher(w.app));
    // The caller's rewrite of a value already there changes nothing when the same person wrote it last: no event for it, as in Twenty.
    assert.ok(events.length >= 1, 'the send’s marking was recorded');
    assert.ok(events.every((event) => event.plural === scenario.plural), 'only the document was written');

    const row = w.db.row(scenario.plural, recordId)!;
    assert.deepEqual([row.status, row.sentAt], [scenario.status, SENT_AT]);
    // The caller's rewrite as it is, the app's marking, and not one write more: no restore, no put-back.
    assert.deepEqual(w.db.writes.slice(writesBefore).map((write) => [write.op, write.plural, write.source, write.data]), [
      ['update', scenario.plural, 'MANUAL', { sentAt: null }],
      ['update', scenario.plural, 'APPLICATION', scenario.marked],
    ]);
    assert.deepEqual(w.db.timeline.slice(timelineBefore).map((entry) => entry.kind), ['SENT']);
    assert.equal(w.db.timeline.filter((entry) => entry.kind === 'CORRECTION').length, 0, 'no correction row, ever');
  });
}
