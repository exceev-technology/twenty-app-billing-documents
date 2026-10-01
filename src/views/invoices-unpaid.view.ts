import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView, statusIs } from '../schema/views.ts';

export default billingView({
  key: 'invoicesUnpaid', object: 'billingInvoice', name: 'Unpaid', icon: 'IconClockDollar', position: 2,
  fields: ['number', 'company', 'person', 'issueDate', 'dueDate', 'total', 'status'],
  filters: [statusIs('ISSUED', 'SENT')],
  sort: { field: 'dueDate', direction: ViewSortDirection.ASC },
});
