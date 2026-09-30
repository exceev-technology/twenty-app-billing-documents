import { defineLogicFunction } from 'twenty-sdk/define';
import { guardSequence } from '../../lifecycle/numbering.ts';
import { id } from '../lib/id.ts';
import { runTrigger } from '../lib/trigger.ts';

export default defineLogicFunction({
  universalIdentifier: id('logicFunction.guardSequence'),
  name: 'guard-sequence',
  description: 'Keeps the numbering ledger sound: one row per scope, and once a scope has given out a number, its last number only rises.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'billingSequence.*' },
  handler: runTrigger((store, event) => guardSequence(store, event)),
});
