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

/** The GraphQL error codes Twenty answers a refused permission with (checked live, email plan Task 1). */
const FORBIDDEN_CODES: readonly string[] = ['FORBIDDEN'];

type GraphqlError = { message?: unknown; extensions?: { code?: unknown } | null };

/** The GraphQL errors a client error carries, as genql throws them; null for any other failure, the network's included. */
function graphqlErrors(error: unknown): GraphqlError[] | null {
  const errors = (error as { errors?: unknown } | null)?.errors;
  return Array.isArray(errors) ? (errors as GraphqlError[]) : null;
}

const reasonOf = (errors: readonly GraphqlError[]): string =>
  errors.map((entry) => (typeof entry?.message === 'string' ? entry.message : '')).filter((message) => message !== '').join(' ');

type Account = { id?: unknown; handle?: unknown } | null;
type Sent = { sendEmail?: { success?: unknown; error?: unknown } | null };

/** The Mailer over Twenty's metadata API: `myConnectedAccounts`, and `sendEmail` (email spec §2). */
export function metadataMailer(client: MetadataLike): Mailer {
  return {
    async accounts(): Promise<Mailbox[]> {
      const result = (await client.query({ myConnectedAccounts: { id: true, handle: true } })) as { myConnectedAccounts?: Account[] | null };
      return (result.myConnectedAccounts ?? []).flatMap((account) =>
        typeof account?.id === 'string' && typeof account.handle === 'string' ? [{ id: account.id, handle: account.handle }] : [],
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
        if (!errors) throw error;
        if (errors.some((entry) => FORBIDDEN_CODES.includes(String(entry?.extensions?.code)))) throw new EmailNotAllowedError(reasonOf(errors));
        throw new SendFailedError(reasonOf(errors));
      }
      if (result.sendEmail?.success !== true) {
        throw new SendFailedError(typeof result.sendEmail?.error === 'string' ? result.sendEmail.error : '');
      }
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
