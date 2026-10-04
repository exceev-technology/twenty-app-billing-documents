import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';

// A first invoice starts with an issuer, and Twenty offers no other way to reach a
// list: neither the command menu nor a profile's Issuers relation opens one.
export default defineNavigationMenuItem({
  universalIdentifier: id('navigationMenuItem.issuers'),
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: objectId('billingIssuer'),
  folderUniversalIdentifier: id('navigationMenuItem.billing'),
  position: 7,
});
