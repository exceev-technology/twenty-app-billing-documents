import { test } from 'node:test';
import assert from 'node:assert/strict';
import fn, { runSeed } from '../src/logic-functions/seed-presets.ts';
import tool from '../src/logic-functions/create-missing-presets.ts';
import { PRESETS } from '../src/presets/index.ts';
import { fakeTwentyRest } from './helpers/fake-twenty.ts';

test('the post-install function validates and runs on every upgrade', () => {
  assert.equal(fn.success, true, fn.errors.join('\n'));
  assert.equal(fn.config.shouldRunOnVersionUpgrade, true);
  assert.equal(fn.config.timeoutSeconds, 300);
});

test('the seeder is also an AI tool that takes no input, for Twenty’s assistant and MCP clients', () => {
  assert.equal(tool.success, true, tool.errors.join('\n'));
  assert.deepEqual(tool.config.toolTriggerSettings, { inputSchema: { type: 'object', properties: {} } });
  assert.equal(tool.config.timeoutSeconds, 300);
  assert.notEqual(tool.config.universalIdentifier, fn.config.universalIdentifier);
});

test('through the REST API, a first run seeds every preset and a second adds nothing', async () => {
  const twenty = fakeTwentyRest();
  const first = await runSeed(twenty);
  assert.equal(first.profiles, PRESETS.length);
  assert.equal(twenty.tables.get('billingTaxCodes')!.length, PRESETS.reduce((n, p) => n + p.taxCodes.length, 0));
  assert.deepEqual(await runSeed(twenty), { profiles: 0, identifierTypes: 0, taxCodes: 0, taxComponents: 0 });
});
