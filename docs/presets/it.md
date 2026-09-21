# Italy (`it`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | IT |
| Language | EN |
| Locale | it-IT |
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
| `it.partita-iva` | Partita IVA | BOTH | yes | yes | `^\d{11}$` |
| `it.codice-fiscale` | Codice fiscale | BOTH | no | no | `^([A-Z0-9]{16}\|\d{11})$` |
| `it.sdi` | Codice destinatario (SDI) | BUYER | no | no | `^[A-Z0-9]{7}$` |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `it.iva.22` | IVA 22% | STANDARD | IVA 22 % |  |
| `it.iva.10` | IVA 10% | REDUCED | IVA 10 % |  |
| `it.iva.5` | IVA 5% | REDUCED | IVA 5 % |  |
| `it.iva.4` | IVA 4% | REDUCED | IVA 4 % |  |
| `it.esente` | Esente | EXEMPT | IVA 0 % | Operazione esente ai sensi dell’art. 10 del D.P.R. 633/1972. |
| `it.reverse-charge` | Inversione contabile | REVERSE_CHARGE | IVA 0 % | Inversione contabile ai sensi dell’art. 17 del D.P.R. 633/1972. |
| `it.forfettario` | Regime forfettario | OUT_OF_SCOPE | IVA 0 % | Operazione senza applicazione dell’IVA, effettuata ai sensi dell’art. 1, commi 54-89, della Legge n. 190/2014. |

## What this PDF does not cover

Domestic invoices must be issued as FatturaPA XML through the SDI exchange system; this PDF is only a courtesy copy (copia di cortesia). Withholding tax (ritenuta d’acconto) and stamp duty (imposta di bollo) are not supported yet. Documents print in English until an Italian language pack exists.

## Sources

- [Fatturazione elettronica (Agenzia delle Entrate)](https://www.agenziaentrate.gov.it/portale/aree-tematiche/fatturazione-elettronica)
- [D.P.R. 26 ottobre 1972, n. 633 (Normattiva)](https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1972-10-26;633)
