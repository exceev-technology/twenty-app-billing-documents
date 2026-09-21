import { defineObject } from 'twenty-sdk/define';
import { fieldId, objectId } from '../schema/fields.ts';
import { lineFields } from '../schema/documents.ts';

const O = 'billingCreditNoteLine';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingCreditNoteLines',
  labelSingular: 'Credit note line',
  labelPlural: 'Credit note lines',
  description: 'One line of a credit note.',
  icon: 'IconList',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'description'),
  fields: lineFields({ object: O, parentObject: 'billingCreditNote', parentField: 'creditNote', parentLabel: 'Credit note', catalogInverse: 'creditNoteLines', taxCodeInverse: 'creditNoteLines' }),
});
