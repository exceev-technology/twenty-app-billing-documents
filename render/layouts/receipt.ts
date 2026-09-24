import { blocks } from '../blocks.ts';
import type { Layout } from '../types.ts';

/** An 80 mm roll: one column, no buyer block, the height grows with the content. */
export const receipt: Layout = (input, pack) => {
  const page = blocks(input, pack, {
    base: 8, rules: false, dense: true, showBuyer: false,
    headerBand: false, sellerInFooter: false, narrow: true,
  });
  return {
    pageSize: { width: 226.77, height: 'auto' }, // 80 mm
    pageMargins: [12, 12, 12, 12],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 },
    content: [page.header(), page.parties(), page.subjectAndNotes(), page.lines(), page.tail()],
  };
};
