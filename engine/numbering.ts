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

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The Gregorian rule: every 4th year, except centuries, except every 4th century. */
const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The first and last day of a period: '2026' is the year, '2026-09' the month, 'ALL' has no bounds. The inverse of periodKey. */
export function periodBounds(key: string): { gte: string; lte: string } | null {
  if (key === 'ALL') return null;
  const year = /^(\d{4})$/.exec(key);
  if (year) return { gte: `${key}-01-01`, lte: `${key}-12-31` };
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!month) throw new Error(`A period is ALL, YYYY or YYYY-MM, not "${key}"`);
  const [, y, m] = month;
  const last = m === '02' && isLeapYear(Number(y)) ? 29 : DAYS_IN_MONTH[Number(m) - 1]!;
  return { gte: `${key}-01`, lte: `${key}-${String(last).padStart(2, '0')}` };
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The sequence a number was formatted from, read back through its pattern;
 * null when the number does not fit it. Reuses the same token grammar as
 * `validatePattern` and `formatNumber`: a token that is neither a date token
 * nor a valid {SEQ:n} can never be the sequence, so a future token the
 * grammar grows is never misread as one.
 */
export function sequenceOf(pattern: string, number: string): number | null {
  let group = 0;
  let sequenceGroup = 0;
  const source = pattern.split(/(\{[^{}]*\})/).map((part) => {
    const token = /^\{([^{}]*)\}$/.exec(part)?.[1];
    if (token === undefined) return escape(part);
    group += 1;
    if (token === 'YYYY') return '(\\d{4})';
    if (token === 'YY' || token === 'MM') return '(\\d{2})';
    if (SEQ.test(token)) {
      sequenceGroup = group;
      return '(\\d+)';
    }
    // Neither a date token nor {SEQ:n}: a pattern the Engine validated never
    // has one, but reading a number back must not mistake it for the sequence.
    return escape(part);
  }).join('');
  const match = new RegExp(`^${source}$`).exec(number);
  return match && sequenceGroup > 0 ? Number(match[sequenceGroup]) : null;
}
