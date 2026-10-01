import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView, statusIs } from '../schema/views.ts';

export default billingView({
  key: 'quotesOpen', object: 'billingQuote', name: 'Open', icon: 'IconHourglass', position: 1,
  fields: ['number', 'company', 'person', 'total', 'validUntil', 'status'],
  filters: [statusIs('DRAFT', 'SENT')],
  sort: { field: 'validUntil', direction: ViewSortDirection.ASC },
});
