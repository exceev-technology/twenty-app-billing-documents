import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView, statusIs } from '../schema/views.ts';

export default billingView({
  key: 'invoicesPaid', object: 'billingInvoice', name: 'Paid', icon: 'IconCash', position: 4,
  fields: ['number', 'company', 'person', 'total', 'paidAt'],
  filters: [statusIs('PAID')],
  sort: { field: 'paidAt', direction: ViewSortDirection.DESC },
});
