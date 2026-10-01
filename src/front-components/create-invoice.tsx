import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.createInvoice'],
  name: 'create-invoice',
  description: 'Makes a draft invoice from the selected quote, and opens it.',
  isHeadless: true,
  component: () => <ActionCommand action="invoiceQuote" object="billingQuote" opensCreated />,
});
