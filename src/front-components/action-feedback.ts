/**
 * What the five buttons send and what a person reads back, kept apart from
 * React so node --test can import it. Nothing here imports Twenty or node.
 */

export type ButtonRequest = {
  action: 'preview' | 'issue' | 'quotePdf';
  object: 'billingInvoice' | 'billingCreditNote' | 'billingQuote';
  recordId: string;
  localDate: string;
  locale: string;
};
export type RouteAnswer = { status: number | null; body: unknown };
export type Feedback = { message: string; variant: 'success' | 'error' };

/** Invoices and credit notes: one selected draft that is not deleted. */
export const DRAFT_ONE = 'numberOfSelectedRecords == 1 and everyEquals(selectedRecords, "status", "DRAFT") and noneDefined(selectedRecords, "deletedAt")';
/** Quotes: one selected record that is not deleted, whatever its status. */
export const ONE = 'numberOfSelectedRecords == 1 and noneDefined(selectedRecords, "deletedAt")';

const SHOWN = 5;

const WORDS = {
  en: {
    more: (count: number) => `And ${count} more.`,
    off: 'The billing actions need logic functions, which are turned off on this server. See “Issuing documents” in the app’s README.',
    failed: (status: number) => `The billing action failed (HTTP ${status}).`,
    unreachable: 'The billing action could not reach the server. Check your connection and try again.',
  },
  fr: {
    more: (count: number) => `Et ${count} de plus.`,
    off: 'Les actions de facturation ont besoin des fonctions logiques, désactivées sur ce serveur. Voir « Issuing documents » dans le README de l’app.',
    failed: (status: number) => `L’action de facturation a échoué (HTTP ${status}).`,
    unreachable: 'L’action de facturation n’a pas pu joindre le serveur. Vérifiez votre connexion et réessayez.',
  },
};

const wordsFor = (locale: string) => (locale.toLowerCase().startsWith('fr') ? WORDS.fr : WORDS.en);
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

/** Posts the request to the route; every answer is kept, a refusal included, and never thrown. */
export async function callRoute(post: (path: string, body: unknown) => Promise<unknown>, request: ButtonRequest): Promise<RouteAnswer> {
  try {
    return { status: 200, body: await post('/s/billing/action', request) };
  } catch (error) {
    const failure = error as { name?: unknown; status?: unknown; body?: unknown } | null;
    if (failure?.name === 'RestApiClientError' && typeof failure.status === 'number') return { status: failure.status, body: parsed(failure.body) };
    return { status: null, body: null };
  }
}

type Answer = { ok: true; message: string } | { ok: false; problems: { message: string }[] };

const isAnswer = (body: unknown): body is Answer => {
  const answer = body as { ok?: unknown; message?: unknown; problems?: unknown } | null;
  if (answer?.ok === true) return typeof answer.message === 'string';
  return answer?.ok === false && Array.isArray(answer.problems) && answer.problems.every((problem) => typeof problem?.message === 'string');
};

/** The snackbar for an answer: the message, or the first five problems and how many more. */
export function feedbackFor(answer: RouteAnswer, locale: string): Feedback {
  const words = wordsFor(locale);
  if (isAnswer(answer.body)) {
    if (answer.body.ok) return { message: answer.body.message, variant: 'success' };
    const { problems } = answer.body;
    const shown = problems.slice(0, SHOWN).map((problem) => problem.message);
    if (problems.length > SHOWN) shown.push(words.more(problems.length - SHOWN));
    return { message: shown.join(' '), variant: 'error' };
  }
  if (answer.status === null) return { message: words.unreachable, variant: 'error' };
  if (answer.status === 404 || answer.status === 503) return { message: words.off, variant: 'error' };
  return { message: words.failed(answer.status), variant: 'error' };
}
