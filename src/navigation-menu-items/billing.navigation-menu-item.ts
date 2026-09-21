import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';

/** The app's sidebar folder, after the workspace's own items. */
export default defineNavigationMenuItem({
  universalIdentifier: id('navigationMenuItem.billing'),
  type: NavigationMenuItemType.FOLDER,
  name: 'Billing',
  icon: 'IconReceipt',
  position: 100,
});
