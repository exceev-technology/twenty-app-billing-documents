# Billing Documents for Twenty

Quotes, invoices and credit notes, issued as PDFs, inside [Twenty](https://twenty.com).
Your clients are already in Twenty, so your documents can be too.

> **Status: under construction.** Invoices and credit notes can be previewed
> and issued, and quotes printed; turning a quote into an invoice, the
> ready-made views and sending by email are still to come. Do not use it for
> real invoices until the first release.

## What it will do

- Quotes that become invoices, invoices that are numbered and locked when
  issued, and credit notes to correct them.
- Any country, any currency: legal identifiers, tax codes, mentions and
  numbering rules are records you edit in Twenty, with
  [presets for 12 countries plus a generic one](docs/presets) to start from.
- Presets are starting points, not legal advice: check them with your accountant before you issue documents.
- Taxes with several components (for example GST plus QST), exemptions and
  reverse charge with the wording the law requires, and prices entered with
  or without tax.
- A product and service catalog, payment status, and ready-made views.

Where a country requires structured e-invoicing, the PDF is a courtesy copy,
and the country preset says so.

PDFs print in English or French, in [five layouts](docs/templates.md). The
embedded font draws Latin, Greek and Cyrillic; a document with Arabic, Hebrew,
Devanagari, Thai or CJK text is refused rather than printed with empty boxes.

## Requirements

- A Twenty server at version 2.40 or later.
- On a self-hosted server, logic functions enabled (`LOGIC_FUNCTION_TYPE`).
  They are off by default, and without them nothing works: the presets are not
  seeded, totals are not computed, issued documents are not protected, and the
  buttons answer that logic functions are turned off.

## What it installs

Fourteen objects, all prefixed `billing` so they never clash with objects you
built yourself: profiles, identifier types, legal identifiers, issuers, tax
codes and their components, catalog items, quotes, invoices, credit notes,
their lines, and the numbering ledger. Companies, people and opportunities
gain relations to them.

On install and on every upgrade, the app creates the country presets that are
missing. It never changes a record that exists: your edits always win, and a
preset you delete stays deleted.

## Issuing documents

Select one draft invoice or credit note: **Preview PDF** and **Issue** appear
at the top of the record and in the command menu. On a quote, **Generate PDF**.

- **Preview PDF** renders the document, marked DRAFT, into its PDF field. It
  numbers nothing and can be run as often as you like.
- **Issue** fills what is left empty (issue date, currency, language, due
  date), checks everything at once and lists every problem it finds, then gives
  the document the next number of its sequence, renders the PDF, and freezes
  the document with a copy of what was printed and the PDF's SHA-256 hash.
- **Generate PDF** numbers a quote on its first PDF, then adds a new version
  (v2, v3…) each time. The quote stays editable; its PDF field keeps the last
  ten.

The buttons act as you: anyone whose role can edit the document can issue it,
and no one else. Messages follow your Twenty language.

**Totals** are computed by the app a moment after a line changes. A line with a
catalog item takes the item's description, unit, price and tax code where it
has none.

**Numbering.** Each issuer has its own sequence per document type and per
period (yearly, monthly or never reset, from the profile), in the pattern the
profile sets, for example `F{YYYY}-{SEQ:4}` for `F2026-0001`. Numbers have no
gaps. To carry on from an older system, create a *Numbering sequence* record
for the issuer, type and period, with *Last number* set to the last number
already used: the next document takes the one after. Once a sequence has given
out a number, its last number can only rise.

**An issued invoice or credit note cannot be changed.** A change to what was
printed (subject, buyer, dates, currency, lines, notes…) is put back a moment
later, and the record's timeline says what was put back and why. Deleting an
issued or numbered document restores it. Its status can still move between
issued, sent and paid, and the sent date, paid date, opportunity and quote stay
free. To correct an issued invoice, issue a credit note that names it.

### Do not let users destroy billing records

Twenty can delete a record permanently ("destroy" it, for example by emptying
the deleted records). The app brings back a deleted invoice, but it cannot
bring back a destroyed one, and a destroyed invoice leaves a gap in your
numbering that your tax authority may ask about. The app never destroys
anything, and its role cannot.

In **Settings → Roles**, turn off the permission to destroy records on the
billing objects, for every role that can edit them (API keys included).

## Development

```bash
npm install
npm test
npm run typecheck
```

- Universal identifiers are generated, never written by hand: after declaring
  a new object, field or option, run `npm run ids:sync`. Never edit or delete
  an entry of `src/ids.ts`.
- Deploy with `npm run deploy -- --remote <name>`: tests, typecheck, plan,
  confirmation, apply (never destroying anything), a check that the plan is
  then empty, and `npm run ids:lock`. Commit `ids.lock.json` afterwards: a test
  then fails if a released identifier changes.
- A deploy does not run the post-install function, so it does not seed the
  presets, and on a production server the CLI cannot run a function (that needs
  a signed-in user, and the CLI signs in with an API key). Run the
  `create-missing-presets` tool instead, from Twenty's AI assistant or an MCP
  client (`app_create_missing_presets`). It is safe to run again: it never
  changes an existing record or brings back a deleted one.
- After changing a preset, run `npm run presets:docs`.

## Design

- [Product overview](docs/superpowers/specs/2026-09-21-product-overview.md)
- [Foundation design](docs/superpowers/specs/2026-09-21-foundation-design.md)
- [Engine design](docs/superpowers/specs/2026-09-22-engine-design.md)
- [Rendering design](docs/superpowers/specs/2026-09-24-rendering-design.md)
- [Issue path design](docs/superpowers/specs/2026-09-26-issue-path-design.md)
- [The five templates](docs/templates.md)
- [Foundation plan](docs/superpowers/plans/2026-09-21-foundation.md)
- [Engine plan](docs/superpowers/plans/2026-09-22-engine.md)
- [Issue path plan](docs/superpowers/plans/2026-09-26-issue-path.md)

## Author

Exceev Technology. Released under the [MIT licence](LICENSE).
