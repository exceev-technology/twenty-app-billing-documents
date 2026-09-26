import { MetadataWritability } from 'twenty-sdk/define';
import type { ObjectField } from './fields.ts';

const DOCUMENT = ['number', 'numberKey', 'snapshot', 'documentHash', 'pdf', 'subtotal', 'discountTotal', 'taxTotal', 'total'] as const;

/**
 * The fields only the app sets (spec §3). The server refuses them to people and
 * API keys and accepts them from the app, a token Twenty mints for the app and
 * a person included. Lifecycle's tests read this list to make the memory store
 * refuse the same writes.
 */
export const APP_ONLY_FIELDS = {
  billingQuote: [...DOCUMENT, 'version'],
  billingInvoice: [...DOCUMENT, 'issuedAt'],
  billingCreditNote: [...DOCUMENT, 'issuedAt'],
  billingQuoteLine: ['lineTotal'],
  billingInvoiceLine: ['lineTotal'],
  billingCreditNoteLine: ['lineTotal'],
  billingSequence: ['scopeKey'],
} as const satisfies Record<string, readonly string[]>;

/** The object's fields, its app-only ones marked so. */
export function markAppOnly(object: keyof typeof APP_ONLY_FIELDS, fields: ObjectField[]): ObjectField[] {
  const appOnly: readonly string[] = APP_ONLY_FIELDS[object];
  return fields.map((f) =>
    appOnly.includes((f as unknown as { name: string }).name) ? ({ ...f, writability: MetadataWritability.APPLICATION } as unknown as ObjectField) : f,
  );
}
