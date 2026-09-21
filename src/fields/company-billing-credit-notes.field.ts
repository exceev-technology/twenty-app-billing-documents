import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('company', oneToMany('company', 'billingCreditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'company' })),
);
