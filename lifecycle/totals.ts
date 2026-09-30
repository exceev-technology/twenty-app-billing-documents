import { checkDocument, computeDocument } from '../engine/index.ts';
import { isIssued, loadFigures, type Kind } from './load.ts';
import { currencyOf, effectiveCurrency, idOf, microsOf, moneyOf, toDocumentInput } from './map.ts';
import type { RecordEvent, Store } from './store.ts';

/** An emptied CURRENCY value, as Twenty stores it. */
export const EMPTY_MONEY = { amountMicros: null, currencyCode: '' };

type Money = { amountMicros: number | null; currencyCode: string };

/** Whether a stored CURRENCY value already holds the wanted one. Empty equals empty, whatever its currency. */
export function sameMoney(value: unknown, wanted: Money): boolean {
  const micros = microsOf(value);
  if (wanted.amountMicros === null) return Number.isNaN(micros);
  return micros === wanted.amountMicros && currencyOf(value) === wanted.currencyCode;
}

/** Fields that change on every write, or that a recomputation writes itself. */
const QUIET = new Set(['updatedAt', 'updatedBy', 'position', 'searchVector', 'lineTotal']);

/** Spec §8: a line created, restored, deleted, or changed in a field other than lineTotal. */
export function lineChangeMatters(event: RecordEvent): boolean {
  if (event.name === 'updated') return event.updatedFields.some((field) => !QUIET.has(field));
  return event.name === 'created' || event.name === 'deleted' || event.name === 'restored';
}

const BASIS = new Set(['currencyCode', 'pricesIncludeTax', 'issuerId', 'issuer']);

/** Spec §8: a change of the currency, the price basis, or the issuer (whose profile sets the rounding). */
export function documentChangeMatters(event: RecordEvent): boolean {
  return event.name === 'updated' && event.updatedFields.some((field) => BASIS.has(field));
}

/**
 * Recomputes a document that is not issued: an issued one is left to the guards.
 * Writes, as the app, only the values that differ: a second run writes nothing,
 * and a change of lineTotal alone triggers no recomputation, so nothing loops.
 */
export async function recomputeTotals(store: Store, kind: Kind, documentId: string): Promise<void> {
  const figures = await loadFigures(store, kind, documentId);
  if (!figures || figures.document.deletedAt || isIssued(kind, figures.document)) return;
  const currency = effectiveCurrency(figures);
  const input = toDocumentInput(figures, currency);
  const result = checkDocument(input).length === 0 ? computeDocument(input) : null;
  const want = (micros: number | undefined): Money => (micros === undefined ? EMPTY_MONEY : moneyOf(micros, currency));

  for (const line of figures.lines) {
    const wanted = want(result?.lines.find((entry) => entry.key === line.id)?.lineTotalMicros);
    if (!sameMoney(line.lineTotal, wanted)) await store.update(kind.linePlural, line.id, { lineTotal: wanted });
  }

  const totals: Record<string, Money> = {
    subtotal: want(result?.subtotalMicros),
    discountTotal: want(result?.discountTotalMicros),
    taxTotal: want(result?.taxTotalMicros),
    total: want(result?.totalMicros),
  };
  const patch = Object.fromEntries(Object.entries(totals).filter(([field, wanted]) => !sameMoney(figures.document[field], wanted)));
  if (Object.keys(patch).length > 0) await store.update(kind.plural, documentId, patch);
}

const blank = (value: unknown): boolean => value === null || value === undefined || value === '';
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A line field the catalog may fill: empty, or for the unit still Twenty's default. */
function emptyOnLine(field: string, value: unknown): boolean {
  if (field === 'unit') return blank(value) || value === 'UNIT';
  if (field === 'unitPrice') return Number.isNaN(microsOf(value));
  return blank(value);
}

/**
 * Spec §8: a line created with a catalog item takes the item's description,
 * unit, price and tax code into its empty fields; a changed item replaces them.
 * A value the item leaves empty never erases the line's. True when it wrote.
 */
export async function fillFromCatalog(store: Store, kind: Kind, event: RecordEvent): Promise<boolean> {
  if (event.name !== 'created' && event.name !== 'updated') return false;
  const itemId = idOf(event.after?.catalogItemId);
  if (!itemId) return false;
  const replacing = event.name === 'updated';
  if (replacing && (!event.updatedFields.includes('catalogItemId') || idOf(event.before?.catalogItemId) === itemId)) return false;
  const line = await store.get(kind.linePlural, event.recordId);
  // Changed again since: the later event does the fill.
  if (!line || idOf(line.catalogItemId) !== itemId) return false;
  const item = await store.get('billingCatalogItems', itemId);
  if (!item) return false;
  const values: Record<string, unknown> = {
    description: item.description,
    unit: item.unit,
    unitPrice: Number.isNaN(microsOf(item.unitPrice)) ? null : moneyOf(microsOf(item.unitPrice), currencyOf(item.unitPrice)),
    taxCodeId: item.taxCodeId,
  };
  const patch: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (blank(value)) continue;
    if (!replacing && !emptyOnLine(field, line[field])) continue;
    if (!same(line[field], value)) patch[field] = value;
  }
  if (Object.keys(patch).length === 0) return false;
  await store.update(kind.linePlural, line.id, patch);
  return true;
}
