import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('person', oneToMany('person', 'billingQuotes', { label: 'Quotes', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'person' })),
);
