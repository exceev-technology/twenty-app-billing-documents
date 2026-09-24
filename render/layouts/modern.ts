import { blocks } from '../blocks.ts';
import type { Layout } from '../types.ts';

/** An accent band across the top, a borderless table, airy rows. */
export const modern: Layout = (input, pack) => {
  const page = blocks(input, pack, {
    base: 9.5, rules: false, dense: false, showBuyer: true,
    headerBand: true, sellerInFooter: false, narrow: false,
  });
  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.2 },
    content: [page.header(), page.parties(), page.subjectAndNotes(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
