import { defineCommandMenuItem } from 'twenty-sdk/define';
import { OPEN_QUOTE_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.createInvoice'),
  label: 'Create invoice',
  shortLabel: 'Invoice',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingQuote'),
  frontComponentUniversalIdentifier: id('frontComponent.createInvoice'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': OPEN_QUOTE_ONE,
});
