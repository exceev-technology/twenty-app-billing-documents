import { defineFrontComponent } from 'twenty-sdk/define';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { ActionCommand } from './action-command.tsx';

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.previewCreditNote'],
  name: 'preview-credit-note',
  description: 'Renders the selected draft credit note as a PDF marked DRAFT, into its PDF field.',
  isHeadless: true,
  component: () => <ActionCommand action="preview" object="billingCreditNote" />,
});
