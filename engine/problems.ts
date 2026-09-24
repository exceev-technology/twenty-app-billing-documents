export type ProblemCode =
  | 'NO_LINES'
  | 'INVALID_CURRENCY'
  | 'CURRENCY_MISMATCH'
  | 'MISSING_TAX_CODE'
  | 'INVALID_QUANTITY'
  | 'INVALID_RATE'
  | 'INVALID_DISCOUNT'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_TOO_LARGE'
  | 'MISSING_TAX_RATE'
  | 'TAX_CODE_CONFLICT'
  | 'INVALID_PATTERN'
  | 'PATTERN_REPEATS_NUMBERS';

/** A problem is data: Rendering's language packs word it in the document's language. */
export type Problem = { code: ProblemCode; line?: string; value?: string | number | null };

export class EngineError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    super(`The engine refused: ${problems.map((problem) => problem.code).join(', ')}`);
    this.name = 'EngineError';
    this.problems = problems;
  }
}
