import { Command, CommandModal, enqueueSnackbar, openSidePanelPage, SidePanelPages, useLocale, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { callRoute, feedbackFor, localDateOf, type ButtonRequest, type Confirmation } from './action-feedback.ts';

type Props = {
  action: ButtonRequest['action'];
  object: ButtonRequest['object'];
  /** Opens the document the answer names: a new draft, or the credit note a refused Cancel left to fix. */
  opensCreated?: boolean;
  /** The words of a confirmation the host shows first; nothing is posted when the person declines. */
  confirm?: (locale: string) => Confirmation;
};

/**
 * What the buttons share: post the action for the one selected record with the
 * person's own token, date and locale, show the answer, and open what it made.
 * The host disables the button while `execute` runs; `execute` never rejects, or
 * the host would show its own generic error instead.
 */
export function ActionCommand({ action, object, opensCreated = false, confirm }: Props) {
  const [recordId] = useSelectedRecordIds();
  const locale = useLocale();
  const execute = async (): Promise<void> => {
    if (!recordId) return;
    try {
      const client = new RestApiClient();
      const answer = await callRoute((path, body) => client.post(path, body), { action, object, recordId, localDate: localDateOf(new Date()), locale });
      const { message, variant, created } = feedbackFor(answer, locale);
      await enqueueSnackbar({ message, variant });
      if (opensCreated && created) {
        await openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: created.recordId, objectNameSingular: created.object });
      }
    } catch (error) {
      // Caught, not rethrown: a rejection would make the host skip its own cleanup of this headless component.
      // Logged, because the route may already have acted and the person then gets no snackbar to say so.
      console.error('billing action: the snackbar or the side panel failed', error);
    }
  };
  if (!confirm) return <Command execute={execute} />;
  const words = confirm(locale);
  return <CommandModal title={words.title} subtitle={words.subtitle} confirmButtonText={words.confirm} confirmButtonAccent="danger" execute={execute} />;
}
