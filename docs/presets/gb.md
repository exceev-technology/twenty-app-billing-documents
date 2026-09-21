# United Kingdom (`gb`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | GB |
| Language | EN |
| Locale | en-GB |
| Currency | GBP |
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
| `gb.vat` | VAT registration number | BOTH | yes | no | `^GB(\d{9}\|\d{12}\|GD\d{3}\|HA\d{3})$` |
| `gb.company-number` | Company number | SELLER | no | no | `^[A-Z0-9]{8}$` |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `gb.vat.20` | VAT 20% | STANDARD | VAT 20 % |  |
| `gb.vat.5` | VAT 5% | REDUCED | VAT 5 % |  |
| `gb.vat.0` | Zero-rated | ZERO | VAT 0 % |  |
| `gb.exempt` | Exempt | EXEMPT | VAT 0 % | Exempt from VAT. |
| `gb.reverse-charge` | Domestic reverse charge | REVERSE_CHARGE | VAT 0 % | Reverse charge: customer to account for VAT to HMRC. |
| `gb.outside-scope` | Outside the scope of VAT | OUT_OF_SCOPE | VAT 0 % | Outside the scope of UK VAT. |

## What this PDF does not cover

No e-invoicing mandate was in force on the verification date. A limited company must also show its registered office and place of registration: add them to the issuer’s footer note.

## Sources

- [Record keeping for VAT: VAT invoices (HMRC VAT Notice 700/21)](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021)
- [VAT rates (GOV.UK)](https://www.gov.uk/vat-rates)
- [Running a limited company: signs, stationery and promotional material (GOV.UK)](https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material)
