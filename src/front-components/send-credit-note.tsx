import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { SendEmailForm } from './send-email-form.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.sendCreditNote'],
  name: 'send-credit-note',
  description: 'The Send by email form for the selected credit note, in the side panel.',
  component: () => <SendEmailForm object="billingCreditNote" />,
});
