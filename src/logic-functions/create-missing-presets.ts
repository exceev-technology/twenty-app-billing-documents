import { defineLogicFunction } from 'twenty-sdk/define';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { id } from '../lib/id.ts';
import { runSeed } from './seed-presets.ts';

/**
 * The post-install seeder, also offered as a tool to Twenty's assistant and to
 * MCP clients. A development deploy never runs install functions, and on a
 * production server the CLI cannot run a function at all (it signs in with an
 * API key, and running a function needs a user), so this is how a workspace
 * gets its presets outside a package install.
 */
export default defineLogicFunction({
  universalIdentifier: id('logicFunction.createMissingPresets'),
  name: 'create-missing-presets',
  description:
    'Creates the billing country presets, identifier types and tax codes that are missing. Never changes an existing record, and never brings back one a user deleted.',
  timeoutSeconds: 300,
  toolTriggerSettings: { inputSchema: { type: 'object', properties: {} } },
  handler: () => runSeed(new RestApiClient({ runAs: 'application' })),
});
