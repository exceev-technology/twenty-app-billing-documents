import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.quotePdf'],
  name: 'quote-pdf',
  description: 'Generates the next version of the selected quote’s PDF, numbering the quote on its first.',
  isHeadless: true,
  component: () => <ActionCommand action="quotePdf" object="billingQuote" />,
});
