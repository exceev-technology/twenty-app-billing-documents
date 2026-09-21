import { defineObject } from 'twenty-sdk/define';
import { fieldId, objectId } from '../schema/fields.ts';
import { lineFields } from '../schema/documents.ts';

const O = 'billingQuoteLine';

export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingQuoteLines',
  labelSingular: 'Quote line',
  labelPlural: 'Quote lines',
  description: 'One line of a quote.',
  icon: 'IconList',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'description'),
  fields: lineFields({ object: O, parentObject: 'billingQuote', parentField: 'quote', parentLabel: 'Quote', catalogInverse: 'quoteLines', taxCodeInverse: 'quoteLines' }),
});
