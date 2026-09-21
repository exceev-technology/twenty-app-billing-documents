import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'fr',
  name: 'France',
  countryCode: 'FR',
  language: 'FR',
  locale: 'fr-FR',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'D{YYYY}-{SEQ:4}', invoice: 'F{YYYY}-{SEQ:4}', creditNote: 'AV{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {
    invoice: 'En cas de retard de paiement, une pénalité égale à trois fois le taux d’intérêt légal est exigible (article L441-10 du Code de commerce), ainsi qu’une indemnité forfaitaire de 40 € pour frais de recouvrement (article D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.',
  },
  qrMode: 'NONE',
  complianceNote: 'E-invoicing reform: from 1 September 2026 every business must be able to receive electronic invoices, and large and mid-sized businesses must issue them; small businesses must issue them from 1 September 2027. From your issuing date, domestic B2B invoices go through an approved platform (plateforme agréée) and this PDF is no longer enough on its own. New mandatory mentions also apply, including the buyer’s SIREN and the category of the operation.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Facture : mentions obligatoires (entreprendre.service-public.gouv.fr)', url: 'https://entreprendre.service-public.gouv.fr/vosdroits/F31808' },
    { title: 'Je passe à la facturation électronique (impots.gouv.fr)', url: 'https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique' },
    { title: 'Code de commerce, article L441-10: pénalités de retard (Légifrance)', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414392' },
    { title: 'Code de commerce, article D441-5: indemnité forfaitaire de 40 euros (Légifrance)', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043197457' },
    { title: 'Code général des impôts, article 262 ter: exonération des livraisons intracommunautaires (Légifrance)', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051764907' },
    { title: 'Code général des impôts, article 283: redevables de la taxe, autoliquidation (Légifrance)', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051214570' },
    { title: 'BOFiP, TVA - Facturation - Mentions obligatoires générales, §520-530: mention "Autoliquidation" requise, sans obligation de citer l’article du CGI (bofip.impots.gouv.fr)', url: 'https://bofip.impots.gouv.fr/bofip/140-PGP.html/identifiant=BOI-TVA-DECLA-30-20-20-10-20131018' },
    { title: 'Code général des impôts, article 293 B: franchise en base de TVA (Légifrance)', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045035275' },
  ],
  identifierTypes: [
    { key: 'fr.siren', name: 'SIREN', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^\\d{9}$' },
    { key: 'fr.siret', name: 'SIRET', appliesTo: 'SELLER', validationPattern: '^\\d{14}$' },
    { key: 'fr.rcs', name: 'RCS', appliesTo: 'SELLER' },
    { key: 'fr.tva', name: 'N° TVA intracommunautaire', appliesTo: 'BOTH', validationPattern: '^FR[0-9A-Z]{2}\\d{9}$' },
    { key: 'fr.capital', name: 'Capital social', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'fr.tva.20', name: 'TVA 20 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 20 }] },
    { code: 'fr.tva.10', name: 'TVA 10 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 10 }] },
    { code: 'fr.tva.5-5', name: 'TVA 5,5 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 5.5 }] },
    { code: 'fr.tva.2-1', name: 'TVA 2,1 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 2.1 }] },
    { code: 'fr.franchise', name: 'Franchise en base de TVA', category: 'EXEMPT', printNote: 'TVA non applicable, article 293 B du CGI.', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'fr.autoliquidation', name: 'Autoliquidation', category: 'REVERSE_CHARGE', printNote: 'Autoliquidation.', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'fr.intracom', name: 'Livraison intracommunautaire', category: 'EXEMPT', printNote: 'Exonération de TVA, article 262 ter, I du CGI.', components: [{ name: 'TVA', rate: 0 }] },
  ],
};

export default preset;
