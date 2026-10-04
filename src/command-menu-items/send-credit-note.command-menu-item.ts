import { defineCommandMenuItem } from 'twenty-sdk/define';
import { ISSUED_CREDIT_NOTE_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.sendCreditNote'),
  label: 'Send by email',
  shortLabel: 'Email',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingCreditNote'),
  frontComponentUniversalIdentifier: id('frontComponent.sendCreditNote'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': ISSUED_CREDIT_NOTE_ONE,
});
