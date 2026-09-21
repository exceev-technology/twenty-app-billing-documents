# Sub-project 1: Foundation, design

Status: agreed 2026-09-21. Read [the product overview](2026-09-21-product-overview.md)
first; this spec does not repeat its decisions.

Foundation delivers the repository, the app's objects and relations, the
identifier registry, and the country presets with their seeding. It renders
nothing and issues nothing: those are Rendering and Lifecycle.

## 1. Object model

One object per document type, each with its own line object, so Twenty gives
quotes, invoices and credit notes their own menu, views and record page. The
engine and renderer work on one normalized shape; the only per-type code is
a mapper.

```
 CONFIGURATION (seeded presets, editable)         REFERENCE DATA
 billingProfile ──< billingIdentifierType          billingTaxCode ──< billingTaxComponent
       │                    │                             │
 billingIssuer ──< billingIdentifier >── company, person  │
       │                                                  │
       │                                     billingCatalogItem
 DOCUMENTS
 billingQuote ──accept──> billingInvoice <──corrects── billingCreditNote
   └< billingQuoteLine      └< billingInvoiceLine        └< billingCreditNoteLine

 billingSequence: numbering ledger (issuer × document type × period)
```

Fourteen objects. API names are prefixed `billing`; labels are plain.

Platform rules the field names follow:

- Every Twenty object already has system fields (`id`, `createdAt`,
  `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `position`), so no
  field is named after one. Print order is `sortOrder`.
- Generic names such as `type` are avoided; the identifier's type field is
  `identifierType`.
- Every object names its label identifier, the value Twenty shows for a
  record and types first when one is created. Without one, the CLI adds a
  `name` field. Documents use `subject`, because a draft has no number yet
  and the number is never typed by hand. Lines use `description`,
  identifiers `value`, sequences `periodKey`, every other object `name`.

### billingProfile: country rules

A preset the user picks for an issuer. Seeded presets are ordinary records
the user may edit or copy.

| Field | Type | Notes |
|---|---|---|
| name | TEXT | "Morocco", "Generic" |
| presetKey | TEXT | Stable key of a seeded preset (`ma`, `generic`). Empty on user-made profiles. |
| countryCode | TEXT | ISO 3166-1 alpha-2. Empty for Generic. |
| language | SELECT | Language pack: `EN`, `FR`. Grows with packs. |
| locale | TEXT | BCP 47 tag for number and date formatting, for example `fr-MA`. |
| defaultCurrency | TEXT | ISO 4217. |
| roundingMode | SELECT | `PER_RATE_ON_TOTAL` (default) or `PER_LINE`. |
| amountInWords | BOOLEAN | Print the total in words, when the language pack supports it. |
| invoiceTitle | TEXT | Overrides the invoice title, for example "Tax Invoice" where the law requires those words. Empty: the language pack's. |
| creditNoteTitle | TEXT | Same, for credit notes. |
| quoteNumberPattern | TEXT | Tokens `{YYYY}` `{YY}` `{MM}` `{SEQ:n}`. Example `Q-{YYYY}-{SEQ:4}`. |
| invoiceNumberPattern | TEXT | Example `INV-{YYYY}-{SEQ:4}`. |
| creditNoteNumberPattern | TEXT | Example `CN-{YYYY}-{SEQ:4}`. |
| numberingReset | SELECT | `NEVER`, `YEARLY`, `MONTHLY`. |
| defaultPaymentTermDays | NUMBER | Integer. |
| defaultQuoteValidityDays | NUMBER | Integer. |
| quoteMentions | RICH_TEXT | Printed on every quote. |
| invoiceMentions | RICH_TEXT | Printed on every invoice. |
| creditNoteMentions | RICH_TEXT | Printed on every credit note. |
| qrMode | SELECT | `NONE`, `PAYLOAD`, `URL_WITH_PAYLOAD`. |
| complianceNote | TEXT | What the PDF does not cover in this country, for example structured e-invoicing. Shown in Twenty, never printed. |
| verifiedOn | DATE | When a seeded preset was last checked against official sources. |

### billingIdentifierType: one legal identifier a profile uses

| Field | Type | Notes |
|---|---|---|
| name | TEXT | Printed label: "ICE", "VAT number", "SIREN". |
| key | TEXT | Stable key, for example `ma.ice`. |
| profile | RELATION | → billingProfile. |
| appliesTo | SELECT | `SELLER`, `BUYER`, `BOTH`. |
| requiredForSeller | BOOLEAN | Issuing is refused while the seller has no value. |
| requiredForBusinessBuyer | BOOLEAN | Refused while a company buyer located in the profile's country, or whose country is unknown, has no value. A foreign buyer or a person buyer is never required to have one, so export invoices are not blocked. |
| printOnDocuments | BOOLEAN | |
| includeInQr | BOOLEAN | |
| validationPattern | TEXT | Optional regular expression, for example 15 digits. |
| sortOrder | NUMBER | Print order. |

### billingIdentifier: an identifier's value

| Field | Type | Notes |
|---|---|---|
| identifierType | RELATION | → billingIdentifierType. |
| value | TEXT | |
| issuer | RELATION | → billingIssuer. |
| company | RELATION | → company (standard). |
| person | RELATION | → person (standard). |

Exactly one of issuer, company and person is set. Twenty cannot enforce that,
so Lifecycle's issue gate checks it and names the offending record.

### billingIssuer: the seller

| Field | Type | Notes |
|---|---|---|
| name | TEXT | Trading name. |
| legalName | TEXT | |
| legalForm | TEXT | Free text: legal forms differ by country. |
| profile | RELATION | → billingProfile. |
| postalAddress | ADDRESS | Twenty reserves the name `address`. |
| emails | EMAILS | |
| phones | PHONES | |
| website | LINKS | |
| logo | FILES | |
| defaultCurrency | TEXT | ISO 4217. Falls back to the profile's. |
| paymentDetails | RICH_TEXT | Free text: bank formats differ by country. |
| accentColor | TEXT | `#RRGGBB`. |
| footerNote | TEXT | |
| verificationBaseUrl | LINKS | Used by `URL_WITH_PAYLOAD` QR mode. |
| isDefault | BOOLEAN | Preselected on new documents. |

### billingTaxCode and billingTaxComponent

| billingTaxCode field | Type | Notes |
|---|---|---|
| name | TEXT | "VAT 20%", "GST + QST" |
| code | TEXT | Stable key, for example `fr.vat.20`. |
| countryCode | TEXT | ISO 3166-1 alpha-2. |
| category | SELECT | `STANDARD`, `REDUCED`, `ZERO`, `EXEMPT`, `REVERSE_CHARGE`, `OUT_OF_SCOPE`. |
| printNote | TEXT | Printed when the code is used, for example an exemption article. |
| isActive | BOOLEAN | Inactive codes stay on old documents but are not offered. |

| billingTaxComponent field | Type | Notes |
|---|---|---|
| taxCode | RELATION | → billingTaxCode. |
| name | TEXT | Printed in the recap: "GST", "QST", "CGST". |
| rate | NUMBER | Percent, up to 4 decimals (9.975). |
| compound | BOOLEAN | Computed on the base plus the components before it. |
| sortOrder | NUMBER | |

### billingCatalogItem

| Field | Type | Notes |
|---|---|---|
| name | TEXT | |
| description | TEXT | |
| sku | TEXT | |
| unit | SELECT | See units below. |
| unitPrice | CURRENCY | |
| taxCode | RELATION | → billingTaxCode. |
| isActive | BOOLEAN | |

### Documents

Fields shared by billingQuote, billingInvoice and billingCreditNote:

| Field | Type | Notes |
|---|---|---|
| number | TEXT | Empty until numbered. Unique per issuer and type, guaranteed by the numbering logic, not by the database. |
| status | SELECT | Per type, below. |
| issuer | RELATION | → billingIssuer. |
| company | RELATION | → company. Buyer. |
| person | RELATION | → person. Buyer or buyer contact. |
| issueDate | DATE | |
| currencyCode | TEXT | ISO 4217. Every line must use it. |
| pricesIncludeTax | BOOLEAN | Price basis for the whole document. |
| language | SELECT | Overrides the profile's language. Empty: the profile's. |
| subject | TEXT | |
| notes | RICH_TEXT | |
| subtotal | CURRENCY | Written by the engine. |
| discountTotal | CURRENCY | Written by the engine. |
| taxTotal | CURRENCY | Written by the engine. |
| total | CURRENCY | Written by the engine. |
| pdf | FILES | Generated PDFs, newest first. |
| snapshot | RAW_JSON | Seller, buyer, identifiers, profile and tax codes, frozen when the document is numbered. Numbered documents render from the snapshot only. |
| documentHash | TEXT | Hash of the rendered content, for integrity checks. |

Per type:

| Object | Extra fields | Statuses |
|---|---|---|
| billingQuote | `opportunity` → opportunity, `validUntil` DATE, `acceptedAt` DATE, `invoices` (reverse of `billingInvoice.quote`; Lifecycle allows one) | `DRAFT`, `SENT`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `INVOICED` |
| billingInvoice | `opportunity` → opportunity, `quote` → billingQuote, `dueDate` DATE, `buyerReference` TEXT (purchase order), `issuedAt` DATE_TIME, `sentAt` DATE_TIME, `paidAt` DATE | `DRAFT`, `ISSUED`, `SENT`, `PAID`, `CANCELLED` |
| billingCreditNote | `invoice` → billingInvoice (required), `reason` TEXT, `issuedAt` DATE_TIME | `DRAFT`, `ISSUED` |

Overdue is not a status. It is a view: due date in the past and not PAID or
CANCELLED.

### Lines

billingQuoteLine, billingInvoiceLine and billingCreditNoteLine share one
shape:

| Field | Type | Notes |
|---|---|---|
| (parent) | RELATION | → the document. |
| sortOrder | NUMBER | Print order. |
| catalogItem | RELATION | → billingCatalogItem. Copies its values; the line stays editable. |
| description | TEXT | |
| quantity | NUMBER | Up to 3 decimals. |
| unit | SELECT | See units below. |
| unitPrice | CURRENCY | Net or gross, per the document's price basis. |
| discountPercent | NUMBER | Up to 2 decimals. |
| taxCode | RELATION | → billingTaxCode. |
| periodStart | DATE | Optional service period. |
| periodEnd | DATE | |
| lineTotal | CURRENCY | Written by the engine. |

Units are a closed list, translated by the language pack and mapped to
UN/ECE Recommendation 20 codes for later e-invoicing: `UNIT`, `HOUR`, `DAY`,
`WEEK`, `MONTH`, `YEAR`, `KG`, `G`, `TONNE`, `M`, `KM`, `M2`, `M3`, `LITRE`,
`KWH`, `FLAT_FEE`, `PACKAGE`.

### billingSequence: the numbering ledger

| Field | Type | Notes |
|---|---|---|
| issuer | RELATION | → billingIssuer. |
| documentType | SELECT | `QUOTE`, `INVOICE`, `CREDIT_NOTE`. |
| periodKey | TEXT | `ALL`, `2026`, or `2026-09`, per `numberingReset`. |
| lastValue | NUMBER | Integer. |

Allocation, atomicity and gap handling belong to Lifecycle.

### Fields added to standard objects

| Standard object | Fields |
|---|---|
| company | `billingQuotes`, `billingInvoices`, `billingCreditNotes`, `billingIdentifiers` |
| person | `billingQuotes`, `billingInvoices`, `billingCreditNotes`, `billingIdentifiers` |
| opportunity | `billingQuotes`, `billingInvoices` |

These are the reverse sides of the relations above. Twenty requires both
sides to be declared.

### Reverse sides between the app's own objects

Every relation above is many-to-one, and its one-to-many reverse is declared
too, each with its own identifier in the registry:

| Object | Reverse fields |
|---|---|
| billingProfile | `identifierTypes`, `issuers` |
| billingIdentifierType | `identifiers` |
| billingIssuer | `identifiers`, `quotes`, `invoices`, `creditNotes`, `sequences` |
| billingTaxCode | `components`, `catalogItems`, `quoteLines`, `invoiceLines`, `creditNoteLines` |
| billingCatalogItem | `quoteLines`, `invoiceLines`, `creditNoteLines` |
| billingQuote | `lines`, `invoices` |
| billingInvoice | `lines`, `creditNotes` |
| billingCreditNote | `lines` |

## 2. Identity and upgrade safety

- Every universal identifier (application, objects, fields, select options,
  role, logic functions) lives in one registry, `src/ids.ts`. New ones come
  from `scripts/new-id.mjs`.
- `ids.lock.json` is committed and lists every released identifier. A test
  fails when an identifier in the lock is changed or missing, and passes
  when one is added. Removing an object or field on upgrade drops its data;
  this test is what prevents it.
- Objects, fields and select options are never deleted once released. A
  retired field is relabelled "(deprecated)" and no longer read.
- Versions follow semver and only increase. The first release is `0.1.0`.

## 3. Presets and seeding

`seed-presets` is a post-install logic function with
`shouldRunOnVersionUpgrade: true`.

- It finds each seeded record by its stable key (`billingProfile.presetKey`,
  `billingIdentifierType.key`, `billingTaxCode.code`). A missing record is
  created. An existing record is never updated, so a user's edit always
  survives an upgrade. A new version only adds records.
- It seeds configuration only: profiles, identifier types, tax codes and tax
  components. Never issuers, clients or documents.
- It is idempotent and safe under the platform's three retries.
- A soft-deleted seeded record counts as existing, so a preset the user
  deleted stays deleted. No identifier type is added to a deleted profile.
- A seeded tax code with no component at all is a run that stopped halfway,
  and the next run adds the preset's components. A code with components,
  including deleted ones, is the user's and is left alone.
- A rate that changes by law ships as a new tax code and a release note. The
  old code is left for the user to deactivate.
- Each preset carries its sources. `docs/presets/<key>.md` is generated from
  the preset data, and a test fails when a page and its data disagree.

Presets at launch:

| Key | Country | Language | Notes |
|---|---|---|---|
| `generic` | none | EN | No required identifiers. `INV-{YYYY}-{SEQ:4}`. |
| `ma` | Morocco | FR | ICE, IF, RC, TP, CNSS. Amount in words. |
| `fr` | France | FR | SIREN, SIRET, RCS, intra-EU VAT number, share capital. Late-payment mentions. E-invoicing reform note. |
| `gb` | United Kingdom | EN | VAT registration number, company number. |
| `us` | United States | EN | EIN, optional. Sales tax codes are left to the user: rates vary by locality. |
| `ca` | Canada | EN | GST/HST number, QST number. GST plus provincial components. |
| `de` | Germany | EN | USt-IdNr, Steuernummer, register entry. |
| `es` | Spain | EN | NIF. |
| `be` | Belgium | FR | Enterprise number, VAT number. Peppol B2B note. |
| `nl` | Netherlands | EN | KvK, BTW-id. |
| `it` | Italy | EN | Partita IVA, Codice Fiscale. SDI note: the PDF is a courtesy copy. |
| `in` | India | EN | GSTIN, PAN. CGST+SGST and IGST codes. IRN note. |
| `ae` | United Arab Emirates | EN | TRN. |

Rates, required identifiers and mentions are verified against official
sources when each preset is written, recorded in `verifiedOn`, and cited in
`docs/presets/<key>.md`. The README states that presets are starting points
to check with an accountant.

## 4. Permissions

One application role:

- Read, create, update and soft delete on the app's own objects. No destroy
  on anything. A role cannot tell a draft from a numbered document, so
  Lifecycle adds the guards that refuse changes and deletion once a document
  is numbered.
- Read on company, person and opportunity, and update on the relation fields
  the app adds to them.
- The `UPLOAD_FILE` permission flag, for PDFs.

## 5. Repository

```
LICENSE                     MIT, Copyright (c) 2026 Exceev Technology
README.md                   what it is, requirements, install, status
package.json                author "Exceev Technology", "private": true until Publish
src/application-config.ts   new application universalIdentifier
src/ids.ts, ids.lock.json   identifier registry
src/objects/                one file per object
src/fields/                 fields added to company, person, opportunity
src/roles/billing.role.ts
src/presets/                one data file per preset
src/logic-functions/seed-presets.ts
engine/                     sub-project 2
test/                       node --test
scripts/new-id.mjs
docs/presets/               one sourced page per preset
.github/workflows/ci.yml    typecheck, tests, identifier lock, secret scan
```

- Node 24, TypeScript, `twenty-sdk` pinned to an exact version: the latest
  the test server supports, 2.41.0 or lower.
- The README states the requirements up front: a Twenty server new enough
  for the pinned SDK, and logic functions enabled on self-hosted servers.

## 6. Error handling

- If logic functions are disabled, the objects exist but no preset is
  seeded. The README covers this, and Lifecycle refuses to issue a document
  whose issuer has no profile, naming the missing configuration.
- A seed failure is retried by the platform. Because the seeder only creates
  what is missing, a partial run is completed by the next one.

## 7. Testing and acceptance

Automated, run in CI:

- Identifier lock: no released identifier changed or removed; all unique,
  all valid v4 UUIDs.
- Schema: every object and every field added to a standard object has a
  `billing`-prefixed API name; every select option has an identifier.
- Presets: keys unique; identifier-type keys unique; tax codes unique across
  presets; rates between 0 and 100; country and currency codes valid ISO
  codes; every preset has a `docs/presets` page.
- Seeder: against an in-memory fake of the API client, a first run creates
  everything, a second run creates nothing, and an edited record is left
  untouched.

On the test workspace:

1. Deploy. All fourteen objects and the standard-object fields exist.
2. The thirteen presets, their identifier types and their tax codes exist.
3. Edit one seeded tax code, bump the patch version, deploy again. No
   duplicates, and the edit survives.
4. With a hand-built object named `invoice` already in the workspace, the
   app still installs. If object labels clash too, the fallback label is
   "Invoice (Billing)".

## Out of scope for Foundation

Rendering, numbering allocation, issuing, locking, credit notes, email,
views and navigation. The schema above is designed so they need no breaking
change.
