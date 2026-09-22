import { roundToMinor } from './money.ts';

/** Rate units in one: a rate is ten-thousandths of a percent, so 9.975 % is 99 750. */
export const RATE_SCALE = 1_000_000n;

/** One tax component, its rate already scaled. Components come in print order. */
export type RateComponent = { rate: bigint; compound: boolean };

/** A component's base and tax, in micros. */
export type ComponentTax = { base: bigint; tax: bigint };

export type Fraction = { n: bigint; d: bigint };

/** Each component on a net amount; a compound one on the net plus the taxes before it. */
function onNet(net: bigint, components: readonly RateComponent[], currencyCode: string): ComponentTax[] {
  const parts: ComponentTax[] = [];
  let before = 0n;
  for (const { rate, compound } of components) {
    const base = net + (compound ? before : 0n);
    const tax = roundToMinor(base * rate, RATE_SCALE, currencyCode);
    parts.push({ base, tax });
    before += tax;
  }
  return parts;
}

/**
 * Each component's exact share tᵢ of the net amount (compounding on the
 * shares before it), and the factor F = 1 + Σ tᵢ, gross ÷ net.
 */
function shares(components: readonly RateComponent[]): { parts: Fraction[]; factor: Fraction } {
  let taxes: Fraction = { n: 0n, d: 1n };
  const parts: Fraction[] = [];
  for (const { rate, compound } of components) {
    const base: Fraction = compound ? { n: taxes.d + taxes.n, d: taxes.d } : { n: 1n, d: 1n };
    const share: Fraction = { n: rate * base.n, d: RATE_SCALE * base.d };
    parts.push(share);
    taxes = { n: taxes.n * share.d + share.n * taxes.d, d: taxes.d * share.d };
  }
  return { parts, factor: { n: taxes.d + taxes.n, d: taxes.d } };
}

/** gross ÷ net for these components, as an exact fraction. */
export function grossFactor(components: readonly RateComponent[]): Fraction {
  return shares(components).factor;
}

/**
 * The taxes of one tax code on one amount: a line's total, or the total of
 * the code's lines. On gross prices each component takes its exact share of
 * the amount, rounded, and the net takes the remainder, so net + taxes = amount.
 */
export function taxOn(
  amount: bigint,
  components: readonly RateComponent[],
  pricesIncludeTax: boolean,
  currencyCode: string,
): { net: bigint; parts: ComponentTax[] } {
  if (!pricesIncludeTax) return { net: amount, parts: onNet(amount, components, currencyCode) };
  const { parts: componentShares, factor } = shares(components);
  const taxes = componentShares.map((share) => roundToMinor(amount * share.n * factor.d, share.d * factor.n, currencyCode));
  const net = amount - taxes.reduce((total, tax) => total + tax, 0n);
  const parts: ComponentTax[] = [];
  let before = 0n;
  components.forEach((component, i) => {
    const tax = taxes[i]!;
    parts.push({ base: net + (component.compound ? before : 0n), tax });
    before += tax;
  });
  return { net, parts };
}
