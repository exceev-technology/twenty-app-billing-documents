# Billing Documents for Twenty: product overview

Status: agreed 2026-09-21. This page records the decisions that span every
sub-project. Each sub-project has its own design spec next to this one.

## Goal

Quotes, invoices and credit notes, issued as PDFs, inside Twenty. A Twenty
user should not need a separate invoicing SaaS: the clients are already in
Twenty, so the documents should be too.

The success test: on a workspace that holds only Twenty's standard objects,
installing the app is enough to configure a seller, pick a country preset,
and issue a first numbered invoice as a PDF. No manual schema work.

## Who it is for

Any Twenty workspace, in any country. Nothing about the app is tied to one
country, language, currency or tax system. Country rules are data the user
can edit; languages are code packs anyone can contribute.

## v1 scope

Documents:

```
Quote ──accept──> Invoice (DRAFT)
                     │ issue: number + lock + PDF
                     v
                  Invoice (ISSUED) ──> SENT ──> PAID
                     │ correct / cancel
                     v
                  Credit note (numbered, PDF)
```

Alongside the documents:

- A product and service catalog that fills lines.
- Payment status (ISSUED, SENT, PAID) with overdue derived from the due date.
- Sending a document by email from Twenty, if the SDK allows apps to send
  mail. Otherwise a documented workflow recipe: the app's render action
  followed by Twenty's own Send Email step.
- Ready-made views (drafts, overdue, paid) and navigation.

Out of v1, kept possible by the schema: deposit invoices, recurring invoices,
payment records and partial payments, online payment links, and submission to
government e-invoicing systems (Italy SDI, Belgium Peppol, India IRN, France
2026, and others). Where a country requires structured e-invoicing, the PDF is
a courtesy copy and the preset says so.

## Decisions

| Topic | Decision |
|---|---|
| Configuration | Hybrid. Language packs live in code (labels, month names, optional amount in words). Legal and business rules live in records the user edits in Twenty: identifier types, mentions, numbering patterns, rounding, tax codes. |
| Taxes | A line points to a tax code. A tax code has one or more components (name, rate) and an optional note printed on the document (exemption reason, reverse charge). The document recaps tax per component. |
| Price basis | Chosen per document. Off: prices exclude tax and tax is added (B2B). On: prices include tax and net and tax are derived per component (B2C). Totals balance to the currency's minor unit either way. |
| Currencies | Any ISO 4217 currency, with its own minor unit (0, 2 or 3 decimals). Amounts are integer micros, as Twenty stores them. |
| Buyers | A document's buyer is a Twenty `company`, a `person`, or both. |
| Languages at launch | English and French. Each further language is one file. |
| Country presets at launch | Generic, Morocco, France, United Kingdom, United States, Canada, Germany, Spain, Belgium, Netherlands, Italy, India, United Arab Emirates. |
| Identity | A new application `universalIdentifier`. Object and field identifiers are permanent once released. |
| Naming | Every object and every field the app adds to a standard object has an API name prefixed `billing`. Labels stay plain ("Invoice"). |

## Platform constraints that shape the design

- App object names are not namespaced. A name that clashes with an existing
  object fails the install, hence the `billing` prefix.
- Removing a declared object or field on upgrade drops its data. Identifiers
  and select options are append-only.
- Default records are created by a post-install logic function, which must be
  idempotent.
- Self-hosted Twenty servers disable logic functions by default. The README
  says so, and the app must fail visibly when they are off.
- Generated PDFs are stored in the app's own FILES fields.
- A logic function that bundles pdfmake weighs several MB, so all rendering
  goes through one shared renderer function.

## Sub-projects

| # | Sub-project | Covers |
|---|---|---|
| 1 | Foundation | Repository scaffold, the app's objects and relations, identifier registry, country presets and their seeding. |
| 2 | Engine | Pure TypeScript with no Twenty import: money in any currency, tax components, price basis, rounding, numbering patterns. |
| 3 | Rendering | PDF layout, language packs, locale formatting, fonts and scripts, QR modes. |
| 4 | Lifecycle | Logic functions: render quote, quote to invoice, issue (number, snapshot, lock), credit note, payment status, email, views. |
| 5 | Publish | Public repository, npm package with provenance, marketplace listing. |

Engine can be built alongside Foundation. Each sub-project goes through its
own design, spec, plan and review before code.

## Repository

- Licence: MIT. Author and copyright holder: Exceev Technology.
- The repository is public from the start. Until the first release, the
  README states that the app is under construction and not ready to
  install. The marketplace listing comes after the app works end to end.
- Every change is verified on a dedicated test workspace holding only
  Twenty's standard objects.
