import { build } from 'esbuild';
import { getFrontComponentBuildPlugins } from 'twenty-sdk/front-component-renderer/build';

/**
 * What twenty-sdk 2.43 passes esbuild for a front component, as 2.41 did: one
 * ES module for the browser (no platform, so esbuild's browser default), JSX in
 * automatic mode, React and the SDK bundled, and the SDK's plugins, which turn
 * the defineFrontComponent default export into a render function.
 */
const FRONT_COMPONENT = {
  bundle: true,
  splitting: false,
  format: 'esm' as const,
  external: ['twenty-client-sdk/core', 'twenty-client-sdk/metadata', 'twenty:front-component-shared-dependencies'],
  jsx: 'automatic' as const,
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
  write: false,
  logLevel: 'silent' as const,
};

/** Bundles a front component as the CLI would; rejects on any import a browser cannot resolve, `node:` ones included. */
export async function bundleFrontComponent(entry: string): Promise<{ exports: string[]; inputs: string[] }> {
  const result = await build({ ...FRONT_COMPONENT, entryPoints: [entry], outdir: '/virtual-front-component-out', plugins: getFrontComponentBuildPlugins() });
  const outputs = Object.values(result.metafile!.outputs);
  return { exports: outputs.flatMap((output) => output.exports), inputs: Object.keys(result.metafile!.inputs) };
}
