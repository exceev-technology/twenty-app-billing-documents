import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView, statusIs } from '../schema/views.ts';

export default billingView({
  key: 'creditNotesDrafts', object: 'billingCreditNote', name: 'Drafts', icon: 'IconPencil', position: 1,
  fields: ['invoice', 'company', 'total'],
  filters: [statusIs('DRAFT')],
  sort: { field: 'updatedAt', direction: ViewSortDirection.DESC },
});
