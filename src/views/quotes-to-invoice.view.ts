import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { statusIs, viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'quotesToInvoice', object: 'billingQuote', name: 'To invoice', icon: 'IconFileInvoice', position: 2,
  fields: ['number', 'company', 'person', 'total', 'acceptedAt'],
  filters: [statusIs('ACCEPTED')],
  sort: { field: 'acceptedAt', direction: ViewSortDirection.ASC },
}));
