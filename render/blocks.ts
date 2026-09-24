import { amountInWords, formatDate, formatMoney, formatPercent, formatQuantity, formatUnitPrice } from './format.ts';
import type { LabelKey, LanguagePack } from './lang/pack.ts';
import { textWidth } from './glyphs.ts';
import { qrBox, qrText } from './qr.ts';
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
  /** How the totals stand out: a ruled box, a panel tinted with the accent, or nothing. */
  totalsPanel: 'box' | 'tint' | 'plain';
};

export const DEFAULT_ACCENT = '#1f2933';

/** The seller's colour when it is a hex triplet, the default ink otherwise. */
export const accentOf = (input: RenderInput): string =>
  /^#[0-9a-fA-F]{6}$/.test(input.brand.accentColor ?? '') ? input.brand.accentColor! : DEFAULT_ACCENT;

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];

/** WCAG contrast ratio between two #RRGGBB colours, from 1 to 21. */
function contrast(first: string, second: string): number {
  const luminance = (hex: string): number => {
    const [r, g, b] = channels(hex).map((value) => value / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/** The colour mixed with white, `amount` of the way: a panel light enough for dark text. */
const tint = (hex: string, amount: number): string =>
  `#${channels(hex).map((value) => Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0')).join('')}`;

const lines = (values: (string | null | undefined)[]): string =>
  values.filter((value) => typeof value === 'string' && value.trim().length > 0).join('\n');

/** An absent block. pdfmake gives an empty text a full line of height, and an empty stack none. */
const NOTHING: Node = { stack: [] };

/** Where a long run may break first: after a separator of a URL, an e-mail address or a reference. */
const SEPARATOR = /(?<=[/.\-@_?&=,;:+#])/u;

/** A run cut into the widest pieces that fit `limit` points, for a run with no separator left in it. */
function chunks(run: string, size: number, limit: number): string[] {
  const found = [''];
  let width = 0;
  for (const character of run) {
    const advance = textWidth(character, size);
    if (found.at(-1) !== '' && width + advance > limit) {
      found.push('');
      width = 0;
    }
    found[found.length - 1] += character;
    width += advance;
  }
  return found;
}

/**
 * pdfmake sizes a column to its widest unbreakable run, so one very long word (a
 * URL, an unspaced IBAN, a pasted hash) widens it and pushes the columns beside
 * it off the page. A run wider than `limit` points becomes adjacent pieces,
 * cut after a separator where there is one: they set and copy as one word, and
 * a line may break between them. Nothing is inserted into the text, and a run
 * that fits is left whole.
 */
function pieces(text: string, size: number, limit: number): string | string[] {
  const found = [''];
  let split = false;
  for (const token of text.split(/(\s+)/u)) {
    if (textWidth(token, size) <= limit) {
      found[found.length - 1] += token;
      continue;
    }
    split = true;
    const parts = token.split(SEPARATOR).flatMap((part) => (textWidth(part, size) <= limit ? [part] : chunks(part, size, limit)));
    found[found.length - 1] += parts[0]!;
    found.push(...parts.slice(1));
  }
  return split ? found : text;
}

/** Every printed string of a block, at its own font size, made to fit `limit`. The QR payload and the logo are data, not text. */
function breakable(node: unknown, limit: number, size: number): unknown {
  if (Array.isArray(node)) return node.map((child) => breakable(child, limit, size));
  if (!node || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  const own = typeof record.fontSize === 'number' ? record.fontSize : size;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    key === 'text' && typeof value === 'string' ? pieces(value, own, limit)
      : key === 'qr' || key === 'image' || typeof value === 'function' ? value
      : breakable(value, limit, own),
  ]));
}

export function blocks(input: RenderInput, pack: LanguagePack, style: Style) {
  const accent = accentOf(input);
  /** Accent text on white paper only when it reads (4.5:1, WCAG AA); a pale brand colour falls back to the default ink. */
  const accentInk = contrast(accent, '#ffffff') >= 4.5 ? accent : DEFAULT_ACCENT;
  /** Text on the accent band: white or the default ink, whichever stands out more. */
  const onAccent = contrast('#ffffff', accent) >= contrast(DEFAULT_ACCENT, accent) ? '#ffffff' : DEFAULT_ACCENT;
  const money = (micros: number): string => formatMoney(micros, input.currencyCode, input.locale);
  const date = (iso: string): string => formatDate(iso, input.locale);
  const label = (key: LabelKey): string => pack.labels[key];
  const identifiers = (side: 'SELLER' | 'BUYER'): string =>
    lines(input.identifiers.filter((identifier) => identifier.side === side).map((identifier) => `${identifier.label}${pack.colon}${identifier.value}`));

  /**
   * The space user text lands in, in points: a cell of the lines table or the tax
   * recap, or a block of its own (half the page on A4, the whole roll on the
   * receipt). A run wider than its space is cut into pieces (see pieces()).
   */
  const cell = style.narrow ? 60 : 150;
  const block = style.narrow ? 190 : 240;

  const hasDiscount = input.lines.some((line) => (line.discountPercent ?? 0) > 0);
  // Keyed on the codes, not their names: two codes may share a name and still differ.
  const hasManyTaxes = input.totals.taxCodesUsed.length > 1;

  const logo = (): Node[] => {
    const image = input.brand.logo;
    if (!image) return [];
    const base64 = Buffer.from(image.bytes).toString('base64');
    return [{ image: `data:${image.type};base64,${base64}`, fit: [120, 48], margin: [0, 0, 0, 6] }];
  };

  const header = (): Node => {
    const facts = lines([
      `${label('number')}${pack.colon}${input.number ?? pack.draft}`,
      `${label('issueDate')}${pack.colon}${date(input.issueDate)}`,
      input.corrects ? `${label('correctsInvoice')}${pack.colon}${input.corrects.number} (${date(input.corrects.issueDate)})` : null,
      input.dueDate ? `${label('dueDate')}${pack.colon}${date(input.dueDate)}` : null,
      input.validUntil ? `${label('validUntil')}${pack.colon}${date(input.validUntil)}` : null,
      input.version ? `${label('version')}${pack.colon}v${input.version}` : null,
    ]);
    const title = {
      text: input.title?.trim() || pack.titles[input.kind],
      fontSize: style.base + 9,
      bold: true,
      color: style.headerBand ? onAccent : accentInk,
    };
    if (style.headerBand) {
      return {
        table: { widths: ['*'], body: [[{ stack: [title, { text: facts, color: onAccent, fontSize: style.base }], margin: [12, 10, 12, 10] }]] },
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
      { text: heading, bold: true, color: accentInk, fontSize: style.base },
      { text: lines([partyFacts(who), identifiers(side)]), fontSize: style.base },
    ],
  });

  const parties = (): Node => {
    const seller = style.sellerInFooter ? [] : [{ width: '*', stack: [...logo(), party(label('from'), input.seller, 'SELLER')] }];
    const buyer = style.showBuyer ? [party(label('billTo'), input.buyer, 'BUYER')] : [];
    const both = [...seller, ...buyer];
    if (both.length === 0) return NOTHING;
    return style.narrow ? { stack: both, margin: [0, 0, 0, 10] } : { columns: both, columnGap: 18, margin: [0, 0, 0, 14] };
  };

  const subjectAndNotes = (): Node => {
    const present = [
      input.subject ? { text: `${label('subject')}${pack.colon}${input.subject}`, bold: true, fontSize: style.base } : null,
      input.buyerReference ? { text: `${label('reference')}${pack.colon}${input.buyerReference}`, fontSize: style.base } : null,
      input.notes ? { text: input.notes, fontSize: style.base, margin: [0, 4, 0, 0] } : null,
    ].filter((node) => node !== null);
    return present.length === 0 ? NOTHING : { margin: [0, 0, 0, 10], stack: present };
  };

  const lineRow = (line: RenderLine): Node[] => {
    const period = line.periodStart || line.periodEnd
      ? `\n${label('period')}${pack.colon}${[line.periodStart, line.periodEnd].filter(Boolean).map((iso) => date(iso as string)).join(' - ')}`
      : '';
    return [
      { text: `${line.description}${period}`, fontSize: style.base },
      { text: `${formatQuantity(line.quantity, input.locale)} ${line.unit}`.trim(), alignment: 'right', fontSize: style.base },
      { text: formatUnitPrice(line.unitPriceMicros, input.currencyCode, input.locale), alignment: 'right', fontSize: style.base },
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
    // A row stays whole, so a line never parts from its service period, unless one could outgrow a page:
    // pdfmake silently drops a row taller than a page when it may not break.
    const rowHeight = (line: RenderLine): number =>
      `${line.description}\nperiod`.split('\n').reduce((count, part) => count + Math.max(1, Math.ceil(textWidth(part, style.base) / cell)), 0) * style.base * 1.2;
    const tallRow = input.lines.some((line) => rowHeight(line) > 500);
    return breakable({
      table: { headerRows: 1, widths, body: [head, ...input.lines.map(lineRow)], dontBreakRows: !tallRow },
      layout: {
        // pdfmake hands a layout callback the table node, so the rows are node.table.body.
        hLineWidth: (index: number, node: { table: { body: unknown[] } }) => (style.rules || index === 1 || index === node.table.body.length ? 0.5 : 0),
        vLineWidth: () => 0,
        hLineColor: () => '#c7ccd1',
        paddingTop: () => pad,
        paddingBottom: () => pad,
      },
      margin: [0, 0, 0, 10],
    }, cell, style.base) as Node;
  };

  /** A code's name, and the component's when the code has several: `taxCode` is a record id, never printed. */
  const recapLabel = (row: RenderInput['totals']['recap'][number]): string => {
    const name = input.taxNames[row.taxCode]!;
    const several = input.totals.recap.filter((other) => other.taxCode === row.taxCode).length > 1;
    return several && row.component ? `${name} - ${row.component}` : name;
  };

  const recap = (): Node => breakable({
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
  }, cell, style.base - 1) as Node;

  type TableNode = { table: { body: unknown[]; widths: unknown[] } };
  /** Always a rule in the accent above the total; classic adds a light box, modern a tinted panel. */
  const totalsLayout = (): Record<string, unknown> => {
    const aboveTotal = (index: number, node: TableNode): boolean => index === node.table.body.length - 1;
    if (style.totalsPanel === 'box') {
      return {
        hLineWidth: (index: number, node: TableNode) => (index === 0 || index === node.table.body.length || aboveTotal(index, node) ? 0.5 : 0),
        vLineWidth: (index: number, node: TableNode) => (index === 0 || index === node.table.widths.length ? 0.5 : 0),
        hLineColor: (index: number, node: TableNode) => (aboveTotal(index, node) ? accent : '#c7ccd1'),
        vLineColor: () => '#c7ccd1',
        paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 3, paddingBottom: () => 3,
      };
    }
    const rule = {
      hLineWidth: (index: number, node: TableNode) => (aboveTotal(index, node) ? 0.5 : 0),
      vLineWidth: () => 0,
      hLineColor: () => accent,
    };
    if (style.totalsPanel === 'tint') {
      return { ...rule, fillColor: () => tint(accent, 0.88), paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 3, paddingBottom: () => 3 };
    }
    return rule;
  };

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
      layout: totalsLayout(),
    };
    const extras = [
      input.totals.discountTotalMicros !== 0
        ? { text: `${label('discountTotal')}${pack.colon}${money(input.totals.discountTotalMicros)}`, fontSize: style.base - 1, margin: [0, 4, 0, 0] }
        : NOTHING,
      input.pricesIncludeTax ? { text: label('pricesIncludeTax'), italics: true, fontSize: style.base - 1, margin: [0, 4, 0, 0] } : NOTHING,
      input.amountInWords
        ? { text: `${label('amountInWords')}${pack.colon}${amountInWords(input.totals.totalMicros, input.currencyCode, pack.code)}`, fontSize: style.base - 1, margin: [0, 4, 0, 0] }
        : NOTHING,
    ];
    if (style.narrow) return { stack: [table, ...extras], margin: [0, 0, 0, 10] };
    return { columns: [{ ...NOTHING, width: '*' }, { stack: [table, ...extras], width: 240 }], margin: [0, 0, 0, 10] };
  };

  const paymentDetails = (): Node =>
    input.brand.paymentDetails ? { text: `${label('paymentDetails')}${pack.colon}${input.brand.paymentDetails}`, fontSize: style.base, margin: [0, 0, 0, 8] } : NOTHING;

  /** The QR sized by qrBox, with four modules of white above and below it, the quiet zone a scanner needs. */
  const qrCode = (): Node => {
    const text = input.qr ? qrText(input.qr) : null;
    const box = text === null ? null : qrBox(text, input.template);
    if (text === null || !box) return NOTHING;
    return { qr: text, eccLevel: 'M', version: box.version, fit: box.fit, margin: [0, 4 * box.module, 0, 4 * box.module] };
  };

  const legal = (): Node => ({
    stack: [
      // Everything the seller block prints elsewhere: the legal form is a legal mention in several countries.
      ...(style.sellerInFooter
        ? [{ text: lines([partyFacts(input.seller), identifiers('SELLER')]), fontSize: style.base - 2, margin: [0, 0, 0, 6] }]
        : []),
      input.taxNotes.length > 0 ? { text: lines(input.taxNotes), fontSize: style.base - 1 } : NOTHING,
      input.mentions ? { text: input.mentions, fontSize: style.base - 1, margin: [0, 4, 0, 0] } : NOTHING,
      input.brand.footerNote ? { text: input.brand.footerNote, fontSize: style.base - 2, color: '#6b7280', margin: [0, 6, 0, 0] } : NOTHING,
    ],
  });

  /**
   * The recap and the totals travel together. Payment and legal text follow and
   * may run on: pdfmake silently drops an unbreakable block taller than a page,
   * and pasted terms of sale easily are.
   */
  const tail = (): Node => ({
    stack: [
      { unbreakable: true, stack: [recap(), totals()] },
      // A receipt ends with its QR code, where a till slip puts it.
      ...(style.narrow ? [paymentDetails(), legal(), qrCode()] : [paymentDetails(), qrCode(), legal()]),
    ],
  });

  const footer = (currentPage: number, pageCount: number): Node => ({
    margin: [40, 10, 40, 0],
    columns: [
      { text: input.number ?? pack.draft, fontSize: style.base - 2, color: '#6b7280' },
      { text: `${label('page')} ${currentPage} ${label('of')} ${pageCount}`, alignment: 'right', fontSize: style.base - 2, color: '#6b7280' },
    ],
  });

  const wrapped = (build: () => Node) => (): Node => breakable(build(), block, style.base) as Node;
  return {
    header: wrapped(header), parties: wrapped(parties), subjectAndNotes: wrapped(subjectAndNotes),
    lines: wrapped(linesTable), tail: wrapped(tail), footer,
  };
}
