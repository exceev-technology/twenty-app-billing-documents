import { amountInWords, formatDate, formatMoney, formatPercent, formatQuantity } from './format.ts';
import type { LabelKey, LanguagePack } from './lang/pack.ts';
import type { Party, RenderInput, RenderLine } from './types.ts';

type Node = Record<string, unknown>;

export type Style = {
  /** Base font size; every other size is derived from it. */
  base: number;
  rules: boolean;
  dense: boolean;
  showBuyer: boolean;
  headerBand: boolean;
  sellerInFooter: boolean;
  narrow: boolean;
};

export const DEFAULT_ACCENT = '#1f2933';

/** The seller's colour when it is a hex triplet, the default ink otherwise. */
export const accentOf = (input: RenderInput): string =>
  /^#[0-9a-fA-F]{6}$/.test(input.brand.accentColor ?? '') ? input.brand.accentColor! : DEFAULT_ACCENT;

const lines = (values: (string | null | undefined)[]): string =>
  values.filter((value) => typeof value === 'string' && value.trim().length > 0).join('\n');

export function blocks(input: RenderInput, pack: LanguagePack, style: Style) {
  const accent = accentOf(input);
  const money = (micros: number): string => formatMoney(micros, input.currencyCode, input.locale);
  const date = (iso: string): string => formatDate(iso, input.locale);
  const label = (key: LabelKey): string => pack.labels[key];
  const identifiers = (side: 'SELLER' | 'BUYER'): string =>
    lines(input.identifiers.filter((identifier) => identifier.side === side).map((identifier) => `${identifier.label}: ${identifier.value}`));

  const hasDiscount = input.lines.some((line) => (line.discountPercent ?? 0) > 0);
  const hasManyTaxes = new Set(input.lines.map((line) => line.taxLabel)).size > 1;

  const logo = (): Node[] => {
    const image = input.brand.logo;
    if (!image) return [];
    const base64 = Buffer.from(image.bytes).toString('base64');
    return [{ image: `data:${image.type};base64,${base64}`, fit: [120, 48], margin: [0, 0, 0, 6] }];
  };

  const header = (): Node => {
    const facts = lines([
      `${label('number')}: ${input.number ?? pack.draft}`,
      `${label('issueDate')}: ${date(input.issueDate)}`,
      input.dueDate ? `${label('dueDate')}: ${date(input.dueDate)}` : null,
      input.validUntil ? `${label('validUntil')}: ${date(input.validUntil)}` : null,
      input.version ? `${label('version')}: v${input.version}` : null,
    ]);
    const title = {
      text: input.title?.trim() || pack.titles[input.kind],
      fontSize: style.base + 9,
      bold: true,
      color: style.headerBand ? '#ffffff' : accent,
    };
    if (style.headerBand) {
      return {
        table: { widths: ['*'], body: [[{ stack: [title, { text: facts, color: '#ffffff', fontSize: style.base }], margin: [12, 10, 12, 10] }]] },
        layout: { fillColor: () => accent, hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 14],
      };
    }
    return {
      columns: [{ stack: [title] }, { text: facts, alignment: style.narrow ? 'left' : 'right', fontSize: style.base }],
      margin: [0, 0, 0, 14],
    };
  };

  const partyFacts = (who: Party): string => lines([who.name, who.legalName, who.legalForm, ...who.addressLines, who.email, who.phone, who.website]);

  const party = (heading: string, who: Party, side: 'SELLER' | 'BUYER'): Node => ({
    width: '*',
    stack: [
      { text: heading, bold: true, color: accent, fontSize: style.base },
      { text: lines([partyFacts(who), identifiers(side)]), fontSize: style.base },
    ],
  });

  const parties = (): Node => {
    const seller = style.sellerInFooter ? [] : [{ width: '*', stack: [...logo(), party(label('from'), input.seller, 'SELLER')] }];
    const buyer = style.showBuyer ? [party(label('billTo'), input.buyer, 'BUYER')] : [];
    const both = [...seller, ...buyer];
    if (both.length === 0) return { text: '' };
    return style.narrow ? { stack: both, margin: [0, 0, 0, 10] } : { columns: both, columnGap: 18, margin: [0, 0, 0, 14] };
  };

  const subjectAndNotes = (): Node => ({
    margin: [0, 0, 0, 10],
    stack: [
      input.subject ? { text: `${label('subject')}: ${input.subject}`, bold: true, fontSize: style.base } : { text: '' },
      input.buyerReference ? { text: `${label('reference')}: ${input.buyerReference}`, fontSize: style.base } : { text: '' },
      input.notes ? { text: input.notes, fontSize: style.base, margin: [0, 4, 0, 0] } : { text: '' },
    ],
  });

  const lineRow = (line: RenderLine): Node[] => {
    const period = line.periodStart || line.periodEnd
      ? `\n${label('period')}: ${[line.periodStart, line.periodEnd].filter(Boolean).map((iso) => date(iso as string)).join(' - ')}`
      : '';
    return [
      { text: `${line.description}${period}`, fontSize: style.base },
      { text: `${formatQuantity(line.quantity, input.locale)} ${line.unit}`.trim(), alignment: 'right', fontSize: style.base },
      { text: money(line.unitPriceMicros), alignment: 'right', fontSize: style.base },
      ...(hasDiscount ? [{ text: line.discountPercent ? formatPercent(line.discountPercent, input.locale) : '', alignment: 'right', fontSize: style.base }] : []),
      ...(hasManyTaxes ? [{ text: line.taxLabel, alignment: 'right', fontSize: style.base }] : []),
      { text: money(line.lineTotalMicros), alignment: 'right', fontSize: style.base },
    ];
  };

  const linesTable = (): Node => {
    const head = [
      { text: label('description'), bold: true },
      { text: label('quantity'), bold: true, alignment: 'right' },
      { text: label('unitPrice'), bold: true, alignment: 'right' },
      ...(hasDiscount ? [{ text: label('discount'), bold: true, alignment: 'right' }] : []),
      ...(hasManyTaxes ? [{ text: label('tax'), bold: true, alignment: 'right' }] : []),
      { text: label('lineTotal'), bold: true, alignment: 'right' },
    ];
    const widths = ['*', 'auto', 'auto', ...(hasDiscount ? ['auto'] : []), ...(hasManyTaxes ? ['auto'] : []), 'auto'];
    const pad = style.dense ? 2 : 5;
    // Rows may break across pages: pdfmake drops a row taller than a page when it may not.
    return {
      table: { headerRows: 1, widths, body: [head, ...input.lines.map(lineRow)] },
      layout: {
        // pdfmake hands a layout callback the table node, so the rows are node.table.body.
        hLineWidth: (index: number, node: { table: { body: unknown[] } }) => (style.rules || index === 1 || index === node.table.body.length ? 0.5 : 0),
        vLineWidth: () => 0,
        hLineColor: () => '#c7ccd1',
        paddingTop: () => pad,
        paddingBottom: () => pad,
      },
      margin: [0, 0, 0, 10],
    };
  };

  /** A code's name, and the component's when the code has several: `taxCode` is a record id, never printed. */
  const recapLabel = (row: RenderInput['totals']['recap'][number]): string => {
    const name = input.taxNames[row.taxCode]!;
    const several = input.totals.recap.filter((other) => other.taxCode === row.taxCode).length > 1;
    return several && row.component ? `${name} - ${row.component}` : name;
  };

  const recap = (): Node => ({
    fontSize: style.base - 1,
    margin: [0, 0, 0, 10],
    table: {
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: label('taxRecap'), bold: true },
          { text: label('rate'), bold: true, alignment: 'right' },
          { text: label('taxableBase'), bold: true, alignment: 'right' },
          { text: label('taxAmount'), bold: true, alignment: 'right' },
        ],
        ...input.totals.recap.map((row) => [
          { text: recapLabel(row) },
          { text: formatPercent(row.rate, input.locale), alignment: 'right' },
          { text: money(row.baseMicros), alignment: 'right' },
          { text: money(row.taxMicros), alignment: 'right' },
        ]),
      ],
    },
    layout: { hLineWidth: (index: number) => (index === 1 ? 0.5 : 0), vLineWidth: () => 0, hLineColor: () => '#c7ccd1' },
  });

  const totals = (): Node => {
    // The subtotal already has the discounts deducted, so they are a note below the sum, never a row of it.
    const rows: [string, string][] = [
      [label('subtotal'), money(input.totals.subtotalMicros)],
      [label('taxTotal'), money(input.totals.taxTotalMicros)],
      [label('total'), money(input.totals.totalMicros)],
    ];
    const table: Node = {
      table: {
        widths: ['*', 'auto'],
        body: rows.map(([name, value], index) => [
          { text: name, bold: index === rows.length - 1, fontSize: style.base },
          { text: value, alignment: 'right', bold: index === rows.length - 1, fontSize: style.base },
        ]),
      },
      layout: {
        hLineWidth: (index: number, node: { table: { body: unknown[] } }) => (index === node.table.body.length - 1 ? 0.5 : 0),
        vLineWidth: () => 0,
        hLineColor: () => accent,
      },
    };
    const extras = [
      input.totals.discountTotalMicros !== 0
        ? { text: `${label('discountTotal')}: ${money(input.totals.discountTotalMicros)}`, fontSize: style.base - 1, margin: [0, 4, 0, 0] }
        : { text: '' },
      input.pricesIncludeTax ? { text: label('pricesIncludeTax'), italics: true, fontSize: style.base - 1, margin: [0, 4, 0, 0] } : { text: '' },
      input.amountInWords
        ? { text: `${label('amountInWords')}: ${amountInWords(input.totals.totalMicros, input.currencyCode, pack.code)}`, fontSize: style.base - 1, margin: [0, 4, 0, 0] }
        : { text: '' },
    ];
    if (style.narrow) return { stack: [table, ...extras], margin: [0, 0, 0, 10] };
    return { columns: [{ text: '', width: '*' }, { stack: [table, ...extras], width: 240 }], margin: [0, 0, 0, 10] };
  };

  const payment = (): Node => ({
    margin: [0, 0, 0, 8],
    stack: [
      input.brand.paymentDetails ? { text: `${label('paymentDetails')}: ${input.brand.paymentDetails}`, fontSize: style.base } : { text: '' },
      input.qr
        ? { qr: input.qr.mode === 'URL_WITH_PAYLOAD' && input.qr.baseUrl ? `${input.qr.baseUrl}?${input.qr.payload}` : input.qr.payload, fit: 96, margin: [0, 6, 0, 0] }
        : { text: '' },
    ],
  });

  const legal = (): Node => ({
    stack: [
      // Everything the seller block prints elsewhere: the legal form is a legal mention in several countries.
      ...(style.sellerInFooter
        ? [{ text: lines([partyFacts(input.seller), identifiers('SELLER')]), fontSize: style.base - 2, margin: [0, 0, 0, 6] }]
        : []),
      { text: lines(input.taxNotes), fontSize: style.base - 1 },
      input.mentions ? { text: input.mentions, fontSize: style.base - 1, margin: [0, 4, 0, 0] } : { text: '' },
      input.brand.footerNote ? { text: input.brand.footerNote, fontSize: style.base - 2, color: '#6b7280', margin: [0, 6, 0, 0] } : { text: '' },
    ],
  });

  /**
   * The recap and the totals travel together. Payment and legal text follow and
   * may run on: pdfmake silently drops an unbreakable block taller than a page,
   * and pasted terms of sale easily are.
   */
  const tail = (): Node => ({ stack: [{ unbreakable: true, stack: [recap(), totals()] }, payment(), legal()] });

  const footer = (currentPage: number, pageCount: number): Node => ({
    margin: [40, 10, 40, 0],
    columns: [
      { text: input.number ?? pack.draft, fontSize: style.base - 2, color: '#6b7280' },
      { text: `${pack.labels.page} ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: style.base - 2, color: '#6b7280' },
    ],
  });

  return { header, parties, subjectAndNotes, lines: linesTable, tail, footer };
}
