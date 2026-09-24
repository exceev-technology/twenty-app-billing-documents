import { blocks } from '../blocks.ts';
import type { Layout } from '../types.ts';

/** Small header, tight rows: roughly twice as many lines before the first break. */
export const compact: Layout = (input, pack) => {
  const page = blocks(input, pack, {
    base: 8, rules: true, dense: true, showBuyer: true,
    headerBand: false, sellerInFooter: false, narrow: false,
  });
  return {
    pageSize: 'A4',
    pageMargins: [32, 28, 32, 48],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.05 },
    content: [page.header(), page.parties(), page.subjectAndNotes(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
