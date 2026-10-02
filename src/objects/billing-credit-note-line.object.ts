import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { fieldId, manyToOne, objectId } from '../schema/fields.ts';
import { lineFields } from '../schema/documents.ts';
import { markAppOnly } from '../schema/app-only.ts';

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
  fields: markAppOnly(O, [
    ...lineFields({ object: O, parentObject: 'billingCreditNote', parentField: 'creditNote', parentLabel: 'Credit note', catalogInverse: 'creditNoteLines', taxCodeInverse: 'creditNoteLines' }),
    manyToOne(O, 'invoiceLine', { label: 'Invoice line', description: 'The invoice line this line credits. Set by the app.', icon: 'IconLink' }, { object: 'billingInvoiceLine', inverse: 'creditNoteLines', onDelete: OnDeleteAction.SET_NULL }),
  ]),
});
