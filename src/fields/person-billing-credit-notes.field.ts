import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('person', oneToMany('person', 'billingCreditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'person' })),
);
