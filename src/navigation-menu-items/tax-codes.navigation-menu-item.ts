import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

export default defineNavigationMenuItem({
  universalIdentifier: id('navigationMenuItem.taxCodes'),
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: objectId('billingTaxCode'),
  folderUniversalIdentifier: id('navigationMenuItem.billing'),
  position: 4,
});
