import { Response as TwentyResponse } from 'twenty-sdk/logic-function';
import { describeAll, packFor } from '../../lifecycle/lang/pack.ts';

/**
 * What the app's two routes share, billing-action and billing-email: the
 * request's body, a reference a person can quote, one log line per entry, who
 * called, and the answer to a call. Kept apart so that billing-email never
 * imports billing-action, which bundles pdfmake.
 */

export type RouteEvent = { body: unknown; isBase64Encoded?: boolean; userWorkspaceId: string | null };
export type RouteContext = { workspaceMemberId: string | null };

/** The request's body: parsed already when it was JSON, else parsed here; null when it is not JSON. */
export function bodyOf(event: { body: unknown; isBase64Encoded?: boolean }): unknown {
  if (typeof event.body !== 'string') return event.body ?? null;
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return null;
  }
}

/** A short reference for an unexpected failure, which the person can quote. */
export const newReference = (): string => crypto.randomUUID().slice(0, 8);

/** One line of JSON per entry, named by its route: the platform keeps each output line as one log entry. */
export const logLineFor =
  (route: string) =>
  (entry: Record<string, unknown>): void =>
    console.error(JSON.stringify({ route, ...entry }));

/**
 * Whether a signed-in person made the call. An API key's call has none, and is
 * refused: the caller's own token is what lets Twenty's role check decide.
 */
export const signedIn = (event: RouteEvent, context: RouteContext): boolean => Boolean(event.userWorkspaceId && context.workspaceMemberId);

/** What a route's runner answers: a status and a body, never a thrown error. */
export type RouteOutcome = { status: number; body: unknown };

/**
 * Answers a call for a route (billing-action's buttons, billing-email's form). A
 * call without a signed-in person (an API key) is refused: the caller's own
 * token is what lets Twenty's role check decide who may act, and an email goes
 * from the caller's own mailbox. The answer is never 401, which the front client
 * would take for an expired token and post again.
 *
 * `run` answers every failure itself, so a throw here is a failure to build the
 * dependencies: logged under the route's name, answered as unexpected with a
 * reference the person can quote. `errorEntry` is how the route logs an error
 * (by default its message), for a route whose errors may hold what it must not log.
 */
export async function respondTo<Deps>(
  event: RouteEvent,
  context: RouteContext,
  route: {
    name: string;
    run: (body: unknown, deps: Deps) => Promise<RouteOutcome>;
    makeDeps: () => Deps;
    errorEntry?: (error: unknown) => Record<string, unknown>;
  },
): Promise<TwentyResponse> {
  const body = bodyOf(event);
  const locale = (body as { locale?: unknown } | null)?.locale;
  const pack = packFor(typeof locale === 'string' ? locale : null);
  if (!signedIn(event, context)) {
    return new TwentyResponse({ ok: false, problems: describeAll([{ source: 'lifecycle', code: 'NOT_ALLOWED' }], pack.code) }, { status: 403 });
  }
  try {
    const outcome = await route.run(body, route.makeDeps());
    return new TwentyResponse(outcome.body, { status: outcome.status });
  } catch (error) {
    const reference = newReference();
    const entry = route.errorEntry?.(error) ?? { error: error instanceof Error ? error.message : String(error) };
    logLineFor(route.name)({ reference, step: 'setup', ...entry });
    return new TwentyResponse({ ok: false, problems: [{ code: 'UNEXPECTED', message: pack.messages.unexpected(reference) }] }, { status: 500 });
  }
}
