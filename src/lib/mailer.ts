import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { EmailNotAllowedError, SendFailedError, type Mailbox, type Mailer } from '../../lifecycle/mailer.ts';

/**
 * The two calls of Twenty's MetadataApiClient the mailer makes, by shape: inside a
 * function, `twenty-client-sdk/metadata` is the server's copy (src/lib/twenty-stores.ts).
 */
export type MetadataLike = {
  query(request: Record<string, unknown>): Promise<unknown>;
  mutation(request: Record<string, unknown>): Promise<unknown>;
};

type GraphqlError = { message?: unknown; extensions?: { code?: unknown; subCode?: unknown } | null };

/** The GraphQL errors a client error carries, as genql throws them; null for any other failure, the network's included. */
function graphqlErrors(error: unknown): GraphqlError[] | null {
  const errors = (error as { errors?: unknown } | null)?.errors;
  return Array.isArray(errors) ? (errors as GraphqlError[]) : null;
}

const reasonOf = (errors: readonly GraphqlError[]): string =>
  errors.map((entry) => (typeof entry?.message === 'string' ? entry.message : '')).filter((message) => message !== '').join(' ');

/** A refused permission, as live Twenty answers it: FORBIDDEN with a PERMISSION_DENIED sub-code (email plan Task 1). */
const permissionDenied = (entry: GraphqlError): boolean => entry?.extensions?.code === 'FORBIDDEN' && entry.extensions.subCode === 'PERMISSION_DENIED';

/**
 * Codes that show Twenty turned the request down before it tried to send anything:
 * a bad input, a mailbox that is not there, another refusal, no session. Any other
 * error (INTERNAL_SERVER_ERROR, none at all) does not say whether the email went.
 */
const REFUSED_BEFORE_SENDING: readonly string[] = ['BAD_USER_INPUT', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED'];
const refusedBeforeSending = (entry: GraphqlError): boolean => REFUSED_BEFORE_SENDING.includes(String(entry?.extensions?.code));

type Account = { id?: unknown; handle?: unknown; authFailedAt?: unknown; archivedAt?: unknown } | null;
type Sent = { sendEmail?: { success?: unknown; error?: unknown } | null };

/** A mailbox that cannot send: its authorisation failed (the person must reconnect it), or it was archived. */
const unusable = (account: NonNullable<Account>): boolean => Boolean(account.authFailedAt) || Boolean(account.archivedAt);

/**
 * The Mailer over Twenty's metadata API: `myConnectedAccounts`, and `sendEmail` (email spec §2).
 *
 * A failure is told apart by what it says about the email: a refused permission is
 * EmailNotAllowedError, a request Twenty turned down before sending SendFailedError, and
 * any other failure is rethrown as it is, because the email may have gone.
 */
export function metadataMailer(client: MetadataLike): Mailer {
  return {
    async accounts(): Promise<Mailbox[]> {
      const result = (await client.query({ myConnectedAccounts: { id: true, handle: true, authFailedAt: true, archivedAt: true } })) as {
        myConnectedAccounts?: Account[] | null;
      };
      return (result.myConnectedAccounts ?? []).flatMap((account) =>
        account && typeof account.id === 'string' && typeof account.handle === 'string' && !unusable(account) ? [{ id: account.id, handle: account.handle }] : [],
      );
    },
    async send(email): Promise<void> {
      const input = {
        connectedAccountId: email.mailboxId,
        to: email.to.join(', '),
        ...(email.cc.length > 0 ? { cc: email.cc.join(', ') } : {}),
        subject: email.subject,
        body: email.html,
        files: email.files.map((file) => ({ id: file.id, name: file.name })),
      };
      let result: Sent;
      try {
        result = (await client.mutation({ sendEmail: { __args: { input }, success: true, error: true } })) as Sent;
      } catch (error) {
        const errors = graphqlErrors(error);
        if (errors?.some(permissionDenied)) throw new EmailNotAllowedError(reasonOf(errors) || undefined);
        if (errors && errors.length > 0 && errors.every(refusedBeforeSending)) throw new SendFailedError(reasonOf(errors));
        // The network, a lost answer, a server error: nothing says the email did not go.
        throw error;
      }
      const answer = result.sendEmail;
      if (answer?.success === true) return;
      if (answer?.success === false) throw new SendFailedError(typeof answer.error === 'string' ? answer.error : '');
      throw new Error('Twenty answered the send with neither success nor failure');
    },
  };
}

/** The caller's mailer: their own token, built on each run like every client, so a warm process never sends as someone else. */
export function callerMailer(): Mailer {
  const client = new MetadataApiClient({ runAs: 'user' });
  return metadataMailer({
    // The requests are built by shape; the client's generated types are the server's at runtime anyway.
    query: (request) => client.query(request as never),
    mutation: (request) => client.mutation(request as never),
  });
}
