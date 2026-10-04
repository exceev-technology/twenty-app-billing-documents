import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { QUOTE_STATUSES } from '../schema/options.ts';
import { viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'quotesPipeline', object: 'billingQuote', name: 'Pipeline', icon: 'IconLayoutKanban', position: 3, kanbanBy: { field: 'status', options: QUOTE_STATUSES },
  fields: ['number', 'company', 'total', 'validUntil'],
  sort: { field: 'updatedAt', direction: ViewSortDirection.DESC },
}));
