import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/** The row a quote gets when an invoice is made from it: "Twenty invoiced <quote>". */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.INVOICED),
  name: 'billingInvoiced',
  label: 'invoiced',
  icon: 'IconFileInvoice',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
