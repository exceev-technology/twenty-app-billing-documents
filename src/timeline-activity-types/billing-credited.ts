import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/** The row an invoice gets when a credit note against it is issued: "Twenty credited <invoice>". */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.CREDITED),
  name: 'billingCredited',
  label: 'credited',
  icon: 'IconReceiptRefund',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
