// Arabic documents: render/pdf.ts (fonts, visual order), render/glyphs.ts
// (detection, drawable check, widths), render/rtl.ts (the mirror), blocks.ts (line breaks),
// render/format.ts (amount in words), and the Arabic packs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forScript, toPdf, visualOrder, visualRuns } from '../../render/pdf.ts';
import { hasArabic, inTajawal, isArabic, textWidth, undrawable } from '../../render/glyphs.ts';
import { mirrored } from '../../render/rtl.ts';
import { amountInWords } from '../../render/format.ts';
import { checkRender, definitionFor, renderDocument } from '../../render/document.ts';
import { PACKS } from '../../render/lang/pack.ts';
import { PACKS as LIFECYCLE, packFor } from '../../lifecycle/lang/pack.ts';
import { localeOf } from '../../lifecycle/map.ts';
import { mockInvoice } from '../../render/samples/mock.ts';
import type { PdfDefinition, RenderInput } from '../../render/types.ts';

type Node = Record<string, unknown>;

/** The sample invoice, in Arabic, for an Egyptian buyer. */
const arabicInvoice = (description = 'تصميم الصفحة الرئيسية'): RenderInput => {
  const input = mockInvoice();
  return {
    ...input,
    language: 'AR',
    locale: 'ar-EG',
    subject: 'تصميم وتطوير موقع الشركة',
    notes: 'شكرًا لتعاملكم معنا.',
    buyer: { ...input.buyer, name: 'شركة تجريبية', addressLines: ['الإسكندرية'] },
    lines: input.lines.map((line, index) => (index === 0 ? { ...line, description, unit: 'يوم' } : line)),
  };
};

/** Every string under a `text` key, in document order. */
function texts(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((child) => texts(child, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'text' && typeof value === 'string') found.push(value);
      else texts(value, found);
    }
  }
  return found;
}

test('visual order reverses Arabic words but keeps a left-to-right run in its own order', () => {
  assert.equal(visualOrder('فاتورة رقم INV-2026-0001 لشركة تجريبية'), 'تجريبية لشركة INV-2026-0001 رقم فاتورة');
  assert.equal(visualOrder('تصميم موقع Mahmoud Abas للعميل'), 'للعميل Mahmoud Abas موقع تصميم');
  assert.equal(visualOrder('Website development'), 'Website development');
  assert.equal(visualOrder('تصميم   موقع'), 'موقع تصميم');
});

test('visual order keeps the spaces at either end, and a no-break space parts words too', () => {
  assert.equal(visualOrder(' الرقم: '), ' الرقم: ');
  assert.equal(visualOrder('6,000.00\u00a0ج.م'), 'ج.م 6,000.00');
});

test('each space between words is a run of its own: the shaper would move a space inside an Arabic word to its other side', () => {
  assert.deepEqual(visualRuns('تصميم الصفحة الرئيسية'), ['الرئيسية', ' ', 'الصفحة', ' ', 'تصميم']);
  assert.deepEqual(visualRuns(' الرقم: '), [' ', 'الرقم:', ' ']);
  assert.deepEqual(visualRuns('Website development'), ['Website development']);
});

test('an Arabic run prints in Tajawal in visual order; a Latin run beside it keeps Roboto', () => {
  const definition = {
    content: [{ text: 'تصميم الصفحة الرئيسية', fontSize: 9 }, { text: 'Website development' }, { text: [{ text: 'الموضوع: ' }, 'Brand'] }],
    defaultStyle: { font: 'Roboto' },
  } as unknown as PdfDefinition;
  const out = forScript(definition) as unknown as { content: Node[]; defaultStyle: Node };
  assert.deepEqual(out.content[0], { text: ['الرئيسية', ' ', 'الصفحة', ' ', 'تصميم'], fontSize: 9, font: 'Tajawal' });
  assert.deepEqual(out.content[1], { text: 'Website development' });
  assert.deepEqual(out.content[2], { text: [{ text: ['الموضوع:', ' '], font: 'Tajawal' }, 'Brand'] });
  assert.equal(out.defaultStyle.font, 'Roboto');
});

test('on an Arabic page Latin runs share Tajawal, and only a letter Tajawal lacks brings Roboto back', () => {
  const definition = { content: [{ text: 'فاتورة' }, { text: 'INV-1' }, { text: 'Ğalata' }], defaultStyle: { font: 'Tajawal' } } as unknown as PdfDefinition;
  const out = forScript(definition) as unknown as { content: Node[] };
  assert.deepEqual(out.content[1], { text: 'INV-1' });
  assert.deepEqual(out.content[2], { text: 'Ğalata', font: 'Roboto' });
});

test('a document without Arabic is returned as it was', () => {
  const definition = { content: [{ text: 'Website development' }] } as unknown as PdfDefinition;
  assert.equal(forScript(definition), definition);
});

test('binary data and functions inside an Arabic document pass through, and the footer is treated when drawn', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const layout = () => 1;
  const definition = {
    content: [{ text: 'فاتورة', image: bytes, layout }],
    footer: () => ({ text: 'صفحة 1 من 1' }),
  } as unknown as PdfDefinition;
  const out = forScript(definition) as unknown as { content: Node[]; footer: () => Node };
  assert.equal(out.content[0]!.image, bytes);
  assert.equal(out.content[0]!.layout, layout);
  assert.deepEqual(out.footer(), { text: ['1', ' ', 'من', ' ', '1', ' ', 'صفحة'], font: 'Tajawal' });
});

test('a run is Arabic by its Unicode block; it must then be drawable in Tajawal, while a Latin run is checked against Roboto', () => {
  assert.equal(isArabic(0x0627), true);
  assert.equal(isArabic(0x06f4), true);
  assert.equal(inTajawal(0x0664), true);
  assert.equal(inTajawal(0x06f4), false);
  assert.equal(hasArabic('INV-2026-0001'), false);
  assert.equal(undrawable('فاتورة رقم ٤٢'), '');
  assert.equal(undrawable('۴'), '۴');
  // Tajawal has no Ğ, so an Arabic run with one cannot print; on its own, Roboto draws it.
  assert.equal(undrawable('شركة Ğalata'), 'Ğ');
  assert.equal(undrawable('Ğalata'), '');
});

test('an Arabic run is measured in Tajawal, each letter in the form its neighbours give it', () => {
  // ب is wide at the end of a word and narrow in the middle of one: three joined are far less than three alone.
  assert.ok(textWidth('ببب', 10) < 3 * textWidth('ب', 10));
  assert.ok(textWidth('ب ب ب', 10) > textWidth('ببب', 10));
  // A mark adds no width.
  assert.equal(textWidth('ألفًا', 10), textWidth('ألفا', 10));
});

test('the mirror reverses columns, cells, widths and runs, and swaps left and right', () => {
  const vLine = (index: number) => index;
  const page = mirrored({
    content: [
      { columns: [{ text: 'a' }, { text: 'b' }], margin: [1, 2, 3, 4] },
      { table: { widths: ['*', 'auto'], body: [[{ text: 'x' }, { text: 'y', alignment: 'right' }]] }, layout: { vLineWidth: vLine } },
      { text: [{ text: 'الرقم: ', color: 'grey' }, { text: 'INV-1' }] },
      { text: ['https://example.', 'com/a'] },
    ],
    footer: () => ({ columns: [{ text: 'left' }, { text: 'right', alignment: 'right' }] }),
  } as unknown as PdfDefinition) as unknown as { content: Node[]; defaultStyle: Node; footer: () => Node };
  assert.deepEqual(page.content[0], { columns: [{ text: 'b' }, { text: 'a' }], margin: [3, 2, 1, 4] });
  const table = page.content[1] as { table: { widths: string[]; body: Node[][] }; layout: { vLineWidth: (index: number, node: unknown) => number } };
  assert.deepEqual(table.table.widths, ['auto', '*']);
  assert.deepEqual(table.table.body[0], [{ text: 'y', alignment: 'left' }, { text: 'x' }]);
  // Rule 0 of the mirrored table is rule 2 of the original: the callback is asked about the other side.
  assert.equal(table.layout.vLineWidth(0, table), 2);
  assert.deepEqual(page.content[2], { text: [{ text: 'INV-1' }, { text: ' الرقم:', color: 'grey' }] });
  assert.deepEqual(page.content[3], { text: ['https://example.', 'com/a'] });
  assert.equal(page.defaultStyle.alignment, 'right');
  assert.deepEqual(page.footer(), { columns: [{ text: 'right', alignment: 'left' }, { text: 'left' }] });
});

test('the mirror reverses runs a line at a time: a line break keeps what follows it below', () => {
  const page = mirrored({ content: [{ text: [{ text: 'وصف البند' }, { text: '\nالفترة: 2026', color: 'grey' }] }] } as unknown as PdfDefinition) as unknown as { content: Node[] };
  assert.deepEqual(page.content[0], { text: [{ text: 'وصف البند' }, { text: '\nالفترة: 2026', color: 'grey' }] });
});

test('an Arabic document is mirrored, an English one is not', () => {
  const arabic = definitionFor(arabicInvoice()) as unknown as { content: Node[]; defaultStyle: Node };
  assert.equal(arabic.defaultStyle.alignment, 'right');
  const english = definitionFor(mockInvoice()) as unknown as { defaultStyle: Node };
  assert.equal(english.defaultStyle.alignment, undefined);
  // The sample charges VAT, so it is a tax invoice.
  assert.ok(texts(arabic.content).includes('فاتورة ضريبية'));
  assert.equal(arabic.defaultStyle.font, 'Tajawal');
  assert.equal(arabic.defaultStyle.lineHeight, 1.4);
});

test('a long Arabic description is broken into lines in reading order, each within the column, and no hint reaches pdfmake', () => {
  const long = 'تطوير لوحة التحكم الخاصة بإدارة الطلبات والعملاء مع ربطها ببوابة الدفع الإلكتروني وتقارير المبيعات الشهرية';
  const definition = definitionFor(arabicInvoice(long));
  // The mirror gives each line of the cell a run of its own; a run after the first starts with its break.
  const all = texts(definition);
  const at = all.findIndex((text) => text.startsWith('تطوير'));
  assert.ok(at >= 0, 'the description is not printed');
  const lines = [all[at]!];
  for (const text of all.slice(at + 1)) {
    if (!text.startsWith('\n')) break;
    lines.push(text.slice(1));
  }
  assert.ok(lines.length >= 2, 'the description was not broken into lines');
  assert.equal(lines.join(' '), long, 'a word was lost or moved');
  for (const line of lines) assert.ok(textWidth(line, 9) <= 515, `a line is wider than the page: ${line}`);
  assert.equal(JSON.stringify(definition).includes('wrapWidth'), false);
});

test('an English document is drawn exactly as before: no line is broken for it', () => {
  const english = texts(definitionFor(mockInvoice()));
  assert.equal(english.some((text) => text.includes('\n') && text.startsWith('Art direction')), false);
});

test('an Arabic invoice passes the render checks and becomes a PDF with both fonts in it', async () => {
  const input = arabicInvoice();
  assert.deepEqual(checkRender(input), []);
  const { bytes, pages } = await renderDocument(input);
  const raw = Buffer.from(bytes).toString('latin1');
  assert.equal(pages, 1);
  assert.ok(raw.includes('Tajawal'), 'the Tajawal font is not embedded');
  // Every letter of the sample is one Tajawal draws, so the page needs no second font.
  assert.equal(raw.includes('Roboto'), false, 'a Latin run fell back to Roboto without a reason');
  const withTurkish = await renderDocument({ ...input, seller: { ...input.seller, name: 'Ğalata Studio' } });
  assert.ok(Buffer.from(withTurkish.bytes).toString('latin1').includes('Roboto'), 'a letter Tajawal lacks did not bring Roboto back');
});

test('the Arabic totals show the discount as rows that add up, and the note under the total goes', () => {
  const input = arabicInvoice();
  // The sample's figures come from the engine; the discount only needs to be non-zero for the rows to show.
  const totals = { ...input.totals, discountTotalMicros: 312_000_000 };
  const printed = texts(definitionFor({ ...input, totals }));
  for (const label of ['الإجمالي قبل الخصم', 'الخصم', 'الإجمالي قبل الضريبة', 'الإجمالي']) assert.ok(printed.includes(label), label);
  assert.equal(printed.some((text) => text.includes('إجمالي الخصم')), false);
  // With tax-inclusive prices the rows would not add up, so the note stays.
  const inclusive = texts(definitionFor({ ...input, totals, pricesIncludeTax: true }));
  assert.equal(inclusive.includes('الإجمالي قبل الخصم'), false);
  assert.ok(inclusive.some((text) => text.includes('إجمالي الخصم')));
});

test('the Arabic number label names the document, a taxed invoice is a tax invoice, and the pound sign has no final period', () => {
  const printed = texts(definitionFor(arabicInvoice()));
  assert.ok(printed.some((text) => text.includes('رقم الفاتورة')));
  const untaxed = arabicInvoice();
  assert.ok(texts(definitionFor({ ...untaxed, totals: { ...untaxed.totals, taxTotalMicros: 0 } })).includes('فاتورة'));
  const egp = texts(definitionFor({ ...arabicInvoice(), currencyCode: 'EGP' }));
  assert.ok(egp.some((text) => text.endsWith('ج.م')), 'no amount ends with ج.م');
  assert.equal(egp.some((text) => text.includes('ج.م.')), false);
});

test('an Arabic run with a character Tajawal lacks is refused, naming the field', () => {
  const input = arabicInvoice();
  const first = checkRender({ ...input, buyer: { ...input.buyer, name: 'شركة Ğalata' } })[0];
  assert.deepEqual([first?.code, first?.field], ['UNSUPPORTED_SCRIPT', 'buyer.name']);
});

test('amounts in words in Arabic: the noun takes the form its number asks for', () => {
  const words = (value: number, code = 'EGP') => amountInWords(Math.round(value * 1_000_000), code, 'AR');
  assert.equal(words(6000), 'فقط ستة آلاف جنيه مصري لا غير');
  assert.equal(words(6500), 'فقط ستة آلاف وخمسمائة جنيه مصري لا غير');
  assert.equal(words(1), 'فقط جنيه مصري واحد لا غير');
  assert.equal(words(2), 'فقط جنيهان مصريان لا غير');
  assert.equal(words(3), 'فقط ثلاثة جنيهات مصرية لا غير');
  assert.equal(words(11), 'فقط أحد عشر جنيهًا مصريًا لا غير');
  assert.equal(words(21), 'فقط واحد وعشرون جنيهًا مصريًا لا غير');
  assert.equal(words(200), 'فقط مائتا جنيه مصري لا غير');
  assert.equal(words(2000), 'فقط ألفا جنيه مصري لا غير');
  assert.equal(words(11000), 'فقط أحد عشر ألف جنيه مصري لا غير');
  assert.equal(words(1_250_750), 'فقط مليون ومائتان وخمسون ألفًا وسبعمائة وخمسون جنيهًا مصريًا لا غير');
  assert.equal(words(15_903), 'فقط خمسة عشر ألفًا وتسعمائة وثلاثة جنيهات مصرية لا غير');
});

test('amounts in words in Arabic: a feminine minor unit, cents, and a currency with no words', () => {
  const words = (value: number, code: string) => amountInWords(Math.round(value * 1_000_000), code, 'AR');
  assert.equal(words(7000.5, 'SAR'), 'فقط سبعة آلاف ريال سعودي وخمسون هللة لا غير');
  assert.equal(words(0.03, 'SAR'), 'فقط ثلاث هللات لا غير');
  assert.equal(words(0.11, 'SAR'), 'فقط إحدى عشرة هللة لا غير');
  assert.equal(words(99.99, 'USD'), 'فقط تسعة وتسعون دولارًا أمريكيًا وتسعة وتسعون سنتًا لا غير');
  assert.equal(words(0.5, 'EGP'), 'فقط خمسون قرشًا لا غير');
  assert.equal(words(12.5, 'TRY'), 'فقط اثنا عشر TRY و50/100 لا غير');
  assert.equal(words(-3, 'EGP'), 'فقط سالب ثلاثة جنيهات مصرية لا غير');
  assert.equal(words(0, 'EGP'), 'فقط صفر جنيه مصري لا غير');
});

test('the Arabic packs: printed words, units and emails in Arabic, and ar-EG when the profile sets no locale', () => {
  assert.equal(PACKS.AR.direction, 'rtl');
  assert.equal(PACKS.EN.direction, 'ltr');
  assert.equal(PACKS.AR.titles.INVOICE, 'فاتورة');
  for (const value of Object.values(PACKS.AR.labels)) assert.ok(hasArabic(value), value);
  assert.equal(LIFECYCLE.AR.units.DAY, 'يوم');
  const facts = { number: 'INV-1', version: null, seller: 'استوديو', total: '6,000.00 ج.م.', dueDate: '04/11/2026', validUntil: null, corrects: null, buyer: null };
  assert.equal(LIFECYCLE.AR.emails.INVOICE.subject(facts), 'فاتورة INV-1 من استوديو');
  assert.ok(LIFECYCLE.AR.emails.INVOICE.message(facts).includes('مرفق الفاتورة رقم INV-1 بقيمة 6,000.00 ج.م. وتاريخ استحقاقها 04/11/2026.'));
  // What the person using Twenty reads follows their own locale: an Arabic locale gets the Arabic pack.
  assert.equal(packFor('ar-SA').code, 'AR');
  assert.equal(packFor('ar').code, 'AR');
  assert.equal(packFor('en-US').code, 'EN');
  assert.equal(localeOf('AR', null), 'ar-EG');
  assert.equal(localeOf('AR', { id: 'p', locale: 'ar-SA' }), 'ar-SA');
});

test('an Arabic unit takes the form its quantity asks for, on the printed line too', () => {
  const unit = PACKS.AR.countedUnit!;
  assert.deepEqual(
    [[1, 'يوم'], [2, 'يوم'], [3, 'يوم'], [10, 'ساعة'], [11, 'يوم'], [103, 'وحدة'], [1.5, 'ساعة'], [3, 'كجم']].map(([quantity, name]) => unit(quantity as number, name as string)),
    ['يوم', 'يومان', 'أيام', 'ساعات', 'يوم', 'وحدات', 'ساعة', 'كجم'],
  );
  assert.equal(PACKS.EN.countedUnit, undefined);
  // The sample's first line is 4 days.
  const printed = texts(definitionFor(arabicInvoice()));
  assert.ok(printed.some((text) => text.trim() === '4 أيام'), 'the quantity column does not print 4 أيام');
});

test('an Arabic document really renders to a PDF', async () => {
  const definition = { content: [{ text: 'تصميم الصفحة الرئيسية لشركة تجريبية' }] } as unknown as PdfDefinition;
  const bytes = await toPdf(definition, '2026-10-05');
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString('latin1'), '%PDF-');
  assert.ok(Buffer.from(bytes).toString('latin1').includes('Tajawal'), 'the Tajawal font is not embedded');
});

test('every message the Arabic UI shows is worded in Arabic', () => {
  const details = { field: 'buyer', value: 'X', documentType: 'INVOICE' as const };
  for (const [code, word] of Object.entries(LIFECYCLE.AR.problems)) assert.ok(hasArabic(word(details)), code);
  for (const [code, word] of Object.entries(LIFECYCLE.AR.renderProblems)) assert.ok(hasArabic(word(details)), code);
  for (const value of Object.values(LIFECYCLE.AR.statuses)) assert.ok(hasArabic(value), value);
  for (const value of Object.values(LIFECYCLE.AR.fields)) assert.ok(hasArabic(value), value);
  const m = LIFECYCLE.AR.messages;
  const samples: string[] = [
    m.previewReady, m.issued('INVOICE', 'INV-1'), m.quotePdf('Q-1', 2), m.unexpected('r1'), m.fieldsPutBack('INVOICE', ['الموضوع', 'العملة']),
    m.lineChangePutBack('QUOTE'), m.lineAddedRemoved('INVOICE'), m.lineDeletedRestored('INVOICE'), m.lineMoveReverted('CREDIT_NOTE'),
    m.documentRestored('INVOICE', 'INV-1'), m.statusPutBack('NOT_ISSUED', 'INVOICE', 'مسودة'), m.createdAsDraft('QUOTE', 'SENT'),
    m.ledgerDuplicateRemoved, m.ledgerChangePutBack(['الفترة']), m.ledgerRestored, m.invoiceCreated, m.creditNoteCreated('INV-1'),
    m.cancelledBy('INV-1', 'CN-1'), m.alreadyCredited('INV-1'), m.invoiceNowCancelled('INV-1'), m.cancellationReason('INV-1'),
    m.invoicedTimeline('x'), m.creditedTimeline('CN-1', '1.00'), m.cancelledTimeline('CN-1'), m.quoteReopened, m.quoteReinvoiced,
    m.sentTo(['a@b.c']), m.sentNotMarked(['a@b.c'], 'INVOICE', 'r'), m.sendUnknown('r'), m.sentTimeline(['a@b.c'], ['d@e.f'], 'me@x.y'),
  ];
  for (const text of samples) assert.ok(hasArabic(text), text);
  assert.equal(m.fieldsPutBack('INVOICE', ['الموضوع', 'العملة']), 'تم إصدار الفاتورة ولذلك أُلغي تغيير الموضوع والعملة. التصحيح يكون بإشعار دائن.');
});
