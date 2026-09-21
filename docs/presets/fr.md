# France (`fr`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | FR |
| Language | FR |
| Locale | fr-FR |
| Currency | EUR |
| Tax rounding | PER_RATE_ON_TOTAL |
| Total in words | no |
| Quote numbers | `D{YYYY}-{SEQ:4}` |
| Invoice numbers | `F{YYYY}-{SEQ:4}` |
| Credit note numbers | `AV{YYYY}-{SEQ:4}` |
| Numbering restarts | YEARLY |
| Payment term | 30 days |
| Quote validity | 30 days |

## Identifiers

| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |
|---|---|---|---|---|---|
| `fr.siren` | SIREN | BOTH | yes | yes | `^\d{9}$` |
| `fr.siret` | SIRET | SELLER | no | no | `^\d{14}$` |
| `fr.rcs` | RCS | SELLER | no | no |  |
| `fr.tva` | N° TVA intracommunautaire | BOTH | no | no | `^FR[0-9A-Z]{2}\d{9}$` |
| `fr.capital` | Capital social | SELLER | no | no |  |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `fr.tva.20` | TVA 20 % | STANDARD | TVA 20 % |  |
| `fr.tva.10` | TVA 10 % | REDUCED | TVA 10 % |  |
| `fr.tva.5-5` | TVA 5,5 % | REDUCED | TVA 5.5 % |  |
| `fr.tva.2-1` | TVA 2,1 % | REDUCED | TVA 2.1 % |  |
| `fr.franchise` | Franchise en base de TVA | EXEMPT | TVA 0 % | TVA non applicable, article 293 B du CGI. |
| `fr.autoliquidation` | Autoliquidation | REVERSE_CHARGE | TVA 0 % | Autoliquidation, article 283 du CGI. |
| `fr.intracom` | Livraison intracommunautaire | EXEMPT | TVA 0 % | Exonération de TVA, article 262 ter, I du CGI. |

## Mentions

- **Invoices**: En cas de retard de paiement, une pénalité égale à trois fois le taux d’intérêt légal est exigible (article L441-10 du Code de commerce), ainsi qu’une indemnité forfaitaire de 40 € pour frais de recouvrement (article D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.

## What this PDF does not cover

E-invoicing reform: from 1 September 2026 every business must be able to receive electronic invoices, and large and mid-sized businesses must issue them; small businesses must issue them from 1 September 2027. From your issuing date, domestic B2B invoices go through an approved platform (plateforme agréée) and this PDF is no longer enough on its own. New mandatory mentions also apply, including the buyer’s SIREN and the category of the operation.

## Sources

- [Facture : mentions obligatoires (entreprendre.service-public.gouv.fr)](https://entreprendre.service-public.gouv.fr/vosdroits/F31808)
- [Je passe à la facturation électronique (impots.gouv.fr)](https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique)
- [Code de commerce, article L441-10: pénalités de retard (Légifrance)](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414392)
- [Code de commerce, article D441-5: indemnité forfaitaire de 40 euros (Légifrance)](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043197457)
- [Code général des impôts, article 262 ter: exonération des livraisons intracommunautaires (Légifrance)](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051764907)
- [Code général des impôts, article 283: redevables de la taxe, autoliquidation (Légifrance)](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051214570)
- [Code général des impôts, article 293 B: franchise en base de TVA (Légifrance)](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045035275)
