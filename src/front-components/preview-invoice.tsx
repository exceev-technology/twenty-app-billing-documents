import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.previewInvoice'],
  name: 'preview-invoice',
  description: 'Renders the selected draft invoice as a PDF marked DRAFT, into its PDF field.',
  isHeadless: true,
  component: () => <ActionCommand action="preview" object="billingInvoice" />,
});
