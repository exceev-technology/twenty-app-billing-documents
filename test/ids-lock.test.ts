import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDS } from '../src/ids.ts';
import { lockViolations } from '../src/lib/id-lock.ts';

test('an identical registry honours the lock', () => {
  assert.deepEqual(lockViolations({ a: '1' }, { a: '1' }), []);
});

test('a registry may add identifiers', () => {
  assert.deepEqual(lockViolations({ a: '1' }, { a: '1', b: '2' }), []);
});

test('a changed identifier is a violation', () => {
  assert.deepEqual(lockViolations({ a: '1' }, { a: '9' }), ['a: released as 1, now 9']);
});

test('a removed identifier is a violation', () => {
  assert.deepEqual(lockViolations({ a: '1' }, {}), ['a: released as 1, now missing from src/ids.ts']);
});

test('the registry honours the repository lock', () => {
  const lock = JSON.parse(readFileSync(new URL('../ids.lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    lockViolations(lock, IDS),
    [],
    'A released identifier was changed or removed. Released identifiers are permanent: restore it.',
  );
});
