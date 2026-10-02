import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';

/** The Overdue view of invoices, right after the Invoices entry. */
export default defineNavigationMenuItem({
  universalIdentifier: id('navigationMenuItem.overdueInvoices'),
  type: NavigationMenuItemType.VIEW,
  name: 'Overdue invoices',
  icon: 'IconAlarm',
  viewUniversalIdentifier: id('view.invoicesOverdue'),
  folderUniversalIdentifier: id('navigationMenuItem.billing'),
  position: 2,
});
