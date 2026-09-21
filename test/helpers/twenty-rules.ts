/**
 * Metadata rules the Twenty server enforces when an app is applied, which the
 * SDK does not check. Copied from twentyhq/twenty, main of 2026-09-21:
 * - packages/twenty-shared/src/metadata/constants/reserved-metadata-name-keywords.constant.ts
 * - packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/validators/utils/validate-enum-flat-field-metadata.util.ts
 */

/** Names no object (singular or plural) and no field of an app may take. */
export const TWENTY_RESERVED_NAMES: readonly string[] = [
  'approvedAccessDomain', 'approvedAccessDomains', 'appToken', 'appTokens',
  'billingCustomer', 'billingCustomers', 'billingEntitlement', 'billingEntitlements',
  'billingMeter', 'billingMeters', 'billingProduct', 'billingProducts',
  'billingSubscription', 'billingSubscriptions', 'billingSubscriptionItem', 'billingSubscriptionItems',
  'featureFlag', 'featureFlags', 'job', 'jobs', 'keyValuePair', 'keyValuePairs',
  'pageLayout', 'pageLayouts', 'pageLayoutTab', 'pageLayoutTabs', 'pageLayoutWidget', 'pageLayoutWidgets',
  'twoFactorMethod', 'twoFactorMethods', 'user', 'users', 'userWorkspace', 'userWorkspaces',
  'workspace', 'workspaces', 'role', 'roles', 'userWorkspaceRole', 'userWorkspaceRoles',
  'plan', 'plans', 'event', 'events', 'field', 'fields', 'link', 'links',
  'currency', 'currencies', 'fullNames', 'address', 'addresses', 'type', 'types',
  'object', 'objects', 'index', 'relation', 'relations',
  'aggregate', 'connect', 'create', 'disconnect', 'search', 'searches',
];

/** A select option label the server accepts: 1 to 63 characters, no comma. */
export const isAcceptedOptionLabel = (label: string): boolean =>
  label.trim().length > 0 && label.length <= 63 && !label.includes(',');
