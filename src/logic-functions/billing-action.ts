import { defineLogicFunction } from 'twenty-sdk/define';
import { Response as TwentyResponse, type LogicFunctionExecutionContext, type RoutePayload } from 'twenty-sdk/logic-function';
import { runAction, type ActionDeps } from '../../lifecycle/actions.ts';
import { describeAll, packFor } from '../../lifecycle/lang/pack.ts';
import { id } from '../lib/id.ts';
import { appStore, callerStore } from '../lib/twenty-stores.ts';

export type RouteEvent = { body: unknown; isBase64Encoded?: boolean; userWorkspaceId: string | null };
export type RouteContext = { workspaceMemberId: string | null };

/** One line of JSON: the platform keeps each output line as one log entry. */
const logLine = (entry: Record<string, unknown>): void => console.error(JSON.stringify({ route: 'billing-action', ...entry }));
const newReference = (): string => crypto.randomUUID().slice(0, 8);

/** The request's body: parsed already when it was JSON, else parsed here; null when it is not JSON. */
export function bodyOf(event: { body: unknown; isBase64Encoded?: boolean }): unknown {
  if (typeof event.body !== 'string') return event.body ?? null;
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return null;
  }
}

/** Hex SHA-256, from Web Crypto. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The route's dependencies in production, built on each call: clients cache their token. */
export function liveDeps(): ActionDeps {
  return { app: appStore(logLine), caller: callerStore(), now: () => new Date(), sha256, reference: newReference, log: logLine };
}

/**
 * Answers a button. A call without a signed-in person (an API key) is refused:
 * the caller's own token is what lets Twenty's role check decide who may act.
 * The answer is never 401, which the front client would take for an expired
 * token and post again.
 */
export async function respond(event: RouteEvent, context: RouteContext, makeDeps: () => ActionDeps): Promise<TwentyResponse> {
  const body = bodyOf(event);
  const locale = (body as { locale?: unknown } | null)?.locale;
  const pack = packFor(typeof locale === 'string' ? locale : null);
  if (!event.userWorkspaceId || !context.workspaceMemberId) {
    return new TwentyResponse({ ok: false, problems: describeAll([{ source: 'lifecycle', code: 'NOT_ALLOWED' }], pack.code) }, { status: 403 });
  }
  try {
    const outcome = await runAction(body, makeDeps());
    return new TwentyResponse(outcome.body, { status: outcome.status });
  } catch (error) {
    // runAction answers every failure itself: this is a failure to build its dependencies.
    const reference = newReference();
    logLine({ reference, step: 'setup', error: error instanceof Error ? error.message : String(error) });
    return new TwentyResponse({ ok: false, problems: [{ code: 'UNEXPECTED', message: pack.messages.unexpected(reference) }] }, { status: 500 });
  }
}

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.billingAction'),
  name: 'billing-action',
  description: 'Runs the billing buttons: previews and issues invoices and credit notes, and generates quote PDFs. The only function that bundles the PDF renderer.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: { path: '/billing/action', httpMethod: 'POST', isAuthRequired: true },
  handler: (event: RoutePayload, context: LogicFunctionExecutionContext) => respond(event, context, liveDeps),
});
