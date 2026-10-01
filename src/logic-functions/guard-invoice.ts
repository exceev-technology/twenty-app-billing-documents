import { defineLogicFunction } from 'twenty-sdk/define';
import { onDocumentEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardInvoice'),
  name: 'guard-invoice',
  description: 'Keeps a draft invoice’s totals current, puts back any change to an issued invoice, lets it be Sent or Paid only once issued and stamps those dates, and keeps the quote it came from in step: Accepted when the draft is deleted, Invoiced again when restored.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingInvoice.*' },
  handler: runTrigger((store, event) => onDocumentEvent(store, KINDS.billingInvoice, event, () => new Date())),
});
