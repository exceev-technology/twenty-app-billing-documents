import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGate, resetOf, type GateContext } from '../../lifecycle/gate.ts';
import { KINDS, loadDocument, type Loaded } from '../../lifecycle/load.ts';
import { numberKeyOf } from '../../lifecycle/numbering.ts';
import { TODAY, address, money, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const ISSUE: GateContext = { action: 'issue', localDate: TODAY, latestIssueDate: null };

async function loaded(w: Workspace, id: string, kind = INVOICE): Promise<Loaded> {
  const result = await loadDocument(w.app, kind, id);
  assert.ok(result);
  return result;
}

/** A draft invoice as the action sees it after the defaults write. */
async function draft(w: Workspace, over: Record<string, unknown> = {}): Promise<Loaded> {
  const invoice = w.addInvoice({ issueDate: TODAY, ...over });
  w.addLine(INVOICE, invoice.id, { quantity: 2, unitPrice: money(500_000_000) });
  return loaded(w, invoice.id);
}

const codes = (loadedDocument: Loaded, context: GateContext = ISSUE) =>
  checkGate(loadedDocument, context).map((problem) => (problem.source === 'lifecycle' ? problem.code : problem.problem.code));

test('a complete draft passes', async () => {
  const w = workspace();
  assert.deepEqual(checkGate(await draft(w), ISSUE), []);
});

test('preview and issue need a draft; a quote PDF takes any status', async () => {
  const w = workspace();
  const sent = await draft(w, { status: 'SENT' });
  assert.deepEqual(checkGate(sent, ISSUE), [{ source: 'lifecycle', code: 'WRONG_STATUS', value: 'SENT' }]);
  assert.deepEqual(codes(sent, { ...ISSUE, action: 'preview' }), ['WRONG_STATUS']);
  const quote = w.addQuote({ status: 'SENT', issueDate: TODAY });
  w.addLine(KINDS.billingQuote, quote.id);
  assert.deepEqual(checkGate(await loaded(w, quote.id, KINDS.billingQuote), { ...ISSUE, action: 'quotePdf' }), []);
});

test('the issuer is set', async () => {
  const w = workspace();
  assert.deepEqual(codes(await draft(w, { issuerId: null })), ['MISSING_ISSUER']);
});

test('the issuer has a profile', async () => {
  const w = workspace();
  const bare = w.db.seed('billingIssuers', { name: 'No profile', profileId: null });
  assert.deepEqual(codes(await draft(w, { issuerId: bare.id })), ['MISSING_PROFILE']);
});

test('the currency is known', async () => {
  const w = workspace();
  assert.deepEqual(codes(await draft(w, { currencyCode: '' })), ['MISSING_CURRENCY']);
});

test('the profile’s pattern for the type is valid, and the problem names the profile field', async () => {
  const w = workspace();
  await w.app.update('billingProfiles', w.profile.id, { invoiceNumberPattern: 'F-{SEQ}' });
  const problems = checkGate(await draft(w), ISSUE);
  assert.ok(problems.length > 0);
  for (const problem of problems) {
    assert.equal(problem.source, 'engine');
    if (problem.source === 'engine') assert.equal(problem.field, 'invoiceNumberPattern');
  }
});

test('a number the document holds was given under its issuer and for its issue date’s period, to issue or make a quote PDF', async () => {
  const w = workspace();
  const other = w.db.seed('billingIssuers', { name: 'Second', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: '333333333', identifierTypeId: w.siren.id, issuerId: other.id, companyId: null, personId: null });
  const key = numberKeyOf(w.issuer.id, 'F2026-0001');
  assert.deepEqual(codes(await draft(w, { number: 'F2026-0001', numberKey: key })), []);
  const moved = await draft(w, { number: 'F2026-0001', numberKey: key, issuerId: other.id });
  assert.deepEqual(checkGate(moved, ISSUE), [{ source: 'lifecycle', code: 'HELD_NUMBER_ELSEWHERE', value: 'F2026-0001' }]);
  assert.deepEqual(codes(moved, { ...ISSUE, action: 'preview' }), [], 'a preview numbers nothing');
  assert.deepEqual(codes(await draft(w, { number: 'F2026-0001', numberKey: key, issueDate: '2025-12-31' })), ['HELD_NUMBER_ELSEWHERE']);
  const quote = w.addQuote({ number: 'D2026-0001', numberKey: numberKeyOf(w.issuer.id, 'D2026-0001'), issuerId: other.id, issueDate: TODAY });
  w.addLine(KINDS.billingQuote, quote.id);
  assert.deepEqual(codes(await loaded(w, quote.id, KINDS.billingQuote), { ...ISSUE, action: 'quotePdf' }), ['HELD_NUMBER_ELSEWHERE']);
});

test('an empty numbering reset reads as the field’s default, yearly', () => {
  assert.equal(resetOf({ id: 'p', numberingReset: 'MONTHLY' }), 'MONTHLY');
  assert.equal(resetOf({ id: 'p', numberingReset: '' }), 'YEARLY');
  assert.equal(resetOf(null), 'YEARLY');
});

test('a buyer is set: a company, a person, or both', async () => {
  const w = workspace();
  assert.deepEqual(codes(await draft(w, { companyId: null, personId: null })), ['MISSING_BUYER']);
  assert.deepEqual(codes(await draft(w, { companyId: null, personId: w.person.id })), []);
  assert.deepEqual(codes(await draft(w, { personId: w.person.id })), []);
});

test('a credit note names an issued invoice with the same issuer and currency', async () => {
  const w = workspace();
  const note = async (over: Record<string, unknown>) => {
    const created = w.addCreditNote({ issueDate: TODAY, ...over });
    w.addLine(KINDS.billingCreditNote, created.id);
    return codes(await loaded(w, created.id, KINDS.billingCreditNote));
  };
  const issued = w.addInvoice({ number: 'F2026-0001', snapshot: { printed: {}, record: {} } });
  assert.deepEqual(await note({ invoiceId: null }), ['MISSING_INVOICE']);
  assert.deepEqual(await note({ invoiceId: w.invoice.id }), ['INVOICE_NOT_ISSUED']);
  assert.deepEqual(await note({ invoiceId: issued.id }), []);
  const other = w.db.seed('billingIssuers', { name: 'Second', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: '333333333', identifierTypeId: w.siren.id, issuerId: other.id, companyId: null, personId: null });
  assert.deepEqual(await note({ invoiceId: issued.id, issuerId: other.id }), ['INVOICE_MISMATCH']);
  const usd = w.addInvoice({ number: 'F2026-0002', currencyCode: 'USD', snapshot: { printed: {}, record: {} } });
  assert.deepEqual(await note({ invoiceId: usd.id }), ['INVOICE_MISMATCH']);
});

test('the seller has every identifier its profile requires', async () => {
  const w = workspace();
  const bare = w.db.seed('billingIssuers', { name: 'No identifiers', profileId: w.profile.id });
  assert.deepEqual(checkGate(await draft(w, { issuerId: bare.id }), ISSUE), [
    { source: 'lifecycle', code: 'MISSING_IDENTIFIER', field: 'seller', value: 'SIREN' },
  ]);
});

test('an identifier matches its type’s pattern, once trimmed', async () => {
  const w = workspace();
  const seller = w.db.seed('billingIssuers', { name: 'Typo', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: '12345', identifierTypeId: w.siren.id, issuerId: seller.id, companyId: null, personId: null });
  assert.deepEqual(checkGate(await draft(w, { issuerId: seller.id }), ISSUE), [
    { source: 'lifecycle', code: 'INVALID_IDENTIFIER', field: 'seller', value: 'SIREN' },
  ]);
  const spaced = w.db.seed('billingIssuers', { name: 'Spaced', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: ' 123456789 ', identifierTypeId: w.siren.id, issuerId: spaced.id, companyId: null, personId: null });
  assert.deepEqual(codes(await draft(w, { issuerId: spaced.id })), []);
});

test('a domestic company buyer, or one of unknown country, has the identifiers required of a business buyer', async () => {
  const w = workspace();
  const domestic = w.db.seed('companies', { name: 'Sans SIREN', address: address('1 rue', 'Lyon', '69001', 'France') });
  assert.deepEqual(checkGate(await draft(w, { companyId: domestic.id }), ISSUE), [
    { source: 'lifecycle', code: 'MISSING_IDENTIFIER', field: 'buyer', value: 'SIREN' },
  ]);
  const unknown = w.db.seed('companies', { name: 'Nowhere', address: address('', '', '', '') });
  assert.deepEqual(codes(await draft(w, { companyId: unknown.id })), ['MISSING_IDENTIFIER']);
});

test('a foreign company buyer and a person buyer are never required to have one', async () => {
  const w = workspace();
  const foreign = w.db.seed('companies', { name: 'Harbor Goods', address: address('1 Main St', 'Boston', '02110', 'United States') });
  assert.deepEqual(codes(await draft(w, { companyId: foreign.id })), []);
  assert.deepEqual(codes(await draft(w, { companyId: null, personId: w.person.id })), []);
});

test('every identifier involved has exactly one owner, reported once', async () => {
  const w = workspace();
  const shared = w.db.seed('billingIssuers', { name: 'Shared', profileId: w.profile.id });
  w.db.seed('billingIdentifiers', { value: '444444444', identifierTypeId: w.siren.id, issuerId: shared.id, companyId: w.company.id, personId: null });
  assert.deepEqual(checkGate(await draft(w, { issuerId: shared.id }), ISSUE), [
    { source: 'lifecycle', code: 'IDENTIFIER_OWNER', value: 'SIREN 444444444' },
  ]);
});

test('the Engine’s problems are the gate’s problems', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ issueDate: TODAY });
  w.addLine(INVOICE, invoice.id, { taxCodeId: null });
  assert.deepEqual(codes(await loaded(w, invoice.id)), ['MISSING_TAX_CODE']);
  assert.deepEqual(codes(await loaded(w, w.addInvoice({ issueDate: TODAY }).id)), ['NO_LINES']);
});

test('an issue date may not be later than the caller’s today, nor earlier than the sequence’s last', async () => {
  const w = workspace();
  const future = await draft(w, { issueDate: '2026-09-27' });
  assert.deepEqual(checkGate(future, ISSUE), [{ source: 'lifecycle', code: 'DATE_IN_FUTURE', field: 'issueDate', value: '2026-09-27' }]);
  const today = await draft(w);
  assert.deepEqual(checkGate(today, { ...ISSUE, latestIssueDate: '2026-09-27' }), [
    { source: 'lifecycle', code: 'DATE_BEFORE_LAST', field: 'issueDate', value: '2026-09-27' },
  ]);
  assert.deepEqual(checkGate(today, { ...ISSUE, latestIssueDate: TODAY }), []);
});

test('the date rules are the issue’s alone: a preview and a quote PDF skip them', async () => {
  const w = workspace();
  const future = await draft(w, { issueDate: '2026-12-01' });
  assert.deepEqual(checkGate(future, { ...ISSUE, action: 'preview', latestIssueDate: '2027-01-01' }), []);
});

test('a due date may not be earlier than the issue date, for every action', async () => {
  const w = workspace();
  const late = await draft(w, { dueDate: '2026-09-25' });
  assert.deepEqual(codes(late), ['DUE_BEFORE_ISSUE']);
  assert.deepEqual(codes(late, { ...ISSUE, action: 'preview' }), ['DUE_BEFORE_ISSUE']);
});

test('all problems are reported together, in the order of the checks', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ status: 'SENT', issuerId: null, companyId: null, currencyCode: '', issueDate: '2026-12-01', dueDate: '2026-11-01' });
  assert.deepEqual(codes(await loaded(w, invoice.id)), [
    'WRONG_STATUS', 'MISSING_ISSUER', 'MISSING_CURRENCY', 'MISSING_BUYER', 'DATE_IN_FUTURE', 'DUE_BEFORE_ISSUE',
  ]);
});
