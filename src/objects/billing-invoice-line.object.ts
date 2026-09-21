import { defineObject } from 'twenty-sdk/define';
import { fieldId, objectId } from '../schema/fields.ts';
import { lineFields } from '../schema/documents.ts';

const O = 'billingInvoiceLine';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingInvoiceLines',
  labelSingular: 'Invoice line',
  labelPlural: 'Invoice lines',
  description: 'One line of an invoice.',
  icon: 'IconList',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'description'),
  fields: lineFields({ object: O, parentObject: 'billingInvoice', parentField: 'invoice', parentLabel: 'Invoice', catalogInverse: 'invoiceLines', taxCodeInverse: 'invoiceLines' }),
});
