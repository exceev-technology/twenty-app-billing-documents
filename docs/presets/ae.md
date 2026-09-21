# United Arab Emirates (`ae`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | AE |
| Language | EN |
| Locale | en-AE |
| Currency | AED |
| Tax rounding | PER_RATE_ON_TOTAL |
| Total in words | no |
| Invoice title | Tax Invoice |
| Credit note title | Tax Credit Note |
| Quote numbers | `Q-{YYYY}-{SEQ:4}` |
| Invoice numbers | `INV-{YYYY}-{SEQ:4}` |
| Credit note numbers | `CN-{YYYY}-{SEQ:4}` |
| Numbering restarts | YEARLY |
| Payment term | 30 days |
| Quote validity | 30 days |

## Identifiers

| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |
|---|---|---|---|---|---|
| `ae.trn` | TRN | BOTH | yes | no | `^\d{15}$` |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `ae.vat.5` | VAT 5% | STANDARD | VAT 5 % |  |
| `ae.vat.0` | Zero-rated | ZERO | VAT 0 % |  |
| `ae.exempt` | Exempt | EXEMPT | VAT 0 % | Exempt from VAT. |
| `ae.reverse-charge` | Reverse charge | REVERSE_CHARGE | VAT 0 % | Reverse charge: the recipient accounts for VAT (Article 48, Federal Decree-Law No. 8 of 2017). |

## What this PDF does not cover

Mandatory e-invoicing through accredited service providers is being phased in from 2026 to 2027. Until it applies to your business, a PDF tax invoice is valid. When the invoice is in another currency, the tax amount must also be shown in AED, which is not supported yet.

## Sources

- [Federal Decree-Law No. (8) of 2017 on Value Added Tax (Federal Tax Authority, unofficial translation)](https://tax.gov.ae/DataFolder/Files/Pdf/VAT-Decree-Law-No-8-of-2017.pdf)
- [Tax invoices — VAT public guide (Federal Tax Authority)](https://tax.gov.ae/Datafolder/Files/Pdf/2023/Knowledge%20Center%20Page/VAT11%20-%20Tax%20invoices%20En.pdf)
- [UAE Electronic Invoicing (Ministry of Finance)](https://mof.gov.ae/en/about-ministry/mof-initiatives/einvoicing/)
