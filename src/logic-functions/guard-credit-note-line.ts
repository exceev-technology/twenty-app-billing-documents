import { defineLogicFunction } from 'twenty-sdk/define';
import { onLineEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardCreditNoteLine'),
  name: 'guard-credit-note-line',
  description: 'Fills a credit note line from its catalog item and updates the totals; puts back any change to an issued credit note’s lines.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingCreditNoteLine.*' },
  handler: runTrigger((store, event) => onLineEvent(store, KINDS.billingCreditNote, event)),
});
