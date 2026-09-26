import {
  DuplicateError, NotAllowedError,
  type Condition, type ListOptions, type RecordEvent, type Row, type Store, type TimelineEntry, type Upload, type Where,
} from '../../../lifecycle/store.ts';

export type MemoryEvent = RecordEvent & { plural: string };
export type MemoryWrite = { op: string; plural: string; id: string; data?: Record<string, unknown>; source: string };

/** Twenty refuses a person's write of a field whose writability is APPLICATION. */
export class NotWritableError extends Error {
  constructor(field: string) {
    super(`field "${field}" is not writable through the API`);
    this.name = 'NotWritableError';
  }
}

type Options = {
  /** Fields no two rows may share, soft-deleted rows included. Blank values never collide. */
  unique?: Readonly<Record<string, readonly string[]>>;
  /** Fields only the app may write. */
  appOnly?: Readonly<Record<string, readonly string[]>>;
};

type FailureTest = (op: string, plural: string, data?: Record<string, unknown>) => boolean;

const blank = (value: unknown): boolean => value === null || value === undefined || value === '';
const copy = <T>(value: T): T => structuredClone(value);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function matches(value: unknown, condition: Condition): boolean {
  if (condition === null) return blank(value);
  if (typeof condition === 'object') {
    if ('notNull' in condition) return !blank(value);
    if (blank(value)) return false;
    const text = String(value);
    return (condition.gte === undefined || text >= condition.gte) && (condition.lte === undefined || text <= condition.lte);
  }
  return value === condition;
}

/** An in-memory stand-in for a workspace, with Twenty's behaviour where Lifecycle depends on it. */
export function memoryDb(options: Options = {}) {
  const tables = new Map<string, Row[]>();
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  const timeline: TimelineEntry[] = [];
  const writes: MemoryWrite[] = [];
  const events: MemoryEvent[] = [];
  const failures: { when: FailureTest; error: Error }[] = [];
  let tick = 0;
  let serial = 0;

  const table = (plural: string): Row[] => {
    if (!tables.has(plural)) tables.set(plural, []);
    return tables.get(plural)!;
  };
  const stamp = (): string => new Date(Date.UTC(2026, 8, 1) + ++tick * 1000).toISOString();
  const newId = (): string => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;

  function injected(op: string, plural: string, data?: Record<string, unknown>): void {
    const index = failures.findIndex((failure) => failure.when(op, plural, data));
    if (index === -1) return;
    const [failure] = failures.splice(index, 1);
    throw failure!.error;
  }

  function checkUnique(plural: string, row: Row): void {
    for (const field of options.unique?.[plural] ?? []) {
      if (blank(row[field])) continue;
      if (table(plural).some((other) => other.id !== row.id && other[field] === row[field])) {
        throw new DuplicateError(`A duplicate entry was detected: unique constraint ${plural}.${field} was violated`);
      }
    }
  }

  /**
   * Like Twenty: `updatedAt` never counts as a change, and an update, delete or
   * restore that changes nothing emits no event. A write of the same values by
   * another actor still changes `updatedBy`, so it does emit one.
   */
  function emit(name: RecordEvent['name'], plural: string, before: Row | null, after: Row): void {
    const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
    fields.delete('updatedAt');
    const updatedFields = before === null ? [] : [...fields].filter((field) => !same(before[field], after[field]));
    if (name !== 'created' && updatedFields.length === 0) return;
    events.push({ name, plural, recordId: after.id, before: before && copy(before), after: copy(after), updatedFields });
  }

  function store(source: 'APPLICATION' | 'MANUAL' = 'APPLICATION', permissions: { canUpdate?: (plural: string) => boolean } = {}): Store {
    const actor = { source, workspaceMemberId: source === 'MANUAL' ? 'member-1' : null, name: source === 'APPLICATION' ? 'Billing Documents' : 'A person' };

    function allowed(plural: string, data: Record<string, unknown> = {}): void {
      if (permissions.canUpdate && !permissions.canUpdate(plural)) throw new NotAllowedError(`This role cannot edit ${plural}`);
      if (source === 'APPLICATION') return;
      for (const field of Object.keys(data)) if (options.appOnly?.[plural]?.includes(field)) throw new NotWritableError(field);
    }

    function live(plural: string, id: string): [Row[], number] {
      const rows = table(plural);
      const index = rows.findIndex((row) => row.id === id && !row.deletedAt);
      if (index === -1) throw new Error(`No ${plural} record ${id}`);
      return [rows, index];
    }

    /** Like Twenty: an update reaches a row whether it is live or soft-deleted. */
    function existing(plural: string, id: string): [Row[], number] {
      const rows = table(plural);
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) throw new Error(`No ${plural} record ${id}`);
      return [rows, index];
    }

    return {
      async get(plural, id, getOptions) {
        const row = table(plural).find((candidate) => candidate.id === id);
        if (!row || (row.deletedAt && !getOptions?.deleted)) return null;
        return copy(row);
      },

      async list(plural, where: Where, listOptions: ListOptions = {}) {
        const deleted = listOptions.deleted ?? 'exclude';
        let rows = table(plural).filter((row) => {
          if (deleted === 'exclude' && row.deletedAt) return false;
          if (deleted === 'only' && !row.deletedAt) return false;
          return Object.entries(where).every(([field, condition]) => matches(row[field], condition));
        });
        if (listOptions.orderBy) {
          const { field, direction } = listOptions.orderBy;
          const sign = direction === 'asc' ? 1 : -1;
          rows = [...rows].sort((a, b) => sign * String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
        }
        return copy(rows.slice(0, listOptions.limit ?? rows.length));
      },

      async create(plural, data) {
        injected('create', plural, data);
        allowed(plural, data);
        const now = stamp();
        const row: Row = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, ...copy(data), createdBy: actor, updatedBy: actor };
        checkUnique(plural, row);
        table(plural).push(row);
        writes.push({ op: 'create', plural, id: row.id, data: copy(data), source });
        emit('created', plural, null, row);
        return copy(row);
      },

      async update(plural, id, data) {
        injected('update', plural, data);
        allowed(plural, data);
        const [rows, index] = existing(plural, id);
        const before = rows[index]!;
        // Twenty accepts an update to a soft-deleted row and leaves it deleted:
        // `deletedAt` carries over from `before` unless `data` itself sets it.
        const after: Row = { ...before, ...copy(data), updatedAt: stamp(), updatedBy: actor };
        checkUnique(plural, after);
        rows[index] = after;
        writes.push({ op: 'update', plural, id, data: copy(data), source });
        emit('updated', plural, before, after);
        return copy(after);
      },

      async softDelete(plural, id) {
        injected('softDelete', plural);
        allowed(plural);
        const [rows, index] = live(plural, id);
        const before = rows[index]!;
        // Twenty leaves updatedBy alone on a soft delete.
        const after: Row = { ...before, deletedAt: stamp() };
        rows[index] = after;
        writes.push({ op: 'softDelete', plural, id, source });
        emit('deleted', plural, before, after);
      },

      async restore(plural, id) {
        injected('restore', plural);
        allowed(plural);
        const rows = table(plural);
        const index = rows.findIndex((row) => row.id === id && row.deletedAt);
        if (index === -1) throw new Error(`No deleted ${plural} record ${id}`);
        const before = rows[index]!;
        const after: Row = { ...before, deletedAt: null };
        rows[index] = after;
        writes.push({ op: 'restore', plural, id, source });
        emit('restored', plural, before, after);
      },

      async upload(file: Upload) {
        injected('upload', file.object);
        const fileId = `file-${++serial}`;
        files.set(fileId, { bytes: file.bytes, type: file.mime });
        writes.push({ op: 'upload', plural: file.object, id: fileId, source });
        return { fileId, label: file.name };
      },

      async download(file) {
        const fileId = (file as { fileId?: unknown } | null)?.fileId;
        return typeof fileId === 'string' ? (files.get(fileId) ?? null) : null;
      },

      async timeline(entry) {
        injected('timeline', entry.object);
        timeline.push(copy(entry));
      },
    };
  }

  return {
    timeline,
    writes,
    store,
    /** Puts a record in place, with no event: the state a test starts from. */
    seed(plural: string, data: Record<string, unknown>): Row {
      const now = stamp();
      const actor = { source: 'MANUAL', workspaceMemberId: 'member-1', name: 'A person' };
      const row: Row = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, createdBy: actor, updatedBy: actor, ...copy(data) };
      table(plural).push(row);
      return copy(row);
    },
    row: (plural: string, id: string): Row | undefined => copy(table(plural).find((row) => row.id === id)),
    rows: (plural: string): Row[] => copy(table(plural)),
    addFile(bytes: Uint8Array, type: string): string {
      const fileId = `file-${++serial}`;
      files.set(fileId, { bytes, type });
      return fileId;
    },
    /** The next operation `when` matches throws `error`, once. */
    failNext(when: FailureTest, error: Error = new Error('injected failure')): void {
      failures.push({ when, error });
    },
    /** The events recorded since the last call, oldest first. */
    takeEvents: (): MemoryEvent[] => events.splice(0),
  };
}

export type MemoryDb = ReturnType<typeof memoryDb>;

/**
 * Hands recorded events to the triggers, as the platform does after each
 * commit, until a round writes nothing. More than `limit` events means a
 * trigger keeps answering its own writes: a loop.
 */
export async function drain(db: MemoryDb, handle: (event: MemoryEvent) => Promise<void>, limit = 200): Promise<MemoryEvent[]> {
  const seen: MemoryEvent[] = [];
  for (;;) {
    const batch = db.takeEvents();
    if (batch.length === 0) return seen;
    if (seen.length + batch.length > limit) throw new Error(`still writing after ${limit} events: a trigger loops`);
    for (const event of batch) {
      seen.push(event);
      await handle(event);
    }
  }
}

/**
 * Runs flows whose store calls wait for the test: `step(name)` lets the named
 * flow's next call run, and waits until the flow has made its following call
 * or finished. `finish(...flows)` releases whatever is left, in arrival order,
 * until the given flows have settled (or, given none, until nothing is waiting).
 */
export function lockstep(db: MemoryDb) {
  type Pending = { name: string; run: () => void };
  const pending: Pending[] = [];
  const settle = async (): Promise<void> => {
    for (let round = 0; round < 50; round++) await new Promise((resolve) => setImmediate(resolve));
  };

  function flow(name: string): Store {
    const base = db.store();
    const wrap = <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      (...args: A): Promise<R> =>
        new Promise<R>((resolve, reject) => {
          pending.push({ name, run: () => void call(...args).then(resolve, reject) });
        });
    return {
      get: wrap(base.get), list: wrap(base.list), create: wrap(base.create), update: wrap(base.update),
      softDelete: wrap(base.softDelete), restore: wrap(base.restore), upload: wrap(base.upload),
      download: wrap(base.download), timeline: wrap(base.timeline),
    };
  }

  async function step(name: string): Promise<boolean> {
    await settle();
    const index = pending.findIndex((call) => call.name === name);
    if (index === -1) return false;
    const [call] = pending.splice(index, 1);
    call!.run();
    await settle();
    return true;
  }

  async function finish(...flows: Promise<unknown>[]): Promise<void> {
    let settled = false;
    void Promise.allSettled(flows).then(() => {
      settled = true;
    });
    for (;;) {
      await settle();
      const call = pending.shift();
      if (call) {
        call.run();
        continue;
      }
      if (settled || flows.length === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  return { flow, step, finish };
}
