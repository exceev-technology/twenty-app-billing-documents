import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView, statusIs } from '../schema/views.ts';

export default billingView({
  key: 'quotesToInvoice', object: 'billingQuote', name: 'To invoice', icon: 'IconFileInvoice', position: 2,
  fields: ['number', 'company', 'person', 'total', 'acceptedAt'],
  filters: [statusIs('ACCEPTED')],
  sort: { field: 'acceptedAt', direction: ViewSortDirection.ASC },
});
