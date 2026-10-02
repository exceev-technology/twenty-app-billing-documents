import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { statusIs, viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'quotesOpen', object: 'billingQuote', name: 'Open', icon: 'IconHourglass', position: 1,
  fields: ['number', 'company', 'person', 'total', 'validUntil', 'status'],
  filters: [statusIs('DRAFT', 'SENT')],
  sort: { field: 'validUntil', direction: ViewSortDirection.ASC },
}));
