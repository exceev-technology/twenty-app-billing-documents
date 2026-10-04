import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, isIssued, kindOf, kindOfLine, loadDocument, loadFigures, loadLogo } from '../../lifecycle/load.ts';
import { money, workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;

test('the three kinds name their objects, lines, profile fields and locked fields', () => {
  assert.equal(kindOf('billingInvoice'), INVOICE);
  assert.equal(kindOfLine('billingCreditNoteLine'), KINDS.billingCreditNote);
  assert.equal(kindOf('company'), undefined);
  assert.deepEqual(
    [KINDS.billingQuote.parentKey, INVOICE.parentKey, KINDS.billingCreditNote.parentKey],
    ['quoteId', 'invoiceId', 'creditNoteId'],
  );
  assert.deepEqual([...INVOICE.lockedFields].sort(), [
    'buyerReference', 'companyId', 'currencyCode', 'dueDate', 'issueDate', 'issuerId', 'language', 'notes', 'personId',
    'pricesIncludeTax', 'subject',
  ]);
  assert.deepEqual([...KINDS.billingCreditNote.lockedFields].sort(), [
    'companyId', 'currencyCode', 'invoiceId', 'issueDate', 'issuerId', 'language', 'notes', 'personId', 'pricesIncludeTax',
    'reason', 'subject',
  ]);
  assert.deepEqual(KINDS.billingQuote.lockedFields, []);
});

test('an invoice or credit note is issued once it holds a snapshot; a quote never is', () => {
  assert.equal(isIssued(INVOICE, { id: 'a', snapshot: null }), false);
  assert.equal(isIssued(INVOICE, { id: 'a', snapshot: { printed: {}, record: {} } }), true);
  assert.equal(isIssued(KINDS.billingQuote, { id: 'a', snapshot: { printed: {}, record: {} } }), false);
});

test('a draft invoice loads with its lines in order, their tax codes, the issuer, its profile and the buyer', async () => {
  const w = workspace();
  const loaded = await loadDocument(w.app, INVOICE, w.invoice.id);
  assert.ok(loaded);
  assert.equal(loaded.document.id, w.invoice.id);
  assert.deepEqual(loaded.lines.map((line) => line.description), ['Direction artistique', 'Système de design', 'Atelier']);
  assert.equal(loaded.issuer?.id, w.issuer.id);
  assert.equal(loaded.profile?.id, w.profile.id);
  assert.equal(loaded.company?.id, w.company.id);
  assert.equal(loaded.person, null);
  assert.equal(loaded.invoice, null);
  assert.deepEqual(loaded.taxCodes.get(w.vat20.id)?.components.map((component) => component.rate), [20]);
  assert.deepEqual(loaded.sellerIdentifiers.map((identifier) => identifier.value).sort(), ['000000000', 'FR12000000000']);
  assert.deepEqual(loaded.buyerIdentifiers.map((identifier) => identifier.value), ['111111111']);
  assert.deepEqual(loaded.profileTypes.map((type) => type.key).sort(), ['fr.siren', 'fr.tva']);
  assert.equal(loaded.identifierTypes.get(w.siren.id)?.name, 'SIREN');
});

test('lines follow their order, then their creation; deleted lines and deleted tax components are left out', async () => {
  const w = workspace();
  const invoice = w.addInvoice();
  const late = w.addLine(INVOICE, invoice.id, { sortOrder: 2, description: 'second, created first' });
  w.addLine(INVOICE, invoice.id, { sortOrder: 1, description: 'first' });
  w.addLine(INVOICE, invoice.id, { sortOrder: 2, description: 'second, created later' });
  w.addLine(INVOICE, invoice.id, { sortOrder: null, description: 'unordered, last' });
  const gone = w.addLine(INVOICE, invoice.id, { sortOrder: 0, description: 'deleted' });
  await w.app.softDelete(INVOICE.linePlural, gone.id);
  const component = w.db.seed('billingTaxComponents', { name: 'extra', taxCodeId: w.vat20.id, rate: 5, compound: false, sortOrder: 1 });
  await w.app.softDelete('billingTaxComponents', component.id);
  const loaded = await loadDocument(w.app, INVOICE, invoice.id);
  assert.deepEqual(loaded?.lines.map((line) => line.description), ['first', 'second, created first', 'second, created later', 'unordered, last']);
  assert.equal(loaded?.lines[1]?.id, late.id);
  assert.deepEqual(loaded?.taxCodes.get(w.vat20.id)?.components.map((c) => c.name), ['TVA']);
});

test('the buyer’s identifiers are the company’s when a company is billed, else the person’s', async () => {
  const w = workspace();
  w.db.seed('billingIdentifiers', { value: '222222222', identifierTypeId: w.siren.id, issuerId: null, companyId: null, personId: w.person.id });
  const both = await loadDocument(w.app, INVOICE, w.addInvoice({ personId: w.person.id }).id);
  assert.deepEqual(both?.buyerIdentifiers.map((identifier) => identifier.value), ['111111111']);
  const personOnly = await loadDocument(w.app, INVOICE, w.addInvoice({ companyId: null, personId: w.person.id }).id);
  assert.deepEqual(personOnly?.buyerIdentifiers.map((identifier) => identifier.value), ['222222222']);
  assert.equal(personOnly?.person?.id, w.person.id);
});

test('a credit note loads the invoice it corrects', async () => {
  const w = workspace();
  const note = w.addCreditNote({ invoiceId: w.invoice.id });
  const loaded = await loadDocument(w.app, KINDS.billingCreditNote, note.id);
  assert.equal(loaded?.invoice?.id, w.invoice.id);
});

test('a document that does not exist loads as nothing; a missing issuer or profile loads empty, for the gate to name', async () => {
  const w = workspace();
  assert.equal(await loadDocument(w.app, INVOICE, 'no-such-id'), null);
  const orphan = await loadDocument(w.app, INVOICE, w.addInvoice({ issuerId: null }).id);
  assert.equal(orphan?.issuer, null);
  assert.equal(orphan?.profile, null);
  assert.deepEqual(orphan?.sellerIdentifiers, []);
  const bare = w.db.seed('billingIssuers', { name: 'No profile', profileId: null });
  const unprofiled = await loadDocument(w.app, INVOICE, w.addInvoice({ issuerId: bare.id }).id);
  assert.equal(unprofiled?.profile, null);
  assert.deepEqual(unprofiled?.profileTypes, []);
});

test('an identifier whose type belongs to another profile still brings its type, to be printed', async () => {
  const w = workspace();
  const other = w.db.seed('billingProfiles', { name: 'Elsewhere' });
  const ein = w.db.seed('billingIdentifierTypes', { name: 'EIN', key: 'us.ein', profileId: other.id, appliesTo: 'SELLER', printOnDocuments: true, sortOrder: 0 });
  w.db.seed('billingIdentifiers', { value: '12-3456789', identifierTypeId: ein.id, issuerId: w.issuer.id, companyId: null, personId: null });
  const loaded = await loadDocument(w.app, INVOICE, w.invoice.id);
  assert.equal(loaded?.identifierTypes.get(ein.id)?.name, 'EIN');
  assert.ok(!loaded?.profileTypes.some((type) => type.id === ein.id));
});

test('the figures alone load the lines, tax codes, issuer and profile, not the parties', async () => {
  const w = workspace();
  const figures = await loadFigures(w.app, INVOICE, w.invoice.id);
  assert.equal(figures?.lines.length, 3);
  assert.equal(figures?.profile?.id, w.profile.id);
  assert.equal('company' in (figures ?? {}), false);
});

test('a soft-deleted document still loads its figures, for a guard to look at', async () => {
  const w = workspace();
  await w.app.softDelete(INVOICE.plural, w.invoice.id);
  assert.equal(await loadFigures(w.app, INVOICE, w.invoice.id), null);
  assert.equal((await loadFigures(w.app, INVOICE, w.invoice.id, { deleted: true }))?.document.id, w.invoice.id);
});

test('the logo is the issuer’s first file, with its type; no logo is nothing', async () => {
  const w = workspace();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const fileId = w.db.addFile(png, 'image/png');
  assert.deepEqual(await loadLogo(w.app, { ...w.issuer, logo: [{ fileId, label: 'logo.png' }] }), { bytes: png, type: 'image/png' });
  assert.equal(await loadLogo(w.app, w.issuer), null);
  assert.equal(await loadLogo(w.app, null), null);
  const jpg = w.db.addFile(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpg');
  assert.equal((await loadLogo(w.app, { ...w.issuer, logo: [{ fileId: jpg, label: 'logo.jpg' }] }))?.type, 'image/jpeg');
});

test('a line whose tax code was deleted loads without it, so the Engine reports the missing code', async () => {
  const w = workspace();
  const invoice = w.addInvoice();
  const code = w.db.seed('billingTaxCodes', { name: 'Gone', category: 'STANDARD' });
  w.addLine(INVOICE, invoice.id, { taxCodeId: code.id, unitPrice: money(1_000_000) });
  await w.app.softDelete('billingTaxCodes', code.id);
  const loaded = await loadDocument(w.app, INVOICE, invoice.id);
  assert.equal(loaded?.taxCodes.has(code.id), false);
});

test('a credit note loads its invoice’s issued credit notes, itself and the drafts left out', async () => {
  const w = workspace();
  const issuedNote = w.addCreditNote({ invoiceId: w.invoice.id, status: 'ISSUED', snapshot: { record: {} } });
  w.addCreditNote({ invoiceId: w.invoice.id, status: 'DRAFT' });
  const mine = w.addCreditNote({ invoiceId: w.invoice.id });
  const loaded = await loadDocument(w.app, KINDS.billingCreditNote, mine.id);
  assert.deepEqual(loaded?.credits.map((note) => note.id), [issuedNote.id]);
  const invoiceLoaded = await loadDocument(w.app, KINDS.billingInvoice, w.invoice.id);
  assert.deepEqual(invoiceLoaded?.credits, []);
});
