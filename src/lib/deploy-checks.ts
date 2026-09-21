/**
 * Reads what the Twenty CLI prints, for scripts/deploy.mjs. readPlan returns
 * null rather than guess when the output is not what it knows.
 */

export type RemoteStatus = { remote: string; server: string; authValid: boolean };

export type PlanSummary =
  | { kind: 'no-changes' }
  // A server that has never seen the app cannot plan it: the first apply
  // registers it, so there is nothing to preview before then.
  | { kind: 'unregistered' }
  | { kind: 'changes'; added: number; changed: number; destroyed: number };

const plain = (output: string): string => output.replace(/\x1b\[[0-9;]*m/g, '');

export function readRemoteStatus(output: string): RemoteStatus {
  const text = plain(output);
  return {
    remote: text.match(/Remote:\s*(\S+)/)?.[1] ?? '',
    server: text.match(/Server:\s*(\S+)/)?.[1] ?? '',
    authValid: /Auth:.*\(valid\)/.test(text),
  };
}

export function readPlan(output: string): PlanSummary | null {
  const text = plain(output);
  if (/No changes\./.test(text)) return { kind: 'no-changes' };
  if (/No registration found for/.test(text)) return { kind: 'unregistered' };
  const counts = text.match(/Plan:\s*(\d+) to add,\s*(\d+) to change,\s*(\d+) to destroy/);
  if (!counts) return null;
  return { kind: 'changes', added: Number(counts[1]), changed: Number(counts[2]), destroyed: Number(counts[3]) };
}
