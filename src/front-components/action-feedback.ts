/**
 * What the buttons send and what a person reads back, kept apart from
 * React so node --test can import it. Nothing here imports Twenty or node.
 */

export type ButtonRequest = {
  action: 'preview' | 'issue' | 'quotePdf' | 'invoiceQuote' | 'creditNote' | 'cancelInvoice';
  object: 'billingInvoice' | 'billingCreditNote' | 'billingQuote';
  recordId: string;
  localDate: string;
  locale: string;
};
export type RouteAnswer = { status: number | null; body: unknown };
/** The document an action made: the button opens it. */
export type Created = { object: ButtonRequest['object']; recordId: string };
export type Feedback = { message: string; variant: 'success' | 'error'; created?: Created };
/** The words of a confirmation, shown before the route is called. */
export type Confirmation = { title: string; subtitle: string; confirm: string };

/** Invoices and credit notes: one selected draft that is not deleted. */
export const DRAFT_ONE = 'numberOfSelectedRecords == 1 and everyEquals(selectedRecords, "status", "DRAFT") and noneDefined(selectedRecords, "deletedAt")';
/** Quotes: one selected record that is not deleted, whatever its status. */
export const ONE = 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt")';
/** Quotes that may become an invoice: one selected, not deleted, in Draft, Sent or Accepted. */
export const OPEN_QUOTE_ONE =
  'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt") and noneEquals(selectedRecords, "status", "DECLINED") and noneEquals(selectedRecords, "status", "EXPIRED") and noneEquals(selectedRecords, "status", "INVOICED")';
/** Invoices that may be credited or cancelled: one selected, not deleted, Issued, Sent or Paid. */
export const ISSUED_ONE =
  'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt") and noneEquals(selectedRecords, "status", "DRAFT") and noneEquals(selectedRecords, "status", "CANCELLED")';

/** Credit notes that may be sent: one selected, not deleted, issued. */
export const ISSUED_CREDIT_NOTE_ONE =
  'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt") and everyEquals(selectedRecords, "status", "ISSUED")';

const SHOWN = 5;

const WORDS = {
  en: {
    more: (count: number) => `And ${count} more.`,
    off: 'The billing actions need logic functions, which are turned off on this server. See “Issuing documents” in the app’s README.',
    failed: (status: number) => `The billing action failed (HTTP ${status}).`,
    unreachable: 'The billing action could not reach the server. Check your connection and try again.',
    cancel: {
      title: 'Cancel this invoice?',
      subtitle: 'A credit note for everything that remains is issued, and the invoice is marked Cancelled. This cannot be undone.',
      confirm: 'Cancel invoice',
    },
  },
  fr: {
    more: (count: number) => `Et ${count} de plus.`,
    off: 'Les actions de facturation ont besoin des fonctions logiques, désactivées sur ce serveur. Voir «\u00a0Issuing documents\u00a0» dans le README de l’app.',
    failed: (status: number) => `L’action de facturation a échoué (HTTP ${status}).`,
    unreachable: 'L’action de facturation n’a pas pu joindre le serveur. Vérifiez votre connexion et réessayez.',
    cancel: {
      title: 'Annuler cette facture\u00a0?',
      subtitle: 'Un avoir pour tout ce qui reste est émis, et la facture passe au statut Annulée. C’est définitif.',
      confirm: 'Annuler la facture',
    },
  },
};

const wordsFor = (locale: string) => (locale.toLowerCase().startsWith('fr') ? WORDS.fr : WORDS.en);

/** Cancel invoice's confirmation, in the person's language. */
export const cancelConfirmation = (locale: string): Confirmation => wordsFor(locale).cancel;

const pad = (value: number) => String(value).padStart(2, '0');

/** The person's calendar date, from their browser's clock and time zone. */
export function localDateOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const parsed = (body: unknown): unknown => {
  if (typeof body !== 'string') return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

/** Posts a body to one of the app's routes; every answer is kept, a refusal included, and never thrown. */
export async function postTo(post: (path: string, body: unknown) => Promise<unknown>, path: string, body: unknown): Promise<RouteAnswer> {
  try {
    return { status: 200, body: await post(path, body) };
  } catch (error) {
    const failure = error as { name?: unknown; status?: unknown; body?: unknown } | null;
    if (failure?.name === 'RestApiClientError' && typeof failure.status === 'number') return { status: failure.status, body: parsed(failure.body) };
    return { status: null, body: null };
  }
}

/** Posts a button's request to the actions route. */
export const callRoute = (post: (path: string, body: unknown) => Promise<unknown>, request: ButtonRequest): Promise<RouteAnswer> =>
  postTo(post, '/s/billing/action', request);

type Answer = { ok: true; message: string } | { ok: false; problems: { message: string }[] };

const isAnswer = (body: unknown): body is Answer => {
  const answer = body as { ok?: unknown; message?: unknown; problems?: unknown } | null;
  if (answer?.ok === true) return typeof answer.message === 'string';
  // A refusal without a problem would show an empty snackbar: it falls through to the HTTP status instead.
  return answer?.ok === false && Array.isArray(answer.problems) && answer.problems.length > 0 && answer.problems.every((problem) => typeof problem?.message === 'string');
};

const CREATED_OBJECTS: readonly string[] = ['billingInvoice', 'billingCreditNote', 'billingQuote'];

/** The document an answer names, when it names one of the app's documents. */
function createdOf(body: unknown): Created | undefined {
  const created = (body as { created?: { object?: unknown; recordId?: unknown } } | null)?.created;
  if (typeof created?.recordId !== 'string' || !CREATED_OBJECTS.includes(created.object as string)) return undefined;
  return { object: created.object as Created['object'], recordId: created.recordId };
}

/** The snackbar for an answer: the message, or the first five problems and how many more. */
export function feedbackFor(answer: RouteAnswer, locale: string): Feedback {
  const words = wordsFor(locale);
  if (isAnswer(answer.body)) {
    const created = createdOf(answer.body);
    const withCreated = created ? { created } : {};
    if (answer.body.ok) return { message: answer.body.message, variant: 'success', ...withCreated };
    const { problems } = answer.body;
    const shown = problems.slice(0, SHOWN).map((problem) => problem.message);
    if (problems.length > SHOWN) shown.push(words.more(problems.length - SHOWN));
    return { message: shown.join(' '), variant: 'error', ...withCreated };
  }
  if (answer.status === null) return { message: words.unreachable, variant: 'error' };
  if (answer.status === 404 || answer.status === 503) return { message: words.off, variant: 'error' };
  return { message: words.failed(answer.status), variant: 'error' };
}
