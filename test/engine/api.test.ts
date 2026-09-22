import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../engine/index.ts';

test('the engine exports its public API and nothing else', () => {
  assert.deepEqual(Object.keys(engine).sort(), ['EngineError', 'checkDocument', 'computeDocument', 'formatNumber', 'periodKey', 'validatePattern']);
});
