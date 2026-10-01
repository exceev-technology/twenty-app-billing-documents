import { ViewSortDirection } from 'twenty-sdk/define';
import { billingView, statusIs } from '../schema/views.ts';

export default billingView({
  key: 'invoicesDrafts', object: 'billingInvoice', name: 'Drafts', icon: 'IconPencil', position: 1,
  fields: ['issuer', 'company', 'person', 'total', 'updatedAt'],
  filters: [statusIs('DRAFT')],
  sort: { field: 'updatedAt', direction: ViewSortDirection.DESC },
});
