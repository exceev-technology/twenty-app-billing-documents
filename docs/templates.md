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

Documents print in English or French today. The embedded font draws Latin, Greek
and Cyrillic; text it cannot draw (Arabic, Hebrew, Devanagari, Thai, CJK) is
refused rather than printed as empty boxes. Font packs for those scripts are
later work.
