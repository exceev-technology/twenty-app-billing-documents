import { defineView, ViewSortDirection } from 'twenty-sdk/define';
import { statusIs, viewConfig } from '../schema/views.ts';

export default defineView(viewConfig({
  key: 'invoicesDrafts', object: 'billingInvoice', name: 'Drafts', icon: 'IconPencil', position: 1,
  fields: ['issuer', 'company', 'person', 'total', 'updatedAt'],
  filters: [statusIs('DRAFT')],
  sort: { field: 'updatedAt', direction: ViewSortDirection.DESC },
}));
