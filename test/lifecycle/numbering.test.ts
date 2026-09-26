import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineError } from '../../engine/index.ts';
import { LifecycleError } from '../../lifecycle/lang/pack.ts';
import { KINDS } from '../../lifecycle/load.ts';
import {
  claimNumber, ensureLedger, latestIssueDate, nextNumber, numberKeyOf, raiseLedger, scopeHasNumbers, scopeKeyOf,
  scopeOf, type ClaimInput,
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

// periodBounds and sequenceOf now live in the Engine (test/engine/numbering.test.ts):
// this file exercises them only through Lifecycle's own functions.

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

test('after fifty refusals the claim stops with LEDGER_BEHIND, naming the issuer, the type and the period, and holds no number', async () => {
  const w = workspace();
  for (let n = 1; n <= 50; n++) numbered(w, `F2026-${String(n).padStart(4, '0')}`);
  await assert.rejects(claim(w, w.invoice.id), (error: unknown) => {
    assert.ok(error instanceof LifecycleError);
    assert.deepEqual(error.problems, [{ code: 'LEDGER_BEHIND', value: `${w.issuer.name}, 2026`, documentType: 'INVOICE' }]);
    return true;
  });
  assert.equal(w.db.row('billingInvoices', w.invoice.id)?.number, '');
});

test('LEDGER_BEHIND falls back to the issuer’s id when it has no name', async () => {
  const w = workspace();
  const other = w.db.seed('billingIssuers', { profileId: w.profile.id });
  const theirs = w.addInvoice({ issuerId: other.id });
  for (let n = 1; n <= 50; n++) w.addInvoice({ issuerId: other.id, number: `F2026-${String(n).padStart(4, '0')}`, numberKey: numberKeyOf(other.id, `F2026-${String(n).padStart(4, '0')}`), issueDate: TODAY });
  await assert.rejects(claim(w, theirs.id, { issuerId: other.id }), (error: unknown) => {
    assert.ok(error instanceof LifecycleError);
    assert.deepEqual(error.problems, [{ code: 'LEDGER_BEHIND', value: `${other.id}, 2026`, documentType: 'INVOICE' }]);
    return true;
  });
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

test('two drafts claimed while a deleted, keyed ledger row blocks a scope with no numbers still converge on consecutive numbers', async () => {
  for (const order of [['A', 'B'], ['B', 'A'], ['A', 'A', 'B'], ['B', 'B', 'A'], ['A', 'B', 'B', 'A']]) {
    const w = workspace();
    const old = w.db.seed('billingSequences', { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 99, scopeKey: scopeKeyOf(scope2026(w)) });
    await w.app.softDelete('billingSequences', old.id);
    const second = w.addInvoice();
    const lock = lockstep(w.db);
    const both = Promise.all([claim(w, w.invoice.id, {}, lock.flow('A')), claim(w, second.id, {}, lock.flow('B'))]);
    for (let round = 0; round < 12; round++) for (const name of order) await lock.step(name);
    await lock.finish();
    const numbers = (await both).map((result) => result.number).sort();
    assert.deepEqual(numbers, ['F2026-0001', 'F2026-0002'], order.join(''));
    const live = w.db.rows('billingSequences').filter((row) => !row.deletedAt);
    assert.equal(live.length, 1, order.join(''));
    assert.equal(live[0]?.scopeKey, scopeKeyOf(scope2026(w)), order.join(''));
    assert.equal(live[0]?.lastValue, 2, order.join(''));
    assert.ok(w.db.row('billingSequences', old.id)?.deletedAt, order.join(''));
    assert.equal(w.db.row('billingSequences', old.id)?.scopeKey, null, order.join(''));
  }
});

test('the same draft claimed twice, while a deleted, keyed ledger row blocks a scope with no numbers, still converges on one number', async () => {
  for (const order of [['A', 'B'], ['B', 'A'], ['A', 'A', 'B'], ['B', 'B', 'A'], ['A', 'B', 'B', 'A']]) {
    const w = workspace();
    const old = w.db.seed('billingSequences', { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 99, scopeKey: scopeKeyOf(scope2026(w)) });
    await w.app.softDelete('billingSequences', old.id);
    const lock = lockstep(w.db);
    const both = Promise.all([claim(w, w.invoice.id, {}, lock.flow('A')), claim(w, w.invoice.id, {}, lock.flow('B'))]);
    for (let round = 0; round < 12; round++) for (const name of order) await lock.step(name);
    await lock.finish();
    const [a, b] = await both;
    assert.equal(a.number, 'F2026-0001', order.join(''));
    assert.equal(b.number, 'F2026-0001', order.join(''));
    const live = w.db.rows('billingSequences').filter((row) => !row.deletedAt);
    assert.equal(live.length, 1, order.join(''));
    assert.equal(live[0]?.lastValue, 1, order.join(''));
  }
});

test('a ledger row deleted after its scope has given out numbers is restored, keeping its key and lastValue', async () => {
  const w = workspace();
  for (let n = 1; n <= 60; n++) numbered(w, `F2026-${String(n).padStart(4, '0')}`);
  const ledger = w.db.seed('billingSequences', { issuerId: w.issuer.id, documentType: 'INVOICE', periodKey: '2026', lastValue: 60, scopeKey: scopeKeyOf(scope2026(w)) });
  await w.app.softDelete('billingSequences', ledger.id);
  assert.equal((await claim(w, w.invoice.id)).number, 'F2026-0061');
  const live = w.db.row('billingSequences', ledger.id);
  assert.ok(live && !live.deletedAt);
  assert.equal(live?.scopeKey, scopeKeyOf(scope2026(w)));
  assert.equal(live?.lastValue, 61);
  assert.equal(w.db.rows('billingSequences').filter((row) => !row.deletedAt).length, 1);
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

test('a pattern refused only because it would repeat numbers under its reset still stops before anything is written', async () => {
  const w = workspace();
  await assert.rejects(claim(w, w.invoice.id, { pattern: 'F-{SEQ:4}', reset: 'YEARLY' }), EngineError);
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
  assert.equal(await latestIssueDate(w.app, scope2026(w), self.id), '2026-05-01');
  assert.equal(await latestIssueDate(w.app, scope2026(w), 'none'), '2026-06-01');
  assert.equal(await latestIssueDate(w.app, { ...scope2026(w), periodKey: '2024' }, 'none'), null);
});

test('in a scope that never resets, a numbered document with no issue date is never the latest, and does not hide the one that has one', async () => {
  const w = workspace();
  const scope = scopeOf(INVOICE, w.issuer.id, 'NEVER', TODAY);
  const dated = numbered(w, 'F-0001', { issueDate: '2026-01-01' });
  numbered(w, 'F-0002', { issueDate: null });
  assert.equal(await latestIssueDate(w.app, scope, dated.id), null);
  assert.equal(await latestIssueDate(w.app, scope, 'none'), '2026-01-01');
  assert.equal(await scopeHasNumbers(w.app, scope), true);
});

test('a claim in a scope that resets monthly numbers within the month, and the date rules see only that month', async () => {
  const w = workspace();
  const pattern = 'F{YYYY}{MM}-{SEQ:3}';
  const scope = scopeOf(INVOICE, w.issuer.id, 'MONTHLY', TODAY);
  assert.equal(scope.periodKey, '2026-09');
  // claimNumber only sets number and numberKey: the document must already carry
  // the issue date the date rules (scopeHasNumbers, latestIssueDate) read.
  const first = w.addInvoice({ issueDate: TODAY });
  assert.equal(await scopeHasNumbers(w.app, scope), false);
  assert.equal((await claim(w, first.id, { pattern, reset: 'MONTHLY' })).number, 'F202609-001');
  assert.equal(await scopeHasNumbers(w.app, scope), true);
  assert.equal(await latestIssueDate(w.app, scope, first.id), null);
  const second = w.addInvoice({ issueDate: TODAY });
  assert.equal((await claim(w, second.id, { pattern, reset: 'MONTHLY' })).number, 'F202609-002');
  assert.equal(await latestIssueDate(w.app, scope, second.id), TODAY);
});

test('a claim in a scope that never resets shares one sequence across every period', async () => {
  const w = workspace();
  const pattern = 'F-{SEQ:3}';
  const scope = scopeOf(INVOICE, w.issuer.id, 'NEVER', TODAY);
  assert.equal(scope.periodKey, 'ALL');
  const first = w.addInvoice({ issueDate: TODAY });
  assert.equal(await scopeHasNumbers(w.app, scope), false);
  assert.equal((await claim(w, first.id, { pattern, reset: 'NEVER' })).number, 'F-001');
  assert.equal(await scopeHasNumbers(w.app, scope), true);
  assert.equal(await latestIssueDate(w.app, scope, first.id), null);
  const nextYear = w.addInvoice({ issueDate: '2027-01-05' });
  assert.equal((await claim(w, nextYear.id, { pattern, reset: 'NEVER', issueDate: '2027-01-05' })).number, 'F-002');
  assert.equal(await latestIssueDate(w.app, scope, nextYear.id), TODAY);
  assert.equal(await latestIssueDate(w.app, scope, 'none'), '2027-01-05');
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
