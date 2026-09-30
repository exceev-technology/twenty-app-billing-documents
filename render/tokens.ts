/**
 * The greys and the type scale every layout shares. The palette is pdfcn's zinc
 * greys and its proportions are pdfcn's (MIT, see THIRD_PARTY_NOTICES.md),
 * scaled from its 11 pt body to ours.
 */

/** Body text. */
export const INK = '#18181b';
/** Secondary text on white paper (4.8:1). */
export const MUTED = '#71717a';
/** Secondary text on a grey panel, where MUTED would fall under 4.5:1. */
export const MUTED_ON_PANEL = '#52525b';
/** A rule that carries structure, a frame or a row's edge: dark enough to survive an office printer. */
export const RULE = '#d4d4d8';
/** A hairline between rows, or under a heading. */
export const HAIRLINE = '#e4e4e7';
/** A table's header row, zebra rows and cards. */
export const PANEL = '#f4f4f5';

/** Every size a layout prints, from its body size. */
export const typeScale = (base: number) => ({
  /** Small labels over a block: never under 7 pt, the footer's size. */
  label: Math.max(7, base - 2),
  small: base - 1,
  body: base,
  /** The document number, where it stands out. */
  number: base + 2,
  /** The grand total, its label and its value alike: one baseline, so they copy as one line. */
  total: base + 2,
  title: base + 8,
});

/**
 * A small label over a block: medium weight, a little letter-spaced, never
 * upper-cased (what copies out of the PDF stays as the pack spells it). Only our
 * own labels: the width guard does not measure letter-spacing.
 */
export const smallLabel = (base: number, color: string = MUTED) => ({
  fontSize: typeScale(base).label,
  bold: true,
  color,
  characterSpacing: 0.4,
});
