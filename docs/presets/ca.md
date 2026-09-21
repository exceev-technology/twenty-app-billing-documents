# Canada (`ca`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | CA |
| Language | EN |
| Locale | en-CA |
| Currency | CAD |
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
| `ca.gst-hst` | GST/HST number | SELLER | no | no | `^\d{9}RT\d{4}$` |
| `ca.qst` | QST number | SELLER | no | no | `^\d{10}TQ\d{4}$` |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `ca.gst.5` | GST 5% | STANDARD | GST 5 % |  |
| `ca.on.hst.13` | HST 13% (Ontario) | STANDARD | HST 13 % |  |
| `ca.hst.15` | HST 15% (New Brunswick, Newfoundland and Labrador, Prince Edward Island) | STANDARD | HST 15 % |  |
| `ca.ns.hst.14` | HST 14% (Nova Scotia) | STANDARD | HST 14 % |  |
| `ca.qc.gst-qst` | GST 5% + QST 9.975% (Quebec) | STANDARD | GST 5 % + QST 9.975 % |  |
| `ca.bc.gst-pst` | GST 5% + PST 7% (British Columbia) | STANDARD | GST 5 % + PST 7 % |  |
| `ca.mb.gst-rst` | GST 5% + RST 7% (Manitoba) | STANDARD | GST 5 % + RST 7 % |  |
| `ca.sk.gst-pst` | GST 5% + PST 6% (Saskatchewan) | STANDARD | GST 5 % + PST 6 % |  |
| `ca.zero` | Zero-rated | ZERO | GST/HST 0 % |  |
| `ca.exempt` | Exempt | EXEMPT | GST/HST 0 % | Exempt supply: no GST/HST charged. |

## What this PDF does not cover

In Quebec, the Charter of the French language requires invoices to be available in French. Provincial sales taxes (PST in British Columbia and Saskatchewan, RST in Manitoba) are charged only by businesses registered for them.

## Sources

- [GST/HST calculator and rates (Canada Revenue Agency)](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html)
- [Input tax credits: information required on invoices (Canada Revenue Agency)](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html)
- [Basic Rules for Applying the GST/HST and QST (Revenu Québec)](https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/)
