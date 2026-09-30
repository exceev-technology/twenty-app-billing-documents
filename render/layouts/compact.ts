import { blocks } from '../blocks.ts';
import { INK } from '../tokens.ts';
import type { Layout } from '../types.ts';

// The look of pdfcn's invoice-minimal (MIT, see THIRD_PARTY_NOTICES.md).
/** The title over a heavy rule beside a framed stamp, tight rows: roughly twice as many lines before the first break. */
export const compact: Layout = (input, pack) => {
  const page = blocks(input, pack, { base: 8, side: 32, top: 'stamp', table: 'tight', totalsPanel: 'plain', notes: 'plain', narrow: false });
  return {
    pageSize: 'A4',
    pageMargins: [32, 28, 32, 48],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.05, color: INK },
    content: [...page.top(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
