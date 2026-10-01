import { onDocumentEvent, onLineEvent } from '../../../lifecycle/guards.ts';
import { KINDS } from '../../../lifecycle/load.ts';
import { guardSequence } from '../../../lifecycle/numbering.ts';
import type { RecordEvent, Store } from '../../../lifecycle/store.ts';
import { now } from './fixtures.ts';
import type { MemoryEvent } from './memory-store.ts';

/** What the seven triggers do, by object: each event goes to the handler its object's trigger runs. */
export function dispatcher(store: Store): (event: MemoryEvent) => Promise<void> {
  const routes = new Map<string, (event: RecordEvent) => Promise<void>>();
  for (const kind of Object.values(KINDS)) {
    routes.set(kind.plural, (event) => onDocumentEvent(store, kind, event, now));
    routes.set(kind.linePlural, (event) => onLineEvent(store, kind, event));
  }
  routes.set('billingSequences', (event) => guardSequence(store, event));
  return async (event) => {
    await routes.get(event.plural)?.(event);
  };
}
