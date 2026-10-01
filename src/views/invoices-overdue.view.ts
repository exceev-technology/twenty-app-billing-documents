import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { inPast, statusIs, viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'invoicesOverdue', object: 'billingInvoice', name: 'Overdue', icon: 'IconAlarm', position: 3,
  fields: ['number', 'company', 'person', 'dueDate', 'total', 'sentAt'],
  filters: [statusIs('ISSUED', 'SENT'), inPast('dueDate')],
  sort: { field: 'dueDate', direction: ViewSortDirection.ASC },
}));
