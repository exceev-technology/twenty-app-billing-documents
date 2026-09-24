import { EngineError, type Problem } from './problems.ts';

export type NumberingReset = 'NEVER' | 'YEARLY' | 'MONTHLY';

const ISSUE_DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TOKEN = /\{([^{}]*)\}/g;
const SEQ = /^SEQ:([1-9])$/;
const DATE_TOKENS = ['YYYY', 'YY', 'MM'];

/** Refuses any reset other than NEVER, YEARLY or MONTHLY: never silently read as monthly. */
function checkReset(reset: NumberingReset): void {
  if (reset !== 'NEVER' && reset !== 'YEARLY' && reset !== 'MONTHLY') {
    throw new Error(`A numbering reset is NEVER, YEARLY or MONTHLY, not "${reset}"`);
  }
}

/** The year and month of a YYYY-MM-DD string, read from its digits: no time zone can move them. */
function yearMonth(issueDate: string): { year: string; month: string } {
  const match = ISSUE_DATE.exec(issueDate);
  if (!match) throw new Error(`An issue date is YYYY-MM-DD, not "${issueDate}"`);
  return { year: match[1]!, month: match[2]! };
}

export function validatePattern(pattern: string, reset: NumberingReset): Problem[] {
  checkReset(reset);
  const problems: Problem[] = [];
  const tokens = [...pattern.matchAll(TOKEN)].map((match) => match[1]!);
  for (const token of tokens) {
    if (!DATE_TOKENS.includes(token) && !SEQ.test(token)) problems.push({ code: 'INVALID_PATTERN', value: `{${token}}` });
  }
  const strayBrace = /[{}]/.test(pattern.replace(TOKEN, ''));
  const sequences = tokens.filter((token) => SEQ.test(token)).length;
  if (strayBrace || sequences !== 1) problems.push({ code: 'INVALID_PATTERN', value: pattern });
  const hasYear = tokens.includes('YYYY') || tokens.includes('YY');
  if ((reset === 'YEARLY' && !hasYear) || (reset === 'MONTHLY' && !(hasYear && tokens.includes('MM')))) {
    problems.push({ code: 'PATTERN_REPEATS_NUMBERS', value: reset });
  }
  return problems;
}

export function formatNumber(pattern: string, sequence: number, issueDate: string): string {
  const problems = validatePattern(pattern, 'NEVER');
  if (problems.length > 0) throw new EngineError(problems);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error(`A sequence is a positive integer, not ${sequence}`);
  const { year, month } = yearMonth(issueDate);
  return pattern.replace(TOKEN, (_whole, token: string) => {
    if (token === 'YYYY') return year;
    if (token === 'YY') return year.slice(2);
    if (token === 'MM') return month;
    return String(sequence).padStart(Number(SEQ.exec(token)![1]), '0');
  });
}

export function periodKey(reset: NumberingReset, issueDate: string): string {
  checkReset(reset);
  const { year, month } = yearMonth(issueDate);
  if (reset === 'NEVER') return 'ALL';
  return reset === 'YEARLY' ? year : `${year}-${month}`;
}
