import type { Preset, PresetIdentifierType, PresetTaxCode, PresetTaxComponent } from '../presets/types.ts';

/**
 * Creates what is missing, never changes what exists. A record found by its
 * stable key is the user's, edited or not, deleted or not. The only repair is
 * a seeded tax code with no component at all, which only an interrupted run
 * leaves behind.
 */

export type SeedRow = { id: string; deletedAt?: string | null; [field: string]: unknown };

export type SeedStore = {
  /** Every row of an object, soft-deleted ones included. */
  list(plural: string): Promise<SeedRow[]>;
  create(plural: string, singular: string, data: Record<string, unknown>): Promise<SeedRow>;
};

export type SeedReport = { profiles: number; identifierTypes: number; taxCodes: number; taxComponents: number };

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}

const markdown = (text?: string) => (text ? { markdown: text } : undefined);

export function profileRecord(p: Preset): Record<string, unknown> {
  return compact({
    name: p.name,
    presetKey: p.key,
    countryCode: p.countryCode,
    language: p.language,
    locale: p.locale,
    defaultCurrency: p.defaultCurrency,
    roundingMode: p.roundingMode,
    amountInWords: p.amountInWords,
    invoiceTitle: p.invoiceTitle,
    creditNoteTitle: p.creditNoteTitle,
    quoteNumberPattern: p.numbering.quote,
    invoiceNumberPattern: p.numbering.invoice,
    creditNoteNumberPattern: p.numbering.creditNote,
    numberingReset: p.numbering.reset,
    defaultPaymentTermDays: p.defaultPaymentTermDays,
    defaultQuoteValidityDays: p.defaultQuoteValidityDays,
    quoteMentions: markdown(p.mentions.quote),
    invoiceMentions: markdown(p.mentions.invoice),
    creditNoteMentions: markdown(p.mentions.creditNote),
    qrMode: p.qrMode,
    complianceNote: p.complianceNote,
    verifiedOn: p.verifiedOn,
  });
}

export function identifierTypeRecord(t: PresetIdentifierType, sortOrder: number, profileId: string): Record<string, unknown> {
  return compact({
    name: t.name,
    key: t.key,
    profileId,
    appliesTo: t.appliesTo,
    requiredForSeller: t.requiredForSeller ?? false,
    requiredForBusinessBuyer: t.requiredForBusinessBuyer ?? false,
    printOnDocuments: t.printOnDocuments ?? true,
    includeInQr: t.includeInQr ?? false,
    validationPattern: t.validationPattern,
    sortOrder,
  });
}

export function taxCodeRecord(p: Preset, c: PresetTaxCode): Record<string, unknown> {
  return compact({ name: c.name, code: c.code, countryCode: p.countryCode, category: c.category, printNote: c.printNote, isActive: true });
}

export function taxComponentRecord(c: PresetTaxComponent, sortOrder: number, taxCodeId: string): Record<string, unknown> {
  return compact({ name: c.name, rate: c.rate, compound: c.compound ?? false, sortOrder, taxCodeId });
}

export async function seedPresets(store: SeedStore, presets: readonly Preset[]): Promise<SeedReport> {
  const report: SeedReport = { profiles: 0, identifierTypes: 0, taxCodes: 0, taxComponents: 0 };

  const profiles = new Map<string, SeedRow>();
  for (const row of await store.list('billingProfiles')) {
    if (typeof row.presetKey === 'string' && row.presetKey) profiles.set(row.presetKey, row);
  }
  for (const preset of presets) {
    if (profiles.has(preset.key)) continue;
    profiles.set(preset.key, await store.create('billingProfiles', 'billingProfile', profileRecord(preset)));
    report.profiles += 1;
  }

  const typeKeys = new Set((await store.list('billingIdentifierTypes')).map((row) => row.key));
  for (const preset of presets) {
    const profile = profiles.get(preset.key)!;
    if (profile.deletedAt) continue;
    for (const [index, type] of preset.identifierTypes.entries()) {
      if (typeKeys.has(type.key)) continue;
      await store.create('billingIdentifierTypes', 'billingIdentifierType', identifierTypeRecord(type, index, profile.id));
      typeKeys.add(type.key);
      report.identifierTypes += 1;
    }
  }

  const codes = new Map<string, SeedRow>();
  for (const row of await store.list('billingTaxCodes')) {
    if (typeof row.code === 'string' && row.code) codes.set(row.code, row);
  }
  const componentCount = new Map<string, number>();
  for (const row of await store.list('billingTaxComponents')) {
    const taxCodeId = row.taxCodeId;
    if (typeof taxCodeId === 'string') componentCount.set(taxCodeId, (componentCount.get(taxCodeId) ?? 0) + 1);
  }
  for (const preset of presets) {
    for (const code of preset.taxCodes) {
      let row = codes.get(code.code);
      if (!row) {
        row = await store.create('billingTaxCodes', 'billingTaxCode', taxCodeRecord(preset, code));
        codes.set(code.code, row);
        report.taxCodes += 1;
      }
      if (row.deletedAt || (componentCount.get(row.id) ?? 0) > 0) continue;
      for (const [index, component] of code.components.entries()) {
        await store.create('billingTaxComponents', 'billingTaxComponent', taxComponentRecord(component, index, row.id));
        report.taxComponents += 1;
      }
      componentCount.set(row.id, code.components.length);
    }
  }

  return report;
}
