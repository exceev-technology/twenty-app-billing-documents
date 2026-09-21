# Billing Documents for Twenty

Quotes, invoices and credit notes, issued as PDFs, inside [Twenty](https://twenty.com).
Your clients are already in Twenty, so your documents can be too.

> **Status: under construction.** The data model and the country presets
> install; documents cannot be rendered or issued yet. Do not use it for real
> invoices until the first release.

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

## Requirements

- A Twenty server at version 2.40 or later.
- On a self-hosted server, logic functions enabled (`LOGIC_FUNCTION_TYPE`):
  they are off by default, and without them the presets are not seeded.

## What it installs

Fourteen objects, all prefixed `billing` so they never clash with objects you
built yourself: profiles, identifier types, legal identifiers, issuers, tax
codes and their components, catalog items, quotes, invoices, credit notes,
their lines, and the numbering ledger. Companies, people and opportunities
gain relations to them.

On install and on every upgrade, the app creates the country presets that are
missing. It never changes a record that exists: your edits always win, and a
preset you delete stays deleted.

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
- [Foundation plan](docs/superpowers/plans/2026-09-21-foundation.md)

## Author

Exceev Technology. Released under the [MIT licence](LICENSE).
