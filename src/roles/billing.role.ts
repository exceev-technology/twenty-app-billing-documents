import { defineApplicationRole, STANDARD_OBJECT, SystemPermissionFlag } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { objectId } from '../schema/fields.ts';
import { APP_OBJECTS, STANDARD_TARGETS } from '../schema/names.ts';

/**
 * Nothing is granted globally: an application role reads as a deny list
 * (twentyhq/twenty#23461), so every object is listed on purpose. The app never
 * destroys a record; guards added by Lifecycle refuse to soft-delete a
 * numbered document.
 */
export default defineApplicationRole({
  universalIdentifier: id('role.billing'),
  label: 'Billing Documents',
  description: 'Reads and writes the app’s own records, reads companies, people and opportunities, and uploads PDFs. Never destroys a record.',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: false,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    ...APP_OBJECTS.map((object) => ({
      objectUniversalIdentifier: objectId(object),
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    })),
    ...STANDARD_TARGETS.map((object) => ({
      objectUniversalIdentifier: STANDARD_OBJECT[object].universalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    })),
  ],
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
});
