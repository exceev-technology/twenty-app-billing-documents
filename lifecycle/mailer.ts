/**
 * The person's side of sending (email spec §4): the mailboxes they connected to
 * Twenty, and a send through one of them, as them. src/lib/mailer.ts backs it
 * with Twenty's metadata API; tests use a fake.
 */

/** A mailbox connected to Twenty: its connected account's id, and its address. */
export type Mailbox = { id: string; handle: string };

/** A file to attach: its id in Twenty, and the name the recipient sees. */
export type Attachment = { id: string; name: string };

export type OutgoingEmail = {
  /** The connected account to send through: one of the caller's own. */
  mailboxId: string;
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  /** The body as HTML. */
  html: string;
  files: readonly Attachment[];
};

export type Mailer = {
  /** The caller's own mailboxes. */
  accounts(): Promise<Mailbox[]>;
  /** Sends as the caller; EmailNotAllowedError or SendFailedError when Twenty refuses. */
  send(email: OutgoingEmail): Promise<void>;
};

/** Twenty refused the send for a permission: the caller's role, or the app's, lacks "Send email". */
export class EmailNotAllowedError extends Error {
  constructor(message = 'Not allowed to send email') {
    super(message);
    this.name = 'EmailNotAllowedError';
  }
}

/** Twenty or the mail server refused the email. `reason` is Twenty's own words, empty when it gave none. */
export class SendFailedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason === '' ? 'The email could not be sent' : `The email could not be sent: ${reason}`);
    this.name = 'SendFailedError';
    this.reason = reason;
  }
}
