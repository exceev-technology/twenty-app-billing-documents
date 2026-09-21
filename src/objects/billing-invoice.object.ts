import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { date, dateTime, fieldId, manyToOne, objectId, oneToMany, text } from '../schema/fields.ts';
import { documentFields } from '../schema/documents.ts';
import { INVOICE_STATUSES } from '../schema/options.ts';

const O = 'billingInvoice';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingInvoices',
  labelSingular: 'Invoice',
  labelPlural: 'Invoices',
  description: 'An invoice. Numbered and locked when issued; corrected only by a credit note.',
  icon: 'IconFileInvoice',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'subject'),
  fields: [
    ...documentFields({ object: O, lineObject: 'billingInvoiceLine', lineParentField: 'invoice', issuerInverse: 'invoices', buyerInverse: 'billingInvoices', statuses: INVOICE_STATUSES }),
    manyToOne(O, 'opportunity', { label: 'Opportunity', icon: 'IconTargetArrow' }, { object: 'opportunity', inverse: 'billingInvoices', onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'quote', { label: 'Quote', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'invoices', onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'dueDate', { label: 'Due date', icon: 'IconCalendarDue' }),
    text(O, 'buyerReference', { label: 'Buyer reference', description: 'The client’s purchase order or reference.', icon: 'IconHash' }),
    dateTime(O, 'issuedAt', { label: 'Issued at', icon: 'IconCalendarCheck' }),
    dateTime(O, 'sentAt', { label: 'Sent at', icon: 'IconSend' }),
    date(O, 'paidAt', { label: 'Paid on', icon: 'IconCash' }),
    oneToMany(O, 'creditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'invoice' }),
  ],
});
