import { defineTimelineActivityType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';

/**
 * The row a guard leaves when it puts something back: "Twenty put back a change
 * to <document>". Expanded, it says what was put back and why, in the
 * document's language.
 */
export default defineTimelineActivityType({
  universalIdentifier: id(TIMELINE_TYPE_KEYS.CORRECTION),
  name: 'billingCorrection',
  label: 'put back a change to',
  icon: 'IconArrowBackUp',
  frontComponentUniversalIdentifier: id('frontComponent.billingTimelineMessage'),
});
