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

type UploadedFile = { id: string };
/** Twenty 2.40 and 2.41: positional, one multipart request, the content type ours to give. */
type PositionalUpload = (fileBuffer: Buffer, filename: string, contentType: string | undefined, fieldMetadataUniversalIdentifier: string) => Promise<UploadedFile>;
/** Twenty 2.42 and later: one options object, the server decides the content type. */
type OptionsUpload = (upload: { fileBuffer: Buffer; filename: string; fieldMetadataUniversalIdentifier: string }) => Promise<UploadedFile>;
export type UploadClient = { uploadFile: PositionalUpload | OptionsUpload };

/**
 * A function's `twenty-client-sdk/metadata` is external to its bundle, so at
 * runtime the class is the server's, not the version this app is built with, and
 * Twenty 2.42 changed `uploadFile` from positional arguments to one options
 * object. The app supports both (Twenty >= 2.40), so the shape is read from the
 * declared parameters: the options form declares one, the positional form two
 * (a parameter with a default, here the content type, and those after it are not
 * counted).
 */
const takesOptions = (uploadFile: UploadClient['uploadFile']): uploadFile is OptionsUpload => uploadFile.length <= 1;

/** Uploads a file to a FILES field through whichever `uploadFile` the client has. */
export function uploadWith(client: UploadClient, bytes: Uint8Array, name: string, mime: string, fieldUniversalIdentifier: string): Promise<UploadedFile> {
  const fileBuffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return takesOptions(client.uploadFile)
    ? client.uploadFile({ fileBuffer, filename: name, fieldMetadataUniversalIdentifier: fieldUniversalIdentifier })
    : client.uploadFile(fileBuffer, name, mime, fieldUniversalIdentifier);
}

/** The app's store: reads, and every write after the caller's first. */
export function appStore(log: (entry: Record<string, unknown>) => void): Store {
  const rest = new RestApiClient({ runAs: 'application' });
  const metadata = new MetadataApiClient({ runAs: 'application' });
  return restStore({
    rest,
    uploadFile: (bytes, name, mime, field) => uploadWith(metadata, bytes, name, mime, field),
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
