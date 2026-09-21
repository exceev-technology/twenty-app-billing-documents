import { defineField } from 'twenty-sdk/define';
import { oneToMany, onStandard } from '../schema/fields.ts';

export default defineField(
  onStandard('company', oneToMany('company', 'billingInvoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'company' })),
);
