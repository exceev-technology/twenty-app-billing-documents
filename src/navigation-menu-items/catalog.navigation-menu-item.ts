import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineNavigationMenuItem({
  universalIdentifier: id('navigationMenuItem.catalog'),
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: objectId('billingCatalogItem'),
  folderUniversalIdentifier: id('navigationMenuItem.billing'),
  position: 3,
});
