import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.creditNote'],
  name: 'credit-note',
  description: 'Makes a draft credit note holding what remains of the selected invoice, and opens it.',
  isHeadless: true,
  component: () => <ActionCommand action="creditNote" object="billingInvoice" opensCreated />,
});
