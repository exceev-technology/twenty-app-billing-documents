import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';
import { cancelConfirmation } from './action-feedback.ts';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.cancelInvoice'],
  name: 'cancel-invoice',
  description: 'After a confirmation, issues a credit note for what remains of the selected invoice and marks it Cancelled.',
  isHeadless: true,
  component: () => <ActionCommand action="cancelInvoice" object="billingInvoice" opensCreated confirm={cancelConfirmation} />,
});
