import type { LanguagePack } from './pack.ts';

export const fr: LanguagePack = {
  code: 'FR',
  titles: { QUOTE: 'Devis', INVOICE: 'Facture', CREDIT_NOTE: 'Avoir' },
  draft: 'BROUILLON',
  labels: {
    number: 'Numéro', issueDate: 'Date', dueDate: 'Échéance', validUntil: 'Valable jusqu’au',
    version: 'Version', subject: 'Objet', notes: 'Notes',
    from: 'Émetteur', billTo: 'Client', reference: 'Votre référence',
    description: 'Désignation', quantity: 'Qté', unit: 'Unité', unitPrice: 'Prix unitaire',
    discount: 'Remise', tax: 'TVA', lineTotal: 'Montant', period: 'Période',
    taxRecap: 'Récapitulatif de TVA', rate: 'Taux', taxableBase: 'Base', taxAmount: 'TVA',
    subtotal: 'Total HT', discountTotal: 'Remise', taxTotal: 'TVA', total: 'Total TTC',
    amountInWords: 'Montant en lettres', pricesIncludeTax: 'Prix taxe comprise',
    paymentDetails: 'Coordonnées bancaires', page: 'Page', line: 'ligne',
  },
  problems: {
    NO_LINES: 'Ce document n’a aucune ligne.',
    INVALID_CURRENCY: 'Le code devise n’est pas composé de trois majuscules.',
    CURRENCY_MISMATCH: 'Une ligne est libellée dans une autre devise que le document.',
    MISSING_TAX_CODE: 'Une ligne n’a pas de code de taxe.',
    INVALID_QUANTITY: 'Une quantité a plus de trois décimales, ou n’est pas un nombre.',
    INVALID_RATE: 'Un taux de taxe est négatif ou a plus de quatre décimales.',
    INVALID_DISCOUNT: 'Une remise sort de 0 à 100 pour cent, ou a plus de deux décimales.',
    INVALID_AMOUNT: 'Un prix unitaire est absent, n’est pas un nombre, ou n’est pas un entier de micros.',
    AMOUNT_TOO_LARGE: 'Les montants dépassent ce que cette application calcule exactement.',
    MISSING_TAX_RATE: 'Un code de taxe normal ou réduit n’a pas de taux.',
    TAX_CODE_CONFLICT: 'Deux lignes utilisent le même code de taxe avec des taux différents.',
    INVALID_PATTERN: 'Le format de numérotation n’est pas valide.',
    PATTERN_REPEATS_NUMBERS: 'Ce format de numérotation répéterait des numéros à chaque remise à zéro.',
  },
};
