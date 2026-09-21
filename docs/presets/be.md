# Belgium (`be`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | BE |
| Language | FR |
| Locale | fr-BE |
| Currency | EUR |
| Tax rounding | PER_RATE_ON_TOTAL |
| Total in words | no |
| Quote numbers | `D-{YYYY}-{SEQ:4}` |
| Invoice numbers | `F-{YYYY}-{SEQ:4}` |
| Credit note numbers | `NC-{YYYY}-{SEQ:4}` |
| Numbering restarts | YEARLY |
| Payment term | 30 days |
| Quote validity | 30 days |

## Identifiers

| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |
|---|---|---|---|---|---|
| `be.bce` | Numéro d’entreprise | BOTH | yes | yes | `^[01]\d{3}\.?\d{3}\.?\d{3}$` |
| `be.tva` | N° TVA | BOTH | no | no | `^BE[01]\d{9}$` |
| `be.rpm` | RPM | SELLER | no | no |  |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `be.tva.21` | TVA 21 % | STANDARD | TVA 21 % |  |
| `be.tva.12` | TVA 12 % | REDUCED | TVA 12 % |  |
| `be.tva.6` | TVA 6 % | REDUCED | TVA 6 % |  |
| `be.tva.0` | TVA 0 % | ZERO | TVA 0 % |  |
| `be.franchise` | Franchise des petites entreprises | EXEMPT | TVA 0 % | Régime particulier de franchise des petites entreprises (article 56bis, Code de la TVA). |
| `be.autoliquidation` | Autoliquidation | REVERSE_CHARGE | TVA 0 % | Autoliquidation. |
| `be.intracom` | Livraison intracommunautaire | EXEMPT | TVA 0 % | Livraison intracommunautaire exemptée (article 39bis du Code de la TVA). |

## What this PDF does not cover

Structured B2B e-invoicing over Peppol is mandatory since 1 January 2026. For domestic B2B, this PDF is not a valid invoice: send the invoice through Peppol. It remains usable for consumers and foreign buyers.

## Sources

- [E-facturation (SPF Finances)](https://finances.belgium.be/fr/entreprises/tva/e-facturation)
- [TVA (SPF Finances)](https://finances.belgium.be/fr/tva)
