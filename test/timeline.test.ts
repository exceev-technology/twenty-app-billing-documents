import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import issued from '../src/timeline-activity-types/billing-issued.ts';
import correction from '../src/timeline-activity-types/billing-correction.ts';
import { TIMELINE_TYPE_KEYS, messageOf } from '../src/front-components/timeline-message.ts';
import { IDS } from '../src/ids.ts';
import { bundleFrontComponent } from './helpers/front-component-build.ts';

const COMPONENT = fileURLToPath(new URL('../src/front-components/billing-timeline-message.tsx', import.meta.url));

test('the two timeline types validate, emit nothing by themselves, and name the message component', () => {
  for (const type of [issued, correction]) {
    assert.equal(type.success, true, type.errors.join('\n'));
    assert.equal(type.config.emit, undefined);
    assert.equal(type.config.frontComponentUniversalIdentifier, IDS['frontComponent.billingTimelineMessage']);
  }
  assert.deepEqual([issued.config.name, issued.config.label], ['billingIssued', 'issued']);
  assert.deepEqual([correction.config.name, correction.config.label], ['billingCorrection', 'put back a change to']);
  assert.equal(issued.config.universalIdentifier, IDS[TIMELINE_TYPE_KEYS.ISSUED]);
  assert.equal(correction.config.universalIdentifier, IDS[TIMELINE_TYPE_KEYS.CORRECTION]);
});

test('the message is read from the timeline activity’s properties', () => {
  assert.equal(messageOf({ data: { timelineActivity: { properties: { message: 'Issued as F2026-0001.' } } } }), 'Issued as F2026-0001.');
  assert.equal(messageOf({ data: { timelineActivity: { properties: null } } }), null);
  assert.equal(messageOf({ data: { timelineActivity: { properties: { message: 42 } } } }), null);
  assert.equal(messageOf(null), null);
});

test('the message component bundles for the browser as the CLI builds it, with a render function as its default export', async () => {
  const { exports, inputs } = await bundleFrontComponent(COMPONENT);
  assert.deepEqual(exports, ['default']);
  assert.ok(!inputs.some((input) => input.startsWith('node:')), inputs.filter((input) => input.startsWith('node:')).join(', '));
  assert.ok(!inputs.some((input) => input.endsWith('src/lib/id.ts')), 'a browser bundle cannot import src/lib/id.ts');
});
