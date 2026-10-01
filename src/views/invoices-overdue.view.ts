import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView, inPast, statusIs } from '../schema/views.ts';

export default billingView({
  key: 'invoicesOverdue', object: 'billingInvoice', name: 'Overdue', icon: 'IconAlarm', position: 3,
  fields: ['number', 'company', 'person', 'dueDate', 'total', 'sentAt'],
  filters: [statusIs('ISSUED', 'SENT'), inPast('dueDate')],
  sort: { field: 'dueDate', direction: ViewSortDirection.ASC },
});
