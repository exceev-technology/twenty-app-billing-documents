# Germany (`de`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | DE |
| Language | EN |
| Locale | de-DE |
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
| `de.ust-idnr` | USt-IdNr. | BOTH | no | no | `^DE\d{9}$` |
| `de.steuernummer` | Steuernummer | SELLER | no | no |  |
| `de.handelsregister` | Handelsregister | SELLER | no | no |  |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `de.ust.19` | USt 19 % | STANDARD | USt 19 % |  |
| `de.ust.7` | USt 7 % | REDUCED | USt 7 % |  |
| `de.ust.0` | USt 0 % | ZERO | USt 0 % |  |
| `de.kleinunternehmer` | Kleinunternehmer | EXEMPT | USt 0 % | Gemäß § 19 UStG wird keine Umsatzsteuer berechnet. |
| `de.reverse-charge` | Reverse charge | REVERSE_CHARGE | USt 0 % | Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). |
| `de.intra-eu` | Innergemeinschaftliche Lieferung | EXEMPT | USt 0 % | Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1b UStG). |

## Mentions

- **Invoices**: Unless a line states a period, the date of supply is the invoice date.

## What this PDF does not cover

Every business must be able to receive e-invoices (XRechnung or ZUGFeRD) since 1 January 2025. Issuing them is mandatory from 1 January 2027 for businesses with a prior-year turnover above €800,000, and for all businesses from 1 January 2028. Until your date, a PDF invoice remains allowed for domestic B2B. Documents print in English until a German language pack exists.

## Sources

- [§ 14 UStG: Ausstellung von Rechnungen (Gesetze im Internet)](https://www.gesetze-im-internet.de/ustg_1980/__14.html)
- [§ 19 UStG: Besteuerung der Kleinunternehmer (Gesetze im Internet)](https://www.gesetze-im-internet.de/ustg_1980/__19.html)
- [§ 13b UStG: Leistungsempfänger als Steuerschuldner (Gesetze im Internet)](https://www.gesetze-im-internet.de/ustg_1980/__13b.html)
- [FAQ zur Einführung der obligatorischen E-Rechnung (Bundesministerium der Finanzen)](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)
