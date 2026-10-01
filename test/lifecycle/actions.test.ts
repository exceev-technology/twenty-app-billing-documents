import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RenderError, type RenderInput, type RenderResult } from '../../render/types.ts';
import { addDays, parseRequest, runAction, type ActionDeps, type ActionOutcome } from '../../lifecycle/actions.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { numberKeyOf } from '../../lifecycle/numbering.ts';
import { lockstep } from './helpers/memory-store.ts';
import { TODAY, money, now, workspace, type Workspace } from './helpers/fixtures.ts';

const sha = async (bytes: Uint8Array): Promise<string> => createHash('sha256').update(bytes).digest('hex');

/** A stand-in Renderer: deterministic bytes naming the number and version it printed, and a record of every input. */
function renderer() {
  const inputs: RenderInput[] = [];
  const render = async (input: RenderInput): Promise<RenderResult> => {
    inputs.push(input);
    return { bytes: new TextEncoder().encode(`%PDF ${input.number ?? 'DRAFT'} v${input.version ?? ''}`), pages: 1 };
  };
  return { inputs, render };
}

function setup(w: Workspace, over: Partial<ActionDeps> = {}) {
  const logs: Record<string, unknown>[] = [];
  const { inputs, render } = renderer();
  const deps: ActionDeps = {
    app: w.app, caller: w.db.store('MANUAL'), now, sha256: sha, reference: () => 'ref-7f3a', log: (entry) => logs.push(entry), render, ...over,
  };
  return { deps, logs, inputs };
}

const request = (w: Workspace, over: Record<string, unknown> = {}) => ({
  action: 'issue', object: 'billingInvoice', recordId: w.invoice.id, localDate: TODAY, locale: 'en', ...over,
});
const invoiceRow = (w: Workspace, id = w.invoice.id) => w.db.row('billingInvoices', id)!;
const problemCodes = (outcome: ActionOutcome) => (outcome.body.ok ? [] : outcome.body.problems.map((problem) => problem.code));

test('a request is read only when it is one of the three actions on its own kind of document', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assert.deepEqual(parseRequest({ action: 'issue', object: 'billingInvoice', recordId: id, localDate: TODAY, locale: 'fr-FR' }), {
    action: 'issue', object: 'billingInvoice', recordId: id, localDate: TODAY, locale: 'fr-FR',
  });
  assert.equal(parseRequest({ action: 'issue', object: 'billingQuote', recordId: id, localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'quotePdf', object: 'billingInvoice', recordId: id, localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'delete', object: 'billingInvoice', recordId: id, localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'issue', object: 'billingInvoice', recordId: '../x', localDate: TODAY }), null);
  assert.equal(parseRequest({ action: 'issue', object: 'billingInvoice', recordId: id, localDate: '2026-02-30' }), null);
  assert.equal(parseRequest(null), null);
  assert.equal(parseRequest({ action: 'preview', object: 'billingCreditNote', recordId: id, localDate: TODAY })?.locale, 'en');
});

test('an action named like an inherited property is no action, and is answered, never thrown', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  for (const action of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(parseRequest({ action, object: 'billingInvoice', recordId: w.invoice.id, localDate: TODAY }), null, action);
    const outcome = await runAction(request(w, { action }), deps);
    assert.equal(outcome.status, 500, action);
    assert.deepEqual(problemCodes(outcome), ['UNEXPECTED'], action);
  }
  assert.equal(logs.length, 4);
  assert.deepEqual(w.db.writes, []);
});

test('days are added on the calendar, across months and years', () => {
  assert.equal(addDays('2026-09-26', 30), '2026-10-26');
  assert.equal(addDays('2026-12-15', 30), '2027-01-14');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('a request that is not an action is answered as unexpected, with a reference, and logged', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  const outcome = await runAction(request(w, { object: 'billingQuote' }), deps);
  assert.equal(outcome.status, 500);
  assert.deepEqual(outcome.body, { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] });
  assert.equal(logs[0]?.reference, 'ref-7f3a');
  assert.equal(logs[0]?.step, 'request');
  assert.deepEqual(w.db.writes, []);
});

test('a caller whose date is more than a day away from the server’s is refused with CLOCK_SKEW', async () => {
  const w = workspace();
  const { deps } = setup(w);
  const skewed = await runAction(request(w, { localDate: '2026-09-28' }), deps);
  assert.equal(skewed.status, 422);
  assert.deepEqual(problemCodes(skewed), ['CLOCK_SKEW']);
  assert.deepEqual(w.db.writes, []);
  assert.equal((await runAction(request(w, { localDate: '2026-09-25', action: 'preview' }), deps)).status, 200);
});

test('a caller whose role cannot edit the document gets NOT_ALLOWED, and nothing else happens', async () => {
  const w = workspace();
  const { deps } = setup(w, { caller: w.db.store('MANUAL', { canUpdate: () => false }) });
  const outcome = await runAction(request(w), deps);
  assert.equal(outcome.status, 403);
  assert.deepEqual(problemCodes(outcome), ['NOT_ALLOWED']);
  assert.deepEqual(w.db.writes, []);
  assert.equal(invoiceRow(w).number, '');
});

test('the draft’s empty defaults are filled with the caller’s token: date, currency, language, due date', async () => {
  const w = workspace();
  const bare = w.addInvoice({ issueDate: null, currencyCode: '', language: null, dueDate: null });
  w.addLine(KINDS.billingInvoice, bare.id);
  const { deps } = setup(w);
  await runAction(request(w, { action: 'preview', recordId: bare.id }), deps);
  assert.deepEqual(w.db.writes[0], {
    op: 'update', plural: 'billingInvoices', id: bare.id, source: 'MANUAL',
    data: { issueDate: TODAY, currencyCode: 'EUR', language: 'FR', dueDate: '2026-10-26' },
  });
});

test('the issuer’s currency comes before the profile’s, and a quote gets its validity', async () => {
  const w = workspace();
  await w.app.update('billingIssuers', w.issuer.id, { defaultCurrency: 'CHF' });
  const quote = w.addQuote({ issueDate: null, currencyCode: '', validUntil: null });
  w.addLine(KINDS.billingQuote, quote.id, { unitPrice: money(1_000_000, 'CHF') });
  const { deps } = setup(w);
  const before = w.db.writes.length;
  await runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id }), deps);
  assert.deepEqual(w.db.writes[before]?.data, { issueDate: TODAY, currencyCode: 'CHF', language: 'FR', validUntil: '2026-10-26' });
});

test('the caller’s write is made even when nothing is missing, rewriting the issue date as it is', async () => {
  const w = workspace();
  const full = w.addInvoice({ issueDate: '2026-09-20', dueDate: '2026-10-20', language: 'EN' });
  w.addLine(KINDS.billingInvoice, full.id);
  const { deps } = setup(w);
  await runAction(request(w, { action: 'preview', recordId: full.id }), deps);
  assert.deepEqual(w.db.writes[0]?.data, { issueDate: '2026-09-20' });
  assert.equal(w.db.writes[0]?.source, 'MANUAL');
});

test('the gate’s problems are worded in the caller’s language, and nothing is written but the defaults', async () => {
  const w = workspace();
  const orphan = w.addInvoice({ companyId: null, issueDate: TODAY });
  w.addLine(KINDS.billingInvoice, orphan.id);
  const { deps } = setup(w);
  const english = await runAction(request(w, { recordId: orphan.id }), deps);
  assert.equal(english.status, 422);
  assert.deepEqual(english.body, { ok: false, problems: [{ code: 'MISSING_BUYER', message: 'Choose the company or the person to bill.', field: 'companyId' }] });
  const french = await runAction(request(w, { recordId: orphan.id, locale: 'fr-FR' }), deps);
  assert.match(french.body.ok ? '' : french.body.problems[0]!.message, /Choisissez la société/);
  assert.deepEqual(w.db.writes.map((write) => write.source), ['MANUAL', 'MANUAL']);
});

test('an Engine problem names its line by position', async () => {
  const w = workspace();
  await w.app.update('billingInvoiceLines', w.lines[1]!.id, { taxCodeId: null });
  const { deps } = setup(w);
  const outcome = await runAction(request(w), deps);
  assert.deepEqual(problemCodes(outcome), ['MISSING_TAX_CODE']);
  assert.match(outcome.body.ok ? '' : outcome.body.problems[0]!.message, /line 2/);
});

test('a preview is a PDF with no number, replacing the previous preview, labelled with the date', async () => {
  const w = workspace();
  const { deps, inputs } = setup(w);
  const first = await runAction(request(w, { action: 'preview' }), deps);
  assert.deepEqual(first, { status: 200, body: { ok: true, message: 'Preview ready: it is in the PDF field.' } });
  assert.equal(inputs[0]?.number, null);
  const [preview] = invoiceRow(w).pdf as { fileId: string; label: string }[];
  assert.equal(preview?.label, 'Preview 2026-09-26.pdf');
  await runAction(request(w, { action: 'preview' }), deps);
  const after = invoiceRow(w).pdf as { fileId: string }[];
  assert.equal(after.length, 1);
  assert.notEqual(after[0]?.fileId, preview?.fileId);
  assert.equal(invoiceRow(w).number, '');
  assert.equal(invoiceRow(w).status, 'DRAFT');
});

test('Issue gives the number, one PDF, its hash, the totals, the ledger and a timeline message', async () => {
  const w = workspace();
  const { deps } = setup(w);
  const outcome = await runAction(request(w), deps);
  assert.deepEqual(outcome, { status: 200, body: { ok: true, number: 'F2026-0001', message: 'Issued as F2026-0001.' } });
  const issued = invoiceRow(w);
  assert.equal(issued.status, 'ISSUED');
  assert.equal(issued.number, 'F2026-0001');
  assert.equal(issued.numberKey, numberKeyOf(w.issuer.id, 'F2026-0001'));
  assert.equal(issued.issuedAt, '2026-09-26T09:30:00.000Z');
  assert.equal(issued.issueDate, TODAY);
  const pdf = issued.pdf as { fileId: string; label: string }[];
  assert.deepEqual(pdf.map((file) => file.label), ['F2026-0001.pdf']);
  assert.equal(issued.documentHash, await sha(new TextEncoder().encode('%PDF F2026-0001 v')));
  assert.deepEqual(issued.total, money(9_792_000_000));
  assert.deepEqual(w.lines.map((line) => w.db.row('billingInvoiceLines', line.id)!.lineTotal), [
    money(3_120_000_000), money(3_840_000_000), money(1_200_000_000),
  ]);
  assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1);
  assert.deepEqual(w.db.timeline, [{ object: 'billingInvoice', recordId: w.invoice.id, kind: 'ISSUED', text: 'Émise sous le numéro F2026-0001.' }]);
});

test('the snapshot keeps what was printed, the logo by file id and hash, and the record as issued', async () => {
  const w = workspace();
  const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const fileId = w.db.addFile(logo, 'image/png');
  await w.app.update('billingIssuers', w.issuer.id, { logo: [{ fileId, label: 'logo.png' }] });
  const { deps } = setup(w);
  await runAction(request(w), deps);
  const snapshot = invoiceRow(w).snapshot as { printed: Record<string, any>; record: { document: Record<string, unknown>; lines: Record<string, Record<string, unknown>> } };
  assert.equal(snapshot.printed.number, 'F2026-0001');
  assert.deepEqual(snapshot.printed.brand.logo, { fileId, sha256: await sha(logo) });
  assert.equal(snapshot.printed.totals.totalMicros, 9_792_000_000);
  assert.equal(snapshot.record.document.id, w.invoice.id);
  assert.equal(snapshot.record.document.subject, 'Identité visuelle');
  assert.equal(snapshot.record.document.issueDate, TODAY);
  assert.deepEqual(Object.keys(snapshot.record.lines).sort(), w.lines.map((line) => line.id).sort());
  const first = snapshot.record.lines[w.lines[0]!.id]!;
  assert.deepEqual([first.description, first.quantity, first.invoiceId], ['Direction artistique', 4, w.invoice.id]);
  assert.equal(JSON.stringify(snapshot).includes('"bytes"'), false, 'the snapshot holds no image bytes');
});

test('the previews go at issue: the PDF field holds the issued PDF alone', async () => {
  const w = workspace();
  const { deps } = setup(w);
  await runAction(request(w, { action: 'preview' }), deps);
  await runAction(request(w), deps);
  assert.deepEqual((invoiceRow(w).pdf as { label: string }[]).map((file) => file.label), ['F2026-0001.pdf']);
});

test('an issued document answers ALREADY_ISSUED with its number, and nothing is written', async () => {
  const w = workspace();
  const { deps } = setup(w);
  await runAction(request(w), deps);
  const writes = w.db.writes.length;
  const again = await runAction(request(w), deps);
  assert.equal(again.status, 422);
  assert.deepEqual(again.body, { ok: false, problems: [{ code: 'ALREADY_ISSUED', message: 'This document is already issued, as F2026-0001.' }] });
  assert.equal(w.db.writes.length, writes);
});

test('a failure after each step leaves a numbered draft, and the next Issue finishes with the same number', async () => {
  const failures: [string, Parameters<Workspace['db']['failNext']>[0]][] = [
    ['upload', (op) => op === 'upload'],
    ['lines', (op, plural) => op === 'update' && plural === 'billingInvoiceLines'],
    ['document', (op, plural, data) => op === 'update' && plural === 'billingInvoices' && data?.status === 'ISSUED'],
    ['ledger', (op, plural, data) => op === 'update' && plural === 'billingSequences' && data?.lastValue !== undefined],
  ];
  for (const [step, when] of failures) {
    const w = workspace();
    const { deps, logs } = setup(w);
    w.db.failNext(when);
    const failed = await runAction(request(w), deps);
    assert.equal(failed.status, 500, step);
    assert.equal(invoiceRow(w).status, 'DRAFT', step);
    assert.equal(invoiceRow(w).number, 'F2026-0001', step);
    assert.ok(logs[0]?.step, step);
    const resumed = await runAction(request(w), deps);
    assert.deepEqual(resumed.body, { ok: true, number: 'F2026-0001', message: 'Issued as F2026-0001.' }, step);
    assert.equal(invoiceRow(w).status, 'ISSUED', step);
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1, step);
    assert.equal((invoiceRow(w).pdf as unknown[]).length, 1, step);
  }
});

/** A second issuer on the fixture's profile, with the SIREN the profile requires of a seller. */
function secondIssuer(w: Workspace) {
  const issuer = w.db.seed('billingIssuers', { name: 'Atelier Second', profileId: w.profile.id, logo: [], defaultCurrency: '', template: 'CLASSIC' });
  w.db.seed('billingIdentifiers', { value: '222222222', identifierTypeId: w.siren.id, issuerId: issuer.id, companyId: null, personId: null });
  return issuer;
}

const HELD_ELSEWHERE = {
  code: 'HELD_NUMBER_ELSEWHERE',
  message: 'This document already holds the number F2026-0001, given under another issuer or period: put its issuer and issue date back to use it.',
};

test('a draft that holds a number and has since changed issuer is refused, and the other issuer keeps its own number alone', async () => {
  const w = workspace();
  const { deps } = setup(w);
  const second = secondIssuer(w);
  const theirs = w.addInvoice({ issuerId: second.id });
  w.addLine(KINDS.billingInvoice, theirs.id);
  assert.equal((await runAction(request(w, { recordId: theirs.id }), deps)).status, 200);
  w.db.failNext((op) => op === 'upload');
  assert.equal((await runAction(request(w), deps)).status, 500);
  assert.equal(invoiceRow(w).number, 'F2026-0001');
  await w.user.update('billingInvoices', w.invoice.id, { issuerId: second.id });
  const before = w.db.writes.length;
  const outcome = await runAction(request(w), deps);
  assert.deepEqual(outcome, { status: 422, body: { ok: false, problems: [HELD_ELSEWHERE] } });
  assert.deepEqual(w.db.writes.slice(before).map((write) => write.source), ['MANUAL'], 'nothing written but the defaults');
  const secondsNumbers = w.db.rows('billingInvoices').filter((row) => row.issuerId === second.id && row.status === 'ISSUED').map((row) => row.number);
  assert.deepEqual(secondsNumbers, ['F2026-0001']);
  assert.equal(invoiceRow(w).status, 'DRAFT');
  assert.deepEqual(w.db.rows('billingSequences').map((row) => [row.issuerId, row.lastValue]).sort(), [[w.issuer.id, 1], [second.id, 1]].sort());
});

test('a quote that holds a number and has since changed issuer is refused before a PDF is made', async () => {
  const w = workspace();
  const { deps } = setup(w);
  const second = secondIssuer(w);
  const ask = (id: string) => runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: id }), deps);
  const theirs = w.addQuote({ issuerId: second.id });
  w.addLine(KINDS.billingQuote, theirs.id);
  assert.equal((await ask(theirs.id)).status, 200);
  const ours = w.addQuote();
  w.addLine(KINDS.billingQuote, ours.id);
  w.db.failNext((op) => op === 'upload');
  assert.equal((await ask(ours.id)).status, 500);
  await w.user.update('billingQuotes', ours.id, { issuerId: second.id });
  const before = w.db.writes.length;
  const outcome = await ask(ours.id);
  assert.equal(outcome.status, 422);
  assert.deepEqual(outcome.body, { ok: false, problems: [{ ...HELD_ELSEWHERE, message: HELD_ELSEWHERE.message.replace('F2026-0001', 'D2026-0001') }] });
  assert.deepEqual(w.db.writes.slice(before).map((write) => write.source), ['MANUAL'], 'nothing written but the defaults');
  assert.deepEqual(w.db.row('billingQuotes', ours.id)!.pdf, []);
});

test('a numbered quote whose date moved into the next year gets its next version with the same number, and no sequence rises', async () => {
  const w = workspace();
  const quote = w.addQuote();
  w.addLine(KINDS.billingQuote, quote.id);
  const ask = (localDate: string, clock: string) =>
    runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id, localDate }), setup(w, { now: () => new Date(clock) }).deps);
  assert.deepEqual((await ask('2026-12-18', '2026-12-18T10:00:00.000Z')).body, { ok: true, number: 'D2026-0001', version: 1, message: 'Quote D2026-0001, version 1: it is in the PDF field.' });
  await w.user.update('billingQuotes', quote.id, { issueDate: '2027-01-08' });
  const outcome = await ask('2027-01-08', '2027-01-08T10:00:00.000Z');
  assert.deepEqual(outcome.body, { ok: true, number: 'D2026-0001', version: 2, message: 'Quote D2026-0001, version 2: it is in the PDF field.' });
  assert.deepEqual(w.db.rows('billingSequences').filter((row) => row.lastValue !== 0).map((row) => [row.documentType, row.periodKey, row.lastValue]), [['QUOTE', '2026', 1]]);
});

test('a numbered draft whose issue date moved into the next year is refused, and that year’s sequence is left alone', async () => {
  const w = workspace();
  const lastDay = setup(w, { now: () => new Date('2026-12-31T16:00:00.000Z') });
  w.db.failNext((op) => op === 'upload');
  assert.equal((await runAction(request(w, { localDate: '2026-12-31' }), lastDay.deps)).status, 500);
  assert.deepEqual([invoiceRow(w).number, invoiceRow(w).issueDate], ['F2026-0001', '2026-12-31']);
  await w.user.update('billingInvoices', w.invoice.id, { issueDate: '2027-01-05' });
  const newYear = setup(w, { now: () => new Date('2027-01-05T09:00:00.000Z') });
  const outcome = await runAction(request(w, { localDate: '2027-01-05' }), newYear.deps);
  assert.deepEqual(problemCodes(outcome), ['HELD_NUMBER_ELSEWHERE']);
  assert.deepEqual(w.db.rows('billingSequences').map((row) => [row.periodKey, row.lastValue]), [['2026', 1]]);
  assert.deepEqual([invoiceRow(w).status, invoiceRow(w).number], ['DRAFT', 'F2026-0001']);
});

test('a timeline message that cannot be written does not undo the issue', async () => {
  const w = workspace();
  const { deps } = setup(w);
  w.db.failNext((op) => op === 'timeline');
  assert.equal((await runAction(request(w), deps)).status, 200);
  assert.equal(invoiceRow(w).status, 'ISSUED');
});

test('a render problem is refused before any number is claimed', async () => {
  const w = workspace();
  const { deps } = setup(w, { render: async () => { throw new RenderError([{ code: 'UNSUPPORTED_IMAGE', field: 'brand.logo.bytes', value: 'image/png' }]); } });
  const outcome = await runAction(request(w), deps);
  assert.equal(outcome.status, 422);
  assert.deepEqual(problemCodes(outcome), ['UNSUPPORTED_IMAGE']);
  assert.equal(invoiceRow(w).number, '');
  assert.deepEqual(w.db.rows('billingSequences'), []);
});

test('an issuer logo that cannot be downloaded stops every action as unexpected, before any number is claimed', async () => {
  const w = workspace();
  await w.app.update('billingIssuers', w.issuer.id, { logo: [{ fileId: 'file-expired', label: 'logo.png' }] });
  const quote = w.addQuote();
  w.addLine(KINDS.billingQuote, quote.id);
  const { deps, logs } = setup(w);
  const asks = [
    request(w, { action: 'preview' }), request(w), request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id }),
  ];
  for (const ask of asks) {
    const before = w.db.writes.length;
    const outcome = await runAction(ask, deps);
    assert.deepEqual(outcome, { status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] } }, ask.action);
    assert.deepEqual(w.db.writes.slice(before).map((write) => write.source), ['MANUAL'], `${ask.action}: nothing written but the defaults`);
    assert.match(String(logs.at(-1)?.error), /logo could not be downloaded/, ask.action);
  }
  assert.deepEqual([invoiceRow(w).number, invoiceRow(w).pdf], ['', []]);
  assert.deepEqual([w.db.row('billingQuotes', quote.id)!.number, w.db.row('billingQuotes', quote.id)!.pdf], ['', []]);
  assert.deepEqual(w.db.rows('billingSequences'), []);
  assert.deepEqual(logs.map((entry) => entry.step), ['render', 'trial', 'trial']);
});

test('the trial’s bytes are the final bytes; a number taken meanwhile is rendered again', async () => {
  const w = workspace();
  const plain = setup(w);
  await runAction(request(w), plain.deps);
  assert.equal(plain.inputs.length, 1, 'rendered once: the trial was the final render');
  const v = workspace();
  v.addInvoice({ number: 'F2026-0001', numberKey: numberKeyOf(v.issuer.id, 'F2026-0001'), issueDate: TODAY });
  const taken = setup(v);
  const outcome = await runAction(request(v), taken.deps);
  assert.deepEqual(taken.inputs.map((input) => input.number), ['F2026-0001', 'F2026-0002']);
  assert.equal(outcome.body.ok && outcome.body.number, 'F2026-0002');
  assert.deepEqual((invoiceRow(v).pdf as { label: string }[]).map((file) => file.label), ['F2026-0002.pdf']);
});

test('a quote’s first PDF gives its number and version 1; the next keeps the number, version 2, newest first', async () => {
  const w = workspace();
  const quote = w.addQuote();
  w.addLine(KINDS.billingQuote, quote.id);
  const { deps, inputs } = setup(w);
  const ask = () => runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id }), deps);
  assert.deepEqual((await ask()).body, { ok: true, number: 'D2026-0001', version: 1, message: 'Quote D2026-0001, version 1: it is in the PDF field.' });
  assert.deepEqual((await ask()).body, { ok: true, number: 'D2026-0001', version: 2, message: 'Quote D2026-0001, version 2: it is in the PDF field.' });
  assert.deepEqual(inputs.map((input) => [input.number, input.version]), [['D2026-0001', 1], ['D2026-0001', 2]]);
  const row = w.db.row('billingQuotes', quote.id)!;
  assert.deepEqual((row.pdf as { label: string }[]).map((file) => file.label), ['D2026-0001 v2.pdf', 'D2026-0001 v1.pdf']);
  assert.equal(row.version, 2);
  assert.equal(row.status, 'DRAFT', 'a quote has no issue step');
});

test('a quote keeps its ten newest PDFs', async () => {
  const w = workspace();
  const old = Array.from({ length: 10 }, (_, index) => ({ fileId: w.db.addFile(new Uint8Array([index]), 'application/pdf'), label: `v${index + 1}.pdf`, extension: '.pdf', url: 'https://x' }));
  const quote = w.addQuote({ number: 'D2026-0001', numberKey: numberKeyOf(w.issuer.id, 'D2026-0001'), version: 10, pdf: old, issueDate: TODAY });
  w.addLine(KINDS.billingQuote, quote.id);
  const { deps } = setup(w);
  await runAction(request(w, { action: 'quotePdf', object: 'billingQuote', recordId: quote.id }), deps);
  const pdf = w.db.row('billingQuotes', quote.id)!.pdf as { fileId: string; label: string }[];
  assert.equal(pdf.length, 10);
  assert.equal(pdf[0]?.label, 'D2026-0001 v11.pdf');
  assert.equal(pdf.at(-1)?.label, 'v9.pdf');
  assert.deepEqual(Object.keys(pdf[1]!).sort(), ['fileId', 'label'], 'a FILES write carries only fileId and label');
});

test('a credit note is numbered in its own sequence and names the invoice it corrects', async () => {
  const w = workspace();
  const { deps, inputs } = setup(w);
  await runAction(request(w), deps);
  const note = w.addCreditNote({ invoiceId: w.invoice.id, issueDate: TODAY });
  w.addLine(KINDS.billingCreditNote, note.id);
  const outcome = await runAction(request(w, { object: 'billingCreditNote', recordId: note.id }), deps);
  assert.equal(outcome.body.ok && outcome.body.number, 'AV2026-0001');
  assert.deepEqual(inputs.at(-1)?.corrects, { number: 'F2026-0001', issueDate: TODAY });
  assert.equal(w.db.timeline.at(-1)?.text, 'Émis sous le numéro AV2026-0001.');
});

test('an unexpected failure is answered with a reference, and logged with the document, the action and the step', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  w.db.failNext((op) => op === 'upload', new Error('storage is full'));
  const outcome = await runAction(request(w, { locale: 'fr-FR' }), deps);
  assert.deepEqual(outcome, { status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Une erreur s’est produite (réf. ref-7f3a).' }] } });
  assert.deepEqual(logs, [{ reference: 'ref-7f3a', object: 'billingInvoice', recordId: w.invoice.id, action: 'issue', step: 'upload', error: 'storage is full' }]);
});

test('an unexpected failure Twenty explained is logged with Twenty’s messages', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  const refusal = Object.assign(new Error('Request failed with status 400'), {
    name: 'RestApiClientError', status: 400, body: { statusCode: 400, error: 'BadRequestException', messages: ['File exceeds the size limit'] },
  });
  w.db.failNext((op) => op === 'upload', refusal);
  assert.equal((await runAction(request(w), deps)).status, 500);
  assert.deepEqual(logs, [{
    reference: 'ref-7f3a', object: 'billingInvoice', recordId: w.invoice.id, action: 'issue', step: 'upload',
    error: 'Request failed with status 400', messages: ['File exceeds the size limit'],
  }]);
});

test('the button’s message follows the caller’s locale, the timeline’s the document’s language', async () => {
  const w = workspace();
  const english = w.addInvoice({ language: 'EN', issueDate: TODAY });
  w.addLine(KINDS.billingInvoice, english.id);
  const { deps } = setup(w);
  const outcome = await runAction(request(w, { recordId: english.id, locale: 'fr-FR' }), deps);
  assert.equal(outcome.body.ok && outcome.body.message, 'Émise sous le numéro F2026-0001.');
  assert.equal(w.db.timeline[0]?.text, 'Issued as F2026-0001.');
});

test('two Issues of the same draft at once end with one number and one PDF', async () => {
  for (const order of [['A', 'B'], ['B', 'A'], ['A', 'A', 'B'], ['A', 'B', 'B', 'A', 'A']]) {
    const w = workspace();
    const lock = lockstep(w.db);
    const run = (name: string) => runAction(request(w), { ...setup(w).deps, app: lock.flow(name) });
    const flows = [run('A'), run('B')];
    for (let round = 0; round < 40; round++) for (const name of order) await lock.step(name);
    await lock.finish(...flows);
    const outcomes = await Promise.all(flows);
    for (const outcome of outcomes) {
      // Perfectly simultaneous requests may both get through (Twenty has no compare-and-set): either way, one number.
      const fine = outcome.body.ok ? outcome.body.number === 'F2026-0001' : problemCodes(outcome).join() === 'ALREADY_ISSUED';
      assert.ok(fine, `${order.join('')}: ${JSON.stringify(outcome.body)}`);
    }
    const issued = invoiceRow(w);
    assert.equal(issued.status, 'ISSUED', order.join(''));
    assert.equal(issued.number, 'F2026-0001', order.join(''));
    assert.equal((issued.pdf as unknown[]).length, 1, order.join(''));
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1, order.join(''));
  }
});

/** Two Issues of the same draft over one database, each with its own Renderer, run by hand: `advance` lets one of them make store calls until `done` holds or it has answered. */
function racing(w: Workspace) {
  const lock = lockstep(w.db);
  const answered = new Set<string>();
  const start = (name: string) => {
    const { deps, inputs } = setup(w);
    const outcome = runAction(request(w), { ...deps, app: lock.flow(name) });
    void outcome.then(() => answered.add(name));
    return { outcome, inputs };
  };
  const flows = { A: start('A'), B: start('B') };
  const advance = async (name: 'A' | 'B', done: () => boolean = () => false): Promise<void> => {
    for (let calls = 0; calls < 300 && !answered.has(name) && !done(); calls++) await lock.step(name);
  };
  const finish = async (): Promise<[ActionOutcome, ActionOutcome]> => {
    await lock.finish(flows.A.outcome, flows.B.outcome);
    return [await flows.A.outcome, await flows.B.outcome];
  };
  return { flows, advance, finish };
}

const uploads = (w: Workspace) => w.db.writes.filter((write) => write.op === 'upload');
const issuedWrites = (w: Workspace) => w.db.writes.filter((write) => write.plural === 'billingInvoices' && write.data?.status === 'ISSUED');

test('an Issue that loaded the draft before another issued it is refused before it uploads anything', async () => {
  for (const [early, late] of [['A', 'B'], ['B', 'A']] as const) {
    const w = workspace();
    const race = racing(w);
    // The late one has rendered its trial and is about to claim: the draft is still a draft for it.
    await race.advance(late, () => race.flows[late].inputs.length > 0);
    await race.advance(early);
    const [a, b] = await race.finish();
    const outcomes = { A: a, B: b };
    assert.deepEqual(outcomes[early].body, { ok: true, number: 'F2026-0001', message: 'Issued as F2026-0001.' }, early);
    assert.deepEqual(outcomes[late].body, { ok: false, problems: [{ code: 'ALREADY_ISSUED', message: 'This document is already issued, as F2026-0001.' }] }, late);
    assert.equal(outcomes[late].status, 422, late);
    assert.equal(uploads(w).length, 1, `${early} ran first: one upload`);
    assert.equal(issuedWrites(w).length, 1, `${early} ran first: one ISSUED write`);
    assert.equal(w.db.timeline.length, 1, `${early} ran first: one timeline message`);
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1);
  }
});

test('an Issue that has uploaded when another issues the draft does not write the document again', async () => {
  for (const [early, late] of [['A', 'B'], ['B', 'A']] as const) {
    const w = workspace();
    const race = racing(w);
    await race.advance(late, () => uploads(w).length > 0);
    await race.advance(early);
    const [a, b] = await race.finish();
    const outcomes = { A: a, B: b };
    assert.equal(outcomes[early].body.ok, true, early);
    assert.deepEqual(problemCodes(outcomes[late]), ['ALREADY_ISSUED'], late);
    assert.equal(issuedWrites(w).length, 1, `${early} ran first: the document is written once`);
    assert.equal(w.db.timeline.length, 1, `${early} ran first: one timeline message`);
    const issued = invoiceRow(w);
    const fileIds = uploads(w).map((write) => write.id);
    assert.equal(fileIds.length, 2, 'the late one’s upload is left orphaned, never attached');
    assert.deepEqual((issued.pdf as { fileId: string }[]).map((file) => file.fileId), [fileIds.at(-1)], 'the PDF field holds the first issuer’s file');
    assert.equal(issued.issuedAt, '2026-09-26T09:30:00.000Z');
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1);
  }
});

test('an Issue far behind another is answered ALREADY_ISSUED', async () => {
  for (const order of [[...Array(12).fill('A'), 'B'], [...Array(12).fill('B'), 'A']] as string[][]) {
    const w = workspace();
    const lock = lockstep(w.db);
    const run = (name: string) => runAction(request(w), { ...setup(w).deps, app: lock.flow(name) });
    const flows = [run('A'), run('B')];
    for (let round = 0; round < 40; round++) for (const name of order) await lock.step(name);
    await lock.finish(...flows);
    const [a, b] = await Promise.all(flows);
    const [first, second] = order[0] === 'A' ? [a!, b!] : [b!, a!];
    assert.equal(first.body.ok && first.body.number, 'F2026-0001', order.join(''));
    assert.deepEqual(problemCodes(second), ['ALREADY_ISSUED'], order.join(''));
    assert.equal(uploads(w).length, 1, order.join(''));
    assert.equal(w.db.timeline.length, 1, order.join(''));
    assert.equal(w.db.rows('billingSequences')[0]?.lastValue, 1, order.join(''));
  }
});

test('with the real Renderer, the issued PDF is a PDF and its hash is the hash of its bytes', async () => {
  const w = workspace();
  const uploads: Uint8Array[] = [];
  const app = { ...w.app, upload: async (file: Parameters<typeof w.app.upload>[0]) => { uploads.push(file.bytes); return w.app.upload(file); } };
  const { deps } = setup(w, { app, render: undefined });
  const outcome = await runAction(request(w), deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  assert.equal(Buffer.from(uploads[0]!.slice(0, 5)).toString('latin1'), '%PDF-');
  assert.equal(invoiceRow(w).documentHash, await sha(uploads[0]!));
});

test('an issued credit note’s snapshot keeps the invoice line each of its lines credits', async () => {
  const w = workspace();
  const { deps } = setup(w);
  assert.equal((await runAction(request(w), deps)).status, 200);
  const note = w.addCreditNote({ invoiceId: w.invoice.id });
  w.addLine(KINDS.billingCreditNote, note.id, { invoiceLineId: w.lines[2]!.id, description: 'Atelier', quantity: 1, unitPrice: money(1_200_000_000) });
  const outcome = await runAction(request(w, { object: 'billingCreditNote', recordId: note.id }), deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  const lines = (w.db.row('billingCreditNotes', note.id)!.snapshot as { record: { lines: Record<string, Record<string, unknown>> } }).record.lines;
  assert.deepEqual(Object.values(lines).map((line) => line.invoiceLineId), [w.lines[2]!.id]);
});
