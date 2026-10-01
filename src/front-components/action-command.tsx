import { Command, enqueueSnackbar, useLocale, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { callRoute, feedbackFor, localDateOf, type ButtonRequest } from './action-feedback.ts';

/**
 * What the five buttons share: post the action for the one selected record
 * with the person's own token, date and locale, and show the answer. The host
 * disables the button while `execute` runs; `execute` never rejects, or the
 * host would show its own generic error instead.
 */
export function ActionCommand({ action, object }: { action: ButtonRequest['action']; object: ButtonRequest['object'] }) {
  const [recordId] = useSelectedRecordIds();
  const locale = useLocale();
  const execute = async (): Promise<void> => {
    if (!recordId) return;
    try {
      const client = new RestApiClient();
      const answer = await callRoute((path, body) => client.post(path, body), { action, object, recordId, localDate: localDateOf(new Date()), locale });
      await enqueueSnackbar(feedbackFor(answer, locale));
    } catch (error) {
      // Caught, not rethrown: a rejection would make the host skip its own cleanup of this headless component.
      // Logged, because the route may already have acted and the person then gets no snackbar to say so.
      console.error('billing action: the snackbar failed', error);
    }
  };
  return <Command execute={execute} />;
}
