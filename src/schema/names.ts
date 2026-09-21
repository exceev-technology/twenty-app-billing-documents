/** Every object the app declares. API names are prefixed `billing`. */
export const APP_OBJECTS = [
  'billingProfile',
  'billingIdentifierType',
  'billingIdentifier',
  'billingIssuer',
  'billingTaxCode',
  'billingTaxComponent',
  'billingCatalogItem',
  'billingQuote',
  'billingQuoteLine',
  'billingInvoice',
  'billingInvoiceLine',
  'billingCreditNote',
  'billingCreditNoteLine',
  'billingSequence',
] as const;

export type AppObject = (typeof APP_OBJECTS)[number];

/** Standard Twenty objects the app relates to. */
export const STANDARD_TARGETS = ['company', 'person', 'opportunity'] as const;

export type StandardTarget = (typeof STANDARD_TARGETS)[number];
