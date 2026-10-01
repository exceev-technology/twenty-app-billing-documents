/**
 * The pure part of the timeline's message component, which node --test can
 * import (it cannot import a .tsx file). Nothing here imports Twenty.
 */

/** The registry key of each timeline type: "issued", and "put back a change to". */
export const TIMELINE_TYPE_KEYS = {
  ISSUED: 'timelineActivityType.billingIssued',
  CORRECTION: 'timelineActivityType.billingCorrection',
} as const;

/** The message of a timeline activity, from `GET /rest/timelineActivities/<id>`; null when it holds none. */
export function messageOf(response: unknown): string | null {
  const activity = (response as { data?: { timelineActivity?: { properties?: { message?: unknown } | null } } } | null)?.data?.timelineActivity;
  const message = activity?.properties?.message;
  return typeof message === 'string' ? message : null;
}
