import { blocks } from '../blocks.ts';
import { INK } from '../tokens.ts';
import type { Layout } from '../types.ts';

// The look of pdfcn's invoice-classic (MIT, see THIRD_PARTY_NOTICES.md).
/** The logo and the facts over a rule, seller left and buyer right, a framed grid with grey rows, totals boxed at the bottom right. */
export const classic: Layout = (input, pack) => {
  const page = blocks(input, pack, { base: 9, side: 40, top: 'ruled', table: 'grid', totalsPanel: 'box', notes: 'callout', narrow: false });
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15, color: INK },
    content: [...page.top(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
