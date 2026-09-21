import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { fieldId, integer, manyToOne, objectId, select, text } from '../schema/fields.ts';
import { DOCUMENT_TYPES } from '../schema/options.ts';

const O = 'billingSequence';

/** The numbering ledger. Allocation and gap handling belong to Lifecycle. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingSequences',
  labelSingular: 'Numbering sequence',
  labelPlural: 'Numbering sequences',
  description: 'The last number issued, per issuer, document type and period. Never edit it by hand.',
  icon: 'IconListNumbers',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'periodKey'),
  fields: [
    text(O, 'periodKey', { label: 'Period', description: 'ALL, a year (2026) or a month (2026-09), per the profile’s numbering reset.', icon: 'IconCalendar' }),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'sequences', onDelete: OnDeleteAction.SET_NULL }),
    select(O, 'documentType', { label: 'Document type', icon: 'IconFiles' }, DOCUMENT_TYPES, 'INVOICE'),
    integer(O, 'lastValue', { label: 'Last number', icon: 'IconHash' }),
  ],
});
