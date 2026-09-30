import { defineLogicFunction } from 'twenty-sdk/define';
import { onLineEvent } from '../../lifecycle/guards.ts';
import { KINDS } from '../../lifecycle/load.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardQuoteLine'),
  name: 'guard-quote-line',
  description: 'Fills a quote line from its catalog item and updates the quote’s totals.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingQuoteLine.*' },
  handler: runTrigger((store, event) => onLineEvent(store, KINDS.billingQuote, event)),
});
