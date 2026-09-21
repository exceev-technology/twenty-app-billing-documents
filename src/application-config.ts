import { defineApplication } from 'twenty-sdk/define';
import { id } from './lib/id.ts';

export default defineApplication({
  universalIdentifier: id('app'),
  displayName: 'Billing Documents',
  description:
    'Quotes, invoices and credit notes as PDFs, inside Twenty. Any country, any currency, your own tax rules.',
  author: 'Exceev Technology',
  category: 'Sales',
});
