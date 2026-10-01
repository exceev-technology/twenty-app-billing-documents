import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runAction } from '../../lifecycle/actions.ts';
import { onDocumentEvent, onLineEvent, sameField, stampsFor, statusRuleBroken } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { numberKeyOf } from '../../lifecycle/numbering.ts';
import type { Store } from '../../lifecycle/store.ts';
import { drain, type MemoryEvent } from './helpers/memory-store.ts';
import { dispatcher } from './helpers/triggers.ts';
import { TODAY, markdown, money, now, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const LINES = 'billingInvoiceLines';

const settle = (w: Workspace, store: Store = w.app) => drain(w.db, dispatcher(store));
const invoice = (w: Workspace, id = w.invoice.id) => w.db.row('billingInvoices', id)!;
const corrections = (w: Workspace) => w.db.timeline.filter((entry) => entry.kind === 'CORRECTION').map((entry) => entry.text);

/** Runs Issue on a document through the action, and answers as the route would. */
const issue = (w: Workspace, id = w.invoice.id, object = 'billingInvoice') =>
  runAction({ action: 'issue', object, recordId: id, localDate: TODAY, locale: 'en' }, {
    app: w.app, caller: w.db.store('MANUAL'), now, reference: () => 'ref', log: () => {},
    sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex'),
    render: async (input) => ({ bytes: new TextEncoder().encode(`%PDF ${input.number}`), pages: 1 }),
  });

/** Issues the fixture's invoice through the action, then lets its events settle. */
async function issued(w: Workspace, id = w.invoice.id, object = 'billingInvoice'): Promise<void> {
  const outcome = await issue(w, id, object);
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
  assert.equal(statusRuleBroken(INVOICE, 'SENT', 'DRAFT', numberedDraft), null, 'a numbered draft never issued may return to Draft');
  assert.equal(statusRuleBroken(credit, 'PAID', 'DRAFT', numberedDraft), null);
  assert.equal(statusRuleBroken(INVOICE, 'DRAFT', 'CANCELLED', draft), null);
  assert.equal(statusRuleBroken(INVOICE, 'CANCELLED', 'DRAFT', draft), null);
  assert.equal(statusRuleBroken(INVOICE, 'CANCELLED', 'PAID', done), 'UNCANCEL');
  assert.equal(statusRuleBroken(INVOICE, 'CANCELLED', 'ISSUED', done), 'UNCANCEL');
  assert.equal(statusRuleBroken(INVOICE, 'CANCELLED', 'SENT', numberedDraft), 'UNCANCEL');
  assert.equal(statusRuleBroken(INVOICE, 'CANCELLED', 'SENT', draft), 'NOT_ISSUED', 'an unnumbered draft a person cancelled may be revived, but not sent');
  assert.equal(statusRuleBroken(credit, 'CANCELLED', 'ISSUED', done), null, 'only an invoice is revived');
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
  assert.deepEqual(corrections(w), ['Cette facture est émise : la modification de Objet a été annulée. Corrigez-la par un avoir.']);
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
  assert.deepEqual(corrections(w), ['Une facture émise ne peut pas revenir au statut Brouillon. Le statut a été remis à Émise.']);
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

test('an invoice its credit notes cancelled stays Cancelled: a person’s move out of it is put back', async () => {
  const w = workspace();
  await issued(w);
  await w.app.update('billingInvoices', w.invoice.id, { status: 'CANCELLED' });
  await settle(w);
  await w.user.update('billingInvoices', w.invoice.id, { status: 'PAID' });
  await settle(w);
  assert.deepEqual([invoice(w).status, invoice(w).paidAt ?? null], ['CANCELLED', null]);
  assert.deepEqual(corrections(w), ['Cette facture est annulée par ses avoirs\u00a0: elle reste Annulée. Le statut a été remis à Annulée.']);
});

test('a numbered draft set to Sent is put back to Draft, and the next Issue gives it the number it holds', async () => {
  const w = workspace();
  w.db.failNext((op) => op === 'upload');
  assert.equal((await issue(w)).status, 500);
  await settle(w);
  assert.equal(invoice(w).number, 'F2026-0001');
  // Sent is put back, as an unissued invoice cannot be Sent; Draft is then where it already stands.
  for (const status of ['SENT', 'DRAFT']) {
    await w.user.update('billingInvoices', w.invoice.id, { status });
    await settle(w);
    assert.equal(invoice(w).status, 'DRAFT', status);
  }
  assert.deepEqual(corrections(w), ['Seule une facture émise peut être Envoyée ou Payée. Le statut a été remis à Brouillon.']);
  await issued(w);
  assert.deepEqual([invoice(w).status, invoice(w).number], ['ISSUED', 'F2026-0001']);
  assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1);
  assert.equal((invoice(w).pdf as unknown[]).length, 1);
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
  assert.deepEqual(corrections(w), ['Cette facture commence comme brouillon : son statut Payée a été remis à Brouillon.']);
});

test('a guard speaks the document’s language', async () => {
  const w = workspace();
  await w.app.update('billingInvoices', w.invoice.id, { language: 'EN' });
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { subject: 'Other' });
  await settle(w);
  assert.deepEqual(corrections(w), ['This invoice is issued: the change to Subject was put back. Correct it with a credit note.']);
});

test('a put-back message is worded in the document’s language as put back, not in the one a person set', async () => {
  const w = workspace();
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { language: 'EN' });
  await settle(w);
  assert.equal(invoice(w).language, 'FR');
  assert.deepEqual(corrections(w), ['Cette facture est émise\u00a0: la modification de Langue a été annulée. Corrigez-la par un avoir.']);
});

test('a retried event changes nothing', async () => {
  const w = workspace();
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { subject: 'Autre chose' });
  const seen = await settle(w);
  const writes = w.db.writes.length;
  const personal = seen.find((event) => event.plural === 'billingInvoices' && event.after?.subject === 'Autre chose')!;
  await onDocumentEvent(w.app, INVOICE, personal, now);
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

// The triggers run after each commit, but nothing says events arrive in order, or once.
// What follows hands events to the guards out of order and twice.

/** Hands events to the triggers in the order given, then lets what those wrote settle in the ordinary way. */
async function deliver(w: Workspace, events: readonly MemoryEvent[]): Promise<void> {
  const handle = dispatcher(w.app);
  for (const event of events) await handle(event);
  await settle(w);
}

/** What a person sees of the fixture's invoice and lines, apart from the stamps Twenty adds on every write. */
function picture(w: Workspace) {
  const document = invoice(w);
  return {
    document: [document.subject, document.status, document.issueDate, document.companyId, Boolean(document.deletedAt)],
    lines: w.db.rows(LINES).map((line) => [line.id, line.invoiceId, line.description, line.quantity, Boolean(line.deletedAt)]),
    corrections: corrections(w).sort(),
  };
}

/** An issued invoice that a person tampers with in every way at once; the events are left undelivered. */
async function tampered(w: Workspace): Promise<MemoryEvent[]> {
  const other = w.addInvoice();
  await issued(w);
  const [first, second, third] = w.lines;
  await w.user.update('billingInvoices', w.invoice.id, { subject: 'Autre chose', status: 'DRAFT' });
  await w.user.update(LINES, first!.id, { description: 'Changée' });
  await w.user.softDelete(LINES, second!.id);
  await w.user.update(LINES, third!.id, { invoiceId: other.id });
  await w.user.create(LINES, { invoiceId: w.invoice.id, description: 'Ajoutée', quantity: 1, unit: 'DAY', unitPrice: money(1_000_000), taxCodeId: w.vat20.id });
  await w.user.softDelete('billingInvoices', w.invoice.id);
  return w.db.takeEvents();
}

test('events delivered in reverse, then delivered again, leave an issued invoice as the ordered ones do', async () => {
  const ordered = workspace();
  await deliver(ordered, await tampered(ordered));
  const scrambled = workspace();
  const events = await tampered(scrambled);
  await deliver(scrambled, [...events].reverse());
  await deliver(scrambled, events);
  const writes = scrambled.db.writes.length;
  await deliver(scrambled, events);

  assert.equal(scrambled.db.writes.length, writes, 'a third delivery writes nothing');
  assert.deepEqual(picture(scrambled), picture(ordered));
  assert.deepEqual(picture(ordered).document, ['Identité visuelle', 'ISSUED', TODAY, ordered.company.id, false]);
});

test('a change made just before deleting an issued invoice is put back too, whatever the order the events come in', async () => {
  for (const reverse of [false, true]) {
    const w = workspace();
    await issued(w);
    await w.user.update('billingInvoices', w.invoice.id, { subject: 'Autre chose' });
    await w.user.softDelete('billingInvoices', w.invoice.id);
    const events = w.db.takeEvents();
    await deliver(w, reverse ? [...events].reverse() : events);
    assert.deepEqual([invoice(w).subject, invoice(w).deletedAt], ['Identité visuelle', null], reverse ? 'reversed' : 'in order');
    assert.equal(corrections(w).length, 2);
  }
});

test('a status move whose event comes twice is put back once', async () => {
  const w = workspace();
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { status: 'DRAFT' });
  const [move] = w.db.takeEvents();
  await deliver(w, [move!, move!, move!]);
  assert.equal(invoice(w).status, 'ISSUED');
  assert.equal(corrections(w).length, 1);
});

test('a creation whose event comes twice is set to Draft once', async () => {
  const w = workspace();
  await w.user.create('billingInvoices', { subject: 'Importée', status: 'PAID', issuerId: w.issuer.id, companyId: w.company.id, currencyCode: 'EUR' });
  const [creation] = w.db.takeEvents();
  await deliver(w, [creation!, creation!]);
  assert.equal(invoice(w, creation!.recordId).status, 'DRAFT');
  assert.equal(corrections(w).length, 1);
});

test('a deletion whose event comes twice, or after the restore, is restored once', async () => {
  const w = workspace();
  await issued(w);
  await w.user.softDelete('billingInvoices', w.invoice.id);
  const [deletion] = w.db.takeEvents();
  await deliver(w, [deletion!, deletion!]);
  assert.equal(invoice(w).deletedAt, null);
  await deliver(w, [deletion!]);
  assert.equal(invoice(w).deletedAt, null);
  assert.equal(corrections(w).length, 1);
});

test('a line moved into an issued invoice and on again before its event is handled is left where it went', async () => {
  const w = workspace();
  const [first, second] = [w.addInvoice(), w.addInvoice()];
  const wanderer = w.addLine(INVOICE, first.id, { description: 'Ailleurs' });
  await issued(w);
  await w.user.update(LINES, wanderer.id, { invoiceId: w.invoice.id });
  await w.user.update(LINES, wanderer.id, { invoiceId: second.id });
  await deliver(w, w.db.takeEvents().reverse());
  assert.equal(w.db.row(LINES, wanderer.id)!.invoiceId, second.id);
  assert.deepEqual(corrections(w), []);
  assert.deepEqual(invoice(w, second.id).total, money(120_000_000), 'the draft it reached follows its lines');
});

test('an event for a record that no longer exists changes nothing', async () => {
  const w = workspace();
  await settle(w);
  const writes = w.db.writes.length;
  const gone = { recordId: '00000000-0000-4000-8000-00000000ffff', before: null, after: null, updatedFields: [] };
  for (const name of ['created', 'updated', 'deleted', 'restored'] as const) {
    await onDocumentEvent(w.app, INVOICE, { ...gone, name }, now);
    await onLineEvent(w.app, INVOICE, { ...gone, name });
  }
  assert.equal(w.db.writes.length, writes);
  assert.deepEqual(corrections(w), []);
});

test('a quote is never worded with the rules of an invoice', async () => {
  const quote = KINDS.billingQuote;
  const statuses = ['DRAFT', 'ISSUED', 'SENT', 'PAID', 'CANCELLED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'INVOICED'];
  for (const from of statuses) for (const to of statuses) {
    for (const numbered of [false, true]) for (const issued of [false, true]) {
      const rule = statusRuleBroken(quote, from, to, { numbered, issued });
      assert.ok(rule === null || rule === 'INVOICED', `${from} to ${to}: ${rule}`);
    }
  }
  const w = workspace();
  const added = w.addQuote({ number: 'D2026-0001', numberKey: numberKeyOf(w.issuer.id, 'D2026-0001'), status: 'ACCEPTED' });
  await w.user.update('billingQuotes', added.id, { status: 'INVOICED' });
  await settle(w);
  assert.deepEqual(corrections(w), ['Un devis passe au statut Facturé quand il devient une facture. Le statut a été remis à Accepté.']);
});

const MOVED_BACK = 'Cette facture est émise : la ligne déplacée a été remise en place. Corrigez-la par un avoir.';

test('a line created on a draft and moved into an issued invoice before its creation is handled goes back to the draft', async () => {
  for (const reverse of [false, true]) {
    const w = workspace();
    const draft = w.addInvoice();
    await issued(w);
    const line = await w.user.create(LINES, { invoiceId: draft.id, description: 'Ailleurs', quantity: 1, unit: 'DAY', unitPrice: money(100_000_000), taxCodeId: w.vat20.id });
    await w.user.update(LINES, line.id, { invoiceId: w.invoice.id });
    const events = w.db.takeEvents();
    await deliver(w, reverse ? [...events].reverse() : events);
    const where = reverse ? 'reversed' : 'in order';
    assert.deepEqual([w.db.row(LINES, line.id)!.invoiceId, w.db.row(LINES, line.id)!.deletedAt], [draft.id, null], where);
    assert.deepEqual(corrections(w), [MOVED_BACK], where);
    assert.deepEqual(invoice(w, draft.id).total, money(120_000_000), `${where}: the draft follows its line`);
  }
});

test('a line moved into an issued invoice, then edited there, goes back to the draft whatever the order the events come in', async () => {
  for (const reverse of [true, false]) {
    const w = workspace();
    const draft = w.addInvoice();
    const wanderer = w.addLine(INVOICE, draft.id, { description: 'Ailleurs' });
    await issued(w);
    await w.user.update(LINES, wanderer.id, { invoiceId: w.invoice.id });
    await w.user.update(LINES, wanderer.id, { description: 'Modifiée' });
    const events = w.db.takeEvents();
    await deliver(w, reverse ? [...events].reverse() : events);
    const where = reverse ? 'reversed' : 'in order';
    assert.deepEqual([w.db.row(LINES, wanderer.id)!.invoiceId, w.db.row(LINES, wanderer.id)!.deletedAt], [draft.id, null], where);
    assert.deepEqual(corrections(w), [MOVED_BACK], where);
  }
});

test('an event that does not show a line arriving leaves a line the snapshot does not know alone', async () => {
  const w = workspace();
  await issued(w);
  // Put in place with no event: nothing says where it came from.
  const stray = w.addLine(INVOICE, w.invoice.id, { description: 'Inconnue' });
  await w.user.update(LINES, stray.id, { description: 'Modifiée' });
  await settle(w);
  assert.deepEqual([w.db.row(LINES, stray.id)!.invoiceId, w.db.row(LINES, stray.id)!.deletedAt], [w.invoice.id, null]);
  assert.deepEqual(corrections(w), []);
});

test('a line that the guard removed and a person restores is removed again', async () => {
  const w = workspace();
  await issued(w);
  const added = await w.user.create(LINES, { invoiceId: w.invoice.id, description: 'Ajoutée', quantity: 1, unit: 'DAY', unitPrice: money(1_000_000), taxCodeId: w.vat20.id });
  await settle(w);
  assert.ok(w.db.row(LINES, added.id)!.deletedAt);
  await w.user.restore(LINES, added.id);
  await settle(w);
  assert.ok(w.db.row(LINES, added.id)!.deletedAt);
  assert.equal(corrections(w).length, 2);
});

const ADDED_REMOVED = 'Cette facture est émise : la ligne ajoutée a été retirée. Corrigez-la par un avoir.';

/** The fixture's invoice issued, and a second one with one line, issued too. */
async function twoIssued(w: Workspace) {
  await issued(w);
  const second = w.addInvoice({ subject: 'Seconde' });
  w.addLine(INVOICE, second.id, { description: 'Autre prestation' });
  await issued(w, second.id);
  return second;
}

test('a line an issued invoice does not hold, moved into another issued invoice, is removed, not bounced between them', async () => {
  for (const reverse of [false, true]) {
    const w = workspace();
    const second = await twoIssued(w);
    const line = await w.user.create(LINES, { invoiceId: w.invoice.id, description: 'Glissée', quantity: 1, unit: 'DAY', unitPrice: money(1_000_000), taxCodeId: w.vat20.id });
    await w.user.update(LINES, line.id, { invoiceId: second.id });
    const events = w.db.takeEvents();
    await deliver(w, reverse ? [...events].reverse() : events);
    const where = reverse ? 'reversed' : 'in order';
    assert.ok(w.db.row(LINES, line.id)!.deletedAt, where);
    assert.deepEqual(corrections(w), [ADDED_REMOVED], where);
  }
});

test('a line moved into an issued invoice from a draft that was issued since is removed, not sent back', async () => {
  const w = workspace();
  const draft = w.addInvoice({ subject: 'Brouillon' });
  w.addLine(INVOICE, draft.id, { description: 'Autre prestation' });
  await issued(w);
  const line = await w.user.create(LINES, { invoiceId: draft.id, description: 'Glissée', quantity: 1, unit: 'DAY', unitPrice: money(1_000_000), taxCodeId: w.vat20.id });
  await w.user.update(LINES, line.id, { invoiceId: w.invoice.id });
  const events = w.db.takeEvents();
  await issued(w, draft.id);
  await deliver(w, events);
  assert.ok(w.db.row(LINES, line.id)!.deletedAt);
  assert.deepEqual(corrections(w), [ADDED_REMOVED]);
});

test('a line moved into an issued invoice from a deleted draft is removed, not sent back', async () => {
  const w = workspace();
  const draft = w.addInvoice({ subject: 'Brouillon' });
  const wanderer = w.addLine(INVOICE, draft.id, { description: 'Ailleurs' });
  await issued(w);
  await w.user.update(LINES, wanderer.id, { invoiceId: w.invoice.id });
  await w.user.softDelete('billingInvoices', draft.id);
  await deliver(w, w.db.takeEvents());
  assert.ok(w.db.row(LINES, wanderer.id)!.deletedAt);
  assert.deepEqual(corrections(w), [ADDED_REMOVED]);
});

test('a line an issued invoice holds, moved into another issued invoice, goes back to the one that holds it', async () => {
  const w = workspace();
  const second = await twoIssued(w);
  await w.user.update(LINES, w.lines[0]!.id, { invoiceId: second.id });
  await settle(w);
  assert.deepEqual([w.db.row(LINES, w.lines[0]!.id)!.invoiceId, w.db.row(LINES, w.lines[0]!.id)!.deletedAt], [w.invoice.id, null]);
  assert.ok(corrections(w).length > 0 && corrections(w).every((text) => text === MOVED_BACK), 'only ever moved back, never removed');
});

test('a line created with no invoice and moved into an issued one is removed once, only by the event that moves it', async () => {
  for (const reverse of [false, true]) {
    const w = workspace();
    await issued(w);
    const line = await w.user.create(LINES, { invoiceId: null, description: 'Libre', quantity: 1, unit: 'DAY', unitPrice: money(1_000_000), taxCodeId: w.vat20.id });
    await w.user.update(LINES, line.id, { invoiceId: w.invoice.id });
    const [creation, move] = w.db.takeEvents();
    const where = reverse ? 'reversed' : 'in order';
    if (reverse) await deliver(w, [move!]);
    else {
      await deliver(w, [creation!]);
      assert.deepEqual([w.db.row(LINES, line.id)!.invoiceId, w.db.row(LINES, line.id)!.deletedAt], [w.invoice.id, null], 'its creation names no invoice: it says nothing');
      assert.deepEqual(corrections(w), []);
      await deliver(w, [move!]);
    }
    assert.ok(w.db.row(LINES, line.id)!.deletedAt, where);
    await deliver(w, [creation!, move!]);
    assert.deepEqual(corrections(w), [ADDED_REMOVED], where);
  }
});

test('an invoice is Sent or Paid only once issued, and a quote leaves Invoiced only while it has no invoice', () => {
  const quote = KINDS.billingQuote;
  const draft = { numbered: false, issued: false };
  const done = { numbered: true, issued: true };
  for (const to of ['SENT', 'PAID']) {
    assert.equal(statusRuleBroken(INVOICE, 'DRAFT', to, draft), 'NOT_ISSUED', to);
    assert.equal(statusRuleBroken(INVOICE, 'DRAFT', to, { numbered: true, issued: false }), 'NOT_ISSUED', to);
    assert.equal(statusRuleBroken(INVOICE, 'ISSUED', to, done), null, to);
  }
  assert.equal(statusRuleBroken(quote, 'INVOICED', 'ACCEPTED', { ...draft, invoiced: true }), 'UNINVOICE');
  assert.equal(statusRuleBroken(quote, 'INVOICED', 'ACCEPTED', { ...draft, invoiced: false }), null);
});

test('a person’s move stamps the empty dates, and leaving Paid empties the paid date', () => {
  const at = now();
  const issuedRow = { id: 'i', sentAt: null, paidAt: null };
  assert.deepEqual(stampsFor(INVOICE, 'ISSUED', 'SENT', issuedRow, at), { sentAt: '2026-09-26T09:30:00.000Z' });
  assert.deepEqual(stampsFor(INVOICE, 'SENT', 'PAID', issuedRow, at), { paidAt: TODAY });
  assert.deepEqual(stampsFor(INVOICE, 'SENT', 'PAID', { ...issuedRow, paidAt: '2026-09-20' }, at), {});
  assert.deepEqual(stampsFor(INVOICE, 'PAID', 'SENT', { ...issuedRow, sentAt: 'x', paidAt: '2026-09-20' }, at), { paidAt: null });
  assert.deepEqual(stampsFor(INVOICE, 'PAID', 'CANCELLED', { ...issuedRow, paidAt: '2026-09-20' }, at), {});
  assert.deepEqual(stampsFor(KINDS.billingQuote, 'DRAFT', 'SENT', { id: 'q', sentAt: null }, at), { sentAt: '2026-09-26T09:30:00.000Z' });
  assert.deepEqual(stampsFor(KINDS.billingQuote, 'SENT', 'ACCEPTED', { id: 'q', acceptedAt: null }, at), { acceptedAt: TODAY });
  assert.deepEqual(stampsFor(KINDS.billingCreditNote, 'DRAFT', 'ISSUED', { id: 'c' }, at), {});
});

test('a draft invoice set to Paid is put back, with a message in the invoice’s language', async () => {
  const w = workspace();
  await w.user.update('billingInvoices', w.invoice.id, { status: 'PAID' });
  await settle(w);
  assert.equal(invoice(w).status, 'DRAFT');
  assert.equal(invoice(w).paidAt ?? null, null, 'a move that is put back stamps nothing');
  assert.deepEqual(corrections(w), ['Seule une facture émise peut être Envoyée ou Payée. Le statut a été remis à Brouillon.']);
});

test('on an issued invoice, Sent and Paid stamp their dates as the app, and Paid undone empties its date', async () => {
  const w = workspace();
  await issued(w);
  await w.user.update('billingInvoices', w.invoice.id, { status: 'SENT' });
  await settle(w);
  assert.equal(invoice(w).sentAt, '2026-09-26T09:30:00.000Z');
  await w.user.update('billingInvoices', w.invoice.id, { status: 'PAID' });
  await settle(w);
  assert.deepEqual([invoice(w).status, invoice(w).paidAt], ['PAID', TODAY]);
  await w.user.update('billingInvoices', w.invoice.id, { status: 'SENT' });
  await settle(w);
  assert.deepEqual([invoice(w).status, invoice(w).paidAt, invoice(w).sentAt], ['SENT', null, '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(corrections(w), []);
});

test('an app move stamps nothing', async () => {
  const w = workspace();
  await issued(w);
  await w.app.update('billingInvoices', w.invoice.id, { status: 'PAID' });
  await settle(w);
  assert.equal(invoice(w).paidAt ?? null, null);
});

/** A quote invoiced through the action, its events settled. */
async function invoicedQuote(w: Workspace) {
  const quote = w.addQuote({ status: 'ACCEPTED' });
  w.addLine(KINDS.billingQuote, quote.id);
  const outcome = await runAction({ action: 'invoiceQuote', object: 'billingQuote', recordId: quote.id, localDate: TODAY, locale: 'en' }, {
    app: w.app, caller: w.db.store('MANUAL'), now, reference: () => 'ref', log: () => {}, sha256: async () => 'x',
  });
  assert.ok(outcome.body.ok, JSON.stringify(outcome.body));
  await settle(w);
  return { quote, invoiceId: outcome.body.created!.recordId };
}

const quoteRow = (w: Workspace, id: string) => w.db.row('billingQuotes', id)!;

test('a quote stays Invoiced while its invoice lives: a person’s move away is put back', async () => {
  const w = workspace();
  const { quote } = await invoicedQuote(w);
  await w.user.update('billingQuotes', quote.id, { status: 'ACCEPTED' });
  await settle(w);
  assert.equal(quoteRow(w, quote.id).status, 'INVOICED');
  assert.match(corrections(w).at(-1)!, /^Ce devis a une facture et reste Facturé/);
});

test('deleting the draft invoice reopens its quote; restoring it invoices the quote again', async () => {
  const w = workspace();
  const { quote, invoiceId } = await invoicedQuote(w);
  await w.user.softDelete('billingInvoices', invoiceId);
  await settle(w);
  assert.equal(quoteRow(w, quote.id).status, 'ACCEPTED');
  await w.user.update('billingQuotes', quote.id, { status: 'SENT' });
  await settle(w);
  assert.equal(quoteRow(w, quote.id).status, 'SENT', 'free again');
  await w.user.restore('billingInvoices', invoiceId);
  await settle(w);
  assert.equal(quoteRow(w, quote.id).status, 'INVOICED');
  assert.deepEqual(w.db.timeline.filter((entry) => entry.recordId === quote.id).map((entry) => entry.kind), ['INVOICED', 'CORRECTION', 'INVOICED']);
});

test('a quote with another live invoice stays Invoiced when one of them is deleted', async () => {
  const w = workspace();
  const { quote, invoiceId } = await invoicedQuote(w);
  w.addInvoice({ quoteId: quote.id });
  await w.user.softDelete('billingInvoices', invoiceId);
  await settle(w);
  assert.equal(quoteRow(w, quote.id).status, 'INVOICED');
});

test('events that come out of order leave a quote Accepted while its only invoice is deleted', async () => {
  const w = workspace();
  const { quote, invoiceId } = await invoicedQuote(w);
  await w.user.softDelete('billingInvoices', invoiceId);
  await w.user.restore('billingInvoices', invoiceId);
  await w.user.softDelete('billingInvoices', invoiceId);
  const [deleted, restored, deletedAgain] = w.db.takeEvents();
  assert.deepEqual([deleted?.name, restored?.name, deletedAgain?.name], ['deleted', 'restored', 'deleted']);
  // The handler reads the invoice as it stands, deleted: the restore's late event must not invoice the quote again.
  await deliver(w, [deleted!, deletedAgain!, restored!]);
  assert.equal(quoteRow(w, quote.id).status, 'ACCEPTED');
  assert.deepEqual(w.db.timeline.filter((entry) => entry.recordId === quote.id).map((entry) => entry.kind), ['INVOICED', 'CORRECTION']);
});

test('a numbered invoice made from a quote, deleted by a person and restored by the guard, leaves the quote Invoiced and silent', async () => {
  const w = workspace();
  const { quote, invoiceId } = await invoicedQuote(w);
  await w.app.update('billingInvoices', invoiceId, { number: 'F2026-0002', numberKey: numberKeyOf(w.issuer.id, 'F2026-0002') });
  await settle(w);
  await w.user.softDelete('billingInvoices', invoiceId);
  await settle(w);
  assert.equal(invoice(w, invoiceId).deletedAt, null, 'the guard restored it');
  assert.equal(quoteRow(w, quote.id).status, 'INVOICED');
  assert.deepEqual(w.db.timeline.filter((entry) => entry.recordId === quote.id).map((entry) => entry.kind), ['INVOICED']);
});

test('a person moving a quote to Sent or Accepted stamps the dates', async () => {
  const w = workspace();
  const quote = w.addQuote();
  await w.user.update('billingQuotes', quote.id, { status: 'SENT' });
  await settle(w);
  assert.equal(quoteRow(w, quote.id).sentAt, '2026-09-26T09:30:00.000Z');
  await w.user.update('billingQuotes', quote.id, { status: 'ACCEPTED' });
  await settle(w);
  assert.equal(quoteRow(w, quote.id).acceptedAt, TODAY);
});
