import { computeDocument, EngineError } from '../engine/index.ts';
import { renderDocument } from '../render/document.ts';
import { RenderError, type RenderInput, type RenderResult } from '../render/types.ts';
import { checkGate, resetOf } from './gate.ts';
import { describeAll, LifecycleError, packFor, PACKS, type AnyProblem, type LifecyclePack, type WordedProblem } from './lang/pack.ts';
import { isIssued, kindOf, LINE_FIELDS, loadDocument, loadLogo, type DocumentObject, type Kind, type Loaded } from './load.ts';
import { effectiveCurrency, fileInputs, idOf, languageOf, moneyOf, textOf, toDocumentInput, toRenderInput } from './map.ts';
import { claimNumber, heldNumberOf, latestIssueDate, nextNumber, raiseLedger, scopeOf, type Scope } from './numbering.ts';
import { leaveMessage, NotAllowedError, type CallerStore, type Row, type Store } from './store.ts';
import { sameMoney } from './totals.ts';

export type ActionName = 'preview' | 'issue' | 'quotePdf';
export type ActionRequest = { action: ActionName; object: DocumentObject; recordId: string; localDate: string; locale: string };
export type ActionResponse = { ok: true; number?: string; version?: number; message: string } | { ok: false; problems: WordedProblem[] };
export type ActionOutcome = { status: 200 | 403 | 422 | 500; body: ActionResponse };

export type ActionDeps = {
  /** Reads and every write after the first, as the app. */
  app: Store;
  /** The first write, with the caller's own token: Twenty's role check decides who may act. */
  caller: CallerStore;
  now: () => Date;
  /** Hex SHA-256 of the PDF's bytes. */
  sha256: (bytes: Uint8Array) => Promise<string>;
  /** A short reference for an unexpected failure, which the person can quote. */
  reference: () => string;
  log: (entry: Record<string, unknown>) => void;
  /** The Renderer; tests replace it. */
  render?: (input: RenderInput) => Promise<RenderResult>;
};

const OBJECTS: Record<ActionName, readonly DocumentObject[]> = {
  preview: ['billingInvoice', 'billingCreditNote'],
  issue: ['billingInvoice', 'billingCreditNote'],
  quotePdf: ['billingQuote'],
};

const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The request a button posts (spec §6), or null when it is not one: an action on its own kind of document. */
export function parseRequest(raw: unknown): ActionRequest | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { action, object, recordId, localDate, locale } = raw as Record<string, unknown>;
  // Own names only: 'toString' or '__proto__' are inherited, and are no action.
  if (typeof action !== 'string' || !Object.hasOwn(OBJECTS, action)) return null;
  if (typeof object !== 'string' || !OBJECTS[action as ActionName].includes(object as DocumentObject)) return null;
  if (typeof recordId !== 'string' || !RECORD_ID.test(recordId)) return null;
  if (typeof localDate !== 'string' || !isCalendarDate(localDate)) return null;
  return { action: action as ActionName, object: object as DocumentObject, recordId, localDate, locale: typeof locale === 'string' ? locale : 'en' };
}

const dayNumber = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** A calendar date `days` after `date`. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const wholeDays = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;

/**
 * The first write (spec §6, "Who may act"): the draft's empty defaults, and
 * always the issue date, rewritten as it is when set.
 */
async function defaultsFor(store: Store, kind: Kind, document: Row, localDate: string): Promise<Record<string, unknown>> {
  const issuerId = idOf(document.issuerId);
  const issuer = issuerId ? await store.get('billingIssuers', issuerId) : null;
  const profileId = idOf(issuer?.profileId);
  const profile = profileId ? await store.get('billingProfiles', profileId) : null;
  const issueDate = textOf(document.issueDate) || localDate;
  const patch: Record<string, unknown> = { issueDate };
  if (textOf(document.currencyCode).trim() === '') {
    const currency = effectiveCurrency({ document, issuer, profile });
    if (currency !== '') patch.currencyCode = currency;
  }
  if (textOf(document.language) === '' && textOf(profile?.language) !== '') patch.language = profile!.language;
  const term = wholeDays(profile?.defaultPaymentTermDays);
  if (kind.kind === 'INVOICE' && textOf(document.dueDate) === '' && term !== null) patch.dueDate = addDays(issueDate, term);
  const validity = wholeDays(profile?.defaultQuoteValidityDays);
  if (kind.kind === 'QUOTE' && textOf(document.validUntil) === '' && validity !== null) patch.validUntil = addDays(issueDate, validity);
  return patch;
}

/** The snapshot's `record` (spec §6): the fields an issued document locks, and each line's, by record id. */
export function recordOf(kind: Kind, loaded: Loaded): { document: Record<string, unknown>; lines: Record<string, Record<string, unknown>> } {
  const pick = (row: Row, fields: readonly string[]) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
  return {
    document: { id: loaded.document.id, ...pick(loaded.document, kind.lockedFields) },
    lines: Object.fromEntries(loaded.lines.map((line) => [line.id, { ...pick(line, LINE_FIELDS), [kind.parentKey]: loaded.document.id }])),
  };
}

type Run = {
  request: ActionRequest;
  kind: Kind;
  loaded: Loaded;
  scope: Scope;
  issueDate: string;
  pack: LifecyclePack;
  deps: ActionDeps;
  render: (input: RenderInput) => Promise<RenderResult>;
  step: (name: string) => void;
};

const ok = (message: string, extra: { number?: string; version?: number } = {}): ActionOutcome => ({ status: 200, body: { ok: true, ...extra, message } });

function refuse(status: 403 | 422, pack: LifecyclePack, problems: readonly AnyProblem[], lineNumbers?: ReadonlyMap<string, number>): ActionOutcome {
  return { status, body: { ok: false, problems: describeAll(problems, pack.code, lineNumbers) } };
}

const alreadyIssued = (pack: LifecyclePack, document: Row): ActionOutcome =>
  refuse(422, pack, [{ source: 'lifecycle', code: 'ALREADY_ISSUED', value: textOf(document.number) }]);

/**
 * A fresh read before each write that cannot be taken back (the upload, the
 * ISSUED write): another request for the same draft may have issued it since
 * this one loaded it. It narrows the window, it cannot close it: two requests
 * that both pass the last re-read can still both write, as Twenty has no
 * compare-and-set. The outcome is still one number (the unique numberKey),
 * identical PDF bytes and hash, at worst a duplicate timeline row and an
 * orphaned upload; and the button ignores a second click (spec §6).
 */
async function issuedMeanwhile(run: Run): Promise<ActionOutcome | null> {
  const current = await run.deps.app.get(run.kind.plural, run.loaded.document.id);
  if (!current) throw new Error('The document no longer exists');
  return isIssued(run.kind, current) ? alreadyIssued(run.pack, current) : null;
}

/** The figures, the logo, and the Renderer's input for a number and a version. */
async function prepare(run: Run) {
  const totals = computeDocument(toDocumentInput(run.loaded));
  const logo = await loadLogo(run.deps.app, run.loaded.issuer);
  // An issued PDF is never rendered again: it must not go out without the logo its issuer has. Before any claim.
  const holdsLogo = Array.isArray(run.loaded.issuer?.logo) && Boolean(run.loaded.issuer.logo[0]);
  if (!logo && holdsLogo) throw new Error('The issuer’s logo could not be downloaded');
  const inputFor = (number: string | null, version?: number): RenderInput =>
    toRenderInput(run.loaded, totals, { number, version, issueDate: run.issueDate, logo });
  return { totals, logo, inputFor };
}

async function preview(run: Run): Promise<ActionOutcome> {
  const { kind, deps, loaded } = run;
  run.step('render');
  const { inputFor } = await prepare(run);
  const { bytes } = await run.render(inputFor(null));
  run.step('upload');
  const file = await deps.app.upload({ bytes, name: `Preview ${run.request.localDate}.pdf`, mime: 'application/pdf', object: kind.object, field: 'pdf' });
  run.step('store');
  await deps.app.update(kind.plural, loaded.document.id, { pdf: [file] });
  return ok(run.pack.messages.previewReady);
}

async function logoReference(run: Run, logo: { bytes: Uint8Array } | null): Promise<{ fileId: string; sha256: string } | null> {
  const first = Array.isArray(run.loaded.issuer?.logo) ? (run.loaded.issuer.logo[0] as { fileId?: unknown } | undefined) : undefined;
  if (!logo || typeof first?.fileId !== 'string') return null;
  return { fileId: first.fileId, sha256: await run.deps.sha256(logo.bytes) };
}

async function issue(run: Run): Promise<ActionOutcome> {
  const { kind, deps, loaded, scope, issueDate } = run;
  const { document, issuer, profile } = loaded;
  const pattern = textOf(profile![kind.patternField]);
  const currency = textOf(document.currencyCode);

  run.step('trial');
  const { totals, logo, inputFor } = await prepare(run);
  // The gate has refused a held number that is not this issuer's and period's.
  const held = heldNumberOf(document, issuer!.id, pattern, issueDate);
  const trialNumber = held?.number ?? (await nextNumber(deps.app, scope, pattern, issueDate)).number;
  let rendered = await run.render(inputFor(trialNumber));

  run.step('claim');
  const claim = await claimNumber(deps.app, { kind, documentId: document.id, issuerId: issuer!.id, pattern, reset: resetOf(profile), issueDate });

  run.step('render');
  if (claim.number !== trialNumber) rendered = await run.render(inputFor(claim.number));

  run.step('upload');
  const issuedBeforeUpload = await issuedMeanwhile(run);
  if (issuedBeforeUpload) return issuedBeforeUpload;
  const file = await deps.app.upload({ bytes: rendered.bytes, name: `${claim.number}.pdf`, mime: 'application/pdf', object: kind.object, field: 'pdf' });
  const documentHash = await deps.sha256(rendered.bytes);

  run.step('lines');
  for (const line of loaded.lines) {
    const micros = totals.lines.find((entry) => entry.key === line.id)?.lineTotalMicros;
    if (micros === undefined) continue;
    const wanted = moneyOf(micros, currency);
    if (!sameMoney(line.lineTotal, wanted)) await deps.app.update(kind.linePlural, line.id, { lineTotal: wanted });
  }

  run.step('document');
  const issuedBeforeWrite = await issuedMeanwhile(run);
  if (issuedBeforeWrite) return issuedBeforeWrite;
  const printed = inputFor(claim.number);
  const snapshot: Record<string, unknown> = {
    printed: { ...printed, brand: { ...printed.brand, logo: await logoReference(run, logo) } },
    record: recordOf(kind, loaded),
  };
  await deps.app.update(kind.plural, document.id, {
    status: 'ISSUED',
    issuedAt: deps.now().toISOString(),
    issueDate,
    snapshot,
    documentHash,
    pdf: [file],
    subtotal: moneyOf(totals.subtotalMicros, currency),
    discountTotal: moneyOf(totals.discountTotalMicros, currency),
    taxTotal: moneyOf(totals.taxTotalMicros, currency),
    total: moneyOf(totals.totalMicros, currency),
  });

  run.step('ledger');
  if (claim.n !== null) await raiseLedger(deps.app, scope, claim.n);
  const documentPack = PACKS[languageOf(document, profile)] ?? PACKS.EN;
  await leaveMessage(deps.app, { object: kind.object, recordId: document.id, kind: 'ISSUED', text: documentPack.messages.issued(kind.kind, claim.number) });
  return ok(run.pack.messages.issued(kind.kind, claim.number), { number: claim.number });
}

async function quotePdf(run: Run): Promise<ActionOutcome> {
  const { kind, deps, loaded, scope, issueDate } = run;
  const { document, issuer, profile } = loaded;
  const pattern = textOf(profile![kind.patternField]);
  const held = heldNumberOf(document, issuer!.id, pattern, issueDate);
  const version = held ? (wholeDays(document.version) ?? 0) + 1 : 1;

  run.step('trial');
  const { inputFor } = await prepare(run);
  const trialNumber = held?.number ?? (await nextNumber(deps.app, scope, pattern, issueDate)).number;
  let rendered = await run.render(inputFor(trialNumber, version));

  run.step('claim');
  const claim = await claimNumber(deps.app, { kind, documentId: document.id, issuerId: issuer!.id, pattern, reset: resetOf(profile), issueDate });

  run.step('render');
  if (claim.number !== trialNumber) rendered = await run.render(inputFor(claim.number, version));

  run.step('upload');
  const file = await deps.app.upload({ bytes: rendered.bytes, name: `${claim.number} v${version}.pdf`, mime: 'application/pdf', object: kind.object, field: 'pdf' });

  run.step('store');
  await deps.app.update(kind.plural, document.id, { version, pdf: [file, ...fileInputs(document.pdf)].slice(0, 10) });
  return ok(run.pack.messages.quotePdf(claim.number, version), { number: claim.number, version });
}

/** What a button asked for, answered: never a thrown error, always an outcome the route can send. */
export async function runAction(raw: unknown, deps: ActionDeps): Promise<ActionOutcome> {
  const locale = (raw as { locale?: unknown } | null)?.locale;
  const pack = packFor(typeof locale === 'string' ? locale : null);
  let request: ActionRequest | null = null;
  let step = 'request';
  try {
    request = parseRequest(raw);
    if (!request) throw new Error('The request is not one of the actions this route runs');
    const serverDate = deps.now().toISOString().slice(0, 10);
    if (Math.abs(dayNumber(request.localDate) - dayNumber(serverDate)) > 1) {
      return refuse(422, pack, [{ source: 'lifecycle', code: 'CLOCK_SKEW', field: 'localDate', value: request.localDate }]);
    }
    const kind = kindOf(request.object)!;

    step = 'read';
    const document = await deps.app.get(kind.plural, request.recordId);
    if (!document) throw new Error('The document no longer exists');
    if (isIssued(kind, document)) return alreadyIssued(pack, document);

    step = 'defaults';
    const defaults = await defaultsFor(deps.app, kind, document, request.localDate);
    try {
      await deps.caller.update(kind.plural, document.id, defaults);
    } catch (error) {
      if (error instanceof NotAllowedError) return refuse(403, pack, [{ source: 'lifecycle', code: 'NOT_ALLOWED' }]);
      throw error;
    }

    step = 'load';
    const loaded = await loadDocument(deps.app, kind, document.id);
    if (!loaded) throw new Error('The document no longer exists');
    // Another request may have issued it meanwhile: a double click is answered as the first read would have been.
    if (isIssued(kind, loaded.document)) return alreadyIssued(pack, loaded.document);
    const lineNumbers = new Map(loaded.lines.map((line, index) => [line.id, index + 1]));

    step = 'gate';
    const issueDate = textOf(loaded.document.issueDate);
    const scope = loaded.issuer && loaded.profile ? scopeOf(kind, loaded.issuer.id, resetOf(loaded.profile), issueDate) : null;
    const latest = request.action === 'issue' && scope ? await latestIssueDate(deps.app, scope, document.id) : null;
    const problems = checkGate(loaded, { action: request.action, localDate: request.localDate, latestIssueDate: latest });
    if (problems.length > 0) return refuse(422, pack, problems, lineNumbers);

    const run: Run = {
      request, kind, loaded, scope: scope!, issueDate, pack, deps,
      render: deps.render ?? renderDocument,
      step: (name) => {
        step = name;
      },
    };
    if (request.action === 'preview') return await preview(run);
    if (request.action === 'issue') return await issue(run);
    return await quotePdf(run);
  } catch (error) {
    if (error instanceof LifecycleError) return refuse(422, pack, error.problems.map((problem): AnyProblem => ({ source: 'lifecycle', ...problem })));
    if (error instanceof RenderError) return refuse(422, pack, error.problems.map((problem): AnyProblem => ({ source: 'render', problem })));
    if (error instanceof EngineError) return refuse(422, pack, error.problems.map((problem): AnyProblem => ({ source: 'engine', problem })));
    const reference = deps.reference();
    deps.log({
      reference, object: request?.object ?? null, recordId: request?.recordId ?? null, action: request?.action ?? null, step,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: pack.messages.unexpected(reference) }] } };
  }
}
