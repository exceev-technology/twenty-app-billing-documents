import { defineLogicFunction } from 'twenty-sdk/define';
import { Response as TwentyResponse, type LogicFunctionExecutionContext, type RoutePayload } from 'twenty-sdk/logic-function';
import {
  attachmentOf, checkMessage, messageHtml, parseEmailRequest, prefilled, preselected, recipientOf, sendRefusal,
  type CheckedMessage, type EmailRequest, type EmailSources, type PrepareRequest, type SendRequest,
} from '../../lifecycle/email.ts';
import { packForDocument } from '../../lifecycle/guards.ts';
import { describeAll, packFor, type LifecyclePack, type LifecycleProblem, type WordedProblem } from '../../lifecycle/lang/pack.ts';
import { KINDS, type Kind } from '../../lifecycle/load.ts';
import { EmailNotAllowedError, SendFailedError, type Mailbox, type Mailer } from '../../lifecycle/mailer.ts';
import { idOf, textOf } from '../../lifecycle/map.ts';
import { leaveMessage, NotAllowedError, reasonOf, type CallerStore, type Row, type Store } from '../../lifecycle/store.ts';
import { id } from '../lib/id.ts';
import { callerMailer } from '../lib/mailer.ts';
import { bodyOf, logLineFor, newReference, signedIn, type RouteContext, type RouteEvent } from '../lib/route.ts';
import { appStore, callerStore } from '../lib/twenty-stores.ts';

const logLine = logLineFor('billing-email');

export type EmailDeps = {
  /** Reads, and the record of a send, as the app. */
  app: Store;
  /** The caller's read (Prepare) and first write (Send), with their own token: Twenty's role check decides. */
  caller: CallerStore;
  /** The caller's mailboxes, and the send, as the caller. */
  mailer: Mailer;
  now: () => Date;
  /** A short reference for an unexpected failure, which the person can quote. */
  reference: () => string;
  log: (entry: Record<string, unknown>) => void;
};

/** The form Prepare fills (email spec §5). */
export type PreparedForm = {
  number: string;
  mailboxes: Mailbox[];
  /** The mailbox preselected: the issuer's own address when the caller has it, else their first. */
  from: string;
  to: string;
  cc: string;
  subject: string;
  message: string;
  /** The file name the client receives. */
  attachment: string;
};

export type EmailResponse =
  | { ok: true; form: PreparedForm }
  | { ok: true; message: string; marked: boolean }
  | { ok: false; problems: WordedProblem[] };
export type EmailOutcome = { status: 200 | 403 | 422 | 500 | 502; body: EmailResponse };

type Step = (name: string) => void;

function refuse(status: 403 | 422 | 502, pack: LifecyclePack, problems: readonly LifecycleProblem[]): EmailOutcome {
  return { status, body: { ok: false, problems: describeAll(problems.map((problem) => ({ source: 'lifecycle' as const, ...problem })), pack.code) } };
}

/** Why the document cannot go, all together (spec §5): it cannot be sent, or has no PDF; the caller has no mailbox. */
function refusalsOf(kind: Kind, document: Row | null, mailboxes: readonly Mailbox[]): LifecycleProblem[] {
  const problems: LifecycleProblem[] = [];
  const refusal = sendRefusal(kind, document);
  if (refusal) problems.push(refusal);
  if (mailboxes.length === 0) problems.push({ code: 'NO_MAILBOX' });
  return problems;
}

/** Whether the caller's own token reads the document (spec §5): one hidden from them, or refused, is not theirs to send, nor its client's address theirs to learn. */
async function callerReads(caller: CallerStore, kind: Kind, documentId: string): Promise<boolean> {
  try {
    return (await caller.get(kind.plural, documentId)) !== null;
  } catch (error) {
    if (error instanceof NotAllowedError) return false;
    throw error;
  }
}

/** What the message is made of, read as the app once the caller has read the document: the issuer and its profile, the person billed, a credit note's invoice. */
async function sourcesOf(store: Store, kind: Kind, document: Row): Promise<EmailSources> {
  const read = async (plural: string, value: unknown): Promise<Row | null> => {
    const key = idOf(value);
    return key ? store.get(plural, key) : null;
  };
  const issuer = await read('billingIssuers', document.issuerId);
  const profile = issuer ? await read('billingProfiles', issuer.profileId) : null;
  const person = await read('people', document.personId);
  const invoice = kind.kind === 'CREDIT_NOTE' ? await read('billingInvoices', document.invoiceId) : null;
  return { kind, document, issuer, profile, person, invoice };
}

/** Prepare (spec §5): writes nothing, and answers the form or every refusal at once. */
async function prepare(request: PrepareRequest, deps: EmailDeps, pack: LifecyclePack, step: Step): Promise<EmailOutcome> {
  const kind = KINDS[request.object];
  step('read');
  const document = await deps.app.get(kind.plural, request.recordId);
  if (document && !(await callerReads(deps.caller, kind, document.id))) return refuse(403, pack, [{ code: 'NOT_ALLOWED' }]);

  step('mailboxes');
  const mailboxes = await deps.mailer.accounts();
  const problems = refusalsOf(kind, document, mailboxes);
  if (problems.length > 0 || !document) return refuse(422, pack, problems);

  step('prefill');
  const sources = await sourcesOf(deps.app, kind, document);
  return {
    status: 200,
    body: {
      ok: true,
      form: {
        number: textOf(document.number),
        mailboxes,
        from: preselected(mailboxes, sources.issuer),
        to: recipientOf(document, sources.person),
        cc: '',
        ...prefilled(sources, request.localDate),
        // sendRefusal found a PDF to attach.
        attachment: attachmentOf(kind, document)!.name,
      },
    },
  };
}

/**
 * After a send, as the app (spec §6, step 5): an Issued invoice and a Draft quote
 * become Sent, `sentAt` keeps the first send's date, and a row names who received
 * it, in the document's language. The status and the date are one write.
 *
 * The document is read again first: the send took seconds, in which a person may
 * have marked the invoice Paid or a credit note cancelled it, and nothing puts
 * back a status the app overwrote (only the app moves a numbered invoice out of
 * Cancelled). One deleted meanwhile is "not marked", never written to.
 */
async function recordSend(deps: EmailDeps, kind: Kind, sentDocument: Row, checked: CheckedMessage, mailbox: Mailbox): Promise<void> {
  // Read before writing: a failure here is "not marked", never a half-told success.
  const document = await deps.app.get(kind.plural, sentDocument.id);
  if (!document || textOf(document.deletedAt) !== '') throw new Error(`The ${kind.object} ${sentDocument.id} was deleted while the email was being sent`);
  const documentPack = await packForDocument(deps.app, document);
  const patch: Record<string, unknown> = {};
  if ((kind.kind === 'INVOICE' && document.status === 'ISSUED') || (kind.kind === 'QUOTE' && document.status === 'DRAFT')) patch.status = 'SENT';
  if (textOf(document.sentAt) === '') patch.sentAt = deps.now().toISOString();
  if (Object.keys(patch).length > 0) await deps.app.update(kind.plural, document.id, patch);
  await leaveMessage(deps.app, {
    object: kind.object, recordId: document.id, kind: 'SENT', text: documentPack.messages.sentTimeline(checked.to, checked.cc, mailbox.handle),
  });
}

/** Send (spec §6): the message checked, the document read again, the caller's write, the email as the caller, the record as the app. */
async function send(request: SendRequest, deps: EmailDeps, pack: LifecyclePack, step: Step): Promise<EmailOutcome> {
  const kind = KINDS[request.object];

  step('check');
  const checked = checkMessage(request);
  if (checked.problems.length > 0) return refuse(422, pack, checked.problems);

  // It may have changed while the form was open: refused as Prepare refuses it, and a mailbox gone is named.
  step('read');
  const document = await deps.app.get(kind.plural, request.recordId);
  const mailboxes = await deps.mailer.accounts();
  const mailbox = mailboxes.find((candidate) => candidate.id === request.from);
  const problems = refusalsOf(kind, document, mailboxes);
  if (mailboxes.length > 0 && !mailbox) problems.push({ code: 'NO_MAILBOX', field: 'from' });
  if (problems.length > 0 || !document || !mailbox) return refuse(422, pack, problems);
  // sendRefusal found a PDF to attach.
  const attachment = attachmentOf(kind, document)!;
  // Built before the send: whatever throws here, no email has gone.
  const html = messageHtml(checked.message);

  step('caller');
  try {
    // Rewritten as it is: Twenty's role check decides whether the caller may act on the document, as for every action.
    await deps.caller.update(kind.plural, document.id, { sentAt: document.sentAt ?? null });
  } catch (error) {
    if (error instanceof NotAllowedError) return refuse(403, pack, [{ code: 'NOT_ALLOWED' }]);
    throw error;
  }

  step('send');
  try {
    await deps.mailer.send({ mailboxId: mailbox.id, to: checked.to, cc: checked.cc, subject: checked.subject, html, files: [attachment] });
  } catch (error) {
    if (error instanceof EmailNotAllowedError) return refuse(403, pack, [{ code: 'EMAIL_NOT_ALLOWED' }]);
    if (error instanceof SendFailedError) return refuse(502, pack, [{ code: 'SEND_FAILED', ...(error.reason === '' ? {} : { value: error.reason }) }]);
    // Neither Twenty's refusal nor its answer (the network, a lost response): the email may have gone. runEmail words it for this step.
    throw error;
  }

  // The email has gone: from here on the answer is a success, whatever the record.
  step('record');
  try {
    await recordSend(deps, kind, document, checked, mailbox);
  } catch (error) {
    const reference = deps.reference();
    // The layout runEmail's own log has: the request's step as `emailStep`, the stage that failed as `step`.
    deps.log({
      reference, object: kind.object, recordId: document.id, emailStep: request.step, step: 'record',
      error: error instanceof Error ? error.message : String(error), ...reasonOf(error),
    });
    return { status: 200, body: { ok: true, message: pack.messages.sentNotMarked(checked.to, kind.kind, reference), marked: false } };
  }
  return { status: 200, body: { ok: true, message: pack.messages.sentTo(checked.to), marked: true } };
}

/** What the form asked for, answered: never a thrown error, always an outcome the route can send. */
export async function runEmail(raw: unknown, deps: EmailDeps): Promise<EmailOutcome> {
  const locale = (raw as { locale?: unknown } | null)?.locale;
  const pack = packFor(typeof locale === 'string' ? locale : null);
  let request: EmailRequest | null = null;
  let step = 'request';
  const setStep: Step = (name) => {
    step = name;
  };
  try {
    request = parseEmailRequest(raw);
    if (!request) throw new Error('The request is not one the email route answers');
    return request.step === 'prepare' ? await prepare(request, deps, pack, setStep) : await send(request, deps, pack, setStep);
  } catch (error) {
    const reference = deps.reference();
    // Ids and the step only: never an address, a subject or a message.
    deps.log({
      reference, object: request?.object ?? null, recordId: request?.recordId ?? null, emailStep: request?.step ?? null, step,
      error: error instanceof Error ? error.message : String(error), ...reasonOf(error),
    });
    // A failure while the email was going is not "something went wrong, try again": it may have gone, and a retry would send it twice.
    const message = step === 'send' ? pack.messages.sendUnknown(reference) : pack.messages.unexpected(reference);
    return { status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message }] } };
  }
}

/** The route's dependencies in production, built on each call: clients cache their token. */
export function liveDeps(): EmailDeps {
  return { app: appStore(logLine), caller: callerStore(), mailer: callerMailer(), now: () => new Date(), reference: newReference, log: logLine };
}

/**
 * Answers the form. A call without a signed-in person (an API key) is refused:
 * the email goes from the caller's own mailbox, as them. The answer is never 401,
 * which the front client would take for an expired token and post again.
 */
export async function respond(event: RouteEvent, context: RouteContext, makeDeps: () => EmailDeps): Promise<TwentyResponse> {
  const body = bodyOf(event);
  const locale = (body as { locale?: unknown } | null)?.locale;
  const pack = packFor(typeof locale === 'string' ? locale : null);
  if (!signedIn(event, context)) {
    return new TwentyResponse({ ok: false, problems: describeAll([{ source: 'lifecycle', code: 'NOT_ALLOWED' }], pack.code) }, { status: 403 });
  }
  try {
    const outcome = await runEmail(body, makeDeps());
    return new TwentyResponse(outcome.body, { status: outcome.status });
  } catch (error) {
    // runEmail answers every failure itself: this is a failure to build its dependencies.
    const reference = newReference();
    logLine({ reference, step: 'setup', error: error instanceof Error ? error.message : String(error) });
    return new TwentyResponse({ ok: false, problems: [{ code: 'UNEXPECTED', message: pack.messages.unexpected(reference) }] }, { status: 500 });
  }
}

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.billingEmail'),
  name: 'billing-email',
  description: 'Prepares and sends a document by email, from the clicking person’s own mailbox. Does not bundle the PDF renderer.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: { path: '/billing/email', httpMethod: 'POST', isAuthRequired: true },
  handler: (event: RoutePayload, context: LogicFunctionExecutionContext) => respond(event, context, liveDeps),
});
