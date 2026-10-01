import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuplicateError, NotAllowedError } from '../../lifecycle/store.ts';
import { literal, restCallerStore, restStore, toFilter, translate, type RestLike, type RestStoreDeps } from '../../src/lib/rest-store.ts';

type Call = { method: string; path: string; body?: unknown; query?: Record<string, unknown> };

/** A REST client that records its calls and answers from a script, like RestApiClient's envelopes and errors. */
function fakeRest(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  const respond = async (call: Call) => {
    calls.push(call);
    const result = answer(call);
    if (result instanceof Error) throw result;
    return result;
  };
  const rest: RestLike = {
    get: (path, options) => respond({ method: 'GET', path, query: options?.query }) as never,
    post: (path, body, options) => respond({ method: 'POST', path, body, query: options?.query }) as never,
    patch: (path, body, options) => respond({ method: 'PATCH', path, body, query: options?.query }) as never,
    delete: (path, options) => respond({ method: 'DELETE', path, query: options?.query }) as never,
  };
  return { rest, calls };
}

const restError = (status: number, body: unknown) => Object.assign(new Error(`Request failed with status ${status}`), { name: 'RestApiClientError', status, body });

function deps(rest: RestLike, over: Partial<RestStoreDeps> = {}): RestStoreDeps & { logs: Record<string, unknown>[] } {
  const logs: Record<string, unknown>[] = [];
  return {
    rest,
    uploadFile: async () => ({ id: 'file-9' }),
    fetchFile: async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer }),
    timelineTypes: async () => [{ id: 'type-issued', universalIdentifier: 'uid-issued', isActive: true }, { id: 'type-fix', universalIdentifier: 'uid-fix', isActive: true }],
    fieldId: (object, field) => `field:${object}.${field}`,
    timelineTypeIds: { ISSUED: 'uid-issued', CORRECTION: 'uid-fix', INVOICED: 'uid-invoiced', CREDITED: 'uid-credited', CANCELLED: 'uid-cancelled' },
    log: (entry) => logs.push(entry),
    logs,
    ...over,
  };
}

test('a where clause becomes Twenty’s filter: conditions joined by commas', () => {
  assert.equal(toFilter({ issuerId: 'u1', documentType: 'INVOICE', periodKey: '2026' }), 'issuerId[eq]:u1,documentType[eq]:INVOICE,periodKey[eq]:2026');
  assert.equal(toFilter({ numberKey: null }), 'numberKey[is]:NULL');
  assert.equal(toFilter({ numberKey: { notNull: true }, issueDate: { gte: '2026-01-01', lte: '2026-12-31' } }), 'numberKey[is]:NOT_NULL,issueDate[gte]:2026-01-01,issueDate[lte]:2026-12-31');
  assert.equal(toFilter({ scopeKey: 'u1:INVOICE:2026' }), 'scopeKey[eq]:u1:INVOICE:2026');
  assert.equal(toFilter({ id: 'r1' }, 'include'), 'id[eq]:r1,or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)');
  assert.equal(toFilter({}, 'only'), 'deletedAt[is]:NOT_NULL');
  assert.equal(toFilter({}), undefined);
  assert.equal(toFilter({ active: true }), 'active[eq]:true');
});

test('a value is quoted when it holds a comma or a space, and refused when Twenty’s parser cannot carry it', () => {
  assert.equal(literal('a, b'), '"a, b"');
  for (const unsafe of ["O'Brien", 'a"b', '[x]', '(x)', '']) assert.throws(() => literal(unsafe), /cannot carry/, unsafe);
});

test('a list reads every page, two hundred at a time, and honours order and limit', async () => {
  const pages = [
    { data: { billingInvoices: [{ id: 'a' }, { id: 'b' }] }, pageInfo: { hasNextPage: true, endCursor: 'b' } },
    { data: { billingInvoices: [{ id: 'c' }] }, pageInfo: { hasNextPage: false, endCursor: 'c' } },
  ];
  const { rest, calls } = fakeRest(() => pages.shift());
  const store = restStore(deps(rest));
  assert.deepEqual((await store.list('billingInvoices', { issuerId: 'u1' })).map((row) => row.id), ['a', 'b', 'c']);
  assert.deepEqual(calls.map((call) => call.query), [
    { depth: 0, limit: 200, filter: 'issuerId[eq]:u1' },
    { depth: 0, limit: 200, filter: 'issuerId[eq]:u1', starting_after: 'b' },
  ]);
  const ordered = fakeRest(() => ({ data: { billingInvoices: [{ id: 'z' }] }, pageInfo: { hasNextPage: true, endCursor: 'z' } }));
  const rows = await restStore(deps(ordered.rest)).list('billingInvoices', {}, { orderBy: { field: 'issueDate', direction: 'desc' }, limit: 1, deleted: 'include' });
  assert.deepEqual(rows.map((row) => row.id), ['z']);
  assert.deepEqual(ordered.calls[0]?.query, { depth: 0, limit: 1, filter: 'or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)', order_by: 'issueDate[DescNullsLast]' });
});

test('a list that does not come back as one fails loudly', async () => {
  const { rest } = fakeRest(() => ({ error: 'unauthorised' }));
  await assert.rejects(restStore(deps(rest)).list('billingInvoices', {}), /did not return a billingInvoices list/);
});

test('a record is read by its path; one that may be soft-deleted through a list; a 404 is nothing', async () => {
  const { rest, calls } = fakeRest((call) => {
    if (call.path === '/rest/billingInvoices/r1') return { data: { billingInvoice: { id: 'r1' } } };
    if (call.path === '/rest/billingInvoices/r404') return restError(404, { messages: ['Record not found'] });
    return { data: { billingInvoices: [{ id: 'r2', deletedAt: '2026-09-26T10:00:00Z' }] }, pageInfo: { hasNextPage: false } };
  });
  const store = restStore(deps(rest));
  assert.equal((await store.get('billingInvoices', 'r1'))?.id, 'r1');
  assert.equal(await store.get('billingInvoices', 'r404'), null);
  assert.equal((await store.get('billingInvoices', 'r2', { deleted: true }))?.id, 'r2');
  assert.equal(calls[2]?.query?.filter, 'id[eq]:r2,or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)');
});

test('writes unwrap Twenty’s envelopes, and a soft delete is never a destroy', async () => {
  const { rest, calls } = fakeRest((call) => {
    if (call.method === 'POST') return { data: { createBillingSequence: { id: 'new', ...(call.body as object) } } };
    if (call.method === 'PATCH' && call.path.endsWith('/restore')) return { data: { restoreBillingInvoice: { id: 'r1' } } };
    if (call.method === 'PATCH') return { data: { updateBillingInvoice: { id: 'r1', ...(call.body as object) } } };
    return { data: { deleteBillingInvoice: { id: 'r1' } } };
  });
  const store = restStore(deps(rest));
  assert.deepEqual(await store.create('billingSequences', { lastValue: 0 }), { id: 'new', lastValue: 0 });
  assert.deepEqual(await store.update('billingInvoices', 'r1', { subject: 'x' }), { id: 'r1', subject: 'x' });
  await store.softDelete('billingInvoices', 'r1');
  await store.restore('billingInvoices', 'r1');
  assert.deepEqual(calls.slice(2).map((call) => [call.method, call.path, call.query]), [
    ['DELETE', '/rest/billingInvoices/r1', { soft_delete: true }],
    ['PATCH', '/rest/billingInvoices/r1/restore', undefined],
  ]);
});

test('Twenty’s refusals become the Store’s errors', async () => {
  const duplicate = restError(400, { statusCode: 400, error: 'BadRequestException', messages: ['A duplicate entry was detected: unique constraint _billingInvoice.IDX_UNIQUE_x was violated'] });
  const denied = restError(400, { statusCode: 400, error: 'Error', messages: ['Entity performing the request does not have permission'], code: 'PERMISSION_DENIED' });
  assert.ok(translate(duplicate) instanceof DuplicateError);
  assert.ok(translate(denied) instanceof NotAllowedError);
  const other = restError(400, { messages: ['Invalid number value'] });
  assert.equal(translate(other), other);
  const { rest } = fakeRest(() => duplicate);
  await assert.rejects(restStore(deps(rest)).update('billingInvoices', 'r1', { numberKey: 'x' }), DuplicateError);
});

test('the caller’s write is refused as NOT_ALLOWED on a permission refusal or a record hidden from them', async () => {
  for (const error of [restError(400, { code: 'PERMISSION_DENIED', messages: ['Entity performing the request does not have permission'] }), restError(404, { messages: ['Record not found'] })]) {
    const { rest } = fakeRest(() => error);
    await assert.rejects(restCallerStore(rest).update('billingInvoices', 'r1', { issueDate: '2026-09-26' }), NotAllowedError);
  }
});

test('a PDF is uploaded for its field, and the FILES value keeps only its id and label', async () => {
  const uploads: unknown[] = [];
  const { rest } = fakeRest(() => ({}));
  const store = restStore(deps(rest, { uploadFile: async (bytes, name, mime, field) => { uploads.push([bytes.length, name, mime, field]); return { id: 'file-1' }; } }));
  assert.deepEqual(await store.upload({ bytes: new Uint8Array(3), name: 'F2026-0001.pdf', mime: 'application/pdf', object: 'billingInvoice', field: 'pdf' }), { fileId: 'file-1', label: 'F2026-0001.pdf' });
  assert.deepEqual(uploads, [[3, 'F2026-0001.pdf', 'application/pdf', 'field:billingInvoice.pdf']]);
});

test('a file is downloaded from its signed link, its type read from its bytes', async () => {
  const { rest } = fakeRest(() => ({}));
  const fetched: string[] = [];
  const store = restStore(deps(rest, { fetchFile: async (url) => { fetched.push(url); return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer }; } }));
  assert.deepEqual(await store.download({ fileId: 'f', label: 'logo.jpg', extension: '.jpg', url: 'https://x/file/files-field/f?token=t' }), { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), type: 'image/jpeg' });
  assert.deepEqual(fetched, ['https://x/file/files-field/f?token=t']);
  assert.equal(await store.download({ fileId: 'f', label: 'logo.png' }), null);
  const failing = deps(rest, { fetchFile: async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) }) });
  assert.equal(await restStore(failing).download({ fileId: 'f', url: 'https://x' }), null);
  assert.equal(failing.logs[0]?.download, 'failed');
});

test('a download that fails in transport is logged and is nothing, as a refused one is', async () => {
  const { rest } = fakeRest(() => ({}));
  const unreachable = deps(rest, { fetchFile: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(await restStore(unreachable).download({ fileId: 'f', url: 'https://x' }), null);
  assert.deepEqual(unreachable.logs, [{ download: 'failed', fileId: 'f', error: 'fetch failed' }]);
  const cut = deps(rest, { fetchFile: async () => ({ ok: true, status: 200, arrayBuffer: async () => { throw new Error('socket hang up'); } }) });
  assert.equal(await restStore(cut).download({ fileId: 'f', url: 'https://x' }), null);
  assert.deepEqual(cut.logs, [{ download: 'failed', fileId: 'f', error: 'socket hang up' }]);
});

test('a timeline message is written as the app, on the record, with the type found by its universal identifier', async () => {
  const { rest, calls } = fakeRest(() => ({ data: { createTimelineActivity: { id: 't1' } } }));
  let lookups = 0;
  const store = restStore(deps(rest, { timelineTypes: async () => { lookups += 1; return [{ id: 'type-fix', universalIdentifier: 'uid-fix', isActive: true }]; } }));
  await store.timeline({ object: 'billingInvoice', recordId: 'r1', kind: 'CORRECTION', text: 'Put back.' });
  await store.timeline({ object: 'billingSequence', recordId: 's1', kind: 'CORRECTION', text: 'Again.' });
  assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [
    ['POST', '/rest/timelineActivities', { timelineActivityTypeId: 'type-fix', targetBillingInvoiceId: 'r1', properties: { message: 'Put back.' } }],
    ['POST', '/rest/timelineActivities', { timelineActivityTypeId: 'type-fix', targetBillingSequenceId: 's1', properties: { message: 'Again.' } }],
  ]);
  assert.equal(lookups, 1);
});

test('a muted or missing timeline type, or a failed write, is logged and never thrown', async () => {
  const { rest, calls } = fakeRest(() => restError(400, { messages: ['Active timeline activity type was not found'] }));
  const muted = deps(rest, { timelineTypes: async () => [{ id: 'type-fix', universalIdentifier: 'uid-fix', isActive: false }] });
  await restStore(muted).timeline({ object: 'billingInvoice', recordId: 'r1', kind: 'CORRECTION', text: 'x' });
  assert.equal(calls.length, 0);
  assert.equal(muted.logs[0]?.timeline, 'skipped');
  const failing = deps(rest);
  await restStore(failing).timeline({ object: 'billingInvoice', recordId: 'r1', kind: 'ISSUED', text: 'x' });
  assert.deepEqual(failing.logs, [{
    timeline: 'failed', kind: 'ISSUED', object: 'billingInvoice', recordId: 'r1',
    error: 'Request failed with status 400', messages: ['Active timeline activity type was not found'],
  }]);
});

test('the caller creates a record with their own token, and a refusal is NOT_ALLOWED', async () => {
  const { rest, calls } = fakeRest(() => ({ data: { createBillingInvoice: { id: 'inv-9', status: 'DRAFT' } } }));
  assert.deepEqual(await restCallerStore(rest).create('billingInvoices', { status: 'DRAFT' }), { id: 'inv-9', status: 'DRAFT' });
  assert.deepEqual(calls, [{ method: 'POST', path: '/rest/billingInvoices', body: { status: 'DRAFT' }, query: undefined }]);
  const refused = fakeRest(() => restError(400, { statusCode: 400, error: 'Error', messages: ['Entity performing the request does not have permission'], code: 'PERMISSION_DENIED' }));
  await assert.rejects(restCallerStore(refused.rest).create('billingInvoices', {}), NotAllowedError);
});
