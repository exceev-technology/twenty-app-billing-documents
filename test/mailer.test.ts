import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmailNotAllowedError, SendFailedError, type OutgoingEmail } from '../lifecycle/mailer.ts';
import { metadataMailer, type MetadataLike } from '../src/lib/mailer.ts';

type Call = { kind: 'query' | 'mutation'; request: Record<string, unknown> };

/** A metadata client that records its calls and answers from a script; a GraphQL error is thrown with its `errors`, as genql throws it. */
function fakeClient(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  const respond = async (call: Call) => {
    calls.push(call);
    const result = answer(call);
    if (result instanceof Error) throw result;
    return result;
  };
  const client: MetadataLike = {
    query: (request) => respond({ kind: 'query', request }),
    mutation: (request) => respond({ kind: 'mutation', request }),
  };
  return { client, calls };
}

const graphqlError = (code: string, message: string, extensions: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), { errors: [{ message, extensions: { code, ...extensions } }], data: null });

/** A refused "Send email" as live Twenty throws it: FORBIDDEN, with a PERMISSION_DENIED sub-code. */
const forbidden = (message: string) => graphqlError('FORBIDDEN', message, { subCode: 'PERMISSION_DENIED', userFriendlyMessage: 'User does not have permission.' });

const EMAIL: OutgoingEmail = {
  mailboxId: 'mailbox-1', to: ['camille@calibre.example', 'compta@calibre.example'], cc: [], subject: 'Facture F2026-0001',
  html: '<p>Bonjour</p>', files: [{ id: 'file-1', name: 'F2026-0001.pdf' }],
};

test('the caller’s mailboxes are their connected accounts, each by id and address', async () => {
  const { client, calls } = fakeClient(() => ({ myConnectedAccounts: [{ id: 'mailbox-1', handle: 'bonjour@verdal.example', provider: 'google' }, { id: 7 }, null] }));
  assert.deepEqual(await metadataMailer(client).accounts(), [{ id: 'mailbox-1', handle: 'bonjour@verdal.example' }]);
  assert.deepEqual(calls, [{
    kind: 'query', request: { myConnectedAccounts: { id: true, handle: true, authFailedAt: true, archivedAt: true } },
  }]);
  const none = fakeClient(() => ({ myConnectedAccounts: null }));
  assert.deepEqual(await metadataMailer(none.client).accounts(), []);
});

test('a mailbox whose authorisation failed, or that was archived, is not offered: it cannot send', async () => {
  const { client } = fakeClient(() => ({
    myConnectedAccounts: [
      { id: 'mailbox-1', handle: 'bonjour@verdal.example', authFailedAt: null, archivedAt: null },
      { id: 'mailbox-2', handle: 'compta@verdal.example', authFailedAt: '2026-09-20T08:00:00.000Z', archivedAt: null },
      { id: 'mailbox-3', handle: 'ancien@verdal.example', authFailedAt: null, archivedAt: '2026-09-01T08:00:00.000Z' },
      { id: 'mailbox-4', handle: 'studio@verdal.example' },
    ],
  }));
  assert.deepEqual(await metadataMailer(client).accounts(), [
    { id: 'mailbox-1', handle: 'bonjour@verdal.example' }, { id: 'mailbox-4', handle: 'studio@verdal.example' },
  ]);
});

test('an email goes through sendEmail: the recipients joined by commas, no cc when there is none, the attachments by file id', async () => {
  const { client, calls } = fakeClient(() => ({ sendEmail: { success: true, error: null } }));
  await metadataMailer(client).send(EMAIL);
  assert.deepEqual(calls, [{
    kind: 'mutation',
    request: {
      sendEmail: {
        __args: {
          input: {
            connectedAccountId: 'mailbox-1', to: 'camille@calibre.example, compta@calibre.example', subject: 'Facture F2026-0001',
            body: '<p>Bonjour</p>', files: [{ id: 'file-1', name: 'F2026-0001.pdf' }],
          },
        },
        success: true,
        error: true,
      },
    },
  }]);
  await metadataMailer(client).send({ ...EMAIL, cc: ['a@x.example', 'b@x.example'] });
  const input = (calls[1]!.request.sendEmail as { __args: { input: { cc?: string } } }).__args.input;
  assert.equal(input.cc, 'a@x.example, b@x.example');
});

test('a send Twenty answers as failed is SendFailedError, with Twenty’s reason', async () => {
  const { client } = fakeClient(() => ({ sendEmail: { success: false, error: 'Invalid recipient: not-an-address' } }));
  await assert.rejects(metadataMailer(client).send(EMAIL), (error) => error instanceof SendFailedError && error.reason === 'Invalid recipient: not-an-address');
  const silent = fakeClient(() => ({ sendEmail: { success: false, error: null } }));
  await assert.rejects(metadataMailer(silent.client).send(EMAIL), (error) => error instanceof SendFailedError && error.reason === '');
});

/** The rejection is neither of the mailer’s typed errors: the route answers it as “may have gone”. */
const unclassified = (expected?: Error) => (error: unknown) =>
  error instanceof Error && !(error instanceof SendFailedError) && !(error instanceof EmailNotAllowedError) && (expected === undefined || error === expected);

test('a refused permission is EmailNotAllowedError', async () => {
  await assert.rejects(
    metadataMailer(fakeClient(() => forbidden('Entity performing the request does not have permission')).client).send(EMAIL),
    (error) => error instanceof EmailNotAllowedError && error.message === 'Entity performing the request does not have permission',
  );
  // An error with no words of its own leaves the class's default message.
  await assert.rejects(
    metadataMailer(fakeClient(() => forbidden('')).client).send(EMAIL),
    (error) => error instanceof EmailNotAllowedError && error.message === 'Not allowed to send email',
  );
});

test('a request Twenty turned down before sending is SendFailedError, with its reason: a bad input, a missing mailbox, another refusal, no session', async () => {
  const refusals = [
    ['BAD_USER_INPUT', 'Invalid recipients', {}],
    ['NOT_FOUND', 'Connected account not found', {}],
    ['FORBIDDEN', 'Connected account is not yours', { subCode: 'CONNECTED_ACCOUNT_NOT_OWNED' }],
    ['FORBIDDEN', 'Forbidden', {}],
    ['UNAUTHENTICATED', 'Unauthenticated', {}],
  ] as const;
  for (const [code, reason, extensions] of refusals) {
    await assert.rejects(
      metadataMailer(fakeClient(() => graphqlError(code, reason, extensions)).client).send(EMAIL),
      (error) => error instanceof SendFailedError && error.reason === reason,
      `${code}: ${reason}`,
    );
  }
});

test('a failure that does not say whether the email went is rethrown as it is, never SendFailedError: a server error, no code, a null answer, the network', async () => {
  const lost = [
    graphqlError('INTERNAL_SERVER_ERROR', 'Internal server error'),
    Object.assign(new Error('Something broke'), { errors: [{ message: 'Something broke' }], data: null }),
    Object.assign(new Error('Something broke'), { errors: [{ message: 'No code', extensions: null }, { message: 'Refused', extensions: { code: 'BAD_USER_INPUT' } }] }),
    new TypeError('fetch failed'),
  ];
  for (const failure of lost) {
    await assert.rejects(metadataMailer(fakeClient(() => failure).client).send(EMAIL), unclassified(failure), failure.message);
  }
  await assert.rejects(metadataMailer(fakeClient(() => ({ sendEmail: null })).client).send(EMAIL), unclassified());
  await assert.rejects(metadataMailer(fakeClient(() => ({})).client).send(EMAIL), unclassified());
});
