/**
 * The lock lists every identifier that has reached a workspace. The registry
 * may grow past it, never change or drop one of its entries: on upgrade,
 * Twenty would read a changed identifier as a delete plus a create.
 */
export function lockViolations(
  lock: Readonly<Record<string, string>>,
  registry: Readonly<Record<string, string>>,
): string[] {
  const violations: string[] = [];
  for (const [key, released] of Object.entries(lock)) {
    const current = registry[key];
    if (current === undefined) violations.push(`${key}: released as ${released}, now missing from src/ids.ts`);
    else if (current !== released) violations.push(`${key}: released as ${released}, now ${current}`);
  }
  return violations;
}
