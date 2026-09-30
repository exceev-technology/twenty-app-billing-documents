import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runAction } from '../../lifecycle/actions.ts';
import { onDocumentEvent, onLineEvent, sameField, statusRuleBroken } from '../../lifecycle/guards.ts';
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
    await onDocumentEvent(w.app, INVOICE, { ...gone, name });
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
