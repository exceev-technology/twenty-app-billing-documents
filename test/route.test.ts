import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import billingAction, { bodyOf, respond, sha256 } from '../src/logic-functions/billing-action.ts';
import type { ActionDeps } from '../lifecycle/actions.ts';
import { IDS } from '../src/ids.ts';
import { TODAY, now, workspace, type Workspace } from './lifecycle/helpers/fixtures.ts';
import { bundleLogicFunction } from './helpers/logic-function-build.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = async (bytes: Uint8Array): Promise<string> => createHash('sha256').update(bytes).digest('hex');

const depsFor = (w: Workspace, over: Partial<ActionDeps> = {}): ActionDeps => ({
  app: w.app, caller: w.db.store('MANUAL'), now, sha256: sha, reference: () => 'ref-7f3a', log: () => {},
  render: async (input) => ({ bytes: new TextEncoder().encode(`%PDF ${input.number ?? 'DRAFT'}`), pages: 1 }),
  ...over,
});
const issueBody = (w: Workspace, over: Record<string, unknown> = {}) => ({
  action: 'issue', object: 'billingInvoice', recordId: w.invoice.id, localDate: TODAY, locale: 'en', ...over,
});
const SIGNED_IN = { userWorkspaceId: 'user-workspace-1' };
const MEMBER = { workspaceMemberId: 'member-1' };
const noDeps = (): ActionDeps => {
  throw new Error('the route must not build its dependencies for this call');
};

test('the route validates: POST /billing/action, signed in, sixty seconds', () => {
  assert.equal(billingAction.success, true, billingAction.errors.join('\n'));
  assert.equal(billingAction.config.name, 'billing-action');
  assert.equal(billingAction.config.universalIdentifier, IDS['logicFunction.billingAction']);
  assert.deepEqual(billingAction.config.httpRouteTriggerSettings, { path: '/billing/action', httpMethod: 'POST', isAuthRequired: true });
  assert.equal(billingAction.config.timeoutSeconds, 60);
});

test('the body is read parsed, as a JSON string, or as base64', () => {
  assert.deepEqual(bodyOf({ body: { action: 'issue' } }), { action: 'issue' });
  assert.deepEqual(bodyOf({ body: '{"action":"issue"}' }), { action: 'issue' });
  assert.deepEqual(bodyOf({ body: Buffer.from('{"action":"issue"}').toString('base64'), isBase64Encoded: true }), { action: 'issue' });
  assert.equal(bodyOf({ body: 'not json' }), null);
  assert.equal(bodyOf({ body: null }), null);
});

test('a call no signed-in person made is refused as NOT_ALLOWED, in the caller’s language, before anything is read', async () => {
  const w = workspace();
  const apiKey = await respond({ body: issueBody(w, { locale: 'fr-FR' }), userWorkspaceId: null }, { workspaceMemberId: null }, noDeps);
  assert.equal(apiKey.__twentyHttpResponse, true);
  assert.equal(apiKey.status, 403);
  assert.deepEqual(apiKey.body, {
    ok: false,
    problems: [{ code: 'NOT_ALLOWED', message: 'Votre rôle ne permet pas de modifier ce document : vous ne pouvez donc pas lancer cette action.' }],
  });
  const noMember = await respond({ body: issueBody(w), ...SIGNED_IN }, { workspaceMemberId: null }, noDeps);
  assert.equal(noMember.status, 403);
  assert.deepEqual(w.db.writes, []);
});

test('a call with a workspace member but no user workspace, or an empty one, is refused too', async () => {
  const w = workspace();
  for (const userWorkspaceId of [null, '']) {
    const answer = await respond({ body: issueBody(w), userWorkspaceId }, MEMBER, noDeps);
    assert.equal(answer.status, 403, String(userWorkspaceId));
  }
  assert.deepEqual(w.db.writes, []);
});

test('a signed-in person’s Issue runs end to end, and the answer carries the outcome’s status', async () => {
  const w = workspace();
  const issued = await respond({ body: JSON.stringify(issueBody(w)), ...SIGNED_IN }, MEMBER, () => depsFor(w));
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  assert.deepEqual(issued.body, { ok: true, number: 'F2026-0001', message: 'Issued as F2026-0001.' });
  assert.equal(w.db.row('billingInvoices', w.invoice.id)!.status, 'ISSUED');

  const again = await respond({ body: issueBody(w), ...SIGNED_IN }, MEMBER, () => depsFor(w));
  assert.equal(again.status, 422);
  assert.equal((again.body as { problems: { code: string }[] }).problems[0]!.code, 'ALREADY_ISSUED');
});

test('dependencies that cannot be built are answered as unexpected, with a reference, and logged', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const w = workspace();
  const failed = await respond({ body: issueBody(w), ...SIGNED_IN }, MEMBER, noDeps);
  assert.equal(failed.status, 500);
  const [problem] = (failed.body as { problems: { code: string; message: string }[] }).problems;
  assert.equal(problem!.code, 'UNEXPECTED');
  assert.match(problem!.message, /^Something went wrong \(ref [0-9a-f]{8}\)\.$/);
  assert.equal(logged.mock.callCount(), 1);
  assert.doesNotMatch(String(logged.mock.calls[0]!.arguments[0]), /\n/);
});

test('SHA-256 comes from Web Crypto, in hex', async () => {
  assert.equal(await sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('bundled as the CLI bundles it, the route issues a real PDF, and it is the one function that carries pdfmake', async () => {
  // Inside node_modules, so that the two client modules left external resolve, as the platform provides them.
  mkdirSync(join(ROOT, 'node_modules/.cache'), { recursive: true });
  const folder = mkdtempSync(join(ROOT, 'node_modules/.cache/route-bundle-'));
  try {
    const inputs = await bundleLogicFunction(join(ROOT, 'src/logic-functions/billing-action.ts'), join(folder, 'route.mjs'));
    assert.ok(inputs.some((input) => input.includes('pdfmake')), 'the route bundles pdfmake');

    const entry = join(folder, 'entry.ts');
    writeFileSync(entry, [
      `import { createHash } from 'node:crypto';`,
      `import { respond } from ${JSON.stringify(join(ROOT, 'src/logic-functions/billing-action.ts'))};`,
      `import { TODAY, now, workspace } from ${JSON.stringify(join(ROOT, 'test/lifecycle/helpers/fixtures.ts'))};`,
      'const w = workspace();',
      'const uploads = [];',
      'const app = { ...w.app, upload: async (file) => { uploads.push(file.bytes); return w.app.upload(file); } };',
      'const deps = () => ({ app, caller: w.db.store("MANUAL"), now, sha256: async (b) => createHash("sha256").update(b).digest("hex"), reference: () => "ref", log: () => {} });',
      'const body = { action: "issue", object: "billingInvoice", recordId: w.invoice.id, localDate: TODAY, locale: "en" };',
      'const response = await respond({ body, userWorkspaceId: "uw" }, { workspaceMemberId: "wm" }, deps);',
      'const row = w.db.row("billingInvoices", w.invoice.id);',
      'console.log(JSON.stringify({ status: response.status, number: row.number, head: Buffer.from(uploads[0].slice(0, 5)).toString("latin1") }));',
    ].join('\n'));
    await bundleLogicFunction(entry, join(folder, 'entry.mjs'));
    const output = execFileSync(process.execPath, [join(folder, 'entry.mjs')], { cwd: folder, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { status: 200, number: 'F2026-0001', head: '%PDF-' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
