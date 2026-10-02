import { defineLogicFunction } from 'twenty-sdk/define';
import { Response as TwentyResponse, type LogicFunctionExecutionContext, type RoutePayload } from 'twenty-sdk/logic-function';
import { runAction, type ActionDeps } from '../../lifecycle/actions.ts';
import { id } from '../lib/id.ts';
import { bodyOf, logLineFor, newReference, respondTo, type RouteContext, type RouteEvent } from '../lib/route.ts';
import { appStore, callerStore } from '../lib/twenty-stores.ts';

export { bodyOf };

const ROUTE = 'billing-action';
const logLine = logLineFor(ROUTE);

/** Hex SHA-256, from Web Crypto. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The route's dependencies in production, built on each call: clients cache their token. */
export function liveDeps(): ActionDeps {
  return { app: appStore(logLine), caller: callerStore(), now: () => new Date(), sha256, reference: newReference, log: logLine };
}

/** Answers a button (src/lib/route.ts: refused without a signed-in person, runAction's outcome as the answer). */
export const respond = (event: RouteEvent, context: RouteContext, makeDeps: () => ActionDeps): Promise<TwentyResponse> =>
  respondTo(event, context, { name: ROUTE, run: runAction, makeDeps });

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.billingAction'),
  name: 'billing-action',
  description: 'Runs the billing buttons: previews and issues invoices and credit notes, and generates quote PDFs. The only function that bundles the PDF renderer.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: { path: '/billing/action', httpMethod: 'POST', isAuthRequired: true },
  handler: (event: RoutePayload, context: LogicFunctionExecutionContext) => respond(event, context, liveDeps),
});
