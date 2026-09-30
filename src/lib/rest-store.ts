import {
  DuplicateError, NotAllowedError,
  type CallerStore, type Condition, type FileRef, type ListOptions, type Row, type Store, type TimelineEntry, type Upload, type Where,
} from '../../lifecycle/store.ts';

type Query = Record<string, string | number | boolean>;

/** The four calls of Twenty's RestApiClient the store makes. Paths, not generated types: a function bundle carries no type map. */
export type RestLike = {
  get<T = unknown>(path: string, options?: { query?: Query }): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, options?: { query?: Query }): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, options?: { query?: Query }): Promise<T>;
  delete<T = unknown>(path: string, options?: { query?: Query }): Promise<T>;
};

export type TimelineType = { id: string; universalIdentifier: string; isActive?: boolean | null };

export type RestStoreDeps = {
  /** A client acting as the app. */
  rest: RestLike;
  uploadFile: (bytes: Uint8Array, name: string, mime: string, fieldUniversalIdentifier: string) => Promise<{ id: string }>;
  fetchFile: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  timelineTypes: () => Promise<TimelineType[]>;
  fieldId: (object: string, field: string) => string;
  timelineTypeIds: Record<TimelineEntry['kind'], string>;
  log: (entry: Record<string, unknown>) => void;
};

const PAGE = 200;
const BOTH_STATES = 'or(deletedAt[is]:NULL,deletedAt[is]:NOT_NULL)';

/** A value Twenty's filter parser can carry. It has no escape: a quote, bracket or parenthesis would corrupt what follows. */
export function literal(value: string | number | boolean): string {
  const text = String(value);
  if (text === '' || /['"[\]()]/.test(text)) throw new Error(`Twenty's REST filter cannot carry ${JSON.stringify(text)}`);
  return /[,\s]/.test(text) ? `"${text}"` : text;
}

function conditionParts(field: string, condition: Condition): string[] {
  if (condition === null) return [`${field}[is]:NULL`];
  if (typeof condition === 'object') {
    if ('notNull' in condition) return [`${field}[is]:NOT_NULL`];
    return [
      ...(condition.gte !== undefined ? [`${field}[gte]:${literal(condition.gte)}`] : []),
      ...(condition.lte !== undefined ? [`${field}[lte]:${literal(condition.lte)}`] : []),
    ];
  }
  return [`${field}[eq]:${literal(condition)}`];
}

/** A where clause as Twenty's filter: conditions joined by commas, which Twenty reads as AND. */
export function toFilter(where: Where, deleted: 'exclude' | 'include' | 'only' = 'exclude'): string | undefined {
  const parts = Object.entries(where).flatMap(([field, condition]) => conditionParts(field, condition));
  if (deleted === 'only') parts.push('deletedAt[is]:NOT_NULL');
  if (deleted === 'include') parts.push(BOTH_STATES);
  return parts.length > 0 ? parts.join(',') : undefined;
}

const statusOf = (error: unknown): number | undefined => (error as { status?: number } | null)?.status;

/** Twenty's refusals as the Store's errors (400 PERMISSION_DENIED, 400 "A duplicate entry was detected"); anything else unchanged. */
export function translate(error: unknown): unknown {
  const failure = error as { name?: unknown; body?: unknown } | null;
  if (failure?.name !== 'RestApiClientError') return error;
  const body = (failure.body ?? {}) as { code?: unknown; messages?: unknown };
  const message = Array.isArray(body.messages) ? body.messages.map(String).join(' ') : '';
  if (body.code === 'PERMISSION_DENIED' || message.startsWith('Entity performing the request does not have permission')) return new NotAllowedError(message);
  if (statusOf(error) === 400 && message.startsWith('A duplicate entry was detected')) return new DuplicateError(message);
  return error;
}

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw translate(error);
  }
}

/** The one record under `data`, whatever Twenty named its key (`billingInvoice`, `updateBillingInvoice`...). */
function single(response: unknown, what: string): Row {
  const data = (response as { data?: Record<string, unknown> } | null)?.data;
  const row = data ? Object.values(data)[0] : undefined;
  if (!row || typeof row !== 'object' || typeof (row as Row).id !== 'string') {
    throw new Error(`Twenty did not return the ${what}: ${JSON.stringify(response).slice(0, 300)}`);
  }
  return row as Row;
}

const capital = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** The type an image's first bytes prove; the Renderer refuses anything else. */
function imageType(bytes: Uint8Array): string {
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'application/octet-stream';
}

export function restStore(deps: RestStoreDeps): Store {
  const { rest, log } = deps;
  let types: Promise<TimelineType[]> | undefined;

  async function list(plural: string, where: Where, options: ListOptions = {}): Promise<Row[]> {
    const rows: Row[] = [];
    const filter = toFilter(where, options.deleted);
    const orderBy = options.orderBy ? `${options.orderBy.field}[${options.orderBy.direction === 'asc' ? 'AscNullsLast' : 'DescNullsLast'}]` : undefined;
    let cursor: string | undefined;
    for (;;) {
      const query: Query = { depth: 0, limit: options.limit === undefined ? PAGE : Math.min(PAGE, options.limit - rows.length) };
      if (filter) query.filter = filter;
      if (orderBy) query.order_by = orderBy;
      if (cursor) query.starting_after = cursor;
      const response = await call(() => rest.get<{ data?: Record<string, unknown>; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } }>(`/rest/${plural}`, { query }));
      const page = response.data?.[plural];
      if (!Array.isArray(page)) throw new Error(`Twenty did not return a ${plural} list: ${JSON.stringify(response).slice(0, 300)}`);
      rows.push(...(page as Row[]));
      if (options.limit !== undefined && rows.length >= options.limit) return rows.slice(0, options.limit);
      const next = response.pageInfo?.hasNextPage ? response.pageInfo.endCursor : null;
      if (!next) return rows;
      cursor = next;
    }
  }

  return {
    async get(plural, id, options) {
      if (options?.deleted) return (await list(plural, { id }, { deleted: 'include', limit: 1 }))[0] ?? null;
      try {
        return single(await rest.get(`/rest/${plural}/${id}`, { query: { depth: 0 } }), `${plural} record`);
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw translate(error);
      }
    },
    list,
    create: async (plural, data) => single(await call(() => rest.post(`/rest/${plural}`, data)), `created ${plural} record`),
    update: async (plural, id, data) => single(await call(() => rest.patch(`/rest/${plural}/${id}`, data)), `updated ${plural} record`),
    async softDelete(plural, id) {
      // Without soft_delete=true, Twenty destroys the record.
      await call(() => rest.delete(`/rest/${plural}/${id}`, { query: { soft_delete: true } }));
    },
    async restore(plural, id) {
      await call(() => rest.patch(`/rest/${plural}/${id}/restore`));
    },
    async upload(file: Upload): Promise<FileRef> {
      const uploaded = await deps.uploadFile(file.bytes, file.name, file.mime, deps.fieldId(file.object, file.field));
      return { fileId: uploaded.id, label: file.name };
    },
    async download(file) {
      const url = (file as { url?: unknown } | null)?.url;
      if (typeof url !== 'string' || url === '') return null;
      const fileId = (file as { fileId?: unknown }).fileId ?? null;
      let bytes: Uint8Array;
      try {
        const response = await deps.fetchFile(url);
        if (!response.ok) {
          log({ download: 'failed', status: response.status, fileId });
          return null;
        }
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        // A transport fault reads as a refused download: the caller decides what a missing file means.
        log({ download: 'failed', fileId, error: error instanceof Error ? error.message : String(error) });
        return null;
      }
      return { bytes, type: imageType(bytes) };
    },
    async timeline(entry: TimelineEntry) {
      try {
        types ??= deps.timelineTypes();
        const type = (await types).find((candidate) => candidate.universalIdentifier === deps.timelineTypeIds[entry.kind]);
        if (!type || type.isActive === false) {
          log({ timeline: 'skipped', reason: 'the type is missing or muted', kind: entry.kind, object: entry.object, recordId: entry.recordId });
          return;
        }
        await rest.post('/rest/timelineActivities', {
          timelineActivityTypeId: type.id,
          [`target${capital(entry.object)}Id`]: entry.recordId,
          properties: { message: entry.text },
        });
      } catch (error) {
        log({ timeline: 'failed', kind: entry.kind, object: entry.object, recordId: entry.recordId, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

/** The caller's side: one write with their delegated token. A record hidden from them is refused as well. */
export function restCallerStore(rest: RestLike): CallerStore {
  return {
    async update(plural, id, data) {
      try {
        return single(await rest.patch(`/rest/${plural}/${id}`, data), `updated ${plural} record`);
      } catch (error) {
        if (statusOf(error) === 404) throw new NotAllowedError('Record not found');
        throw translate(error);
      }
    },
  };
}
