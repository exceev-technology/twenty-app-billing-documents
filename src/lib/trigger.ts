import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';
import type { RecordEvent, Row, Store } from '../../lifecycle/store.ts';
import { appStore } from './twenty-stores.ts';

const OPERATIONS: readonly RecordEvent['name'][] = ['created', 'updated', 'deleted', 'restored', 'destroyed', 'upserted'];

const rowOf = (value: unknown): Row | null => (value !== null && typeof value === 'object' ? (value as Row) : null);

/** A Twenty database event in Lifecycle's shape; null when it is not one. */
export function toRecordEvent(payload: unknown): RecordEvent | null {
  const event = payload as { name?: unknown; recordId?: unknown; properties?: { before?: unknown; after?: unknown; updatedFields?: unknown } } | null;
  const name = typeof event?.name === 'string' ? event.name.slice(event.name.lastIndexOf('.') + 1) : '';
  if (!OPERATIONS.includes(name as RecordEvent['name']) || typeof event?.recordId !== 'string') return null;
  const properties = event.properties ?? {};
  return {
    name: name as RecordEvent['name'],
    recordId: event.recordId,
    before: rowOf(properties.before),
    after: rowOf(properties.after),
    updatedFields: Array.isArray(properties.updatedFields) ? properties.updatedFields.filter((field): field is string => typeof field === 'string') : [],
  };
}

/** A failure the platform's retry can cure: the network, a rate limit, a server error. */
export function isTransient(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const failure = error as { name?: unknown; status?: unknown } | null;
  if (failure?.name !== 'RestApiClientError') return false;
  return failure.status === undefined || failure.status === 429 || (typeof failure.status === 'number' && failure.status >= 500);
}

/** One line of JSON: the platform keeps each output line as one log entry. */
const logLine = (entry: Record<string, unknown>): void => console.error(JSON.stringify(entry));

/** A trigger's handler: Lifecycle's event, a store built for this run, and a retry only when one can help. */
export function runTrigger(
  handle: (store: Store, event: RecordEvent) => Promise<void>,
  makeStore: () => Store = () => appStore(logLine),
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const event = toRecordEvent(payload);
    if (!event) return;
    try {
      await handle(makeStore(), event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logLine({ trigger: 'failed', event: event.name, recordId: event.recordId, error: message });
      if (isTransient(error)) throw new RetryableLogicFunctionError(message);
      throw error;
    }
  };
}
