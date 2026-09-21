import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineNavigationMenuItem({
  universalIdentifier: id('navigationMenuItem.quotes'),
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: objectId('billingQuote'),
  folderUniversalIdentifier: id('navigationMenuItem.billing'),
  position: 0,
});
