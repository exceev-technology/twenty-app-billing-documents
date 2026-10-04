import { defineCommandMenuItem } from 'twenty-sdk/define';
import { ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.sendQuote'),
  label: 'Send by email',
  shortLabel: 'Email',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingQuote'),
  frontComponentUniversalIdentifier: id('frontComponent.sendQuote'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': ONE,
});
