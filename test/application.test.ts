import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/application-config.ts';

test('the application manifest validates', () => {
  assert.equal(app.success, true, app.errors.join('\n'));
});

test('the application is listed as Billing Documents, in Sales, by Exceev Technology', () => {
  assert.equal(app.config.displayName, 'Billing Documents');
  assert.equal(app.config.category, 'Sales');
  assert.equal(app.config.author, 'Exceev Technology');
});
