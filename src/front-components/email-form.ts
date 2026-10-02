/**
 * What the email form sends and reads back, kept apart from React so node --test
 * can import it, as action-feedback.ts is for the buttons. Nothing here imports
 * Twenty or node.
 */
import { feedbackFor, postTo, type RouteAnswer } from './action-feedback.ts';

export type EmailObject = 'billingInvoice' | 'billingCreditNote' | 'billingQuote';
export type Mailbox = { id: string; handle: string };
/** The form as Prepare fills it (email spec §5). */
export type EmailForm = { number: string; mailboxes: Mailbox[]; from: string; to: string; cc: string; subject: string; message: string; attachment: string };
/** What the person may change before sending. */
export type EditableField = 'from' | 'to' | 'cc' | 'subject' | 'message';

type RequestBase = { object: EmailObject; recordId: string; localDate: string; locale: string };
export type EmailRequest = (RequestBase & { step: 'prepare' }) | (RequestBase & { step: 'send' } & Pick<EmailForm, EditableField>);

export const EMAIL_PATH = '/s/billing/email';

/** Posts Prepare or Send to the email route, with the person's own token. */
export const postEmail = (post: (path: string, body: unknown) => Promise<unknown>, request: EmailRequest): Promise<RouteAnswer> =>
  postTo(post, EMAIL_PATH, request);

const TEXTS = ['number', 'from', 'to', 'cc', 'subject', 'message', 'attachment'] as const;
const isMailbox = (value: unknown): value is Mailbox =>
  typeof (value as Mailbox | null)?.id === 'string' && typeof (value as Mailbox).handle === 'string';

function formOf(body: unknown): EmailForm | null {
  const answer = body as { ok?: unknown; form?: unknown } | null;
  if (answer?.ok !== true || answer.form === null || typeof answer.form !== 'object') return null;
  const form = answer.form as Record<string, unknown>;
  if (!TEXTS.every((key) => typeof form[key] === 'string')) return null;
  if (!Array.isArray(form.mailboxes) || !form.mailboxes.every(isMailbox)) return null;
  return form as EmailForm;
}

type RouteProblem = { code: unknown; message: string };

/** The problems a refusal lists, as the route coded and worded them; null when the body is no refusal. */
function routeProblems(body: unknown): RouteProblem[] | null {
  const refusal = body as { ok?: unknown; problems?: unknown } | null;
  if (refusal?.ok !== false || !Array.isArray(refusal.problems) || refusal.problems.length === 0) return null;
  const found: RouteProblem[] = [];
  for (const problem of refusal.problems as ({ code?: unknown; message?: unknown } | null)[]) {
    if (typeof problem?.message !== 'string') return null;
    found.push({ code: problem.code, message: problem.message });
  }
  return found;
}

/** The sentences a refusal lists, worded by the route; null when the body is no refusal. */
const problemsOf = (body: unknown): string[] | null => routeProblems(body)?.map((problem) => problem.message) ?? null;

/** The code with which the route says a send's outcome is unknown: the email may have gone. */
const SEND_UNCONFIRMED = 'SEND_UNCONFIRMED';

/** Prepare's answer: the form, or the problems to list; a transport failure in the buttons' own words (spec §8). */
export function readPrepared(answer: RouteAnswer, locale: string): { ok: true; form: EmailForm } | { ok: false; problems: string[] } {
  const form = formOf(answer.body);
  if (form) return { ok: true, form };
  return { ok: false, problems: problemsOf(answer.body) ?? [feedbackFor(answer, locale).message] };
}

/**
 * Send's answer: the snackbar (a warning when the document could not be marked), or the problems to list.
 * `unconfirmed` is set when the email may have gone: the person must not be invited to send it again.
 */
export type SentRead = { ok: true; message: string; variant: 'success' | 'warning' } | { ok: false; unconfirmed: boolean; problems: string[] };

/** A 4xx without the route's body came from before the route (no function, a gateway, a refused token): nothing was sent. */
const neverReachedRoute = (status: number | null): boolean => status !== null && status >= 400 && status < 500;

/**
 * Read Send's answer. The route's own body is read as it words itself; its `SEND_UNCONFIRMED` code says the
 * outcome is unknown, and its message is shown as is. Without a body, only a 4xx proves the request never
 * reached the route; a lost answer (no status), the platform's 30 s cut or a gateway's 5xx, or a success that
 * is no route body, leaves the email possibly sent (email spec §10): that is said, not retried.
 */
export function readSent(answer: RouteAnswer, locale: string): SentRead {
  const sent = answer.body as { ok?: unknown; message?: unknown; marked?: unknown } | null;
  if (sent?.ok === true && typeof sent.message === 'string') return { ok: true, message: sent.message, variant: sent.marked === false ? 'warning' : 'success' };
  const problems = routeProblems(answer.body);
  if (problems) {
    return { ok: false, unconfirmed: problems.some((problem) => problem.code === SEND_UNCONFIRMED), problems: problems.map((problem) => problem.message) };
  }
  if (neverReachedRoute(answer.status)) return { ok: false, unconfirmed: false, problems: [feedbackFor(answer, locale).message] };
  return { ok: false, unconfirmed: true, problems: [formWords(locale).unconfirmed] };
}

/** Where a form's Send stands, for the one record the form was prepared for. */
export type SendPhase = 'unloaded' | 'idle' | 'sending' | 'sent' | 'unconfirmed';
export type SendState = { record: string | null; phase: SendPhase };
/**
 * What moves it. Every event but `select` names the record it was asked for, so that an answer, or a click, for a
 * record that is no longer the selected one is recognised and dropped.
 */
export type SendEvent =
  | { type: 'select'; record: string | null }
  | { type: 'loaded'; record: string }
  | { type: 'send'; record: string }
  | { type: 'answer'; record: string; read: SentRead };

/** Nothing selected, nothing loaded. */
export const SEND_START: SendState = { record: null, phase: 'unloaded' };

/**
 * The send state machine (email spec §6, §8, §10), pure so that node --test can pin it. The selection changing
 * starts over, on the new record, with no form. Prepare loads the form of the selected record only; Send is accepted
 * once, from a loaded form of the selected record; its answer unlocks it only when the route refused or was never
 * reached. A sent or unconfirmed form stays locked until the selection changes. An event that changes nothing returns
 * the very same state, which is how the component tells it was dropped.
 */
export function sendStep(state: SendState, event: SendEvent): SendState {
  if (event.type === 'select') return { record: event.record, phase: 'unloaded' };
  if (event.record !== state.record) return state;
  switch (event.type) {
    case 'loaded':
      return state.phase === 'unloaded' ? { record: state.record, phase: 'idle' } : state;
    case 'send':
      return state.phase === 'idle' ? { record: state.record, phase: 'sending' } : state;
    case 'answer':
      if (state.phase !== 'sending') return state;
      if (event.read.ok) return { record: state.record, phase: 'sent' };
      return { record: state.record, phase: event.read.unconfirmed ? 'unconfirmed' : 'idle' };
  }
}

/** Send is clickable only for a loaded form that has not been sent, is not being sent, and was not left unconfirmed. */
export const canSend = (state: SendState): boolean => state.phase === 'idle';

/**
 * What an answer for a record no longer shown still tells the person, as a snackbar (never the form, which is
 * another record's now): that it went, that it went but was not marked, or that it could not be confirmed. A
 * refusal says nothing: nothing was sent, and the person has left that form.
 */
export function staleNotice(read: SentRead, locale: string): { message: string; variant: 'success' | 'warning' } | null {
  if (read.ok) return { message: read.message, variant: read.variant };
  return read.unconfirmed ? { message: formWords(locale).unconfirmed, variant: 'warning' } : null;
}

/** A document's Send, as the in-flight set knows it: the object too, since two objects may share an id. */
export const sendKey = (object: EmailObject, recordId: string): string => `${object}:${recordId}`;

/**
 * The documents whose Send is in flight. Module-level, so that it outlives a form: a fresh form for a record
 * (after A, B, A, or a remount) must not send it a second time in parallel with the first. It guards only what
 * is in flight; once an answer has come, a new form may send the same record again.
 */
export const SENDS_IN_FLIGHT: Set<string> = new Set();

/** Takes a document's Send; false when one is already in flight for it. */
export function claimSend(inFlight: Set<string>, key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

/** Frees a document's Send once its answer has come, whatever it was, even for a record no longer shown. */
export function releaseSend(inFlight: Set<string>, key: string): void {
  inFlight.delete(key);
}

/**
 * The value a form element's change event carries. Twenty's remote DOM serializes it
 * onto `event.detail` (twentyhq/twenty#20525), and later versions onto `event.target`
 * too: either is read, `detail` first.
 */
export function inputValue(event: unknown): string {
  const { detail, target } = (event ?? {}) as { detail?: { value?: unknown } | null; target?: { value?: unknown } | null };
  const value = detail?.value ?? target?.value;
  return typeof value === 'string' ? value : '';
}

/** The form with one field changed: a new form, so React sees the change. */
export function withField(form: EmailForm, field: EditableField, value: string): EmailForm {
  const next = { ...form };
  next[field] = value;
  return next;
}

export type FormWords = {
  heading: (object: EmailObject, number: string) => string;
  attachmentLine: (name: string) => string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  message: string;
  separate: string;
  loading: string;
  noRecord: string;
  /** Send's answer was lost or cut: the email may have gone, so the person checks before sending it again. */
  unconfirmed: string;
  send: string;
  sending: string;
  cancel: string;
};

const WORDS = {
  en: {
    kinds: { billingInvoice: 'invoice', billingCreditNote: 'credit note', billingQuote: 'quote' },
    heading: (kind: string, number: string) => `Send ${kind} ${number}`,
    attachmentLine: (name: string) => `Attachment: ${name}`,
    from: 'From', to: 'To', cc: 'Cc', subject: 'Subject', message: 'Message',
    separate: 'Separate several addresses with commas.',
    loading: 'Preparing the email…', noRecord: 'No document is selected.',
    unconfirmed: 'We could not confirm that the email was sent: check your Sent folder, or the document’s timeline, before sending it again.',
    send: 'Send', sending: 'Sending…', cancel: 'Cancel',
  },
  fr: {
    kinds: { billingInvoice: 'la facture', billingCreditNote: 'l’avoir', billingQuote: 'le devis' },
    heading: (kind: string, number: string) => `Envoyer ${kind} ${number}`,
    attachmentLine: (name: string) => `Pièce jointe\u00a0: ${name}`,
    from: 'De', to: 'À', cc: 'Cc', subject: 'Objet', message: 'Message',
    separate: 'Séparez les adresses par des virgules.',
    loading: 'Préparation de l’e-mail…', noRecord: 'Aucun document n’est sélectionné.',
    unconfirmed: 'Impossible de confirmer l’envoi de l’e-mail\u00a0: vérifiez vos éléments envoyés, ou l’historique du document, avant de le renvoyer.',
    send: 'Envoyer', sending: 'Envoi…', cancel: 'Annuler',
  },
};

/** The form's own words, in the person's Twenty language: French for any French locale, English otherwise (spec §8). */
export function formWords(locale: string): FormWords {
  const { kinds, heading, ...words } = locale.toLowerCase().startsWith('fr') ? WORDS.fr : WORDS.en;
  return { ...words, heading: (object, number) => heading(kinds[object], number).trim() };
}
