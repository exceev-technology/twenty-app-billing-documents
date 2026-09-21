import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('person', oneToMany('person', 'billingIdentifiers', { label: 'Legal identifiers', icon: 'IconId' }, { object: 'billingIdentifier', inverse: 'person' })),
);
