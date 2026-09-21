# Morocco (`ma`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | MA |
| Language | FR |
| Locale | fr-MA |
| Currency | MAD |
| Tax rounding | PER_RATE_ON_TOTAL |
| Total in words | yes |
| Quote numbers | `D-{YYYY}-{SEQ:4}` |
| Invoice numbers | `F-{YYYY}-{SEQ:4}` |
| Credit note numbers | `AV-{YYYY}-{SEQ:4}` |
| Numbering restarts | YEARLY |
| Payment term | 60 days |
| Quote validity | 30 days |

## Identifiers

| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |
|---|---|---|---|---|---|
| `ma.ice` | ICE | BOTH | yes | yes | `^\d{15}$` |
| `ma.if` | IF | SELLER | yes | no |  |
| `ma.rc` | RC | SELLER | yes | no |  |
| `ma.tp` | TP | SELLER | yes | no |  |
| `ma.cnss` | CNSS | SELLER | no | no |  |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `ma.tva.20` | TVA 20 % | STANDARD | TVA 20 % |  |
| `ma.tva.10` | TVA 10 % | REDUCED | TVA 10 % |  |
| `ma.exonere` | Exonéré de TVA | EXEMPT | TVA 0 % | Exonéré de TVA en application du Code général des impôts (articles 91 et 92). |

## Mentions

- **Invoices**: En cas de retard de paiement, des pénalités de retard sont exigibles conformément à la loi n° 69-21 relative aux délais de paiement.

## What this PDF does not cover

The tax administration (DGI) is preparing mandatory electronic invoicing. Until it applies to your business, this PDF is your invoice. Check the current timetable before relying on it.

## Sources

- [Code général des impôts 2026, articles 91, 92, 99 et 145 (Direction générale des impôts)](https://www.tax.gov.ma/wps/wcm/connect/08712531-1e81-4e28-a38b-2bd9edf8e09e/CGI+2026+FR.pdf)
- [Loi n° 69-21 relative aux délais de paiement, Bulletin officiel n° 7204 du 15 juin 2023 (Secrétariat général du gouvernement)](https://www.sgg.gov.ma/BO/FR/2873/2023/BO_7204_Fr.pdf)
