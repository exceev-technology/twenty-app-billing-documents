import { isCurrencyCode, isSafe, roundToMinor, toScaled } from './money.ts';
import { EngineError, type Problem } from './problems.ts';
import { taxOn, type RateComponent } from './tax.ts';

export type RoundingMode = 'PER_RATE_ON_TOTAL' | 'PER_LINE';
export type TaxCategory = 'STANDARD' | 'REDUCED' | 'ZERO' | 'EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';

/** A component's `sortOrder` is required and decides both print order and compound order. */
export type TaxComponentInput = { name: string; rate: number; compound: boolean; sortOrder: number };
/** `code` is the tax code's unique identity: Lifecycle passes the record id. */
export type TaxCodeInput = { code: string; name: string; category: TaxCategory; components: readonly TaxComponentInput[] };

export type LineInput = {
  /** Echoed back on the matching LineResult, unchanged. */
  key: string;
  quantity: number;
  unitPrice: { amountMicros: number; currencyCode: string };
  discountPercent: number | null;
  tax: TaxCodeInput | null;
};

export type DocumentInput = {
  currencyCode: string;
  pricesIncludeTax: boolean;
  roundingMode: RoundingMode;
  lines: readonly LineInput[];
};

/** `lineTotalMicros` is in the document's price basis: net when prices exclude tax, gross when they include it. */
export type LineResult = { key: string; amountMicros: number; discountMicros: number; lineTotalMicros: number };
export type RecapRow = { taxCode: string; component: string | null; rate: number; baseMicros: number; taxMicros: number };

export type DocumentResult = {
  lines: LineResult[];
  recap: RecapRow[];
  /** In recap order, for Rendering to print their notes. */
  taxCodesUsed: string[];
  subtotalMicros: number;
  discountTotalMicros: number;
  taxTotalMicros: number;
  totalMicros: number;
};

const sum = (values: readonly bigint[]): bigint => values.reduce((total, value) => total + value, 0n);

/** Same components once sorted by `sortOrder`, field by field; different lengths differ. */
function sameComponents(a: readonly TaxComponentInput[], b: readonly TaxComponentInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((component, i) => {
    const other = b[i]!;
    return (
      component.name === other.name &&
      component.rate === other.rate &&
      component.compound === other.compound &&
      component.sortOrder === other.sortOrder
    );
  });
}

function validate(input: DocumentInput): Problem[] {
  const problems: Problem[] = [];
  if (!isCurrencyCode(input.currencyCode)) problems.push({ code: 'INVALID_CURRENCY', value: input.currencyCode });
  if (input.lines.length === 0) problems.push({ code: 'NO_LINES' });
  // The first tax definition seen for a `code`; later lines with the same code must match it.
  const definitions = new Map<string, readonly TaxComponentInput[]>();
  for (const line of input.lines) {
    const at = { line: line.key };
    if (line.unitPrice.currencyCode !== input.currencyCode) {
      problems.push({ code: 'CURRENCY_MISMATCH', ...at, value: line.unitPrice.currencyCode });
    }
    const amountMicros = line.unitPrice.amountMicros;
    if (typeof amountMicros !== 'number' || !Number.isInteger(amountMicros)) {
      problems.push({ code: 'INVALID_AMOUNT', ...at, value: amountMicros });
    } else if (!Number.isSafeInteger(amountMicros)) {
      problems.push({ code: 'AMOUNT_TOO_LARGE', ...at, value: amountMicros });
    }
    if (toScaled(line.quantity, 3) === null) problems.push({ code: 'INVALID_QUANTITY', ...at, value: line.quantity });
    const discount = line.discountPercent;
    if (discount !== null && (toScaled(discount, 2) === null || discount < 0 || discount > 100)) {
      problems.push({ code: 'INVALID_DISCOUNT', ...at, value: discount });
    }
    if (line.tax === null) {
      problems.push({ code: 'MISSING_TAX_CODE', ...at });
      continue;
    }
    if ((line.tax.category === 'STANDARD' || line.tax.category === 'REDUCED') && line.tax.components.length === 0) {
      problems.push({ code: 'MISSING_TAX_RATE', ...at, value: line.tax.code });
    }
    const sorted = [...line.tax.components].sort((a, b) => a.sortOrder - b.sortOrder);
    const seen = definitions.get(line.tax.code);
    if (seen === undefined) {
      definitions.set(line.tax.code, sorted);
    } else if (!sameComponents(seen, sorted)) {
      problems.push({ code: 'TAX_CODE_CONFLICT', ...at, value: line.tax.code });
    }
    for (const component of line.tax.components) {
      if (toScaled(component.rate, 4) === null || component.rate < 0) {
        problems.push({ code: 'INVALID_RATE', ...at, value: component.rate });
      }
    }
  }
  return problems;
}

/** The problems of a document, and its result when it has none. */
function evaluate(input: DocumentInput): { problems: Problem[]; result?: DocumentResult } {
  const problems = validate(input);
  if (problems.length > 0) return { problems };
  const currency = input.currencyCode;

  const lines = input.lines.map((line) => {
    const amount = roundToMinor(toScaled(line.quantity, 3)! * BigInt(line.unitPrice.amountMicros), 1000n, currency);
    const discount = line.discountPercent === null ? 0n : roundToMinor(amount * toScaled(line.discountPercent, 2)!, 10_000n, currency);
    return { key: line.key, tax: line.tax!, amount, discount, lineTotal: amount - discount };
  });

  // Lines are grouped by their tax code's `code`, in the order codes first appear.
  const groups = new Map<string, { tax: TaxCodeInput; totals: bigint[] }>();
  for (const line of lines) {
    const group = groups.get(line.tax.code) ?? { tax: line.tax, totals: [] };
    group.totals.push(line.lineTotal);
    groups.set(line.tax.code, group);
  }

  const recap: { taxCode: string; component: string | null; rate: number; base: bigint; tax: bigint }[] = [];
  for (const { tax, totals } of groups.values()) {
    const components = [...tax.components].sort((a, b) => a.sortOrder - b.sortOrder);
    const rates: RateComponent[] = components.map((c) => ({ rate: toScaled(c.rate, 4)!, compound: c.compound }));
    const amounts = input.roundingMode === 'PER_LINE' ? totals : [sum(totals)];
    const results = amounts.map((amount) => taxOn(amount, rates, input.pricesIncludeTax, currency));
    if (components.length === 0) {
      recap.push({ taxCode: tax.code, component: null, rate: 0, base: sum(results.map((r) => r.net)), tax: 0n });
      continue;
    }
    components.forEach((component, i) => {
      recap.push({
        taxCode: tax.code,
        component: component.name,
        rate: component.rate,
        base: sum(results.map((r) => r.parts[i]!.base)),
        tax: sum(results.map((r) => r.parts[i]!.tax)),
      });
    });
  }

  const taxTotal = sum(recap.map((row) => row.tax));
  const lineTotals = sum(lines.map((line) => line.lineTotal));
  const subtotal = input.pricesIncludeTax ? lineTotals - taxTotal : lineTotals;
  const total = input.pricesIncludeTax ? lineTotals : lineTotals + taxTotal;
  const discountTotal = sum(lines.map((line) => line.discount));

  const figures = [
    subtotal, total, discountTotal, taxTotal,
    ...lines.flatMap((line) => [line.amount, line.discount, line.lineTotal]),
    ...recap.flatMap((row) => [row.base, row.tax]),
  ];
  if (!figures.every(isSafe)) return { problems: [{ code: 'AMOUNT_TOO_LARGE' }] };

  return {
    problems: [],
    result: {
      lines: lines.map((line) => ({
        key: line.key,
        amountMicros: Number(line.amount),
        discountMicros: Number(line.discount),
        lineTotalMicros: Number(line.lineTotal),
      })),
      recap: recap.map((row) => ({
        taxCode: row.taxCode,
        component: row.component,
        rate: row.rate,
        baseMicros: Number(row.base),
        taxMicros: Number(row.tax),
      })),
      taxCodesUsed: [...groups.keys()],
      subtotalMicros: Number(subtotal),
      discountTotalMicros: Number(discountTotal),
      taxTotalMicros: Number(taxTotal),
      totalMicros: Number(total),
    },
  };
}

/** The document's problems, if any; empty when it can be computed. */
export function checkDocument(input: DocumentInput): Problem[] {
  return evaluate(input).problems;
}

/** The document's figures; throws EngineError(problems) if checkDocument would find any. */
export function computeDocument(input: DocumentInput): DocumentResult {
  const { problems, result } = evaluate(input);
  if (!result) throw new EngineError(problems);
  return result;
}
