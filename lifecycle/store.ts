/**
 * Everything Lifecycle reads and writes goes through a Store: Twenty's REST API
 * in production (src/lib/rest-store.ts), memory in tests
 * (test/lifecycle/helpers/memory-store.ts). Records are the shapes the REST API
 * returns: fields by name, a relation as `<name>Id`, a composite field as an object.
 */

export type Row = { id: string; [field: string]: unknown };

/**
 * A condition on one field: equal to a value, empty (null), filled
 * (`{ notNull: true }`), or inside a range of YYYY-MM-DD dates.
 */
export type Condition = string | number | boolean | null | { notNull: true } | { gte?: string; lte?: string };
export type Where = Readonly<Record<string, Condition>>;

export type ListOptions = {
  /** Soft-deleted rows: left out (the default), included, or alone. */
  deleted?: 'exclude' | 'include' | 'only';
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
};

/** A file as a FILES field holds it. */
export type FileRef = { fileId: string; label: string };

/** A PDF to store: its bytes, and the object and field it is uploaded for. */
export type Upload = { bytes: Uint8Array; name: string; mime: string; object: string; field: string };

/**
 * A message left on a record's timeline, in the document's language. `kind` picks the
 * timeline activity type, whose label is what the collapsed row says: "issued" or
 * "put back a change to"; the text shows when the row is expanded.
 */
export type TimelineEntry = { object: string; recordId: string; kind: 'ISSUED' | 'CORRECTION'; text: string };

/** A database event, as a trigger hands it to Lifecycle. */
export type RecordEvent = {
  name: 'created' | 'updated' | 'deleted' | 'restored' | 'destroyed' | 'upserted';
  recordId: string;
  before: Row | null;
  after: Row | null;
  updatedFields: readonly string[];
};

export type Store = {
  /** A record by id; a soft-deleted one only when asked. Null when there is none. */
  get(plural: string, id: string, options?: { deleted?: boolean }): Promise<Row | null>;
  /** Every record matching `where`, following pages. */
  list(plural: string, where: Where, options?: ListOptions): Promise<Row[]>;
  create(plural: string, data: Record<string, unknown>): Promise<Row>;
  update(plural: string, id: string, data: Record<string, unknown>): Promise<Row>;
  softDelete(plural: string, id: string): Promise<void>;
  restore(plural: string, id: string): Promise<void>;
  upload(file: Upload): Promise<FileRef>;
  /** The bytes of a file a FILES field holds, or null when it cannot be read. */
  download(file: unknown): Promise<{ bytes: Uint8Array; type: string } | null>;
  timeline(entry: TimelineEntry): Promise<void>;
};

/** The caller's side of the route: one write, with the caller's own token. */
export type CallerStore = Pick<Store, 'update'>;

/** A unique key refused a value another record holds. */
export class DuplicateError extends Error {
  constructor(message = 'A duplicate entry was detected') {
    super(message);
    this.name = 'DuplicateError';
  }
}

/** Twenty's role check refused the write. */
export class NotAllowedError extends Error {
  constructor(message = 'Not allowed') {
    super(message);
    this.name = 'NotAllowedError';
  }
}

/** Who last wrote a record, as Twenty records it: 'APPLICATION' for the app, 'MANUAL' for a person. */
export function sourceOf(row: Row | null | undefined): string | null {
  const actor = row?.updatedBy as { source?: unknown } | null | undefined;
  return typeof actor?.source === 'string' ? actor.source : null;
}

/**
 * Leaves a timeline message after a correction. A message that cannot be
 * written (a muted timeline type, a network fault) never undoes the correction
 * it explains; the REST store logs the failure.
 */
export async function leaveMessage(store: Store, entry: TimelineEntry): Promise<void> {
  try {
    await store.timeline(entry);
  } catch {
    // The correction stands without its message.
  }
}
