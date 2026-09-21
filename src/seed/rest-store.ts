import type { SeedRow, SeedStore } from './seed.ts';

/**
 * The two calls of Twenty's `RestApiClient` the seeder needs. REST addresses
 * objects by path, so it does not depend on a generated type map, which a
 * logic function bundle does not carry.
 */
export type RestLike = {
  get<T = unknown>(path: string, options?: { query?: Record<string, string | number> }): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
};

type ListResponse = {
  data?: Record<string, SeedRow[]>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const PAGE_SIZE = 60;

export function restSeedStore(client: RestLike): SeedStore {
  async function listAll(plural: string, filter?: string): Promise<SeedRow[]> {
    const rows: SeedRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const query: Record<string, string | number> = { limit: PAGE_SIZE, depth: 0 };
      if (filter) query.filter = filter;
      if (cursor) query.starting_after = cursor;
      const response = await client.get<ListResponse>(`/rest/${plural}`, { query });
      rows.push(...(response.data?.[plural] ?? []));
      const next = response.pageInfo?.hasNextPage ? response.pageInfo.endCursor : null;
      if (!next) return rows;
      cursor = next;
    }
  }

  return {
    // Twenty lists soft-deleted rows only when asked. A preset the user
    // deleted must count as existing, or the next upgrade would bring it back.
    async list(plural) {
      const [active, deleted] = await Promise.all([listAll(plural), listAll(plural, 'deletedAt[is]:NOT_NULL')]);
      return [...active, ...deleted];
    },
    async create(plural, singular, data) {
      const response = await client.post<{ data?: Record<string, SeedRow> }>(`/rest/${plural}`, data);
      const row = response.data?.[`create${singular[0].toUpperCase()}${singular.slice(1)}`];
      if (!row?.id) {
        throw new Error(`Twenty did not return the created ${singular}: ${JSON.stringify(response).slice(0, 300)}`);
      }
      return row;
    },
  };
}
