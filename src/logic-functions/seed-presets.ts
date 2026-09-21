import { definePostInstallLogicFunction, type InstallPayload } from 'twenty-sdk/define';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { id } from '../lib/id.ts';
import { PRESETS } from '../presets/index.ts';
import { seedPresets, type SeedReport } from '../seed/seed.ts';
import { restSeedStore, type RestLike } from '../seed/rest-store.ts';

/** Seeds through any REST-shaped client: Twenty's in production, a fake in tests. */
export function runSeed(client: RestLike): Promise<SeedReport> {
  return seedPresets(restSeedStore(client), PRESETS);
}

const handler = async ({ previousVersion, newVersion }: InstallPayload): Promise<SeedReport> => {
  const report = await runSeed(new RestApiClient({ runAs: 'application' }));
  console.log(`seed-presets ${previousVersion ?? 'fresh install'} -> ${newVersion}: ${JSON.stringify(report)}`);
  return report;
};

export default definePostInstallLogicFunction({
  universalIdentifier: id('logicFunction.seedPresets'),
  name: 'seed-presets',
  description: 'Creates the country presets, identifier types and tax codes that are missing. Never changes an existing record.',
  timeoutSeconds: 300,
  shouldRunOnVersionUpgrade: true,
  shouldRunSynchronously: false,
  handler,
});
