import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.issueInvoice'],
  name: 'issue-invoice',
  description: 'Issues the selected draft invoice: its number, its PDF, and the invoice frozen.',
  isHeadless: true,
  component: () => <ActionCommand action="issue" object="billingInvoice" />,
});
