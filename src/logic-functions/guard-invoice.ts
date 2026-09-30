import { defineLogicFunction } from 'twenty-sdk/define';
import { onDocumentEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardInvoice'),
  name: 'guard-invoice',
  description: 'Keeps a draft invoice’s totals current, and puts back any change to an issued invoice.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingInvoice.*' },
  handler: runTrigger((store, event) => onDocumentEvent(store, KINDS.billingInvoice, event)),
});
