import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Entity = { file: string; result: { success: boolean; errors: string[]; config: any } };

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/** Every entity file of a folder, as the validation result its default export is. */
export async function loadEntities(folder: 'objects' | 'fields'): Promise<Entity[]> {
  const dir = join(SRC, folder);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts')).sort();
  return Promise.all(
    files.map(async (file) => ({ file, result: (await import(pathToFileURL(join(dir, file)).href)).default })),
  );
}
