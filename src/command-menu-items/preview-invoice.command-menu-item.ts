import { defineCommandMenuItem } from 'twenty-sdk/define';
import { DRAFT_ONE } from '../front-components/action-feedback.ts';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineCommandMenuItem({
  universalIdentifier: id('commandMenuItem.previewInvoice'),
  label: 'Preview PDF',
  shortLabel: 'Preview',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: objectId('billingInvoice'),
  frontComponentUniversalIdentifier: id('frontComponent.previewInvoice'),
  // Quoted, so that the CLI's rewrite of `conditionalAvailabilityExpression:` leaves the string as it is.
  'conditionalAvailabilityExpression': DRAFT_ONE,
});
