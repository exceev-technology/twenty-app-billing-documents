import { defineLogicFunction } from 'twenty-sdk/define';
import { onDocumentEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardQuote'),
  name: 'guard-quote',
  description: 'Keeps a quote’s totals current, keeps a numbered quote from being deleted, stamps its sent and accepted dates, and keeps it Invoiced while it has an invoice: a person’s move out of Invoiced is put back.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingQuote.*' },
  handler: runTrigger((store, event) => onDocumentEvent(store, KINDS.billingQuote, event, () => new Date())),
});
