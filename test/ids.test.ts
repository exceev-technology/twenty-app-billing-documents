import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDS } from '../src/ids.ts';
import { id } from '../src/lib/id.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('every registered identifier is a lowercase v4 UUID', () => {
  for (const [key, value] of Object.entries(IDS)) assert.match(value, UUID_V4, key);
});

test('no identifier is registered twice', () => {
  const values = Object.values(IDS);
  assert.equal(new Set(values).size, values.length);
});

test('id() returns the registered identifier', () => {
  assert.equal(id('app'), IDS.app);
});

test('id() refuses a key the registry does not have, and says how to fix it', () => {
  assert.throws(() => id('field.nothing.here'), /npm run ids:sync/);
});

test('id() refuses a key that could not be written back into the registry safely', () => {
  assert.throws(() => id("bad'key"), /Invalid identifier key/);
});
