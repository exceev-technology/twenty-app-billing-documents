import { blocks } from '../blocks.ts';
import type { Layout } from '../types.ts';

/** The top 45 mm stay empty for pre-printed paper; the seller prints below. */
export const letterhead: Layout = (input, pack) => {
  const page = blocks(input, pack, {
    base: 9, rules: true, dense: false, showBuyer: true,
    headerBand: false, sellerInFooter: true, narrow: false, totalsPanel: 'plain',
  });
  return {
    pageSize: 'A4',
    pageMargins: [40, 128, 40, 60], // 45 mm is 127.6pt
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 },
    content: [page.header(), page.parties(), page.subjectAndNotes(), page.lines(), page.tail()],
    footer: page.footer,
  };
};
