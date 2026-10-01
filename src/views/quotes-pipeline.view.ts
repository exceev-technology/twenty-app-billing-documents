import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView } from '../schema/views.ts';

export default billingView({
  key: 'quotesPipeline', object: 'billingQuote', name: 'Pipeline', icon: 'IconLayoutKanban', position: 3, kanbanBy: 'status',
  fields: ['number', 'company', 'total', 'validUntil'],
  sort: { field: 'updatedAt', direction: ViewSortDirection.DESC },
});
