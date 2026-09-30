import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import guardInvoice from '../src/logic-functions/guard-invoice.ts';
import guardCreditNote from '../src/logic-functions/guard-credit-note.ts';
import guardQuote from '../src/logic-functions/guard-quote.ts';
import guardInvoiceLine from '../src/logic-functions/guard-invoice-line.ts';
import guardCreditNoteLine from '../src/logic-functions/guard-credit-note-line.ts';
import guardQuoteLine from '../src/logic-functions/guard-quote-line.ts';
import guardSequence from '../src/logic-functions/guard-sequence.ts';
import { isTransient, runTrigger, toRecordEvent } from '../src/lib/trigger.ts';
import type { RecordEvent, Store } from '../lifecycle/store.ts';
import { bundleLogicFunction } from './helpers/logic-function-build.ts';

const SRC = fileURLToPath(new URL('../src/logic-functions/', import.meta.url));

const TRIGGERS = [
  [guardInvoice, 'guard-invoice', 'billingInvoice.*'],
  [guardCreditNote, 'guard-credit-note', 'billingCreditNote.*'],
  [guardQuote, 'guard-quote', 'billingQuote.*'],
  [guardInvoiceLine, 'guard-invoice-line', 'billingInvoiceLine.*'],
  [guardCreditNoteLine, 'guard-credit-note-line', 'billingCreditNoteLine.*'],
  [guardQuoteLine, 'guard-quote-line', 'billingQuoteLine.*'],
  [guardSequence, 'guard-sequence', 'billingSequence.*'],
] as const;

const restError = (status: number) => Object.assign(new Error(`status ${status}`), { name: 'RestApiClientError', status });

test('the seven triggers validate, each on every event of its object, within thirty seconds', () => {
  for (const [fn, name, eventName] of TRIGGERS) {
    assert.equal(fn.success, true, `${name}: ${fn.errors.join('; ')}`);
    assert.equal(fn.config.name, name);
    assert.deepEqual(fn.config.databaseEventTriggerSettings, { eventName });
    assert.equal(fn.config.timeoutSeconds, 30);
  }
  assert.equal(new Set(TRIGGERS.map(([fn]) => fn.config.universalIdentifier)).size, 7);
});

test('a Twenty event becomes Lifecycle’s event', () => {
  assert.deepEqual(
    toRecordEvent({ name: 'billingInvoice.updated', recordId: 'r1', workspaceId: 'w', properties: { before: { id: 'r1', subject: 'a' }, after: { id: 'r1', subject: 'b' }, updatedFields: ['subject'], diff: {} } }),
    { name: 'updated', recordId: 'r1', before: { id: 'r1', subject: 'a' }, after: { id: 'r1', subject: 'b' }, updatedFields: ['subject'] },
  );
  assert.deepEqual(toRecordEvent({ name: 'billingInvoiceLine.created', recordId: 'l1', properties: { after: { id: 'l1' } } }), {
    name: 'created', recordId: 'l1', before: null, after: { id: 'l1' }, updatedFields: [],
  });
  assert.equal(toRecordEvent({ name: 'billingInvoice.exploded', recordId: 'r1', properties: {} }), null);
  assert.equal(toRecordEvent({ name: 'billingInvoice.updated' }), null);
  assert.equal(toRecordEvent(null), null);
});

test('a network failure, a rate limit or a server error is worth a retry; a refusal is not', () => {
  assert.equal(isTransient(new TypeError('fetch failed')), true);
  assert.equal(isTransient(restError(429)), true);
  assert.equal(isTransient(restError(503)), true);
  assert.equal(isTransient(restError(400)), false);
  assert.equal(isTransient(new Error('a bug')), false);
});

test('a trigger hands the event to its handler with a store built for the run', async () => {
  const stores: Store[] = [];
  const seen: RecordEvent[] = [];
  const handler = runTrigger(async (store, event) => { stores.push(store); seen.push(event); }, () => ({}) as Store);
  await handler({ name: 'billingQuote.deleted', recordId: 'q1', properties: { before: { id: 'q1' }, after: { id: 'q1' }, updatedFields: ['deletedAt'] } });
  await handler({ name: 'billingQuote.restored', recordId: 'q1', properties: { before: { id: 'q1' }, after: { id: 'q1' }, updatedFields: ['deletedAt'] } });
  assert.deepEqual(seen.map((event) => event.name), ['deleted', 'restored']);
  assert.notEqual(stores[0], stores[1]);
  await handler({ nonsense: true });
  assert.equal(seen.length, 2);
});

test('a transient failure asks the platform for a retry; any other failure fails the run as it is', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const transient = runTrigger(async () => { throw restError(503); }, () => ({}) as Store);
  await assert.rejects(transient({ name: 'billingInvoice.updated', recordId: 'r1', properties: {} }), (error: Error) => error.name === 'RetryableLogicFunctionError');
  const bug = new Error('a bug');
  const failing = runTrigger(async () => { throw bug; }, () => ({}) as Store);
  await assert.rejects(failing({ name: 'billingInvoice.updated', recordId: 'r1', properties: {} }), (error) => error === bug);
  assert.equal(logged.mock.callCount(), 2);
  assert.match(String(logged.mock.calls[1]!.arguments[0]), /"trigger":"failed".*"error":"a bug"/);
});

test('the triggers bundle as logic functions, and none of them carries pdfmake', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'trigger-bundle-'));
  try {
    for (const [, name] of TRIGGERS) {
      const inputs = await bundleLogicFunction(join(SRC, `${name}.ts`), join(folder, `${name}.mjs`));
      assert.ok(inputs.some((input) => input.includes('lifecycle/guards.ts') || input.includes('lifecycle/numbering.ts')), name);
      assert.ok(!inputs.some((input) => input.includes('pdfmake')), `${name} bundles pdfmake`);
      assert.ok(!inputs.some((input) => input.includes('render/document.ts')), `${name} bundles the Renderer`);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
