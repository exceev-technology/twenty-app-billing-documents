# Sub-project 2: Engine, design

Status: agreed 2026-09-22. Read [the product overview](2026-09-21-product-overview.md)
and [the Foundation design](2026-09-21-foundation-design.md) first; this spec
does not repeat their decisions.

The Engine turns a document's lines into the amounts printed on it, and a
numbering pattern into a document number. It reads and writes nothing:
Lifecycle maps records to plain inputs, calls the Engine, and writes back
what it returns. Rendering prints the result.

## 1. Boundaries

- Pure TypeScript in `engine/`, at the repository root. No import from
  `twenty-sdk`, `twenty-client-sdk` or `node:*`, and no `Date` is ever
  constructed. The same code therefore runs in logic functions, in front
  components (which are browser bundles) and in tests. A test enforces this.
- Money is computed in integer micros with `BigInt` for intermediate products.
  Results are returned as ordinary numbers, ready for Twenty's `amountMicros`.
- Not the Engine's job:
  - allocating the next number from the ledger, concurrency, starting from a
    given number, quote versions: Lifecycle;
  - amounts in words, number and date formatting, message wording: Rendering;
  - exchange rates: a document has one currency;
  - document-level discounts: the only discount is the line percentage.

## 2. Public API

`engine/index.ts` exports these and nothing else.

```ts
type RoundingMode = 'PER_RATE_ON_TOTAL' | 'PER_LINE';
type TaxCategory = 'STANDARD' | 'REDUCED' | 'ZERO' | 'EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';

type TaxComponentInput = { name: string; rate: number; compound: boolean; sortOrder: number };
type TaxCodeInput = { code: string; name: string; category: TaxCategory; components: TaxComponentInput[] };
// `code` is the tax code's unique identity: Lifecycle passes the record id.

type LineInput = {
  key: string;                                     // the line's record id, echoed back
  quantity: number;                                // up to 3 decimals
  unitPrice: { amountMicros: number; currencyCode: string };
  discountPercent: number | null;                  // up to 2 decimals, 0 to 100
  tax: TaxCodeInput | null;
};

type DocumentInput = {
  currencyCode: string;
  pricesIncludeTax: boolean;
  roundingMode: RoundingMode;
  lines: LineInput[];
};

type LineResult = { key: string; amountMicros: number; discountMicros: number; lineTotalMicros: number };
type RecapRow = { taxCode: string; component: string | null; rate: number; baseMicros: number; taxMicros: number };
type DocumentResult = {
  lines: LineResult[];
  recap: RecapRow[];
  taxCodesUsed: string[];                          // in recap order, for Rendering to print their notes
  subtotalMicros: number;
  discountTotalMicros: number;
  taxTotalMicros: number;
  totalMicros: number;
};

type ProblemCode = 'NO_LINES' | 'INVALID_CURRENCY' | 'CURRENCY_MISMATCH' | 'MISSING_TAX_CODE' | 'INVALID_QUANTITY'
  | 'INVALID_RATE' | 'INVALID_DISCOUNT' | 'INVALID_AMOUNT' | 'AMOUNT_TOO_LARGE' | 'MISSING_TAX_RATE'
  | 'TAX_CODE_CONFLICT' | 'INVALID_PATTERN' | 'PATTERN_REPEATS_NUMBERS';
type Problem = { code: ProblemCode; line?: string; value?: string | number | null };   // section 6

checkDocument(input: DocumentInput): Problem[];
computeDocument(input: DocumentInput): DocumentResult;   // throws EngineError(problems) if checkDocument finds any

formatNumber(pattern: string, sequence: number, issueDate: string): string;
periodKey(reset: 'NEVER' | 'YEARLY' | 'MONTHLY', issueDate: string): string;
validatePattern(pattern: string, reset: 'NEVER' | 'YEARLY' | 'MONTHLY'): Problem[];
minorDigits(currencyCode: string): number;               // Rendering formats with the same decimals
```

`lineTotalMicros` is in the document's price basis: net when prices exclude
tax, gross when they include it. That is the figure printed in the lines table.

## 3. Units and rounding

### Exact conversion at the boundary

Twenty hands the Engine decimals as JavaScript numbers (`1.5`, `9.975`,
`12.5`). Each is converted from its decimal digits, never by multiplying a
float, into an integer:

| Input | Integer unit | Example |
|---|---|---|
| quantity | thousandths | 1.5 → 1500 |
| tax rate | ten-thousandths of a percent, that is millionths of the base | 9.975 → 99750 |
| discount | hundredths of a percent | 12.5 → 1250 |
| amount | micros, already an integer | 19.99 → 19990000 |

A value with more decimals than its unit allows is a problem (section 6), not
a silent rounding.

### Rounding

- Every rounding step rounds half away from zero to the currency's minor unit,
  so −0.005 becomes −0.01, the mirror of 0.005.
- Minor units come from a table in the Engine, from ISO 4217, not from `Intl`
  (browsers and Node disagree on a few currencies):

| Minor digits | Currencies |
|---|---|
| 0 | BIF, CLP, DJF, GNF, ISK, JPY, KMF, KRW, PYG, RWF, UGX, UYI, VND, VUV, XAF, XOF, XPF |
| 3 | BHD, IQD, JOD, KWD, LYD, OMR, TND |
| 4 | CLF, UYW |
| 2 | every other code |

- A rounded amount is a whole number of minor units: a multiple of
  10^(6 − digits) micros.
- Every amount returned must be a safe integer. A document whose figures would
  pass `Number.MAX_SAFE_INTEGER` micros (about 9 billion units) is refused.

## 4. Computation

### Lines

For each line, in order:

1. `amount = quantity × unitPrice`, rounded.
2. `discount = amount × discountPercent`, rounded. Zero when there is none.
3. `lineTotal = amount − discount`.

Every amount is in the document's price basis.

### Tax on net prices

For one tax code, with components sorted by `sortOrder` and a base `B`:

- component *i* has base `Bᵢ = B + (compoundᵢ ? tax₁ + … + taxᵢ₋₁ : 0)`;
- `taxᵢ = Bᵢ × rateᵢ`, rounded.

The profile's `roundingMode` decides what `B` is:

- `PER_LINE`: `B` is each line's `lineTotal`. Taxes are computed and rounded
  line by line, then summed per code and component.
- `PER_RATE_ON_TOTAL`: `B` is the sum of the `lineTotal`s of the lines whose
  tax code has the same `code`. Each component is computed and rounded once.

The two modes print different figures: three lines of 0.33 at 20 % give
3 × 0.07 = 0.21 per line, and 0.99 × 20 % = 0.20 on the total.

### Tax on gross prices

When `pricesIncludeTax` is set, `lineTotal` is gross and the tax is taken out:

1. The code's factor `F = 1 + t₁ + … + tₖ`, where `tᵢ = rateᵢ × (1 + (compoundᵢ ? t₁ + … + tᵢ₋₁ : 0))`,
   is kept as an exact fraction in `BigInt`.
2. Each component's tax is `G × tᵢ ÷ F`, rounded, and the net is `G` minus the
   taxes, so net + taxes = G exactly, components at equal rates always get
   equal taxes, and a 0 % component always gets 0. `G` is a line's `lineTotal`
   (`PER_LINE`) or the sum of the code's `lineTotal`s (`PER_RATE_ON_TOTAL`).

Example: 19.99 including 20 % gives net 16.66 and tax 3.33.

### Codes without components

A code with no components (exempt, zero-rated, reverse charge, out of scope)
has no tax. It still produces one recap row, with `component: null`, rate 0
and its base, because many countries require the taxable amount per rate on
the invoice. Its code is listed in `taxCodesUsed` like any other.

### Recap and totals

- The recap has one row per tax code and component, in the order the codes
  first appear in the lines, then by `sortOrder`. A compound component's base
  is its `Bᵢ`.
- `taxTotal` is the sum of the recap's taxes.
- On net prices, `subtotal` is the sum of the `lineTotal`s, and
  `total = subtotal + taxTotal`.
- On gross prices, `total` is the sum of the `lineTotal`s, and
  `subtotal = total − taxTotal`.
- `discountTotal` is the sum of the line discounts, in the price basis. It is
  shown for information and is already deducted.
- Every total is a sum of amounts already rounded, so the printed figures
  always add up to the minor unit.

### Signs

Negative quantities or prices (a rebate line) are allowed, and rounding is
symmetric. A credit note is computed with positive amounts; Rendering presents
it as a credit.

## 5. Numbering

### Grammar

- A pattern is literal text and the tokens `{YYYY}`, `{YY}`, `{MM}` and
  `{SEQ:n}`.
- `{SEQ:n}` appears exactly once. It pads the sequence to at least *n* digits,
  n from 1 to 9, and never truncates: 12345 under `{SEQ:4}` prints `12345`.
- Any other text in braces (`{YEAR}`, `{SEQ}`) is a problem, never printed as
  literal text, so a typo cannot reach a real invoice.

### Dates

The issue date is a `YYYY-MM-DD` string, as Twenty's DATE fields hold it. The
Engine reads the year and month from the string, so no time zone can move an
invoice issued late on 31 December into the next year.

### Periods and validation

- `periodKey`: `NEVER` → `ALL`, `YEARLY` → `2026`, `MONTHLY` → `2026-09`. It is
  the ledger's `periodKey`.
- `validatePattern` refuses a pattern that would repeat numbers: a yearly reset
  needs `{YYYY}` or `{YY}`, a monthly reset needs a year and `{MM}`.
- Any other reset, and a date that is not a real YYYY-MM-DD, is refused with
  an error.

| Pattern | Reset | Sequence, date | Result |
|---|---|---|---|
| `INV-{YYYY}-{SEQ:4}` | yearly | 17, 2026-09-22 | `INV-2026-0017` |
| `FA{YY}{MM}-{SEQ:3}` | monthly | 5, 2026-09-22 | `FA2609-005` |
| `{SEQ:6}` | never | 42 | `000042` |
| `INV-{SEQ:4}` | yearly | | refused: numbers would repeat each year |

## 6. Problems

A problem is data: a code, the line it concerns and the value at fault.
Rendering's language packs turn it into a sentence in the document's language.

| Code | When |
|---|---|
| `NO_LINES` | The document has no line. |
| `INVALID_CURRENCY` | The document's currency is not three capital letters. |
| `CURRENCY_MISMATCH` | A line's unit price is in another currency than the document's. |
| `MISSING_TAX_CODE` | A line has no tax code. It is never read as 0 %. |
| `INVALID_QUANTITY` | Not finite, or more than 3 decimals. |
| `INVALID_RATE` | Below 0, or more than 4 decimals. |
| `INVALID_DISCOUNT` | Outside 0 to 100, or more than 2 decimals. |
| `INVALID_AMOUNT` | A unit price is missing, not a number, or not a whole number of micros. |
| `AMOUNT_TOO_LARGE` | A figure would pass the largest safe integer in micros. |
| `MISSING_TAX_RATE` | A standard or reduced tax code has no component. It is never read as 0 %. |
| `TAX_CODE_CONFLICT` | Two lines use the same tax code `code` with different components. |
| `INVALID_PATTERN` | Unknown token, or `{SEQ:n}` missing, repeated or out of range. |
| `PATTERN_REPEATS_NUMBERS` | The pattern lacks the year or month its reset needs. |

## 7. Testing

`node --test`, as the rest of the repository, in `test/engine/`.

- Worked cases, each for one behaviour: France 20 % on net prices; three lines
  of 0.33 in both rounding modes; Quebec GST 5 % and QST 9.975 %; a compound
  component; India CGST and SGST; gross prices (19.99 including 20 % gives
  16.66 and 3.33); JPY with 0 decimals and KWD with 3; a 12.5 % discount; a
  negative rebate line; an exempt code's 0 % recap row.
- Invariants over many generated documents, from a fixed seed and without a
  library: `total = subtotal + taxTotal`; on gross prices `total` equals the sum
  of the `lineTotal`s; every amount is a safe integer and a whole number of
  minor units; the two rounding modes agree on single-line documents.
- Every tax code of the thirteen presets computes without a problem.
- Purity: no file in `engine/` imports `twenty-*` or `node:*`, or constructs a
  `Date`.

## 8. Files

```
engine/money.ts       exact decimal parsing, micros, rounding, ISO 4217 minor units
engine/tax.ts         components, compound, taking tax out of gross prices
engine/document.ts    checkDocument, computeDocument, their types
engine/numbering.ts   formatNumber, periodKey, validatePattern
engine/index.ts       the public API, nothing else
test/engine/*.test.ts
```

`tsconfig.json` includes `engine/**/*.ts`.

## 9. Carried to other sub-projects

Decisions taken while designing the Engine, for the sub-projects that own
them:

- A quote takes its number from the ledger the first time its PDF is
  generated. Generating it again keeps the number and increments a version,
  shown as v2, v3. Lifecycle adds a `version` field to `billingQuote`.
- Lifecycle allocates `lastValue + 1` safely under concurrency, lets a
  business start from a given number, and runs `validatePattern` before the
  first number of a scope is taken.

Findings of the button spike on a self-hosted Twenty 2.41 server, which the
Lifecycle design starts from:

- A record button is a command menu item that opens a headless front
  component. The front component calls the app's HTTP route
  (`httpRouteTriggerSettings`, `isAuthRequired: true`) at `<api>/s/<path>`,
  which works without a separate functions domain, and reports the result in a
  snackbar.
- The route's logic function receives the caller's identity and can read with
  the caller's token (`runAs: 'user'`). An action checks the caller's rights
  that way first, then writes as the application.
- A logic function running as the application can upload a PDF into a
  document's FILES field and attach it to the record. Writes it makes are
  marked `updatedBy.source: APPLICATION`.
- File URLs Twenty returns are signed and expire after a day. The PDF lives in
  the FILES field, never as a copied link.
- Front components are browser bundles: code they import must not use Node
  built-ins. `src/lib/id.ts` does, so buttons need a browser-safe way to read
  identifiers.

## Out of scope for the Engine

Allocating numbers, amounts in words, currency conversion, document-level
discounts, cash rounding (for example to 0.05 CHF), withholding taxes, and
any storage.
