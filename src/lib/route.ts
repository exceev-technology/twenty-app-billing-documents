/**
 * What the app's two routes share, billing-action and billing-email: the
 * request's body, a reference a person can quote, one log line per entry, and
 * who called. Kept apart so that billing-email never imports billing-action,
 * which bundles pdfmake.
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
