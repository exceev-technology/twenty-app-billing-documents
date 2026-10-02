import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { SendEmailForm } from './send-email-form.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.sendQuote'],
  name: 'send-quote',
  description: 'The Send by email form for the selected quote, in the side panel.',
  component: () => <SendEmailForm object="billingQuote" />,
});
