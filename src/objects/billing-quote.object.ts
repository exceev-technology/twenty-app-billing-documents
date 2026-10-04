import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { date, dateTime, fieldId, integer, manyToOne, objectId, oneToMany } from '../schema/fields.ts';
import { documentFields } from '../schema/documents.ts';
import { QUOTE_STATUSES } from '../schema/options.ts';
import { markAppOnly } from '../schema/app-only.ts';

const O = 'billingQuote';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingQuotes',
  labelSingular: 'Quote',
  labelPlural: 'Quotes',
  description: 'A priced offer to a client. Once accepted, it becomes an invoice.',
  icon: 'IconFileDescription',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'subject'),
  fields: markAppOnly(O, [
    ...documentFields({ object: O, lineObject: 'billingQuoteLine', lineParentField: 'quote', issuerInverse: 'quotes', buyerInverse: 'billingQuotes', statuses: QUOTE_STATUSES }),
    manyToOne(O, 'opportunity', { label: 'Opportunity', icon: 'IconTargetArrow' }, { object: 'opportunity', inverse: 'billingQuotes', onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'validUntil', { label: 'Valid until', icon: 'IconCalendarDue' }),
    date(O, 'acceptedAt', { label: 'Accepted on', icon: 'IconCircleCheck' }),
    dateTime(O, 'sentAt', { label: 'Sent at', icon: 'IconSend' }),
    integer(O, 'version', { label: 'PDF version', description: 'Empty before the first PDF, then 1, 2, 3.', icon: 'IconVersions' }),
    oneToMany(O, 'invoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'quote' }),
  ]),
});
