import { defineApplication } from 'twenty-sdk/define';
import { id } from './lib/id.ts';

const REPOSITORY = 'https://github.com/exceev-technology/twenty-app-billing-documents';

export default defineApplication({
  universalIdentifier: id('app'),
  displayName: 'Billing Documents',
  description:
    'Quotes, invoices and credit notes as PDFs, inside Twenty. Any country, any currency, your own tax rules.',
  author: 'Exceev Technology',
  category: 'Sales',
  // The build reads these two from public/ and the marketplace copies them to its own storage;
  // an external URL is ignored. `npm run listing:images` draws the logo and the layouts picture.
  logo: 'public/logo.png',
  galleryImages: ['public/gallery/layouts.png'],
  websiteUrl: REPOSITORY,
  issueReportUrl: `${REPOSITORY}/issues`,
});
