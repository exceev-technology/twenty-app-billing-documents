import { defineCommandMenuItem } from 'twenty-sdk/define';
import { DRAFT_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.issueCreditNote'),
  label: 'Issue credit note',
  shortLabel: 'Issue',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingCreditNote'),
  frontComponentUniversalIdentifier: id('frontComponent.issueCreditNote'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': DRAFT_ONE,
});
