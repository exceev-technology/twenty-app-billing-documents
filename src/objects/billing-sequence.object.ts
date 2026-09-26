import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { fieldId, integer, manyToOne, objectId, select, text, unique } from '../schema/fields.ts';
import { DOCUMENT_TYPES } from '../schema/options.ts';
import { markAppOnly } from '../schema/app-only.ts';

const O = 'billingSequence';

/** The numbering ledger. Allocation and gap handling belong to Lifecycle. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingSequences',
  labelSingular: 'Numbering sequence',
  labelPlural: 'Numbering sequences',
  description: 'The last number given out, per issuer, document type and period. Create one to continue from an older system’s numbers; once a number is given out, it only rises.',
  icon: 'IconListNumbers',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'periodKey'),
  fields: markAppOnly(O, [
    text(O, 'periodKey', { label: 'Period', description: 'ALL, a year (2026) or a month (2026-09), per the profile’s numbering reset.', icon: 'IconCalendar' }),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'sequences', onDelete: OnDeleteAction.SET_NULL }),
    select(O, 'documentType', { label: 'Document type', icon: 'IconFiles' }, DOCUMENT_TYPES, 'INVOICE'),
    integer(O, 'lastValue', { label: 'Last number', icon: 'IconHash' }),
    unique(text(O, 'scopeKey', { label: 'Scope key', description: 'Issuer, document type and period, so that a scope has one row. Set by the app.', icon: 'IconKey' })),
  ]),
});
