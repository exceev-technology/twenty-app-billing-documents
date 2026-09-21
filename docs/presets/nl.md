# Netherlands (`nl`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | NL |
| Language | EN |
| Locale | nl-NL |
| Currency | EUR |
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
| `nl.kvk` | KvK number | SELLER | yes | no | `^\d{8}$` |
| `nl.btw` | VAT ID (btw-id) | BOTH | no | no | `^NL\d{9}B\d{2}$` |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `nl.btw.21` | Btw 21% | STANDARD | Btw 21 % |  |
| `nl.btw.9` | Btw 9% | REDUCED | Btw 9 % |  |
| `nl.btw.0` | Btw 0% | ZERO | Btw 0 % |  |
| `nl.kor` | Kleineondernemersregeling | EXEMPT | Btw 0 % | Vrijgesteld van btw op grond van de kleineondernemersregeling. |
| `nl.verlegd` | Btw verlegd | REVERSE_CHARGE | Btw 0 % | Btw verlegd. |
| `nl.intra-eu` | Intracommunautaire levering | EXEMPT | Btw 0 % | Intracommunautaire levering. |

## What this PDF does not cover

No B2B e-invoicing mandate was in force on the verification date. Documents print in English until a Dutch language pack exists.

## Sources

- [Factuureisen (Belastingdienst)](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/facturen_maken/factuureisen/factuureisen)
- [Tarieven en vrijstellingen (Belastingdienst)](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/tarieven_en_vrijstellingen/tarieven_en_vrijstellingen)
- [U maakt gebruik van de kleineondernemersregeling (Belastingdienst)](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/facturen_maken/factuureisen/aangepaste_regels_facturen/u_maakt_gebruik_van_de_kleineondernemersregeling)
- [KVK-nummer: goed om te weten (Kamer van Koophandel)](https://www.kvk.nl/over-het-handelsregister/kvk-nummer-alles-wat-je-moet-weten/)
