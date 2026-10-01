import { blocks } from '../blocks.ts';
import { INK } from '../tokens.ts';
import type { Layout } from '../types.ts';

// The look of pdfcn's invoice-corporate (MIT, see THIRD_PARTY_NOTICES.md), without its header: the paper has one.
/** The top 45 mm stay empty for pre-printed paper; the seller prints at the end. */
export const letterhead: Layout = (input, pack) => {
  const page = blocks(input, pack, { base: 9, side: 40, top: 'letter', table: 'framed', totalsPanel: 'card', notes: 'plain', narrow: false });
  return {
    pageSize: 'A4',
    pageMargins: [40, 128, 40, 60], // 45 mm is 127.6pt
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15, color: INK },
    content: [...page.top(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
