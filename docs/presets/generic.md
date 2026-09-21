# Generic (`generic`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | none |
| Language | EN |
| Locale | en |
| Currency | set on the issuer |
| Tax rounding | PER_RATE_ON_TOTAL |
| Total in words | no |
| Quote numbers | `Q-{YYYY}-{SEQ:4}` |
| Invoice numbers | `INV-{YYYY}-{SEQ:4}` |
| Credit note numbers | `CN-{YYYY}-{SEQ:4}` |
| Numbering restarts | YEARLY |
| Payment term | 30 days |
| Quote validity | 30 days |

## Identifiers

| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |
|---|---|---|---|---|---|
| `generic.tax-id` | Tax ID | BOTH | no | no |  |
| `generic.registration` | Company registration | SELLER | no | no |  |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `generic.no-tax` | No tax | OUT_OF_SCOPE | Tax 0 % |  |

## What this PDF does not cover

No country rules. Add the identifiers, tax codes and mentions your country requires.

## Sources

None: this preset carries no country rules.
