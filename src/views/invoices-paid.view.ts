import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { statusIs, viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'invoicesPaid', object: 'billingInvoice', name: 'Paid', icon: 'IconCash', position: 4,
  fields: ['number', 'company', 'person', 'total', 'paidAt'],
  filters: [statusIs('PAID')],
  sort: { field: 'paidAt', direction: ViewSortDirection.DESC },
}));
