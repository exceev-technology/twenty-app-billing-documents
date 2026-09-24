import type { LanguagePack } from './pack.ts';

export const en: LanguagePack = {
  code: 'EN',
  titles: { QUOTE: 'Quote', INVOICE: 'Invoice', CREDIT_NOTE: 'Credit note' },
  draft: 'DRAFT',
  labels: {
    number: 'Number', issueDate: 'Issue date', dueDate: 'Due date', validUntil: 'Valid until',
    version: 'Version', subject: 'Subject', notes: 'Notes',
    from: 'From', billTo: 'Bill to', reference: 'Your reference',
    description: 'Description', quantity: 'Qty', unit: 'Unit', unitPrice: 'Unit price',
    discount: 'Discount', tax: 'Tax', lineTotal: 'Amount', period: 'Period',
    taxRecap: 'Tax summary', rate: 'Rate', taxableBase: 'Taxable amount', taxAmount: 'Tax',
    subtotal: 'Subtotal', discountTotal: 'Discount', taxTotal: 'Tax', total: 'Total',
    amountInWords: 'Amount in words', pricesIncludeTax: 'Prices include tax',
    paymentDetails: 'Payment details', page: 'Page', line: 'line',
  },
  problems: {
    NO_LINES: 'This document has no lines.',
    INVALID_CURRENCY: 'The currency code is not three capital letters.',
    CURRENCY_MISMATCH: 'A line is priced in another currency than the document.',
    MISSING_TAX_CODE: 'A line has no tax code.',
    INVALID_QUANTITY: 'A quantity has more than three decimals, or is not a number.',
    INVALID_RATE: 'A tax rate is negative or has more than four decimals.',
    INVALID_DISCOUNT: 'A discount is outside 0 to 100 percent, or has more than two decimals.',
    INVALID_AMOUNT: 'A unit price is missing, is not a number, or is not a whole number of micros.',
    AMOUNT_TOO_LARGE: 'The figures are larger than this app can compute exactly.',
    MISSING_TAX_RATE: 'A standard or reduced tax code has no rate.',
    TAX_CODE_CONFLICT: 'Two lines use the same tax code with different rates.',
    INVALID_PATTERN: 'The numbering pattern is not valid.',
    PATTERN_REPEATS_NUMBERS: 'This numbering pattern would repeat numbers when the sequence restarts.',
  },
};
