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

test('a message that cannot be written never undoes the correction it explains', async () => {
  const w = workspace();
  const row = keyed(w);
  numbered(w);
  w.db.failNext((op, plural) => op === 'timeline' && plural === 'billingSequence');
  await w.user.softDelete(LEDGER, row.id);
  await settle(w);
  assert.equal(w.db.row(LEDGER, row.id)?.deletedAt, null);
  assert.deepEqual(w.db.timeline, []);
});
