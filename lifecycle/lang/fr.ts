import type { LifecyclePack, StatusKey } from './pack.ts';

const statuses: Record<StatusKey, string> = {
  DRAFT: 'Brouillon', ISSUED: 'Émise', SENT: 'Envoyée', PAID: 'Payée', CANCELLED: 'Annulée',
  ACCEPTED: 'Accepté', DECLINED: 'Refusé', EXPIRED: 'Expiré', INVOICED: 'Facturé',
};

const statusName = (value?: string): string => (value && value in statuses ? statuses[value as StatusKey] : value ?? '');
const party = (field?: string): string => (field === 'buyer' ? 'Le client' : 'L’émetteur');
const list = (names: readonly string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
const kinds = { QUOTE: 'devis', INVOICE: 'facture', CREDIT_NOTE: 'avoir' } as const;
/** "Cette facture est émise", "Cet avoir est émis", "Ce devis". */
const thisOne = { QUOTE: 'Ce devis', INVOICE: 'Cette facture', CREDIT_NOTE: 'Cet avoir' } as const;
const issued = { QUOTE: 'émis', INVOICE: 'émise', CREDIT_NOTE: 'émis' } as const;
const correct = (kind: keyof typeof kinds): string =>
  kind === 'CREDIT_NOTE' ? 'Un avoir émis ne peut plus changer.' : 'Corrigez-la par un avoir.';

export const fr: LifecyclePack = {
  code: 'FR',
  problems: {
    NOT_ALLOWED: () => 'Votre rôle ne permet pas de modifier ce document\u00a0: vous ne pouvez donc pas lancer cette action.',
    WRONG_STATUS: ({ value }) => `Cette action demande un brouillon\u00a0; ce document est au statut ${statusName(value)}.`,
    ALREADY_ISSUED: ({ value }) => `Ce document est déjà émis, sous le numéro ${value}.`,
    MISSING_ISSUER: () => 'Choisissez l’émetteur.',
    MISSING_PROFILE: () => 'L’émetteur n’a pas de profil de facturation\u00a0: choisissez-en un sur l’émetteur.',
    MISSING_BUYER: () => 'Choisissez la société ou la personne à facturer.',
    MISSING_CURRENCY: () => 'Indiquez une devise sur le document, sur l’émetteur ou sur son profil.',
    MISSING_IDENTIFIER: ({ field, value }) => `${party(field)} n’a pas de ${value}.`,
    INVALID_IDENTIFIER: ({ field, value }) => `${party(field)} a un ${value} qui n’a pas le format attendu.`,
    IDENTIFIER_OWNER: ({ value }) => `L’identifiant ${value} est rattaché à plus d’un enregistrement\u00a0: n’en gardez qu’un.`,
    MISSING_INVOICE: () => 'Choisissez la facture que cet avoir corrige.',
    INVOICE_NOT_ISSUED: () => 'La facture que cet avoir corrige n’est pas émise.',
    INVOICE_MISMATCH: ({ field }) =>
      field === 'currencyCode'
        ? 'La facture que cet avoir corrige est dans une autre devise.'
        : 'La facture que cet avoir corrige a un autre émetteur.',
    DATE_IN_FUTURE: ({ value }) => `La date d’émission, ${value}, est postérieure à aujourd’hui.`,
    DATE_BEFORE_LAST: ({ value }) => `La date d’émission est antérieure au ${value}, date du dernier document numéroté de sa séquence.`,
    DUE_BEFORE_ISSUE: () => 'L’échéance est antérieure à la date d’émission.',
    CLOCK_SKEW: () => 'La date de votre ordinateur s’écarte de plus d’un jour de celle du serveur\u00a0: vérifiez sa date et son heure.',
    LEDGER_BEHIND: ({ value, documentType }) =>
      `La séquence de numérotation de type ${documentType ? kinds[documentType] : 'document'}, pour ${value}, est très en retard sur les numéros déjà attribués\u00a0: augmentez son dernier numéro.`,
  },
  renderProblems: {
    UNSUPPORTED_SCRIPT: ({ field, value }) => `Certains caractères ne peuvent pas être imprimés avec la police du PDF (${field})\u00a0: ${value}`,
    UNSUPPORTED_IMAGE: () => 'Le logo de l’émetteur n’est pas une image PNG ou JPEG, ou le fichier est endommagé.',
    UNKNOWN_TEMPLATE: ({ value }) => `Le modèle de l’émetteur, ${value}, n’est pas connu de cette application.`,
    UNKNOWN_LANGUAGE: ({ value }) => `Les documents ne peuvent pas encore être imprimés en ${value}.`,
    QR_PAYLOAD_TOO_LONG: ({ value }) => `Le code QR contient trop de données pour rester lisible (${value}).`,
    MISSING_TAX_NAME: () => 'Un code de taxe de ce document n’a pas de nom.',
    INVALID_LOCALE: ({ value }) => `La locale du profil, ${value}, n’est pas une balise de langue valide comme fr-FR.`,
    INVALID_DATE: ({ field, value }) => `${value} n’est pas une date valide (${field}).`,
    INVALID_CURRENCY: ({ value }) => `${value} n’est pas un code de devise.`,
    QR_BASE_URL_MISSING: () => 'Le profil imprime un lien QR, mais l’émetteur n’a pas de lien de vérification.',
    QR_PAYLOAD_EMPTY: () => 'Le code QR serait vide.',
  },
  units: {
    UNIT: 'unité', HOUR: 'heure', DAY: 'jour', WEEK: 'semaine', MONTH: 'mois', YEAR: 'an',
    KG: 'kg', G: 'g', TONNE: 't', M: 'm', KM: 'km', M2: 'm²', M3: 'm³', LITRE: 'L', KWH: 'kWh',
    FLAT_FEE: 'forfait', PACKAGE: 'lot',
  },
  fields: {
    subject: 'Objet', issuerId: 'Émetteur', companyId: 'Société', personId: 'Personne', issueDate: 'Date d’émission',
    dueDate: 'Échéance', currencyCode: 'Devise', pricesIncludeTax: 'Prix TTC', language: 'Langue',
    notes: 'Notes', buyerReference: 'Référence client', invoiceId: 'Facture', reason: 'Motif',
    documentType: 'Type de document', periodKey: 'Période', lastValue: 'Dernier numéro',
  },
  statuses,
  kinds,
  messages: {
    previewReady: 'Aperçu prêt\u00a0: il est dans le champ PDF.',
    issued: (kind, number) => `${kind === 'INVOICE' ? 'Émise' : 'Émis'} sous le numéro ${number}.`,
    quotePdf: (number, version) => `Devis ${number}, version ${version}\u00a0: il est dans le champ PDF.`,
    unexpected: (ref) => `Une erreur s’est produite (réf. ${ref}).`,
    fieldsPutBack: (kind, fields) =>
      `${thisOne[kind]} est ${issued[kind]}\u00a0: ${fields.length > 1 ? `les modifications de ${list(fields)} ont été annulées` : `la modification de ${list(fields)} a été annulée`}. ${correct(kind)}`,
    lineChangePutBack: (kind) => `${thisOne[kind]} est ${issued[kind]}\u00a0: la modification d’une ligne a été annulée. ${correct(kind)}`,
    lineAddedRemoved: (kind) => `${thisOne[kind]} est ${issued[kind]}\u00a0: la ligne ajoutée a été retirée. ${correct(kind)}`,
    lineDeletedRestored: (kind) => `${thisOne[kind]} est ${issued[kind]}\u00a0: la ligne supprimée a été restaurée. ${correct(kind)}`,
    lineMoveReverted: (kind) => `${thisOne[kind]} est ${issued[kind]}\u00a0: la ligne déplacée a été remise en place. ${correct(kind)}`,
    documentRestored: (kind, number) =>
      `${thisOne[kind]} porte le numéro ${number} et ne peut pas être ${kind === 'INVOICE' ? 'supprimée\u00a0: elle a été restaurée' : 'supprimé\u00a0: il a été restauré'}.`,
    statusPutBack: (rule, kind, back) => {
      const why = {
        ISSUE: `Seule l’action Issue émet ${kind === 'INVOICE' ? 'une facture' : 'un avoir'}.`,
        DRAFT: `${kind === 'INVOICE' ? 'Une facture numérotée' : 'Un avoir numéroté'} ne peut pas revenir au statut Brouillon.`,
        CANCEL: 'Une facture numérotée s’annule par un avoir.',
        INVOICED: 'Un devis passe au statut Facturé quand il devient une facture.',
      }[rule];
      return `${why} Le statut a été remis à ${back}.`;
    },
    createdAsDraft: (kind, status) => `${thisOne[kind]} commence comme brouillon\u00a0: son statut ${status} a été remis à Brouillon.`,
    ledgerDuplicateRemoved: 'Une séquence de numérotation existe déjà pour cet émetteur, ce type de document et cette période\u00a0: celle-ci a été supprimée.',
    ledgerChangePutBack: (fields) =>
      `Cette séquence a déjà attribué des numéros\u00a0: son émetteur, son type et sa période sont fixés, et son dernier numéro ne peut que monter. La modification de ${list(fields)} a été annulée.`,
    ledgerRestored: 'Cette séquence a déjà attribué des numéros et ne peut pas être supprimée\u00a0: elle a été restaurée.',
  },
};
