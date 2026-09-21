import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { dateTime, fieldId, manyToOne, objectId, text } from '../schema/fields.ts';
import { documentFields } from '../schema/documents.ts';
import { CREDIT_NOTE_STATUSES } from '../schema/options.ts';

const O = 'billingCreditNote';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingCreditNotes',
  labelSingular: 'Credit note',
  labelPlural: 'Credit notes',
  description: 'Corrects or cancels an issued invoice, in whole or in part.',
  icon: 'IconReceiptRefund',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'subject'),
  fields: [
    ...documentFields({ object: O, lineObject: 'billingCreditNoteLine', lineParentField: 'creditNote', issuerInverse: 'creditNotes', buyerInverse: 'billingCreditNotes', statuses: CREDIT_NOTE_STATUSES }),
    manyToOne(O, 'invoice', { label: 'Invoice', description: 'The invoice this credit note corrects. Required to issue.', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'creditNotes', onDelete: OnDeleteAction.SET_NULL }),
    text(O, 'reason', { label: 'Reason', icon: 'IconMessage' }),
    dateTime(O, 'issuedAt', { label: 'Issued at', icon: 'IconCalendarCheck' }),
  ],
});
