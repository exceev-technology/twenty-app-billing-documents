import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, periodKey, validatePattern } from '../../engine/numbering.ts';
import { EngineError } from '../../engine/problems.ts';

test('a pattern fills in the year, the month and the padded sequence', () => {
  assert.equal(formatNumber('INV-{YYYY}-{SEQ:4}', 17, '2026-09-22'), 'INV-2026-0017');
  assert.equal(formatNumber('FA{YY}{MM}-{SEQ:3}', 5, '2026-09-22'), 'FA2609-005');
  assert.equal(formatNumber('{SEQ:6}', 42, '2026-09-22'), '000042');
});

test('the sequence is padded, never truncated', () => {
  assert.equal(formatNumber('INV-{SEQ:4}', 12345, '2026-01-01'), 'INV-12345');
});

test('the date is read from its digits, so 31 December stays in its year', () => {
  assert.equal(formatNumber('{YYYY}-{SEQ:1}', 1, '2026-12-31'), '2026-1');
  assert.equal(periodKey('YEARLY', '2026-12-31'), '2026');
});

test('the period key follows the reset', () => {
  assert.equal(periodKey('NEVER', '2026-09-22'), 'ALL');
  assert.equal(periodKey('YEARLY', '2026-09-22'), '2026');
  assert.equal(periodKey('MONTHLY', '2026-09-22'), '2026-09');
});

test('a valid pattern has no problem', () => {
  assert.deepEqual(validatePattern('INV-{YYYY}-{SEQ:4}', 'YEARLY'), []);
  assert.deepEqual(validatePattern('FA{YY}{MM}-{SEQ:3}', 'MONTHLY'), []);
  assert.deepEqual(validatePattern('{SEQ:6}', 'NEVER'), []);
});

test('an unknown or misspelt token is refused, never printed', () => {
  assert.deepEqual(validatePattern('INV-{YEAR}-{SEQ:4}', 'NEVER'), [{ code: 'INVALID_PATTERN', value: '{YEAR}' }]);
  assert.deepEqual(validatePattern('INV-{SEQ}', 'NEVER'), [
    { code: 'INVALID_PATTERN', value: '{SEQ}' },
    { code: 'INVALID_PATTERN', value: 'INV-{SEQ}' },
  ]);
});

test('{SEQ:n} appears once, with n from 1 to 9, and braces are balanced', () => {
  for (const pattern of ['INV-{YYYY}', '{SEQ:2}-{SEQ:3}', 'INV-{SEQ:4', 'INV-SEQ:4}']) {
    assert.deepEqual(validatePattern(pattern, 'NEVER'), [{ code: 'INVALID_PATTERN', value: pattern }], pattern);
  }
  for (const pattern of ['{SEQ:0}', '{SEQ:10}']) assert.equal(validatePattern(pattern, 'NEVER')[0]?.value, pattern);
});

test('a reset that would repeat numbers is refused', () => {
  assert.deepEqual(validatePattern('INV-{SEQ:4}', 'YEARLY'), [{ code: 'PATTERN_REPEATS_NUMBERS', value: 'YEARLY' }]);
  assert.deepEqual(validatePattern('INV-{YYYY}-{SEQ:4}', 'MONTHLY'), [{ code: 'PATTERN_REPEATS_NUMBERS', value: 'MONTHLY' }]);
  assert.deepEqual(validatePattern('INV-{MM}-{SEQ:4}', 'MONTHLY'), [{ code: 'PATTERN_REPEATS_NUMBERS', value: 'MONTHLY' }]);
  assert.deepEqual(validatePattern('INV-{SEQ:4}', 'NEVER'), []);
});

test('formatting refuses a broken pattern, a bad sequence or a bad date', () => {
  assert.throws(
    () => formatNumber('INV-{YEAR}-{SEQ:4}', 1, '2026-09-22'),
    (error: unknown) => error instanceof EngineError && error.problems[0]?.code === 'INVALID_PATTERN',
  );
  assert.throws(() => formatNumber('{SEQ:4}', 0, '2026-09-22'), /positive integer/);
  assert.throws(() => formatNumber('{SEQ:4}', 1.5, '2026-09-22'), /positive integer/);
  assert.throws(() => formatNumber('{SEQ:4}', 1, '22/09/2026'), /YYYY-MM-DD/);
});

test('a reset other than never, yearly or monthly is refused, never read as monthly', () => {
  for (const reset of [null, '', 'yearly'] as const) {
    assert.throws(() => validatePattern('INV-{YYYY}-{SEQ:4}', reset as never), /NEVER, YEARLY or MONTHLY/);
    assert.throws(() => periodKey(reset as never, '2026-09-22'), /NEVER, YEARLY or MONTHLY/);
  }
});

test('an impossible date is refused, whatever the reset', () => {
  assert.throws(() => formatNumber('{YYYY}{MM}-{SEQ:3}', 1, '2026-13-40'), /YYYY-MM-DD/);
  assert.throws(() => periodKey('NEVER', 'not a date'), /YYYY-MM-DD/);
});
