import { build } from 'esbuild';

/**
 * What twenty-sdk 2.41 passes esbuild for a logic function: one ES module for
 * Node, Node built-ins and two client modules left external, and `require`
 * shimmed by a banner. Nothing defines __dirname, and the bundle runs far from
 * node_modules.
 */
export const LOGIC_FUNCTION = {
  bundle: true,
  splitting: false,
  format: 'esm' as const,
  platform: 'node' as const,
  external: [
    'twenty-client-sdk/core', 'twenty-client-sdk/metadata', 'path', 'fs', 'crypto', 'stream', 'util', 'os', 'url',
    'http', 'https', 'events', 'buffer', 'querystring', 'assert', 'zlib', 'net', 'tls', 'child_process', 'worker_threads',
  ],
  banner: { js: "import { createRequire as __createRequire } from 'module';\nconst require = __createRequire(import.meta.url);" },
  logLevel: 'silent' as const,
};

/** Bundles a logic function as the CLI would, and returns the files that went into it. */
export async function bundleLogicFunction(entry: string, outfile: string): Promise<string[]> {
  const result = await build({ ...LOGIC_FUNCTION, entryPoints: [entry], outfile, metafile: true });
  return Object.keys(result.metafile.inputs);
}
