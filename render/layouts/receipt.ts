import { blocks } from '../blocks.ts';
import { INK } from '../tokens.ts';
import type { Layout } from '../types.ts';

/** An 80 mm roll: one column, no buyer block, the height grows with the content. */
export const receipt: Layout = (input, pack) => {
  const page = blocks(input, pack, { base: 8, side: 12, top: 'stacked', table: 'bare', totalsPanel: 'plain', notes: 'plain', narrow: true });
  return {
    pageSize: { width: 226.77, height: 'auto' }, // 80 mm
    pageMargins: [12, 12, 12, 12],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1, color: INK },
    content: [...page.top(), page.lines(), page.tail()],
  };
};
