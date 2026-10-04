import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { statusIs, viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'creditNotesDrafts', object: 'billingCreditNote', name: 'Drafts', icon: 'IconPencil', position: 1,
  fields: ['invoice', 'company', 'total'],
  filters: [statusIs('DRAFT')],
  sort: { field: 'updatedAt', direction: ViewSortDirection.DESC },
}));
