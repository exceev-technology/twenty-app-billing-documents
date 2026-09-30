import { blocks } from '../blocks.ts';
import { INK } from '../tokens.ts';
import type { Layout } from '../types.ts';

// The look of pdfcn's invoice-modern (MIT, see THIRD_PARTY_NOTICES.md).
/** An accent banner across the top, the facts in a row of small labels, the table's header row and the total in the accent. */
export const modern: Layout = (input, pack) => {
  const page = blocks(input, pack, { base: 9.5, side: 40, top: 'banner', table: 'accent', totalsPanel: 'tint', notes: 'plain', narrow: false });
  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.2, color: INK },
    content: [...page.top(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
