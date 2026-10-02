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
import { logLineFor, newReference, respondTo, type RouteContext, type RouteEvent } from '../lib/route.ts';
import { appStore, callerStore } from '../lib/twenty-stores.ts';

const ROUTE = 'billing-email';
const logLine = logLineFor(ROUTE);

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

/** A record read with the caller's own token (spec §5): null when Twenty hides it from them or refuses their role. */
async function readAsCaller(caller: CallerStore, plural: string, recordId: string): Promise<Row | null> {
  try {
    return await caller.get(plural, recordId);
  } catch (error) {
    if (error instanceof NotAllowedError) return null;
    throw error;
  }
}

/**
 * What the message is made of. The issuer, its profile and a credit note's invoice are the app's reads, once the
 * caller has read the document; the person billed is the caller's own read, since their address and name are
 * theirs to learn only if their role reads People.
 */
async function sourcesOf(deps: EmailDeps, kind: Kind, document: Row): Promise<EmailSources> {
  const read = async (plural: string, value: unknown): Promise<Row | null> => {
    const key = idOf(value);
    return key ? deps.app.get(plural, key) : null;
  };
  const issuer = await read('billingIssuers', document.issuerId);
  const profile = issuer ? await read('billingProfiles', issuer.profileId) : null;
  const personId = idOf(document.personId);
  const person = personId ? await readAsCaller(deps.caller, 'people', personId) : null;
  const invoice = kind.kind === 'CREDIT_NOTE' ? await read('billingInvoices', document.invoiceId) : null;
  return { kind, document, issuer, profile, person, invoice };
}

/** Prepare (spec §5): writes nothing, and answers the form or every refusal at once. */
async function prepare(request: PrepareRequest, deps: EmailDeps, pack: LifecyclePack, step: Step): Promise<EmailOutcome> {
  const kind = KINDS[request.object];
  step('read');
  const document = await deps.app.get(kind.plural, request.recordId);
  if (document && !(await readAsCaller(deps.caller, kind.plural, document.id))) return refuse(403, pack, [{ code: 'NOT_ALLOWED' }]);

  step('mailboxes');
  const mailboxes = await deps.mailer.accounts();
  const problems = refusalsOf(kind, document, mailboxes);
  if (problems.length > 0 || !document) return refuse(422, pack, problems);

  step('prefill');
  const sources = await sourcesOf(deps, kind, document);
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
  // The caller's read comes first, as in Prepare: a document hidden from them is answered NOT_ALLOWED and nothing of it (no status, no PDF).
  step('read');
  const document = await deps.app.get(kind.plural, request.recordId);
  if (document && !(await readAsCaller(deps.caller, kind.plural, document.id))) return refuse(403, pack, [{ code: 'NOT_ALLOWED' }]);
  step('mailboxes');
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
    // It runs on every update, whatever the values (twenty-server 2.43, validateOperationIsPermittedOrThrow), so a write that changes nothing is still refused.
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

/** Answers the form (src/lib/route.ts: refused without a signed-in person, as the email goes from the caller's own mailbox). */
export const respond = (event: RouteEvent, context: RouteContext, makeDeps: () => EmailDeps): Promise<TwentyResponse> =>
  respondTo(event, context, { name: ROUTE, run: runEmail, makeDeps });

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.billingEmail'),
  name: 'billing-email',
  description: 'Prepares and sends a document by email, from the clicking person’s own mailbox. Does not bundle the PDF renderer.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: { path: '/billing/email', httpMethod: 'POST', isAuthRequired: true },
  handler: (event: RoutePayload, context: LogicFunctionExecutionContext) => respond(event, context, liveDeps),
});
