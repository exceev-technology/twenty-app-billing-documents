# Sub-project 3: Rendering, design

Status: agreed 2026-09-24. Read [the product overview](2026-09-21-product-overview.md),
[the Foundation design](2026-09-21-foundation-design.md) and
[the Engine design](2026-09-22-engine-design.md) first; this spec does not
repeat their decisions.

Rendering turns a computed document into the PDF a business sends: a quote,
an invoice or a credit note, in the document's language, in the seller's
colours, on one of five layouts. It reads and writes nothing. Lifecycle maps
records to a plain input, calls Rendering, and stores the bytes.

## 1. Boundaries

- `render/` at the repository root, beside `engine/`. It imports nothing from
  `twenty-sdk` or `twenty-client-sdk`. It does import `engine/index.ts`, for the
  result types, the problem type and `minorDigits`. It bundles pdfmake, so
  unlike the engine it runs in a logic function, never in a front component.
- pdfmake is pinned to an exact version as a dependency, and imported as its
  prebuilt bundle (`pdfmake/build/pdfmake.js`, with Roboto from
  `build/vfs_fonts.js`): the package's Node entry reads `__dirname` when it
  renders, which the ES module twenty-sdk builds for a logic function does not
  define. That trap cost the internal app a debugging session, and
  `test/render/bundle.test.ts` bundles the renderer with the SDK's own esbuild
  options so it cannot come back.
- One entry point. Everything else in `render/` is private to it.
- Rendering never decides a business fact. A document with no number prints a
  draft marker; it never invents one. A missing identifier is Lifecycle's gate
  to refuse, not a blank line here.
- Not Rendering's job: reading records, fetching the logo's bytes, uploading
  the PDF, allocating numbers, deciding whether a document may be issued.

## 2. Public API

```ts
type TemplateKey = 'classic' | 'modern' | 'compact' | 'letterhead' | 'receipt';
type DocumentKind = 'QUOTE' | 'INVOICE' | 'CREDIT_NOTE';
type Language = 'EN' | 'FR';

type Party = {
  name: string;
  legalName?: string | null;
  legalForm?: string | null;
  addressLines: string[];          // already ordered for the country
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

type PrintedIdentifier = { label: string; value: string; side: 'SELLER' | 'BUYER' };

type RenderLine = {
  key: string;                     // the line's record id, for tests and diffs
  description: string;
  quantity: number;
  unit: string;                    // already translated by Lifecycle from the unit list
  unitPriceMicros: number;
  discountPercent: number | null;
  taxLabel: string;                // the tax code's name, as printed in the lines table
  lineTotalMicros: number;         // from the Engine
  periodStart?: string | null;     // YYYY-MM-DD
  periodEnd?: string | null;
};

type RenderInput = {
  template: TemplateKey;
  language: Language;
  locale: string;                  // BCP 47, for dates and numbers
  kind: DocumentKind;
  title?: string | null;           // the profile's override; empty means the pack's title
  number: string | null;           // null prints the draft marker
  version?: number | null;         // quotes: 2 prints "v2"
  issueDate: string;               // YYYY-MM-DD
  corrects?: { number: string; issueDate: string } | null;  // a credit note's original invoice
  dueDate?: string | null;
  validUntil?: string | null;
  subject?: string | null;
  notes?: string | null;
  currencyCode: string;
  pricesIncludeTax: boolean;
  seller: Party;
  buyer: Party;
  buyerReference?: string | null;
  identifiers: PrintedIdentifier[];             // already filtered to those printed, in sortOrder
  lines: RenderLine[];
  totals: DocumentResult;                       // the Engine's result, verbatim
  taxNames: Record<string, string>;             // each code in totals.taxCodesUsed -> its name; the code is a record id
  taxNotes: string[];                           // the printed notes of the codes used, in recap order
  mentions?: string | null;
  amountInWords: boolean;
  brand: {
    accentColor?: string | null;                // #RRGGBB
    footerNote?: string | null;
    paymentDetails?: string | null;
    logo?: { bytes: Uint8Array; type: 'image/png' | 'image/jpeg' } | null;
  };
  qr?: { mode: 'PAYLOAD' | 'URL_WITH_PAYLOAD'; payload: string; baseUrl?: string | null } | null;
};

type RenderResult = { bytes: Uint8Array; pages: number };

renderDocument(input: RenderInput): Promise<RenderResult>;   // rejects with RenderError(problems);
                                                             // async because pdfmake delivers its bytes that way

type RenderProblemCode =
  | 'UNSUPPORTED_SCRIPT' | 'UNSUPPORTED_IMAGE' | 'UNKNOWN_TEMPLATE'
  | 'UNKNOWN_LANGUAGE' | 'QR_PAYLOAD_TOO_LONG' | 'MISSING_TAX_NAME'
  | 'INVALID_LOCALE' | 'INVALID_DATE' | 'INVALID_CURRENCY' | 'QR_BASE_URL_MISSING' | 'QR_PAYLOAD_EMPTY';
type RenderProblem = { code: RenderProblemCode; field?: string; value?: string };
class RenderError extends Error { readonly problems: readonly RenderProblem[] }

/** The Engine's problems, worded in a document's language. For Lifecycle's messages. */
describeProblem(problem: Problem, language: Language): string;
```

`totals` is the Engine's `DocumentResult` unchanged, so the figures printed are
the figures computed: no arithmetic happens in `render/`.

## 3. The five templates

Every template prints the same content. A template arranges it; it never drops
a requirement.

| # | Block | Contents |
|---|---|---|
| 1 | Header | Title (pack or override), number or draft marker, issue date, a credit note's original invoice (number and date, which several countries require it to name), due date or validity date, a quote's version |
| 2 | Seller | Logo, trading and legal name, legal form, address, contacts, the seller's printed identifiers |
| 3 | Buyer | Name, address, their printed identifiers, their reference |
| 4 | Subject and notes | |
| 5 | Lines | Description (service period beneath it when set), quantity and unit, unit price, discount, tax label, line total |
| 6 | Tax recap | One row per code and component: the code's name (and the component's, when the code has several), rate, taxable base, tax. 0 % rows included. The code itself is a record id and is never printed |
| 7 | Totals | Subtotal, tax, total, which add up as printed; beneath them the discounts applied (already deducted from the subtotal, so never a row of the sum), the "prices include tax" sentence when they do, the total in words when the profile asks |
| 8 | Payment | Due date, payment details, the QR when a mode is set |
| 9 | Legal | The tax codes' printed notes, the profile's mentions, the seller's footer note |

A column whose value is empty on every line is dropped: no discount column
when nobody discounted, no tax column when the document uses a single code.

| Key | Page | Arrangement |
|---|---|---|
| `classic` | A4, 14 mm side margins | Seller left, buyer right, ruled lines table, totals boxed bottom right. The default. |
| `modern` | A4 | Accent band across the top carrying the title and number, borderless table, totals in a tinted panel. |
| `compact` | A4, smaller header and row padding | Roughly twice as many lines before the first page break. |
| `letterhead` | A4, top 45 mm reserved | Nothing printed in the reserved band; the seller block moves to the footer. |
| `receipt` | 80 mm wide roll, height grows with content | Single column, no buyer block, totals stacked, QR at the end. |

**Colour.** The seller's accent colours headings, rules and panels. Accent text
on white paper needs a 4.5:1 contrast (WCAG AA), or it prints in the default
ink; text on the modern accent band is white or the default ink, whichever
stands out more. A pale brand colour never leaves a heading nobody can read.

**Pagination.** The lines table repeats its header row on every page. The tax
recap and the totals (blocks 6 and 7) stay together; payment and legal text
follow and run on to another page when they must. A line stays on one page with
its service period, unless it is estimated taller than a page: pdfmake silently
drops any block it was told not to break once that block outgrows a page, so
nothing that long is ever unbreakable.

**Long words.** pdfmake sizes a column to its widest unbreakable run, so one
very long word (a URL, an unspaced IBAN) would push the columns beside it off
the page. A run wider than the space it lands in (a cell of the lines table or
the recap, 60 pt on the receipt and 150 pt on A4; any other block, 190 pt and
240 pt) is handed to pdfmake as adjacent pieces, cut after a `/ . - @ _` where
there is one, measured with Roboto's own advance widths. Nothing is inserted
into the text, so it copies and searches whole, and a run that fits its space is
never cut.
Every page's footer carries the document number and "Page 1 of 3". `receipt`
grows in height instead of paginating.

**Draft.** With no number, the header prints the pack's draft marker in place
of the number, and the footer repeats it.

## 4. Words and numbers

**Language packs.** `render/lang/en.ts` and `render/lang/fr.ts` each satisfy one
`LanguagePack` type: the titles per kind, every label in the nine blocks, the
draft marker, the "prices include tax" sentence, the words for amounts, and a
message for each of the Engine's thirteen problem codes. A pack is data plus two
functions, so a new language is one file and a parity test.

**Dates** are formatted with `Intl.DateTimeFormat(locale)` as numeric day, month
and year in the locale's own order.

**Money** is formatted from micros with the currency's own number of decimals
and the locale's separators. `Intl` inserts a narrow no-break space as a French
thousands separator and Roboto has no glyph for it, so every narrow space in
formatted output is replaced with a normal no-break space.

**The Engine gains one export.** Rendering must use the same number of decimals
the Engine rounded to, or a JPY total prints as `¥1,099.00`. `engine/index.ts`
also exports `minorDigits(currencyCode: string): number`, and the Engine spec's
§2 list grows by that one entry. Copying the table into `render/` would drift.

**Amounts in words** for English and French, with each currency's words (euros
and cents, dirhams and centimes, pounds and pence, rupees and paise, yen with no
minor unit). A currency the pack has no words for falls back to the number in
words followed by the ISO code and the minor amount as a fraction, as on a
cheque: `one thousand two hundred and thirty-four SEK and 56/100`. French follows
its grammar: `quatre-vingt mille`, `un million d’euros`, `zéro euro`.

## 5. Fonts, and what they can draw

Rendering embeds the Roboto family pdfmake already ships (Apache-2.0): regular,
medium for bold, and their italics. No font binary is committed to this
repository.

Before anything is drawn, every string that would be printed is tidied (accents
composed to NFC, Windows line breaks made Unix, tabs made spaces) and checked
against the characters all four faces draw. That list, `render/glyphs.ts`, is
generated from the fonts' own character maps by `npm run glyphs`, and a test
fails when it and the fonts disagree: a hand-written list drifts. Anything else
raises `UNSUPPORTED_SCRIPT`, naming the field and the offending characters. A
PDF never prints empty boxes in place of a buyer's name.

Formatted output is held to the same rule. Every `Intl` formatter asks for
Western digits and the Gregorian calendar, direction marks are removed, and a
currency sign the font lacks (the hryvnia's, the lari's) prints as the ISO code.
The locale's formatted output is checked too, and refused as
`UNSUPPORTED_SCRIPT` on `locale` if it still carries a character the font lacks.

Roboto draws Latin, Greek and Cyrillic, Vietnamese included. Arabic, Hebrew,
Devanagari, Thai and CJK are refused: they need glyphs Roboto lacks, and most
need letter-joining and bidirectional ordering that a plain PDF text layer does
not do. This is a stated limitation, not an oversight. The README says so, and
a later sub-project can add font packs with proper shaping.

## 6. QR codes

`PAYLOAD` encodes the payload Lifecycle built. `URL_WITH_PAYLOAD` encodes
`baseUrl` with the payload as its query (joined with `&` when the base already
has one); without a base URL it is refused as `QR_BASE_URL_MISSING`. `NONE`
(represented by `qr: null`) prints nothing.

pdfmake rounds a QR module down to whole points and silently draws what no
phone can scan once modules shrink to 1 pt, so `render/qr.ts` sizes every code
itself: error correction M (what the EPC payment QR specifies), the version the
text's bytes need, modules of at least 2 pt (0.7 mm), about 32 mm across when
the payload allows, four modules of white above and below, and no larger than
the layout allows (140 pt on A4, 190 pt on the receipt). A payload that cannot
fit legibly raises `QR_PAYLOAD_TOO_LONG`, counting the base URL as well,
rather than printing a QR nobody can scan. On `receipt` the QR comes last.

## 7. Determinism

The PDF's creation and modification dates are pinned to the document's issue
date, and nothing else in the output varies between runs. Two renders of the
same input produce identical bytes, so an archived document can be checked
against a hash.

## 8. Problems

| Code | When |
|---|---|
| `UNSUPPORTED_SCRIPT` | A printed string uses characters the embedded font cannot draw. |
| `UNSUPPORTED_IMAGE` | The logo is not PNG or JPEG (pdfmake cannot draw SVG), or its bytes are not its declared type or are damaged (field `brand.logo.bytes`): the first bytes are checked before drawing, and a logo the PDF library then fails on is reported once the same document renders without it. |
| `INVALID_LOCALE` | `locale` is not a well-formed BCP 47 tag (`fr_FR`, an empty string), which `Intl` would throw on. |
| `INVALID_DATE` | A date is not `YYYY-MM-DD`, or names a day that does not exist. |
| `INVALID_CURRENCY` | `currencyCode` is not three capital letters, which `Intl` would throw on. |
| `UNKNOWN_TEMPLATE` | `template` is not one of the five. |
| `UNKNOWN_LANGUAGE` | `language` has no pack. |
| `QR_PAYLOAD_TOO_LONG` | The encoded text (base URL included) cannot be drawn legibly in the layout's QR box. |
| `QR_BASE_URL_MISSING` | `URL_WITH_PAYLOAD` was asked for with no `baseUrl`. |
| `QR_PAYLOAD_EMPTY` | A QR mode is set with nothing to encode. |
| `MISSING_TAX_NAME` | A code in the recap has no name in `taxNames`; the recap would otherwise print a record id. |

`renderDocument` rejects with a `RenderError` carrying every problem it found, in the order
found. Rendering does not word its own problems: Lifecycle decides what a person
sees, using the packs.

## 9. The mock company and the samples

`render/samples/mock.ts` holds one clearly fictitious seller, its buyer, and
five documents: a three-line invoice; a twenty-four-line invoice with two tax
codes, discounts and service periods, which must break across pages; a quote;
a credit note naming the invoice it corrects; and a tax-inclusive B2C sale for
`receipt`. Their figures come from the Engine's `computeDocument`, so a sample
prints exactly what a real document would. No real company, person, address or
identifier appears anywhere in it.

The mock logo is a small geometric PNG generated by `scripts/mock-logo.mjs`, not
a downloaded asset, so the repository carries no artwork of unclear provenance.

`npm run render:samples` renders every template. Five PDFs — one per layout, the
same invoice — are committed under `docs/templates/`, with a page linking them,
so the layouts can be seen without running anything. Everything else it writes
goes to a git-ignored folder.

## 10. Testing

`node --test`, in `test/render/`.

- **Content completeness**, for every template and every mock document: collect
  every string the definition would print and assert that nothing required is
  missing — the number, both parties, each printed identifier, every recap row's
  name and rate, the mentions, the totals, the footer note. A layout may rearrange the
  page; it may not silently drop a legal requirement.
- **Structure:** the lines table repeats its header; the footer carries the page
  numbers; `receipt`'s page is 80 mm wide; `letterhead` reserves its top band;
  columns empty on every line are absent.
- **Real output:** the long invoice produces more than one page, counted in the
  bytes; the same input rendered twice gives identical bytes.
- **Guards:** an Arabic buyer name, an SVG logo, an unknown template, an unknown
  language, an over-long QR payload and a recap code with no name are each
  refused, naming the field.
- **Language:** both packs carry every label and a message for all thirteen
  Engine problem codes; French labels appear when the language is French; money
  is formatted with each currency's decimals; no narrow no-break space survives
  in the output.
- **Words:** amounts in words in both languages, including eighty, seventy-one,
  one thousand and one, and the minor unit.

## 11. Files

```
render/document.ts        renderDocument, the guards, the problems
render/blocks.ts          the nine blocks every layout arranges, long-word pieces
render/layouts/*.ts       classic, modern, compact, letterhead, receipt
render/lang/en.ts, fr.ts  the packs
render/lang/pack.ts       the LanguagePack type, describeProblem
render/format.ts          dates, money, amounts in words
render/pdf.ts             the only module that touches pdfmake
render/qr.ts              what a QR code encodes, and its version and size
render/glyphs.ts          what Roboto draws and how wide: generated, never edited
render/samples/mock.ts    the fictitious company and its five documents
render/samples/logo.png   generated by scripts/mock-logo.mjs
scripts/mock-logo.mjs, scripts/render-samples.mjs
scripts/glyphs.mjs        writes render/glyphs.ts from the fonts (npm run glyphs)
test/render/*.test.ts
test/render/helpers/      the definition's text, and the text read back out of a PDF
docs/templates/*.pdf      five committed samples, one per layout
```

## 12. Carried to other sub-projects

- **Lifecycle** adds a `template` SELECT to `billingIssuer` (the five keys,
  `classic` by default), maps records to `RenderInput` (each tax code's name
  into `taxNames`, keyed by the record id the Engine used), fetches the logo's bytes
  and refuses an SVG, builds the QR payload, and stores the PDF in the
  document's own files field.
- **The Engine** exports `minorDigits` (§4 above).
- A document-level template override, more language packs, and font packs with
  shaping for non-Latin scripts are later work.

## Out of scope for Rendering

Storage and attachments, email, the verification portal behind a QR, e-invoicing
formats (Factur-X, UBL, XML), user-editable templates, and any change to the
figures the Engine computed.
