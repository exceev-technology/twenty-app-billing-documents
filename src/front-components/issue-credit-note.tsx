import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.issueCreditNote'],
  name: 'issue-credit-note',
  description: 'Issues the selected draft credit note: its number, its PDF, and the credit note frozen.',
  isHeadless: true,
  component: () => <ActionCommand action="issue" object="billingCreditNote" />,
});
