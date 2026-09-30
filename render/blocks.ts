import { amountInWords, formatDate, formatMoney, formatPercent, formatQuantity, formatUnitPrice } from './format.ts';
import type { LabelKey, LanguagePack } from './lang/pack.ts';
import { textWidth } from './glyphs.ts';
import { qrBox, qrText } from './qr.ts';
import { HAIRLINE, INK, MUTED, MUTED_ON_PANEL, PANEL, RULE, smallLabel, typeScale } from './tokens.ts';
import type { Party, RenderInput, RenderLine } from './types.ts';

type Node = Record<string, unknown>;

/**
 * How a layout looks. Each look is named after the part of a pdfcn design
 * (MIT, see THIRD_PARTY_NOTICES.md) it takes after; the content is the same nine
 * blocks whatever the look.
 */
export type Style = {
  /** Base font size; every other size is derived from it (tokens.ts). */
  base: number;
  /** The page's side margin: rules drawn across the page and the footer line up with it. */
  side: number;
  /**
   * The top of the page, down to the lines table:
   * - `ruled`: the logo beside the title and the facts, a rule, then seller and buyer (invoice-classic);
   * - `banner`: the title in an accent banner, the logo and the facts in a row of small labels, then seller and buyer split by a rule (invoice-modern);
   * - `stamp`: the title over a heavy accent rule beside the facts in a framed stamp, then seller and buyer (invoice-minimal);
   * - `letter`: nothing about the seller (the paper has it): the title over the facts as a list, beside the buyer (invoice-corporate);
   * - `stacked`: title, facts, logo and seller one under the other, no buyer (a till slip).
   */
  top: 'ruled' | 'banner' | 'stamp' | 'letter' | 'stacked';
  /**
   * The lines table: `grid`, framed with a grey header and every other row grey (invoice-classic);
   * `accent`, its header row in the accent (invoice-modern); `tight`, a grey header and hairlines,
   * tightly padded (invoice-minimal); `framed`, framed with a grey header (invoice-corporate);
   * `bare`, a rule under the header and after the last line (a till slip).
   */
  table: 'grid' | 'accent' | 'tight' | 'framed' | 'bare';
  /** How the totals stand out: a ruled box, a panel tinted with the accent, a grey card, or rules only. */
  totalsPanel: 'box' | 'tint' | 'card' | 'plain';
  /** The notes: in a grey callout with an accent bar (invoice-consultant), or plain. */
  notes: 'callout' | 'plain';
  /** An 80 mm roll: one column, narrower spaces, the QR code last. */
  narrow: boolean;
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

/** The widest a logo is drawn: it is fitted into LOGO_WIDTH x 48 pt. */
const LOGO_WIDTH = 120;

/** pdfmake hands a layout callback the table node, so the rows are node.table.body and the columns node.table.widths. */
type TableNode = { table: { body: unknown[]; widths: unknown[] } };
type Callback = (index: number, node: TableNode) => unknown;
const rowCount = (node: TableNode): number => node.table.body.length;
const columnCount = (node: TableNode): number => node.table.widths.length;
const padded = (x: number, y: number): Record<string, Callback> =>
  ({ paddingLeft: () => x, paddingRight: () => x, paddingTop: () => y, paddingBottom: () => y });

export function blocks(input: RenderInput, pack: LanguagePack, style: Style) {
  const accent = accentOf(input);
  /** The accent as text on `paper` when it reads there (4.5:1, WCAG AA); a pale brand colour falls back to the default ink. */
  const inkOn = (paper: string): string => (contrast(accent, paper) >= 4.5 ? accent : DEFAULT_ACCENT);
  const accentInk = inkOn('#ffffff');
  /** Text on an accent fill: white or the default ink, whichever stands out more. */
  const onAccent = contrast('#ffffff', accent) >= contrast(DEFAULT_ACCENT, accent) ? '#ffffff' : DEFAULT_ACCENT;
  const size = typeScale(style.base);
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
  /** Text made to fit a space narrower than a block: a column of the facts, a stamp. */
  const fit = (node: Node, limit: number): Node => breakable(node, limit, style.base) as Node;
  /** The width between the side margins, for rules drawn across it. */
  const width = (style.narrow ? 226.77 : 595.28) - 2 * style.side;

  const hasDiscount = input.lines.some((line) => (line.discountPercent ?? 0) > 0);
  // Keyed on the codes, not their names: two codes may share a name and still differ.
  const hasManyTaxes = input.totals.taxCodesUsed.length > 1;

  const title = (): string => input.title?.trim() || pack.titles[input.kind];

  /** The header's facts, a label and its value each, only those the document has. The number comes first. */
  const facts = (): [string, string][] => [
    [label('number'), input.number ?? pack.draft] as [string, string],
    [label('issueDate'), date(input.issueDate)] as [string, string],
    ...(input.corrects ? [[label('correctsInvoice'), `${input.corrects.number} (${date(input.corrects.issueDate)})`] as [string, string]] : []),
    ...(input.dueDate ? [[label('dueDate'), date(input.dueDate)] as [string, string]] : []),
    ...(input.validUntil ? [[label('validUntil'), date(input.validUntil)] as [string, string]] : []),
    ...(input.version ? [[label('version'), `v${input.version}`] as [string, string]] : []),
  ];

  /**
   * "Label: value" as one text, the label in grey: it reads and copies as one
   * phrase. The value takes the node's own style, so a value cut into pieces (see
   * breakable()) keeps it; a stressed value is larger and bold, its label not.
   */
  const labelled = (name: string, value: string, own: Node = {}, stressed = false): Node => ({
    text: [{ text: `${name}${pack.colon}`, color: MUTED, bold: false, ...(stressed ? { fontSize: style.base } : {}) }, { text: value }],
    ...own,
    ...(stressed ? { fontSize: size.number, bold: true } : {}),
  });

  /** A rule across the page, between the side margins. */
  const rule = (lineWidth: number, lineColor: string, margin: number[]): Node =>
    ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth, lineColor }], margin });

  const logo = (margin: number[] = [0, 0, 0, 6]): Node[] => {
    const image = input.brand.logo;
    if (!image) return [];
    const base64 = Buffer.from(image.bytes).toString('base64');
    return [{ image: `data:${image.type};base64,${base64}`, fit: [LOGO_WIDTH, 48], margin }];
  };

  const heading = (text: string): Node => ({ text, ...smallLabel(style.base), margin: [0, 0, 0, 3] });

  /** Everything the law asks of a party but its name and identifiers, one per line. */
  const partyFacts = (who: Party): string => lines([who.legalName, who.legalForm, ...who.addressLines, who.email, who.phone, who.website]);

  /** A party: the name first and a little larger, then everything else the law asks for, in grey. */
  const party = (who: Party, side: 'SELLER' | 'BUYER'): Node[] => {
    const rest = lines([partyFacts(who), identifiers(side)]);
    return [
      { text: who.name, bold: true, fontSize: style.base + 1 },
      rest ? { text: rest, color: MUTED } : NOTHING,
    ];
  };
  const seller = (): Node[] => [heading(label('from')), ...party(input.seller, 'SELLER')];
  const buyer = (): Node[] => [heading(label('billTo')), ...party(input.buyer, 'BUYER')];

  /** Seller left, buyer right. */
  const parties = (): Node => ({
    columns: [{ width: '*', stack: seller() }, { width: '*', stack: buyer() }],
    columnGap: 18,
    margin: [0, 0, 0, 14],
  });

  const notes = (): Node => {
    const text = input.notes!;
    if (style.notes === 'plain') return { text, margin: [0, 4, 0, 0] };
    return {
      table: { widths: ['*'], body: [[{ text, color: MUTED_ON_PANEL }]] },
      layout: { fillColor: () => PANEL, hLineWidth: () => 0, vLineWidth: (index: number) => (index === 0 ? 2.5 : 0), vLineColor: () => accent, ...padded(9, 5) },
      margin: [0, 6, 0, 0],
    };
  };

  const subjectAndNotes = (): Node => {
    const present = [
      input.subject ? labelled(label('subject'), input.subject, { bold: true }) : null,
      input.buyerReference ? labelled(label('reference'), input.buyerReference) : null,
      input.notes ? notes() : null,
    ].filter((node) => node !== null);
    return present.length === 0 ? NOTHING : { margin: [0, 0, 0, 12], stack: present };
  };

  /** The title in the accent, when the accent reads on white. */
  const titleText = (own: Node = {}): Node => ({ text: title(), fontSize: size.title, bold: true, color: accentInk, ...own });

  /** Each fact as "Label: value" on its line, the number larger. */
  const factLines = (): Node[] =>
    facts().map(([name, value], index) => labelled(name, value, {}, index === 0));

  // invoice-classic: the logo left and the facts right, above a rule; the number stands out.
  const ruledTop = (): Node[] => [
    {
      stack: [
        {
          columns: [
            { width: '*', stack: logo([0, 0, 0, 0]) },
            { width: '*', alignment: 'right', stack: [titleText({ margin: [0, 0, 0, 3] }), ...factLines()] },
          ],
        },
        rule(1.5, HAIRLINE, [0, 12, 0, 14]),
      ],
    },
    parties(),
    subjectAndNotes(),
  ];

  // invoice-modern: a banner in the accent, the logo and the facts in a row of small labels, a rule between seller and buyer.
  const bannerTop = (): Node[] => {
    const row = facts();
    const gap = 12;
    // The facts share what the logo (at its widest, with its margin) and the gutters leave: a run is cut to that width,
    // or pdfmake widens every column to hold it and the row runs past the margin.
    const beside = input.brand.logo ? LOGO_WIDTH + gap + gap : 0;
    const column = Math.floor((width - beside - gap * (row.length - 1)) / row.length);
    return [
      {
        table: {
          widths: ['*'],
          body: [[{
            stack: [titleText({ color: onAccent }), { text: input.seller.name, color: onAccent, fontSize: style.base + 1, margin: [0, 2, 0, 0] }],
            margin: [14, 12, 14, 12],
          }]],
        },
        layout: { fillColor: () => accent, hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 14],
      },
      fit({
        columns: [
          ...logo([0, 0, gap, 0]).map((image) => ({ width: 'auto', stack: [image] })),
          ...row.map(([name, value], index) => ({
            width: '*',
            stack: [heading(name), { text: value, ...(index === 0 ? { bold: true, fontSize: size.number } : {}) }],
          })),
        ],
        columnGap: gap,
        margin: [0, 0, 0, 14],
      }, column),
      {
        table: { widths: ['*', '*'], body: [[{ stack: seller() }, { stack: buyer() }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (index: number) => (index === 1 ? 1 : 0),
          vLineColor: () => HAIRLINE,
          paddingLeft: (index: number) => (index === 0 ? 0 : 14),
          paddingRight: (index: number) => (index === 0 ? 14 : 0),
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 14],
      },
      subjectAndNotes(),
    ];
  };

  // invoice-minimal: the title over a heavy accent rule, the facts in a framed stamp beside it.
  const stampTop = (): Node[] => {
    const [[, number], ...rest] = facts();
    return [
      {
        columns: [
          {
            width: '*',
            stack: [
              ...logo(),
              {
                table: { widths: ['*'], body: [[titleText()]] },
                layout: { hLineWidth: (index: number) => (index === 1 ? 3 : 0), vLineWidth: () => 0, hLineColor: () => accent, ...padded(0, 0), paddingBottom: () => 5 },
              },
            ],
          },
          fit({
            width: 'auto',
            table: {
              body: [[{
                alignment: 'right',
                stack: [{ text: number!, fontSize: size.number + 1, bold: true, margin: [0, 0, 0, 2] }, ...rest.map(([name, value]) => labelled(name, value))],
              }]],
            },
            layout: { hLineWidth: () => 1.5, vLineWidth: () => 1.5, hLineColor: () => accent, vLineColor: () => accent, ...padded(9, 5) },
          }, 150),
        ],
        columnGap: 18,
        margin: [0, 0, 0, 12],
      },
      parties(),
      subjectAndNotes(),
    ];
  };

  // invoice-corporate, without its header: the paper is printed with it. The facts as a list beside the buyer.
  const letterTop = (): Node[] => [
    {
      columns: [
        {
          width: '*',
          stack: [
            titleText({ margin: [0, 0, 0, 6] }),
            fit({
              table: { widths: ['auto', '*'], body: facts().map(([name, value]) => [{ text: name, color: MUTED, noWrap: true }, { text: value, alignment: 'right' }]) },
              layout: { hLineWidth: () => 0, vLineWidth: () => 0, ...padded(0, 1.5), paddingRight: (index: number) => (index === 0 ? 12 : 0) },
            }, 150),
          ],
        },
        {
          width: '*',
          stack: [
            {
              table: { widths: ['*'], body: [[{ text: label('billTo'), ...smallLabel(style.base) }]] },
              layout: { hLineWidth: (index: number) => (index === 1 ? 1 : 0), vLineWidth: () => 0, hLineColor: () => HAIRLINE, ...padded(0, 0), paddingBottom: () => 3 },
              margin: [0, 4, 0, 5],
            },
            ...party(input.buyer, 'BUYER'),
          ],
        },
      ],
      columnGap: 24,
      margin: [0, 0, 0, 16],
    },
    subjectAndNotes(),
  ];

  // A till slip: one column, the facts under the title, the seller under them; no buyer.
  const stackedTop = (): Node[] => [
    { stack: [titleText({ margin: [0, 0, 0, 2] }), ...factLines()], margin: [0, 0, 0, 8] },
    { stack: [...logo(), ...seller()], margin: [0, 0, 0, 10] },
    subjectAndNotes(),
  ];

  const lineRow = (line: RenderLine): Node[] => {
    const period = line.periodStart || line.periodEnd
      ? `\n${label('period')}${pack.colon}${[line.periodStart, line.periodEnd].filter(Boolean).map((iso) => date(iso as string)).join(' - ')}`
      : '';
    return [
      // The period in grey under the description; dark enough for a grey row too.
      { text: [{ text: line.description }, ...(period ? [{ text: period, color: MUTED_ON_PANEL }] : [])], fontSize: style.base },
      { text: `${formatQuantity(line.quantity, input.locale)} ${line.unit}`.trim(), alignment: 'right', fontSize: style.base },
      { text: formatUnitPrice(line.unitPriceMicros, input.currencyCode, input.locale), alignment: 'right', fontSize: style.base },
      ...(hasDiscount ? [{ text: line.discountPercent ? formatPercent(line.discountPercent, input.locale) : '', alignment: 'right', fontSize: style.base }] : []),
      ...(hasManyTaxes ? [{ text: line.taxLabel, alignment: 'right', fontSize: style.base }] : []),
      { text: money(line.lineTotalMicros), alignment: 'right', fontSize: style.base },
    ];
  };

  /** The lines table's rules, fills and padding, per look (see Style). */
  const linesLook = (): Record<string, Callback> => {
    const edge = (index: number, count: number): boolean => index === 0 || index === count;
    switch (style.table) {
      case 'grid':
        return {
          hLineWidth: (index, node) => (edge(index, rowCount(node)) ? 1 : 0.5),
          vLineWidth: (index, node) => (edge(index, columnCount(node)) ? 1 : 0.5),
          hLineColor: (index, node) => (index <= 1 || index === rowCount(node) ? RULE : HAIRLINE),
          vLineColor: (index, node) => (edge(index, columnCount(node)) ? RULE : HAIRLINE),
          fillColor: (row) => (row % 2 === 0 ? PANEL : null),
          ...padded(7, 5),
        };
      case 'accent':
        return {
          hLineWidth: (index) => (index <= 1 ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: (index, node) => (index === rowCount(node) ? RULE : HAIRLINE),
          fillColor: (row) => (row === 0 ? accent : null),
          ...padded(7, 5),
        };
      case 'tight':
        return {
          hLineWidth: (index) => (index === 0 ? 0 : index === 1 ? 1 : 0.5),
          vLineWidth: () => 0,
          hLineColor: (index, node) => (index === 1 || index === rowCount(node) ? RULE : HAIRLINE),
          fillColor: (row) => (row === 0 ? PANEL : null),
          ...padded(5, 2),
        };
      case 'framed':
        return {
          hLineWidth: (index, node) => (edge(index, rowCount(node)) ? 1 : 0.5),
          vLineWidth: (index, node) => (edge(index, columnCount(node)) ? 1 : 0.5),
          hLineColor: (index, node) => (index <= 1 || index === rowCount(node) ? RULE : HAIRLINE),
          vLineColor: (index, node) => (edge(index, columnCount(node)) ? RULE : HAIRLINE),
          fillColor: (row) => (row === 0 ? PANEL : null),
          ...padded(7, 4),
        };
      case 'bare':
        return {
          hLineWidth: (index, node) => (index === 1 || index === rowCount(node) ? 0.5 : 0),
          vLineWidth: () => 0,
          hLineColor: () => INK,
          ...padded(4, 2),
        };
    }
  };

  const linesTable = (): Node => {
    const head = (key: LabelKey, alignment?: 'right'): Node =>
      ({ text: label(key), bold: true, ...(style.table === 'accent' ? { color: onAccent } : {}), ...(alignment ? { alignment } : {}) });
    const header = [
      head('description'),
      head('quantity', 'right'),
      head('unitPrice', 'right'),
      ...(hasDiscount ? [head('discount', 'right')] : []),
      ...(hasManyTaxes ? [head('tax', 'right')] : []),
      head('lineTotal', 'right'),
    ];
    const widths = ['*', 'auto', 'auto', ...(hasDiscount ? ['auto'] : []), ...(hasManyTaxes ? ['auto'] : []), 'auto'];
    // A row stays whole, so a line never parts from its service period, unless one could outgrow a page:
    // pdfmake silently drops a row taller than a page when it may not break.
    const rowHeight = (line: RenderLine): number =>
      `${line.description}\nperiod`.split('\n').reduce((count, part) => count + Math.max(1, Math.ceil(textWidth(part, style.base) / cell)), 0) * style.base * 1.2;
    const tallRow = input.lines.some((line) => rowHeight(line) > 500);
    return breakable({
      table: { headerRows: 1, widths, body: [header, ...input.lines.map(lineRow)], dontBreakRows: !tallRow },
      layout: linesLook(),
      margin: [0, 0, 0, 12],
    }, cell, style.base) as Node;
  };

  /** A code's name, and the component's when the code has several: `taxCode` is a record id, never printed. */
  const recapLabel = (row: RenderInput['totals']['recap'][number]): string => {
    const name = input.taxNames[row.taxCode]!;
    const several = input.totals.recap.filter((other) => other.taxCode === row.taxCode).length > 1;
    return several && row.component ? `${name} - ${row.component}` : name;
  };

  const recap = (): Node => breakable({
    fontSize: size.small,
    margin: [0, 0, 0, 10],
    table: {
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: label('taxRecap'), bold: true, color: MUTED },
          { text: label('rate'), bold: true, color: MUTED, alignment: 'right' },
          { text: label('taxableBase'), bold: true, color: MUTED, alignment: 'right' },
          { text: label('taxAmount'), bold: true, color: MUTED, alignment: 'right' },
        ],
        ...input.totals.recap.map((row) => [
          { text: recapLabel(row) },
          { text: formatPercent(row.rate, input.locale), alignment: 'right' },
          { text: money(row.baseMicros), alignment: 'right' },
          { text: money(row.taxMicros), alignment: 'right' },
        ]),
      ],
    },
    layout: { hLineWidth: (index: number) => (index === 1 ? 0.5 : 0), vLineWidth: () => 0, hLineColor: () => (style.narrow ? INK : RULE) },
  }, cell, size.small) as Node;

  /**
   * Every look sets the total apart with a rule in the accent above it (black on
   * the receipt), or
   * (modern) fills its row with the accent; classic adds a light box, letterhead
   * a grey card, modern a tinted panel.
   */
  const totalsLayout = (): Record<string, Callback> => {
    const aboveTotal = (index: number, node: TableNode): boolean => index === rowCount(node) - 1;
    const between = (index: number, node: TableNode): boolean => index > 0 && index < rowCount(node);
    // A thermal roll drops a pale accent: the receipt's rule above the total is black.
    const totalRule = style.narrow ? INK : accent;
    const rules = (dividers: number, divider: string) => ({
      hLineWidth: (index: number, node: TableNode) => (aboveTotal(index, node) ? 1 : between(index, node) ? dividers : 0),
      hLineColor: (index: number, node: TableNode) => (aboveTotal(index, node) ? totalRule : divider),
      vLineWidth: () => 0,
    });
    switch (style.totalsPanel) {
      case 'box':
        return {
          hLineWidth: (index, node) => (aboveTotal(index, node) ? 1 : 0.5),
          hLineColor: (index, node) => (aboveTotal(index, node) ? accent : between(index, node) ? HAIRLINE : RULE),
          vLineWidth: (index, node) => (index === 0 || index === columnCount(node) ? 0.5 : 0),
          vLineColor: () => RULE,
          ...padded(8, 4),
        };
      case 'tint':
        return {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: (row, node) => (row === rowCount(node) - 1 ? accent : tint(accent, 0.88)),
          ...padded(8, 4),
        };
      case 'card':
        return { ...rules(0.5, RULE), fillColor: () => PANEL, ...padded(10, 4) };
      case 'plain':
        return { ...rules(style.narrow ? 0 : 0.5, HAIRLINE), ...padded(0, 3) };
    }
  };

  const totals = (): Node => {
    // The subtotal already has the discounts deducted, so they are a note below the sum, never a row of it.
    const rows: [string, string][] = [
      [label('subtotal'), money(input.totals.subtotalMicros)],
      [label('taxTotal'), money(input.totals.taxTotalMicros)],
      [label('total'), money(input.totals.totalMicros)],
    ];
    const panel = style.totalsPanel === 'card' || style.totalsPanel === 'tint';
    // The total's label and value share one size, so they sit on one baseline and copy as one line.
    const totalInk = style.totalsPanel === 'tint' ? onAccent : style.totalsPanel === 'card' ? inkOn(PANEL) : style.totalsPanel === 'plain' ? accentInk : INK;
    const table: Node = {
      table: {
        widths: ['*', 'auto'],
        body: rows.map(([name, value], index) => {
          const isTotal = index === rows.length - 1;
          const own = isTotal ? { bold: true, fontSize: size.total } : { fontSize: style.base };
          return [
            { text: name, ...own, color: isTotal ? (style.totalsPanel === 'tint' ? onAccent : INK) : panel ? MUTED_ON_PANEL : MUTED },
            { text: value, alignment: 'right', ...own, color: isTotal ? totalInk : INK },
          ];
        }),
      },
      layout: totalsLayout(),
    };
    const note = (text: Node): Node => ({ ...text, fontSize: size.small, margin: [0, 4, 0, 0] });
    const extras = [
      input.totals.discountTotalMicros !== 0 ? note(labelled(label('discountTotal'), money(input.totals.discountTotalMicros))) : NOTHING,
      input.pricesIncludeTax ? note({ text: label('pricesIncludeTax'), italics: true, color: MUTED }) : NOTHING,
      input.amountInWords
        ? note(labelled(label('amountInWords'), amountInWords(input.totals.totalMicros, input.currencyCode, pack.code)))
        : NOTHING,
    ];
    if (style.narrow) return { stack: [table, ...extras], margin: [0, 0, 0, 10] };
    return { columns: [{ ...NOTHING, width: '*' }, { stack: [table, ...extras], width: 240 }], margin: [0, 0, 0, 12] };
  };

  const paymentDetails = (): Node =>
    input.brand.paymentDetails ? labelled(label('paymentDetails'), input.brand.paymentDetails, { margin: [0, 0, 0, 8] }) : NOTHING;

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
      ...(style.top === 'letter'
        ? [{ text: lines([input.seller.name, partyFacts(input.seller), identifiers('SELLER')]), fontSize: style.base - 2, color: MUTED, margin: [0, 0, 0, 6] }]
        : []),
      input.taxNotes.length > 0 ? { text: lines(input.taxNotes), fontSize: size.small } : NOTHING,
      input.mentions ? { text: input.mentions, fontSize: size.small, margin: [0, 4, 0, 0] } : NOTHING,
      input.brand.footerNote ? { text: input.brand.footerNote, fontSize: style.base - 2, color: MUTED, margin: [0, 6, 0, 0] } : NOTHING,
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
    margin: [style.side, 14, style.side, 0],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: HAIRLINE }] },
      {
        columns: [
          { text: input.number ?? pack.draft, fontSize: style.base - 2, color: MUTED },
          { text: `${label('page')} ${currentPage} ${label('of')} ${pageCount}`, alignment: 'right', fontSize: style.base - 2, color: MUTED },
        ],
        margin: [0, 5, 0, 0],
      },
    ],
  });

  const tops = { ruled: ruledTop, banner: bannerTop, stamp: stampTop, letter: letterTop, stacked: stackedTop };
  const wrap = (node: Node): Node => breakable(node, block, style.base) as Node;
  return {
    /** Everything above the lines table: title, facts, seller, buyer, subject and notes, as the look arranges them. */
    top: (): Node[] => tops[style.top]().map(wrap),
    lines: (): Node => wrap(linesTable()),
    tail: (): Node => wrap(tail()),
    footer,
  };
}
