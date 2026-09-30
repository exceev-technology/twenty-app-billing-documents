import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/** The row an issue leaves: "Twenty issued <document>". Expanded, it reads "Issued as F2026-0001." in the document's language. */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.ISSUED),
  name: 'billingIssued',
  label: 'issued',
  icon: 'IconFileCheck',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
