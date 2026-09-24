import { blocks } from '../blocks.ts';
import type { Layout } from '../types.ts';

/** Seller left, buyer right, a ruled table, totals at the bottom right. */
export const classic: Layout = (input, pack) => {
  const page = blocks(input, pack, {
    base: 9, rules: true, dense: false, showBuyer: true,
    headerBand: false, sellerInFooter: false, narrow: false,
  });
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 },
    content: [page.header(), page.parties(), page.subjectAndNotes(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
