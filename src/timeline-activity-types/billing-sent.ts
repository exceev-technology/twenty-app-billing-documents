import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/** The row each send leaves: "Twenty sent <document>". Expanded, it names the mailbox and the recipients, in the document's language. */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.SENT),
  name: 'billingSent',
  label: 'sent',
  icon: 'IconMailForward',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
