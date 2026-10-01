import { defineLogicFunction } from 'twenty-sdk/define';
import { onLineEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardInvoiceLine'),
  name: 'guard-invoice-line',
  description: 'Fills an invoice line from its catalog item and updates the totals; puts back any change to an issued invoice’s lines.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingInvoiceLine.*' },
  handler: runTrigger((store, event) => onLineEvent(store, KINDS.billingInvoice, event)),
});
