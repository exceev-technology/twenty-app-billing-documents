import type { LanguagePack } from './pack.ts';

/** The dual and the plural of the units lifecycle/lang/ar.ts prints; an abbreviation (كجم, م²) has none. */
const UNIT_FORMS: Record<string, { two: string; few: string }> = {
  'وحدة': { two: 'وحدتان', few: 'وحدات' },
  'ساعة': { two: 'ساعتان', few: 'ساعات' },
  'يوم': { two: 'يومان', few: 'أيام' },
  'أسبوع': { two: 'أسبوعان', few: 'أسابيع' },
  'شهر': { two: 'شهران', few: 'أشهر' },
  'سنة': { two: 'سنتان', few: 'سنوات' },
  'طن': { two: 'طنان', few: 'أطنان' },
  'لتر': { two: 'لتران', few: 'لترات' },
  'باقة': { two: 'باقتان', few: 'باقات' },
};

/** 1 and 11 or more take the singular, 2 the dual, 3 to 10 the plural; a fraction takes the singular. */
function countedUnit(quantity: number, unit: string): string {
  const forms = UNIT_FORMS[unit];
  if (!forms || !Number.isInteger(quantity)) return unit;
  const rest = Math.abs(quantity) % 100;
  if (quantity === 2) return forms.two;
  if (rest >= 3 && rest <= 10) return forms.few;
  return unit;
}

// The words printed on an Arabic document, in the formal register
// Egyptian invoices use. The page is mirrored right to left (render/rtl.ts).
export const ar: LanguagePack = {
  code: 'AR',
  direction: 'rtl',
  countedUnit,
  numberLabels: { INVOICE: 'رقم الفاتورة', QUOTE: 'رقم العرض', CREDIT_NOTE: 'رقم الإشعار' },
  // An Egyptian invoice that charges VAT is a tax invoice.
  taxedTitles: { INVOICE: 'فاتورة ضريبية', CREDIT_NOTE: 'إشعار دائن ضريبي' },
  discountRows: { gross: 'الإجمالي قبل الخصم', discount: 'الخصم' },
  titles: { QUOTE: 'عرض سعر', INVOICE: 'فاتورة', CREDIT_NOTE: 'إشعار دائن' },
  draft: 'مسودة',
  colon: ': ',
  labels: {
    number: 'الرقم', issueDate: 'تاريخ الإصدار', dueDate: 'تاريخ الاستحقاق', validUntil: 'صالح حتى',
    version: 'النسخة', subject: 'الموضوع', notes: 'ملاحظات', correctsInvoice: 'الفاتورة الأصلية',
    from: 'من', billTo: 'إلى', reference: 'مرجع العميل',
    description: 'البيان', quantity: 'الكمية', unit: 'الوحدة', unitPrice: 'سعر الوحدة',
    discount: 'الخصم', tax: 'الضريبة', lineTotal: 'القيمة', period: 'الفترة',
    taxRecap: 'ملخص الضريبة', rate: 'النسبة', taxableBase: 'المبلغ الخاضع للضريبة', taxAmount: 'قيمة الضريبة',
    subtotal: 'الإجمالي قبل الضريبة', discountTotal: 'إجمالي الخصم', taxTotal: 'الضريبة', total: 'الإجمالي',
    amountInWords: 'المبلغ بالحروف', pricesIncludeTax: 'الأسعار شاملة الضريبة',
    paymentDetails: 'بيانات الدفع', page: 'صفحة', of: 'من', line: 'السطر',
  },
  problems: {
    NO_LINES: 'المستند ليس فيه أي بند.',
    INVALID_CURRENCY: 'رمز العملة ليس ثلاثة أحرف لاتينية كبيرة.',
    CURRENCY_MISMATCH: 'أحد البنود مسعّر بعملة غير عملة المستند.',
    MISSING_TAX_CODE: 'أحد البنود ليس له رمز ضريبي.',
    INVALID_QUANTITY: 'الكمية فيها أكثر من ثلاثة أرقام عشرية أو ليست رقمًا.',
    INVALID_RATE: 'نسبة الضريبة سالبة أو فيها أكثر من أربعة أرقام عشرية.',
    INVALID_DISCOUNT: 'الخصم خارج المدى من 0 إلى 100 في المئة أو فيه أكثر من رقمين عشريين.',
    INVALID_AMOUNT: 'سعر الوحدة غير موجود أو ليس رقمًا صالحًا.',
    AMOUNT_TOO_LARGE: 'الأرقام أكبر من أن يحسبها التطبيق بدقة.',
    MISSING_TAX_RATE: 'رمز ضريبي عادي أو مخفض ليس له نسبة.',
    TAX_CODE_CONFLICT: 'بندان يستخدمان نفس الرمز الضريبي بنسبتين مختلفتين.',
    INVALID_PATTERN: 'نمط الترقيم غير صالح.',
    PATTERN_REPEATS_NUMBERS: 'نمط الترقيم هذا سيكرر الأرقام عند إعادة بدء التسلسل.',
  },
};
