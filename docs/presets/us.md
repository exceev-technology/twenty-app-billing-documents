# United States (`us`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | US |
| Language | EN |
| Locale | en-US |
| Currency | USD |
| Tax rounding | PER_RATE_ON_TOTAL |
| Total in words | no |
| Credit note title | Credit Memo |
| Quote numbers | `Q-{SEQ:5}` |
| Invoice numbers | `INV-{SEQ:5}` |
| Credit note numbers | `CM-{SEQ:5}` |
| Numbering restarts | NEVER |
| Payment term | 30 days |
| Quote validity | 30 days |

## Identifiers

| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |
|---|---|---|---|---|---|
| `us.ein` | EIN | SELLER | no | no | `^\d{2}-\d{7}$` |
| `us.sales-tax-permit` | Sales tax permit | SELLER | no | no |  |
| `us.resale-certificate` | Resale certificate | BUYER | no | no |  |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `us.no-tax` | No sales tax | OUT_OF_SCOPE | Sales tax 0 % |  |
| `us.resale` | Sale for resale | EXEMPT | Sales tax 0 % | Exempt from sales tax: sale for resale, certificate on file. |

## What this PDF does not cover

Sales tax depends on the state, county and city of the sale, and on whether you have nexus there. The preset ships no rates: add a tax code for each rate you charge.

## Sources

- [Employer ID Numbers (IRS)](https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers)
- [State sales tax rates and vendor discounts (Federation of Tax Administrators)](https://taxadmin.org/wp-content/uploads/resources/tax_rates/vendors.pdf)
