import { useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useTimelineActivityId } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
// src/lib/id.ts imports node:crypto, which a browser bundle cannot resolve: read the registry directly.
import { IDS } from '../ids.ts';
import { messageOf } from './timeline-message.ts';

/**
 * Shown when a Billing timeline row is expanded. It reads the activity as the
 * viewing person (the default token in a front component), and prints its
 * message. The timeline row sets `white-space: nowrap`; the text undoes it.
 */
const BillingTimelineMessage = () => {
  const activityId = useTimelineActivityId();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activityId === null) return;
    let current = true;
    new RestApiClient()
      .get(`/rest/timelineActivities/${activityId}`)
      .then((response) => {
        if (current) setMessage(messageOf(response));
      })
      .catch(() => {
        if (current) setMessage(null);
      });
    return () => {
      current = false;
    };
  }, [activityId]);

  if (message === null) return null;
  return <p style={{ margin: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{message}</p>;
};

export default defineFrontComponent({
  universalIdentifier: IDS['frontComponent.billingTimelineMessage'],
  name: 'billing-timeline-message',
  description: 'Shows the text of a Billing timeline message.',
  component: BillingTimelineMessage,
});
