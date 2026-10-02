import type { EmailFacts, EmailTemplate, EmailWords, LifecyclePack, StatusKey } from './pack.ts';

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

/** "de Verdal Studio", "d’Atelier Nord". */
const ofSeller = (seller: string): string => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(seller) ? `d’${seller}` : `de ${seller}`);
const greeting = (buyer: string | null): string => (buyer ? `Bonjour ${buyer},` : 'Bonjour,');
const signed = (seller: string): string => (seller ? `Cordialement,\n${seller}` : 'Cordialement,');
const bySeller = (seller: string): string => (seller ? ` ${ofSeller(seller)}` : '');
const amount = (total: string | null): string => (total ? ` d’un montant de ${total}` : '');
const quoteName = ({ number, version }: EmailFacts): string => (version !== null && version > 1 ? `${number} (version ${version})` : number);
/** A greeting, the paragraphs, and the seller's signature, a blank line apart. */
const letter = (facts: EmailFacts, body: string): string => [greeting(facts.buyer), body, signed(facts.seller)].join('\n\n');
/** Sent but not marked: "la facture n’a pas pu être marquée comme envoyée". */
const notMarked = {
  QUOTE: 'le devis n’a pas pu être marqué comme envoyé',
  INVOICE: 'la facture n’a pas pu être marquée comme envoyée',
  CREDIT_NOTE: 'l’avoir n’a pas pu être marqué comme envoyé',
} as const;

const emails: Record<EmailTemplate, EmailWords> = {
  INVOICE: {
    subject: (facts) => `Facture ${facts.number}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(facts, `Veuillez trouver ci-joint la facture ${facts.number}${amount(facts.total)}${facts.dueDate ? `, à régler au plus tard le ${facts.dueDate}` : ''}.`),
  },
  REMINDER: {
    subject: (facts) => `Relance\u00a0: facture ${facts.number}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(
        facts,
        `Sauf erreur de notre part, la facture ${facts.number}${amount(facts.total)}${facts.dueDate ? `, échue le ${facts.dueDate},` : ''} n’est pas encore réglée. Vous la trouverez de nouveau ci-jointe.\n\nSi vous l’avez déjà réglée, merci de ne pas tenir compte de ce message.`,
      ),
  },
  CREDIT_NOTE: {
    subject: (facts) => `Avoir ${facts.number}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(facts, `Veuillez trouver ci-joint l’avoir ${facts.number}${amount(facts.total)}${facts.corrects ? `, qui corrige la facture ${facts.corrects}` : ''}.`),
  },
  QUOTE: {
    subject: (facts) => `Devis ${quoteName(facts)}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(facts, `Veuillez trouver ci-joint notre devis ${quoteName(facts)}${amount(facts.total)}${facts.validUntil ? `, valable jusqu’au ${facts.validUntil}` : ''}.`),
  },
};

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
    HELD_NUMBER_ELSEWHERE: ({ value }) =>
      `Ce document porte déjà le numéro ${value}, attribué pour un autre émetteur ou une autre période\u00a0: rétablissez son émetteur et sa date d’émission pour l’utiliser.`,
    QUOTE_NOT_OPEN: ({ value }) => `Ce devis est au statut ${statusName(value)}\u00a0: seul un devis brouillon, envoyé ou accepté devient une facture.`,
    ALREADY_INVOICED: ({ value }) =>
      value
        ? `Ce devis a déjà une facture, ${value}\u00a0: terminez-la, ou supprimez-la pour recommencer.`
        : 'Ce devis a déjà une facture\u00a0: terminez-la, ou supprimez-la pour recommencer.',
    NOT_ISSUED: () => 'Cette facture n\u2019est pas émise\u00a0: un brouillon se corrige en le modifiant.',
    INVOICE_CANCELLED: ({ field }) =>
      field === 'invoiceId'
        ? 'La facture que cet avoir corrige est annulée\u00a0: il n\u2019y reste rien à créditer.'
        : 'Cette facture est annulée\u00a0: il n\u2019y reste rien à créditer.',
    NOTHING_TO_CREDIT: () => 'Tout ce que porte cette facture est déjà crédité.',
    REMAINDER_UNKNOWN: () =>
      'Un avoir sur cette facture a changé un prix ou ajouté une ligne\u00a0: ce qui reste ne peut pas être calculé. Utilisez Credit note et ajustez l\u2019avoir.',
    OVER_CREDIT: ({ value }) =>
      value ? `Cet avoir crédite plus qu\u2019il ne reste sur sa facture (ligne ${value}).` : 'Cet avoir crédite plus qu\u2019il ne reste sur sa facture.',
    NUMBERED_CREDIT_NOTE_PENDING: ({ value }) => `L’avoir ${value} porte déjà un numéro\u00a0: terminez-le (ou corrigez-le) avant d’en créer un autre.`,
    NOT_SENDABLE: ({ value, documentType }) => {
      if (value === 'DELETED') return 'Ce document est supprimé\u00a0: restaurez-le pour l’envoyer.';
      if (value === 'CANCELLED') return 'Cette facture est annulée\u00a0: elle ne peut pas être envoyée.';
      return documentType === 'CREDIT_NOTE'
        ? 'Seul un avoir émis peut être envoyé\u00a0: émettez celui-ci d’abord.'
        : 'Seule une facture émise peut être envoyée\u00a0: émettez celle-ci d’abord.';
    },
    NO_PDF: ({ documentType }) =>
      documentType === 'QUOTE' ? 'Ce devis n’a pas encore de PDF\u00a0: générez-le d’abord.' : 'Ce document n’a pas de PDF à joindre.',
    NO_MAILBOX: ({ field }) =>
      field === 'from'
        ? 'La boîte mail choisie n’est plus connectée à Twenty\u00a0: fermez ce formulaire et rouvrez-le.'
        : 'Aucune boîte mail n’est connectée à Twenty à votre nom\u00a0: connectez la vôtre dans Paramètres → Comptes, puis rouvrez ce formulaire.',
    MISSING_RECIPIENT: () => 'Indiquez l’adresse du destinataire.',
    INVALID_RECIPIENT: ({ value }) => `${value} n’est pas une adresse e-mail.`,
    TOO_MANY_RECIPIENTS: ({ value }) => `Un e-mail part vers ${value} adresses au plus.`,
    MISSING_SUBJECT: () => 'Indiquez un objet.',
    MISSING_MESSAGE: () => 'Écrivez un message.',
    EMAIL_NOT_ALLOWED: () =>
      'Votre rôle ne permet pas d’envoyer des e-mails\u00a0: un administrateur peut l’autoriser dans Paramètres → Rôles, sous votre rôle, «\u00a0Send email\u00a0».',
    SEND_FAILED: ({ value }) => (value ? `L’e-mail n’a pas pu être envoyé\u00a0: ${value}` : 'L’e-mail n’a pas pu être envoyé.'),
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
  emails,
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
        DRAFT: `${kind === 'INVOICE' ? 'Une facture émise' : 'Un avoir émis'} ne peut pas revenir au statut Brouillon.`,
        CANCEL: 'Une facture numérotée s’annule par un avoir.',
        INVOICED: 'Un devis passe au statut Facturé quand il devient une facture.',
        NOT_ISSUED: 'Seule une facture émise peut être Envoyée ou Payée.',
        UNINVOICE: 'Ce devis a une facture et reste Facturé\u00a0: supprimez la facture pour rouvrir le devis.',
        UNCANCEL: 'Cette facture est annulée par ses avoirs\u00a0: elle reste Annulée.',
      }[rule];
      return `${why} Le statut a été remis à ${back}.`;
    },
    createdAsDraft: (kind, status) => `${thisOne[kind]} commence comme brouillon\u00a0: son statut ${status} a été remis à Brouillon.`,
    ledgerDuplicateRemoved: 'Une séquence de numérotation existe déjà pour cet émetteur, ce type de document et cette période\u00a0: celle-ci a été supprimée.',
    ledgerChangePutBack: (fields) =>
      `Cette séquence a déjà attribué des numéros\u00a0: son émetteur, son type et sa période sont fixés, et son dernier numéro ne peut que monter. La modification de ${list(fields)} a été annulée.`,
    ledgerRestored: 'Cette séquence a déjà attribué des numéros et ne peut pas être supprimée\u00a0: elle a été restaurée.',
    invoiceCreated: 'Facture brouillon créée à partir de ce devis.',
    creditNoteCreated: (invoiceNumber) => `Avoir brouillon créé pour ${invoiceNumber}.`,
    cancelledBy: (invoiceNumber, creditNoteNumber) => `${invoiceNumber} est annulée par l’avoir ${creditNoteNumber}.`,
    alreadyCredited: (invoiceNumber) => `${invoiceNumber} est annulée\u00a0: ses avoirs la créditent déjà entièrement.`,
    invoiceNowCancelled: (invoiceNumber) => `La facture ${invoiceNumber} est maintenant annulée.`,
    cancellationReason: (invoiceNumber) => `Annulation de la facture ${invoiceNumber}`,
    invoicedTimeline: (subject) =>
      subject ? `Facture brouillon «\u00a0${subject}\u00a0» créée à partir de ce devis.` : 'Facture brouillon créée à partir de ce devis.',
    creditedTimeline: (creditNoteNumber, total) => `Avoir ${creditNoteNumber} émis sur cette facture, pour ${total}.`,
    cancelledTimeline: (creditNoteNumber) => `Annulée par l’avoir ${creditNoteNumber}.`,
    quoteReopened: 'La facture brouillon issue de ce devis a été supprimée\u00a0: le devis est de nouveau Accepté.',
    quoteReinvoiced: 'La facture issue de ce devis a été restaurée\u00a0: le devis est de nouveau Facturé.',
    sentTo: (to) => `E-mail envoyé à ${list(to)}.`,
    sentNotMarked: (to, kind, ref) => `E-mail envoyé à ${list(to)}, mais ${notMarked[kind]} (réf. ${ref}).`,
    sentTimeline: (to, cc, from) => `E-mail envoyé depuis ${from} à ${list(to)}${cc.length > 0 ? `, en copie à ${list(cc)}` : ''}.`,
  },
};
