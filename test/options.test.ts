import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as options from '../src/schema/options.ts';

const lists = Object.entries(options).filter(([, value]) => Array.isArray(value)) as [string, readonly (readonly string[])[]][];

test('option values are UPPER_SNAKE_CASE and unique within their list', () => {
  for (const [name, list] of lists) {
    const values = list.map(([value]) => value);
    for (const value of values) assert.match(value, /^[A-Z][A-Z0-9_]*$/, `${name}: ${value}`);
    assert.equal(new Set(values).size, values.length, `${name} repeats a value`);
  }
});

test('every unit has a UN/ECE Recommendation 20 code', () => {
  for (const [value] of options.UNITS) assert.match(options.UNECE_UNIT_CODES[value] ?? '', /^[A-Z0-9]{2,3}$/, value);
});
