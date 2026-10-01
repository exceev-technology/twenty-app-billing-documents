import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { statusIs, viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'invoicesUnpaid', object: 'billingInvoice', name: 'Unpaid', icon: 'IconClockDollar', position: 2,
  fields: ['number', 'company', 'person', 'issueDate', 'dueDate', 'total', 'status'],
  filters: [statusIs('ISSUED', 'SENT')],
  sort: { field: 'dueDate', direction: ViewSortDirection.ASC },
}));
