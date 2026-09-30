import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { RestApiClient } from 'twenty-client-sdk/rest';
import type { CallerStore, Store } from '../../lifecycle/store.ts';
import { TIMELINE_TYPE_KEYS } from '../front-components/timeline-message.ts';
import { fieldId } from '../schema/fields.ts';
import { id } from './id.ts';
import { restCallerStore, restStore, type TimelineType } from './rest-store.ts';

/**
 * The stores a logic function uses, built on each run: Twenty's clients cache
 * their token, and a warm process shares module state between runs, so a client
 * kept at module scope could act with another person's token.
 */

/** The app's store: reads, and every write after the caller's first. */
export function appStore(log: (entry: Record<string, unknown>) => void): Store {
  const rest = new RestApiClient({ runAs: 'application' });
  const metadata = new MetadataApiClient({ runAs: 'application' });
  return restStore({
    rest,
    uploadFile: (bytes, name, mime, field) => metadata.uploadFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), name, mime, field),
    fetchFile: (url) => fetch(url),
    timelineTypes: async () => {
      const result = await metadata.query({ timelineActivityTypes: { id: true, universalIdentifier: true, isActive: true } });
      return result.timelineActivityTypes as TimelineType[];
    },
    fieldId,
    timelineTypeIds: { ISSUED: id(TIMELINE_TYPE_KEYS.ISSUED), CORRECTION: id(TIMELINE_TYPE_KEYS.CORRECTION) },
    log,
  });
}

/** The caller's store: their delegated token, so Twenty checks the caller's role (intersected with the app's). */
export function callerStore(): CallerStore {
  return restCallerStore(new RestApiClient({ runAs: 'user' }));
}
