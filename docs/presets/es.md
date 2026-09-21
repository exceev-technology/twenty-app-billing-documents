# Spain (`es`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | ES |
| Language | EN |
| Locale | es-ES |
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
| `es.nif` | NIF | BOTH | yes | yes | `^[A-Z0-9]\d{7}[A-Z0-9]$` |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `es.iva.21` | IVA 21 % | STANDARD | IVA 21 % |  |
| `es.iva.10` | IVA 10 % | REDUCED | IVA 10 % |  |
| `es.iva.4` | IVA 4 % | REDUCED | IVA 4 % |  |
| `es.exento` | Exento | EXEMPT | IVA 0 % | Operación exenta de IVA (artículo 20 de la Ley 37/1992). |
| `es.isp` | Inversión del sujeto pasivo | REVERSE_CHARGE | IVA 0 % | Inversión del sujeto pasivo (artículo 84 de la Ley 37/1992). |
| `es.intra-eu` | Entrega intracomunitaria | EXEMPT | IVA 0 % | Entrega intracomunitaria exenta (artículo 25 de la Ley 37/1992). |

## What this PDF does not cover

VERI*FACTU record-keeping is mandatory from 1 January 2027 for corporate taxpayers and 1 July 2027 for the self-employed and others using invoicing software. Mandatory B2B e-invoicing under the Crea y Crece law was regulated by Real Decreto 238/2026: it applies from October 2027 for businesses with turnover above €8 million, and from October 2028 for the rest. This app is not VERI*FACTU certified. IRPF withholding on professional invoices is not supported yet. Documents print in English until a Spanish language pack exists.

## Sources

- [Ley 37/1992 del Impuesto sobre el Valor Añadido (BOE)](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740)
- [Real Decreto 1619/2012, Reglamento de facturación (BOE)](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696)
- [Real Decreto 238/2026, sistema de facturación electrónica obligatoria B2B (BOE)](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295)
- [Sistemas informáticos de facturación (SIF) y VERI*FACTU (Agencia Tributaria)](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
