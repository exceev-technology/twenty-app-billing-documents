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
