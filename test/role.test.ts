import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_OBJECT, SystemPermissionFlag } from 'twenty-sdk/define';
import role from '../src/roles/billing.role.ts';
import { APP_OBJECTS, STANDARD_TARGETS } from '../src/schema/names.ts';
import { objectId } from '../src/schema/fields.ts';

const permission = (objectUid: string) =>
  role.config.objectPermissions?.find((p) => p.objectUniversalIdentifier === objectUid);

test('the role validates', () => {
  assert.equal(role.success, true, role.errors.join('\n'));
});

test('it grants nothing globally', () => {
  const c = role.config;
  for (const flag of [c.canReadAllObjectRecords, c.canUpdateAllObjectRecords, c.canSoftDeleteAllObjectRecords, c.canDestroyAllObjectRecords, c.canUpdateAllSettings, c.canAccessAllTools]) {
    assert.equal(flag, false);
  }
});

test('it reads, writes and soft-deletes every app object, and destroys none', () => {
  for (const object of APP_OBJECTS) {
    const p = permission(objectId(object));
    assert.ok(p, object);
    assert.deepEqual(
      [p.canReadObjectRecords, p.canUpdateObjectRecords, p.canSoftDeleteObjectRecords, p.canDestroyObjectRecords],
      [true, true, true, false],
      object,
    );
  }
});

test('it only reads companies, people and opportunities', () => {
  for (const object of STANDARD_TARGETS) {
    const p = permission(STANDARD_OBJECT[object].universalIdentifier);
    assert.ok(p, object);
    assert.deepEqual(
      [p.canReadObjectRecords, p.canUpdateObjectRecords, p.canSoftDeleteObjectRecords, p.canDestroyObjectRecords],
      [true, false, false, false],
      object,
    );
  }
});

test('it may upload PDFs', () => {
  assert.ok(role.config.permissionFlagUniversalIdentifiers?.includes(SystemPermissionFlag.UPLOAD_FILE));
});

test('it belongs to the app alone', () => {
  assert.deepEqual(
    [role.config.canBeAssignedToUsers, role.config.canBeAssignedToAgents, role.config.canBeAssignedToApiKeys],
    [false, false, false],
  );
});
