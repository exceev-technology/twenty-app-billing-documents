// One command for a deploy: `npm run deploy -- --remote <name>`.
//
//   remote check -> tests -> typecheck -> plan -> confirm -> apply -> plan again -> lock
//
// Rules that make it safe rather than a blind chain:
//  - The target is named on the command line, never taken from whichever
//    remote is active: a deploy aimed at the wrong workspace succeeds silently.
//  - A plan that destroys anything stops the run. A destroy is decided by a
//    person reading the plan, not by a script; apply always runs --no-delete.
//  - After apply the plan must be empty, or Twenty did not converge.
//
// --yes applies without the confirmation prompt (the plan is still printed).
// Every CLI call goes through ./node_modules/.bin/twenty, never `npx twenty`:
// npm has an unrelated package with that name.
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { readPlan, readRemoteStatus } from '../src/lib/deploy-checks.ts';

const TWENTY = './node_modules/.bin/twenty';
const args = process.argv.slice(2);
const yes = args.includes('--yes');
const remoteFlag = args.findIndex((arg) => arg === '--remote' || arg.startsWith('--remote='));
const remote = remoteFlag === -1 ? undefined : args[remoteFlag].split('=')[1] ?? args[remoteFlag + 1];

function step(title) {
  console.log(`\n=== ${title} ===`);
}

function fail(message) {
  console.error(`\nDeploy stopped: ${message}`);
  process.exit(1);
}

/** Runs a command with its output shown live. */
function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) fail(`\`${[command, ...commandArgs].join(' ')}\` exited with ${result.status}.`);
}

/** Runs a command, shows its output, and returns it with the exit status. */
function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { output, status: result.status };
}

const twenty = (...commandArgs) => [TWENTY, ['--remote', remote, ...commandArgs]];

if (!remote || remote.startsWith('--')) {
  fail('name the workspace to deploy to: `npm run deploy -- --remote <name>` (see `./node_modules/.bin/twenty remote:list`).');
}

step('1/7 Remote');
const status = capture(...twenty('remote:status'));
if (status.status !== 0) fail(`remote "${remote}" is not available.`);
const { server, authValid } = readRemoteStatus(status.output);
if (!authValid) fail(`remote "${remote}" is not authenticated. Run \`./node_modules/.bin/twenty remote:add\`.`);

step('2/7 Tests');
run('npm', ['test']);

step('3/7 Typecheck');
run('npm', ['run', 'typecheck']);

step('4/7 Plan');
const plan = readPlan(capture(...twenty('plan')).output);
if (plan === null) fail('could not read the plan. Read the output above.');
if (plan.kind === 'no-changes') {
  console.log(`\nNothing to deploy: ${remote} already matches the manifest.`);
  process.exit(0);
}
if (plan.kind === 'changes' && plan.destroyed > 0) {
  fail(`the plan destroys ${plan.destroyed} item(s). Read it, and apply by hand with \`npm run apply\` if that is intended.`);
}
const summary =
  plan.kind === 'unregistered'
    ? `a first deploy of the app to ${server}. Twenty cannot preview it until apply registers it; --no-delete keeps anything from being destroyed`
    : `${plan.added} to add, ${plan.changed} to change, 0 to destroy on ${server}`;

step('5/7 Apply');
console.log(`This is ${summary}.`);
if (!yes) {
  if (!process.stdin.isTTY) fail('no terminal to confirm in. Re-run with --yes to apply without the prompt.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type "${remote}" to apply: `);
  rl.close();
  if (answer.trim() !== remote) fail('not confirmed.');
}
run(...twenty('apply', '--no-delete'));

step('6/7 Converged?');
if (readPlan(capture(...twenty('plan')).output)?.kind !== 'no-changes') {
  fail('the plan after apply is not empty. Twenty did not converge on the manifest.');
}

step('7/7 Lock the released identifiers');
run('npm', ['run', 'ids:lock']);
const lockChanged = spawnSync('git', ['diff', '--quiet', '--', 'ids.lock.json']).status !== 0;

console.log(`\nDeployed to ${remote} (${server}). The plan after apply is empty.`);
if (lockChanged) console.log('ids.lock.json changed: commit it.');
console.log(
  'A deploy does not run the post-install function, so presets are not seeded. Run the create-missing-presets\n' +
    'tool from Twenty’s AI assistant or an MCP client (app_create_missing_presets); it is safe to run again.',
);
