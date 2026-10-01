import { defineLogicFunction } from 'twenty-sdk/define';
import { onDocumentEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardCreditNote'),
  name: 'guard-credit-note',
  description: 'Keeps a draft credit note’s totals current, and puts back any change to an issued credit note.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingCreditNote.*' },
  handler: runTrigger((store, event) => onDocumentEvent(store, KINDS.billingCreditNote, event)),
});
