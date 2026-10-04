import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/** The row an invoice gets when its credit notes credit all of it: "Twenty cancelled <invoice>". */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.CANCELLED),
  name: 'billingCancelled',
  label: 'cancelled',
  icon: 'IconFileX',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
