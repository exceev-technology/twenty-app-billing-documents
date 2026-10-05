import type { EmailFacts, EmailTemplate, EmailWords, LifecyclePack, StatusKey } from './pack.ts';

// The units and the email follow the DOCUMENT's language (map.ts, email.ts);
// the problems, statuses and messages follow the language of the person using Twenty (packFor).
// Sentences avoid naming the document's gender where they can: فاتورة is feminine, عرض سعر and
// إشعار دائن are masculine.

const statuses: Record<StatusKey, string> = {
  DRAFT: 'مسودة', ISSUED: 'تم الإصدار', SENT: 'تم الإرسال', PAID: 'تم السداد', CANCELLED: 'ملغاة',
  ACCEPTED: 'مقبول', DECLINED: 'مرفوض', EXPIRED: 'منتهي الصلاحية', INVOICED: 'تمت فوترته',
};

const statusName = (value?: string): string => (value && value in statuses ? statuses[value as StatusKey] : value ?? '');
const party = (field?: string): string => (field === 'buyer' ? 'العميل' : 'البائع');
const kinds = { QUOTE: 'عرض السعر', INVOICE: 'الفاتورة', CREDIT_NOTE: 'الإشعار الدائن' } as const;
/** Names joined the Arabic way: the conjunction و joins the word after it. */
const list = (names: readonly string[]): string => names.join(' و');
const correct = (kind: keyof typeof kinds): string =>
  kind === 'CREDIT_NOTE' ? 'الإشعار الدائن الصادر لا يمكن تغييره.' : 'التصحيح يكون بإشعار دائن.';

/** The greeting names the billed person when there is one. */
const greeting = (buyer: string | null): string => (buyer ? `مرحبًا ${buyer}` : 'مرحبًا');
const signed = (seller: string): string => (seller ? `مع خالص التحية\n${seller}` : 'مع خالص التحية');
const bySeller = (seller: string): string => (seller ? ` من ${seller}` : '');
const amount = (total: string | null): string => (total ? ` بقيمة ${total}` : '');
const quoteName = ({ number, version }: EmailFacts): string => (version !== null && version > 1 ? `${number} (النسخة ${version})` : number);
/** A greeting, the paragraphs, and the seller's signature, a blank line apart. */
const letter = (facts: EmailFacts, body: string): string => [greeting(facts.buyer), body, signed(facts.seller)].join('\n\n');

const emails: Record<EmailTemplate, EmailWords> = {
  INVOICE: {
    subject: (facts) => `فاتورة ${facts.number}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(facts, `مرفق الفاتورة رقم ${facts.number}${amount(facts.total)}${facts.dueDate ? ` وتاريخ استحقاقها ${facts.dueDate}` : ''}.`),
  },
  REMINDER: {
    subject: (facts) => `تذكير: الفاتورة ${facts.number}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(
        facts,
        `الفاتورة رقم ${facts.number}${amount(facts.total)} ${facts.dueDate ? `كان تاريخ استحقاقها ${facts.dueDate}` : 'تأخر سدادها'} ولم يصلنا السداد حتى الآن. نرفقها لكم مرة أخرى.\n\nإذا كنتم سددتموها بالفعل فبرجاء تجاهل هذه الرسالة.`,
      ),
  },
  CREDIT_NOTE: {
    subject: (facts) => `إشعار دائن ${facts.number}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(facts, `مرفق الإشعار الدائن رقم ${facts.number}${amount(facts.total)}${facts.corrects ? ` لتصحيح الفاتورة ${facts.corrects}` : ''}.`),
  },
  QUOTE: {
    subject: (facts) => `عرض سعر ${quoteName(facts)}${bySeller(facts.seller)}`,
    message: (facts) =>
      letter(facts, `مرفق عرض السعر رقم ${quoteName(facts)}${amount(facts.total)}${facts.validUntil ? ` وهو صالح حتى ${facts.validUntil}` : ''}.`),
  },
};

export const ar: LifecyclePack = {
  code: 'AR',
  problems: {
    NOT_ALLOWED: () => 'صلاحياتك لا تسمح بتعديل هذا المستند ولذلك لا يمكن تنفيذ هذا الإجراء.',
    WRONG_STATUS: ({ value }) => `هذا الإجراء يحتاج مسودة. حالة هذا المستند: ${statusName(value)}.`,
    ALREADY_ISSUED: ({ value }) => `هذا المستند صادر بالفعل برقم ${value}.`,
    MISSING_ISSUER: () => 'اختر جهة الإصدار.',
    MISSING_PROFILE: () => 'جهة الإصدار ليس لها ملف فوترة. اختر ملفًا من صفحة جهة الإصدار.',
    MISSING_BUYER: () => 'اختر الشركة أو الشخص الموجّه له المستند.',
    MISSING_CURRENCY: () => 'حدد العملة في المستند أو في جهة الإصدار أو في ملف الفوترة.',
    MISSING_IDENTIFIER: ({ field, value }) => `${party(field)} ليس له ${value}.`,
    INVALID_IDENTIFIER: ({ field, value }) => `صيغة ${value} لدى ${party(field)} غير صحيحة.`,
    IDENTIFIER_OWNER: ({ value }) => `المعرّف ${value} مرتبط بأكثر من سجل. أبقِ واحدًا فقط.`,
    MISSING_INVOICE: () => 'اختر الفاتورة التي يصححها هذا الإشعار الدائن.',
    INVOICE_NOT_ISSUED: () => 'الفاتورة التي يصححها هذا الإشعار الدائن لم تصدر بعد.',
    INVOICE_MISMATCH: ({ field }) =>
      field === 'currencyCode'
        ? 'الفاتورة التي يصححها هذا الإشعار الدائن بعملة مختلفة.'
        : 'الفاتورة التي يصححها هذا الإشعار الدائن لها جهة إصدار مختلفة.',
    DATE_IN_FUTURE: ({ value }) => `تاريخ الإصدار ${value} بعد تاريخ اليوم.`,
    DATE_BEFORE_LAST: ({ value }) => `تاريخ الإصدار قبل ${value} وهو تاريخ آخر مستند مرقّم في نفس التسلسل.`,
    DUE_BEFORE_ISSUE: () => 'تاريخ الاستحقاق قبل تاريخ الإصدار.',
    CLOCK_SKEW: () => 'تاريخ جهازك يختلف عن تاريخ الخادم بأكثر من يوم. راجع تاريخ الجهاز ووقته.',
    LEDGER_BEHIND: ({ value, documentType }) =>
      `تسلسل ترقيم ${documentType ? kinds[documentType] : 'المستندات'} لدى ${value} متأخر كثيرًا عن الأرقام المستخدمة بالفعل. ارفع آخر رقم فيه.`,
    HELD_NUMBER_ELSEWHERE: ({ value }) =>
      `هذا المستند يحمل بالفعل الرقم ${value} تحت جهة إصدار أو فترة أخرى. أرجع جهة الإصدار وتاريخ الإصدار لاستخدامه.`,
    QUOTE_NOT_OPEN: ({ value }) => `حالة عرض السعر: ${statusName(value)}. لا يتحول إلى فاتورة إلا عرض مسودة أو مرسل أو مقبول.`,
    ALREADY_INVOICED: ({ value }) =>
      value
        ? `لعرض السعر هذا فاتورة بالفعل هي ${value}. أكملها أو احذفها لتبدأ من جديد.`
        : 'لعرض السعر هذا فاتورة بالفعل. أكملها أو احذفها لتبدأ من جديد.',
    NOT_ISSUED: () => 'هذه الفاتورة لم تصدر بعد. المسودة تُصحح بتعديلها مباشرة.',
    INVOICE_CANCELLED: ({ field }) =>
      field === 'invoiceId'
        ? 'الفاتورة التي يصححها هذا الإشعار الدائن ملغاة ولم يبق فيها ما يُخصم.'
        : 'هذه الفاتورة ملغاة ولم يبق فيها ما يُخصم.',
    NOTHING_TO_CREDIT: () => 'كل ما في هذه الفاتورة تم خصمه بالفعل.',
    REMAINDER_UNKNOWN: () =>
      'إشعار دائن على هذه الفاتورة غيّر سعرًا أو أضاف بندًا ولذلك لا يمكن حساب المتبقي. استخدم "إشعار دائن" وعدّله بنفسك.',
    OVER_CREDIT: ({ value }) =>
      value ? `هذا الإشعار الدائن يخصم أكثر من المتبقي في فاتورته (البند ${value}).` : 'هذا الإشعار الدائن يخصم أكثر من المتبقي في فاتورته.',
    NUMBERED_CREDIT_NOTE_PENDING: ({ value }) => `الإشعار الدائن ${value} يحمل رقمًا بالفعل. أكمله أو صحّحه قبل إنشاء إشعار آخر.`,
    NOT_SENDABLE: ({ value, documentType }) => {
      if (value === 'DELETED') return 'هذا المستند محذوف. استرجعه لإرساله.';
      if (value === 'CANCELLED') return 'هذه الفاتورة ملغاة ولا يمكن إرسالها.';
      return documentType === 'CREDIT_NOTE'
        ? 'لا يُرسل إلا إشعار دائن صادر. أصدر هذا الإشعار أولًا.'
        : 'لا تُرسل إلا فاتورة صادرة. أصدر هذه الفاتورة أولًا.';
    },
    NO_PDF: ({ documentType }) => (documentType === 'QUOTE' ? 'لا يوجد ملف PDF لعرض السعر بعد. أنشئه أولًا.' : 'لا يوجد ملف PDF لهذا المستند لإرفاقه.'),
    NO_MAILBOX: ({ field }) =>
      field === 'from'
        ? 'صندوق البريد المختار لم يعد متصلًا بـ Twenty. أغلق هذا النموذج وافتحه من جديد.'
        : 'لا يوجد صندوق بريد متصل بـ Twenty. اربط بريدك من الإعدادات ثم الحسابات وافتح النموذج من جديد.',
    MISSING_RECIPIENT: () => 'أضف عنوان المرسل إليه.',
    INVALID_RECIPIENT: ({ value }) => (value ? `${value} ليس عنوان بريد إلكتروني.` : 'أحد العناوين ليس عنوان بريد إلكتروني.'),
    TOO_MANY_RECIPIENTS: ({ value }) => (value ? `الحد الأقصى لعناوين الرسالة الواحدة: ${value}.` : 'هذه الرسالة فيها عناوين كثيرة.'),
    MISSING_SUBJECT: () => 'اكتب موضوعًا.',
    MISSING_MESSAGE: () => 'اكتب الرسالة.',
    EMAIL_NOT_ALLOWED: () => 'دورك لا يسمح بإرسال البريد. يمكن للمسؤول السماح بذلك من الإعدادات ثم الأدوار بخيار "Send email" في دورك.',
    SEND_FAILED: ({ value }) => (value ? `تعذّر إرسال البريد: ${value}` : 'تعذّر إرسال البريد.'),
  },
  renderProblems: {
    UNSUPPORTED_SCRIPT: ({ field, value }) => `بعض الحروف لا يمكن طباعتها بخط ملف PDF (${field}): ${value}`,
    UNSUPPORTED_IMAGE: () => 'شعار جهة الإصدار ليس صورة PNG أو JPEG أو أن الملف تالف.',
    UNKNOWN_TEMPLATE: ({ value }) => `قالب جهة الإصدار ${value} غير معروف لهذا التطبيق.`,
    UNKNOWN_LANGUAGE: ({ value }) => `لا يمكن طباعة المستندات بلغة ${value} حتى الآن.`,
    QR_PAYLOAD_TOO_LONG: ({ value }) => `رمز QR يحمل بيانات أكثر من أن تُطبع بوضوح (${value}).`,
    MISSING_TAX_NAME: () => 'أحد الرموز الضريبية في هذا المستند بدون اسم.',
    INVALID_LOCALE: ({ value }) => `الإعدادات الإقليمية لملف الفوترة (${value}) ليست رمز لغة صحيحًا مثل ar-EG.`,
    INVALID_DATE: ({ field, value }) => `${value} ليس تاريخًا صحيحًا (${field}).`,
    INVALID_CURRENCY: ({ value }) => `${value} ليس رمز عملة.`,
    QR_BASE_URL_MISSING: () => 'ملف الفوترة يطبع رابط QR لكن جهة الإصدار ليس لها رابط تحقق.',
    QR_PAYLOAD_EMPTY: () => 'رمز QR سيكون فارغًا.',
  },
  units: {
    UNIT: 'وحدة', HOUR: 'ساعة', DAY: 'يوم', WEEK: 'أسبوع', MONTH: 'شهر', YEAR: 'سنة',
    KG: 'كجم', G: 'جم', TONNE: 'طن', M: 'م', KM: 'كم', M2: 'م²', M3: 'م³', LITRE: 'لتر', KWH: 'كيلووات ساعة',
    FLAT_FEE: 'مبلغ مقطوع', PACKAGE: 'باقة',
  },
  fields: {
    subject: 'الموضوع', issuerId: 'جهة الإصدار', companyId: 'الشركة', personId: 'الشخص', issueDate: 'تاريخ الإصدار',
    dueDate: 'تاريخ الاستحقاق', currencyCode: 'العملة', pricesIncludeTax: 'الأسعار شاملة الضريبة', language: 'اللغة',
    notes: 'الملاحظات', buyerReference: 'مرجع العميل', invoiceId: 'الفاتورة', reason: 'السبب',
    documentType: 'نوع المستند', periodKey: 'الفترة', lastValue: 'آخر رقم',
  },
  statuses,
  kinds,
  emails,
  messages: {
    previewReady: 'المعاينة جاهزة في حقل ملف PDF.',
    issued: (_kind, number) => `تم الإصدار برقم ${number}.`,
    quotePdf: (number, version) => `عرض السعر ${number} النسخة ${version}: الملف في حقل ملف PDF.`,
    unexpected: (ref) => `حدث خطأ غير متوقع (المرجع ${ref}).`,
    fieldsPutBack: (kind, fields) => `تم إصدار ${kinds[kind]} ولذلك أُلغي تغيير ${list(fields)}. ${correct(kind)}`,
    lineChangePutBack: (kind) => `تم إصدار ${kinds[kind]} ولذلك أُلغي التغيير على البند. ${correct(kind)}`,
    lineAddedRemoved: (kind) => `تم إصدار ${kinds[kind]} ولذلك حُذف البند المضاف. ${correct(kind)}`,
    lineDeletedRestored: (kind) => `تم إصدار ${kinds[kind]} ولذلك استُرجع البند المحذوف. ${correct(kind)}`,
    lineMoveReverted: (kind) => `تم إصدار ${kinds[kind]} ولذلك أُعيد البند المنقول إلى مكانه. ${correct(kind)}`,
    documentRestored: (_kind, number) => `هذا المستند يحمل الرقم ${number} ولذلك لا يمكن حذفه. تم استرجاعه.`,
    statusPutBack: (rule, kind, back) => {
      const why = {
        ISSUE: `إجراء "إصدار" وحده هو الذي يُصدر ${kinds[kind]}.`,
        DRAFT: 'المستند الصادر لا يعود إلى مسودة.',
        CANCEL: 'المستند المرقّم يُلغى بإشعار دائن.',
        INVOICED: `يصبح عرض السعر "${statuses.INVOICED}" عند تحويله إلى فاتورة.`,
        NOT_ISSUED: `لا تأخذ حالة "${statuses.SENT}" أو "${statuses.PAID}" إلا فاتورة صادرة.`,
        UNINVOICE: `لعرض السعر هذا فاتورة ولذلك تبقى حالته "${statuses.INVOICED}". احذف الفاتورة لإعادة فتح العرض.`,
        UNCANCEL: 'هذه الفاتورة ملغاة بإشعاراتها الدائنة ولذلك تبقى ملغاة.',
      }[rule];
      return `${why} أُعيدت الحالة إلى ${back}.`;
    },
    createdAsDraft: (_kind, status) => `أي مستند جديد يبدأ مسودة. تم تغيير الحالة ${status} إلى مسودة.`,
    ledgerDuplicateRemoved: 'يوجد بالفعل تسلسل ترقيم لنفس جهة الإصدار ونوع المستند والفترة. تم حذف هذا التسلسل.',
    ledgerChangePutBack: (fields) =>
      `هذا التسلسل أعطى أرقامًا بالفعل. جهة الإصدار ونوع المستند والفترة ثابتة وآخر رقم لا يمكن إلا أن يزيد. تم إلغاء تغيير ${list(fields)}.`,
    ledgerRestored: 'هذا التسلسل أعطى أرقامًا بالفعل ولذلك لا يمكن حذفه. تم استرجاعه.',
    invoiceCreated: 'تم إنشاء مسودة فاتورة من عرض السعر هذا.',
    creditNoteCreated: (invoiceNumber) => `تم إنشاء مسودة إشعار دائن للفاتورة ${invoiceNumber}.`,
    cancelledBy: (invoiceNumber, creditNoteNumber) => `الفاتورة ${invoiceNumber} ملغاة بالإشعار الدائن ${creditNoteNumber}.`,
    alreadyCredited: (invoiceNumber) => `الفاتورة ${invoiceNumber} ملغاة لأن إشعاراتها الدائنة تغطي قيمتها كلها.`,
    invoiceNowCancelled: (invoiceNumber) => `الفاتورة ${invoiceNumber} أصبحت ملغاة.`,
    cancellationReason: (invoiceNumber) => `إلغاء الفاتورة ${invoiceNumber}`,
    invoicedTimeline: (subject) => (subject ? `تم إنشاء مسودة الفاتورة "${subject}" من عرض السعر هذا.` : 'تم إنشاء مسودة فاتورة من عرض السعر هذا.'),
    creditedTimeline: (creditNoteNumber, total) => `تم إصدار الإشعار الدائن ${creditNoteNumber} على هذه الفاتورة بقيمة ${total}.`,
    cancelledTimeline: (creditNoteNumber) => `أُلغيت بالإشعار الدائن ${creditNoteNumber}.`,
    quoteReopened: `تم حذف مسودة الفاتورة المنشأة من عرض السعر هذا. عاد العرض إلى حالة "${statuses.ACCEPTED}".`,
    quoteReinvoiced: `تم استرجاع الفاتورة المنشأة من عرض السعر هذا. عاد العرض إلى حالة "${statuses.INVOICED}".`,
    sentTo: (to) => `تم الإرسال إلى ${list(to)}.`,
    sentNotMarked: (to, kind, ref) => `تم الإرسال إلى ${list(to)} لكن تعذّر تسجيل الإرسال على ${kinds[kind]} (المرجع ${ref}).`,
    sendUnknown: (ref) => `ربما أُرسل البريد بالفعل. راجع صندوق المرسل قبل المحاولة مرة أخرى (المرجع ${ref}).`,
    sentTimeline: (to, cc, from) => `تم إرسال بريد من ${from} إلى ${list(to)}${cc.length > 0 ? ` مع نسخة إلى ${list(cc)}` : ''}.`,
  },
};
