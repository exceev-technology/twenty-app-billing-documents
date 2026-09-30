# The five templates

Every template prints the same content — the tax recap, the legal mentions, the
identifiers each country requires — and arranges it differently; only the
receipt leaves out the buyer, as a till slip does. A seller picks one; their
logo and accent colour fill it.

The samples below are rendered from a fictitious company by
`npm run render:samples`, with figures computed by the Engine. The four A4
samples are the same three-line invoice; the receipt is a tax-inclusive sale,
as a till would print it.

| Template | Best for | Sample |
|---|---|---|
| `classic` | Most businesses, any country | [classic.pdf](templates/classic.pdf) |
| `modern` | Agencies and studios | [modern.pdf](templates/modern.pdf) |
| `compact` | Long itemised invoices | [compact.pdf](templates/compact.pdf) |
| `letterhead` | Pre-printed stationery (the top 45 mm stay empty) | [letterhead.pdf](templates/letterhead.pdf) |
| `receipt` | Retail and B2C, on an 80 mm roll | [receipt.pdf](templates/receipt.pdf) |

## How each one looks

All five share one palette of neutral greys and one type scale: small grey
labels over each block, grey secondary lines under a bold name, light rules
between rows, and a grand total set larger than the rows above it. The seller's
accent colours the title, the rule above the total and, on `modern`, the
banner, the table's header row and the total's row. Accent text only prints in
the accent when it reads on its background; a pale brand colour falls back to
dark ink.

- **`classic`** — the logo at the top left, the title and the facts at the top
  right (the number larger), a rule under them. Seller and buyer side by side,
  the notes in a grey callout, a framed table with a grey header and every
  other row grey, the totals in a light box.
- **`modern`** — a banner in the accent with the title and the seller's name;
  the logo and the facts in a row of small labels; seller and buyer split by a
  rule; the table's header row and the total's row in the accent, the other
  totals on a tint of it.
- **`compact`** — the title over a heavy accent rule, the number and dates in a
  framed stamp beside it; a grey table header, hairlines and tight rows; the
  totals with rules only, the total in the accent.
- **`letterhead`** — nothing in the top 45 mm. The title with the facts as a
  list beside the buyer, a framed table with a grey header, the totals on a
  grey card; the seller prints small at the end, above the legal text.
- **`receipt`** — one narrow column, as before: title and facts, then the
  seller, a table with black rules only (a thermal printer drops pale greys and
  fills), the total set larger, the QR code last.

The look follows the invoice designs of
[pdfcn](https://github.com/shadcn-labs/pdfcn) (MIT, see
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)), redrawn with the embedded
Roboto font so that every script the renderer accepts still prints.

Documents print in English or French today. The embedded font draws Latin, Greek
and Cyrillic; text it cannot draw (Arabic, Hebrew, Devanagari, Thai, CJK) is
refused rather than printed as empty boxes. Font packs for those scripts are
later work.
