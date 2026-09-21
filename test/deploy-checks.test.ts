import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPlan, readRemoteStatus } from '../src/lib/deploy-checks.ts';

// Trimmed from real `twenty` 2.41 output.
const STATUS = `Using remote: billing-test
  Remote:  billing-test
  Server:  https://example.test
  Auth:    api-key (valid)`;

const PLAN = `Computing metadata plan (read-only, nothing will be applied)...

Twenty will perform the following actions:

  # objectMetadata "billingInvoice" will be created

Plan: 1126 to add, 0 to change, 0 to destroy.

✓ Plan complete for Billing Documents — no changes were applied`;

const NO_CHANGES = `Computing metadata plan (read-only, nothing will be applied)...

No changes. Twenty metadata matches your manifest.`;

const UNREGISTERED = `Computing metadata plan (read-only, nothing will be applied)...
Sync failed with error: No registration found for "046d0988-b217-403e-a50f-d2a57e70780d". Create one first with createApplicationRegistration.`;

test('reads the remote, its server and whether its credentials are valid', () => {
  assert.deepEqual(readRemoteStatus(STATUS), { remote: 'billing-test', server: 'https://example.test', authValid: true });
  assert.equal(readRemoteStatus(STATUS.replace('(valid)', '(expired)')).authValid, false);
});

test('reads the counts of a plan', () => {
  assert.deepEqual(readPlan(PLAN), { kind: 'changes', added: 1126, changed: 0, destroyed: 0 });
  assert.deepEqual(readPlan(PLAN.replace('0 to destroy', '3 to destroy')), { kind: 'changes', added: 1126, changed: 0, destroyed: 3 });
});

test('reads a plan with nothing to do', () => {
  assert.deepEqual(readPlan(NO_CHANGES), { kind: 'no-changes' });
});

test('recognises an app the server has never seen, which cannot be previewed', () => {
  assert.deepEqual(readPlan(UNREGISTERED), { kind: 'unregistered' });
});

test('reads through the colours the CLI prints', () => {
  assert.deepEqual(readPlan(`\x1b[1mPlan:\x1b[0m 2 to add, 1 to change, 0 to destroy.`), { kind: 'changes', added: 2, changed: 1, destroyed: 0 });
});

test('refuses to guess at output it does not recognise', () => {
  assert.equal(readPlan('Sync failed with error: Label must not contain a comma'), null);
});
