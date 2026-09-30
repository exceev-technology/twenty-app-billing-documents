import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadWith } from '../src/lib/twenty-stores.ts';

const FIELD = 'field:billingInvoice.pdf';
// A view into the middle of a larger buffer, as a renderer can hand its bytes back: the upload must send these five bytes, not the backing store.
const BACKING = new Uint8Array([9, 9, 0x25, 0x50, 0x44, 0x46, 0x2d, 9, 9]);
const PDF = BACKING.subarray(2, 7);

type Received = { fileBuffer: Buffer; filename: string; contentType?: string; size: number; fieldMetadataUniversalIdentifier: string };

/** Twenty 2.41's client, with its real parameter list: positional, and the content type defaulted. */
const positionalClient = () => {
  const received: Received[] = [];
  return {
    received,
    client: {
      async uploadFile(fileBuffer: Buffer, filename: string, contentType = 'application/octet-stream', fieldMetadataUniversalIdentifier: string) {
        received.push({ fileBuffer, filename, contentType, size: fileBuffer.byteLength, fieldMetadataUniversalIdentifier });
        return { id: 'file-41' };
      },
    },
  };
};

/** Twenty 2.42 and later: one options object, and the size read from the buffer, as the real client does for `createFileUpload`. */
const optionsClient = () => {
  const received: Received[] = [];
  return {
    received,
    client: {
      async uploadFile({ fileBuffer, filename, fieldMetadataUniversalIdentifier }: { fileBuffer: Buffer; filename: string; fieldMetadataUniversalIdentifier: string }) {
        received.push({ fileBuffer, filename, size: fileBuffer.byteLength, fieldMetadataUniversalIdentifier });
        return { id: 'file-42' };
      },
    },
  };
};

const sentBytes = (r: Received | undefined): number[] => Array.from(r?.fileBuffer ?? []);

test('a PDF is uploaded through the positional client of Twenty 2.41, as application/pdf', async () => {
  const { client, received } = positionalClient();
  assert.deepEqual(await uploadWith(client, PDF, 'F2026-0001.pdf', 'application/pdf', FIELD), { id: 'file-41' });
  assert.equal(received.length, 1);
  assert.deepEqual(sentBytes(received[0]), [0x25, 0x50, 0x44, 0x46, 0x2d]);
  assert.equal(received[0]?.size, PDF.length);
  assert.equal(received[0]?.filename, 'F2026-0001.pdf');
  assert.equal(received[0]?.contentType, 'application/pdf');
  assert.equal(received[0]?.fieldMetadataUniversalIdentifier, FIELD);
});

test('a PDF is uploaded through the options client of Twenty 2.42 and later', async () => {
  const { client, received } = optionsClient();
  assert.deepEqual(await uploadWith(client, PDF, 'F2026-0001.pdf', 'application/pdf', FIELD), { id: 'file-42' });
  assert.equal(received.length, 1);
  assert.deepEqual(sentBytes(received[0]), [0x25, 0x50, 0x44, 0x46, 0x2d]);
  assert.equal(received[0]?.size, PDF.length);
  assert.equal(received[0]?.filename, 'F2026-0001.pdf');
  assert.equal(received[0]?.fieldMetadataUniversalIdentifier, FIELD);
});
