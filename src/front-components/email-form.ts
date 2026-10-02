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

/** The sentences a refusal lists, worded by the route; null when the body is no refusal. */
function problemsOf(body: unknown): string[] | null {
  const refusal = body as { ok?: unknown; problems?: unknown } | null;
  if (refusal?.ok !== false || !Array.isArray(refusal.problems) || refusal.problems.length === 0) return null;
  const messages = refusal.problems.map((problem) => (problem as { message?: unknown } | null)?.message);
  return messages.every((message): message is string => typeof message === 'string') ? messages : null;
}

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
 * Read Send's answer. The route's own body is read as it words itself. Without one, only a 4xx proves the
 * request never reached the route; a lost answer (no status), the platform's 30 s cut or a gateway's 5xx, or a
 * success that is no route body, leaves the email possibly sent (email spec §10): that is said, not retried.
 */
export function readSent(answer: RouteAnswer, locale: string): SentRead {
  const sent = answer.body as { ok?: unknown; message?: unknown; marked?: unknown } | null;
  if (sent?.ok === true && typeof sent.message === 'string') return { ok: true, message: sent.message, variant: sent.marked === false ? 'warning' : 'success' };
  const problems = problemsOf(answer.body);
  if (problems) return { ok: false, unconfirmed: false, problems };
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
