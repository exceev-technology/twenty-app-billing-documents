type Query = Record<string, string | number | boolean | null | undefined>;
type Row = Record<string, unknown> & { id: string; deletedAt: string | null };

/**
 * An in-memory stand-in for Twenty's REST API, shaped like its responses:
 * `{ data: { <plural>: [...] }, pageInfo }` for lists and
 * `{ data: { create<Singular>: {...} } }` for creates. Soft-deleted rows are
 * listed only under `filter=deletedAt[is]:NOT_NULL`.
 */
export function fakeTwentyRest(pageSize = 60) {
  const tables = new Map<string, Row[]>();
  const requests: string[] = [];
  let seq = 0;
  return {
    tables,
    requests,
    async get<T = unknown>(path: string, options?: { query?: Query }): Promise<T> {
      const plural = path.replace('/rest/', '');
      const q = options?.query ?? {};
      requests.push(`GET ${plural} ${JSON.stringify(q)}`);
      const deleted = q.filter === 'deletedAt[is]:NOT_NULL';
      const rows = (tables.get(plural) ?? []).filter((r) => Boolean(r.deletedAt) === deleted);
      const start = q.starting_after ? rows.findIndex((r) => r.id === q.starting_after) + 1 : 0;
      const limit = Math.min(Number(q.limit ?? pageSize), pageSize);
      const page = rows.slice(start, start + limit);
      return {
        data: { [plural]: page },
        pageInfo: { hasNextPage: start + limit < rows.length, endCursor: page.at(-1)?.id ?? null },
        totalCount: rows.length,
      } as T;
    },
    async post<T = unknown>(path: string, body?: unknown): Promise<T> {
      const plural = path.replace('/rest/', '');
      requests.push(`POST ${plural}`);
      const row: Row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, deletedAt: null, ...(body as object) };
      tables.set(plural, [...(tables.get(plural) ?? []), row]);
      const singular = plural.replace(/s$/, '');
      return { data: { [`create${singular[0].toUpperCase()}${singular.slice(1)}`]: row } } as T;
    },
  };
}
