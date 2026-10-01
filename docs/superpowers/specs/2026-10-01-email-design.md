# Sub-project 4c: Sending documents by email, design

Status: proposed 2026-10-01, for review. Read [the issue path design](2026-09-26-issue-path-design.md)
and [the flows design](2026-10-01-flows-design.md) first.

4c sends a document's PDF to the client from Twenty. The person reviews a
prefilled message in the side panel and sends it from their own mailbox; the
document records that it was sent.

## 1. Decisions

| Topic | Decision |
|---|---|
| Sending | Through Twenty's own `sendEmail`, from a mailbox the clicking person has connected to Twenty. |
| Form | A form in the side panel: from, to, cc, subject and message, prefilled in the document's language, with the PDF attached. The person reviews it and sends. |
| Documents | An issued invoice (Issued, Sent or Paid), an issued credit note, and a quote that has a PDF. |
| Effect | An Issued invoice becomes Sent and a Draft quote becomes Sent; `sentAt` is stamped on the first send; every send leaves a timeline message. |
| Messages | One template per document type, plus a reminder for an overdue invoice, in each language pack. No template records to configure. |
| Shape | A second route, `billing-email`, which does not bundle the PDF renderer. |

## 2. What the platform allows

Read in the server source at tag `twenty/v2.43.0`:

- The metadata API's `sendEmail(input: { connectedAccountId, to, cc?, bcc?,
  subject, body, files? })` sends through a connected mailbox. Its guard
  requires the "send email" permission (`SEND_EMAIL_TOOL`) of the caller's role,
  and the mailbox must be usable by the caller: their own. `myConnectedAccounts`
  lists the caller's mailboxes.
- `files` are `{ id, name }` file ids. The server reads them from a files field,
  a workflow or its email-attachment folder, so the document's PDF is attached
  by its own file id. After sending, the server deletes the attached files that
  live in its email-attachment folder, and only those: the document's PDF stays
  where it is.
- `body` is a string read as HTML (or Twenty's email document JSON) and
  sanitized. Plain text with line breaks would arrive as one paragraph, so the
  route writes the paragraphs itself.
- The sent message is stored in the person's mailbox, and Twenty imports it
  into its email timeline when that mailbox syncs.
- A front component renders form elements (`input`, `textarea`, `select`,
  `button`), can call a route with the person's own token, and can close the
  side panel.

Two things are checked live before the code that depends on them (plan,
Task 1): that a command menu item opening a front component that is not
headless shows it in the side panel with the selected record, and that
`sendEmail` called from a route with the token Twenty mints for the app and the
person works once the app's role and the person's role both hold the
permission, with the PDF attached and still in place after the send. The 4a
spike found that such a token is checked against both roles.

## 3. Data model and role

| Change | Purpose |
|---|---|
| billingCreditNote `sentAt` (DATE_TIME) | The first send of a credit note. Quotes gain theirs in 4b; invoices have one. |
| The app's role gains `SEND_EMAIL_TOOL` | Required by `sendEmail` for a call made with the app's token for the person. |
| Timeline type `billingSent`, "Twenty sent <document>" | One row per send, expandable to its recipients. |

`sentAt` stays free on an issued document (4a, §7).

## 4. Components

```
 Send by email ─> side panel form ─ POST /s/billing/email { step: 'prepare' } ─> billing-email
                                    POST /s/billing/email { step: 'send' }    ─> billing-email
                                                                                 lifecycle/email: defaults, checks, body
                                                                                 Mailer: accounts, send (as the person)
                                                                                 Store: sent date, status, timeline (as the app)
```

- **`lifecycle/email.ts`** (pure): whether a document can be sent, the
  attachment, the prefilled message, the recipients' checks, and plain text to
  HTML.
- **`Mailer`**, an interface beside `Store`: `accounts()` and `send(input)`.
  `src/lib/mailer.ts` backs it with the metadata client, `runAs: 'user'`;
  tests use a fake.
- **`billing-email`**: an HTTP route, POST `/billing/email`, authentication
  required, timeout 30 s. It imports neither pdfmake nor the Renderer's layouts;
  a bundle test checks it.
- **The form**: one front component that is not headless, shared by three
  command menu items ("Send by email" on invoices, credit notes and quotes).
  The component reads its record from the selection and posts the object
  name it was opened for, as 4a's buttons do; three thin wrappers give it that
  name.

## 5. Prepare

The form opens and posts `{ step: 'prepare', object, recordId, localDate,
locale }`. Prepare writes nothing, so it reads the document with the caller's
own token: a person who cannot read it gets `NOT_ALLOWED`, and never learns its
client's address through the app. The route answers, in the document's
language:

| Field | Value |
|---|---|
| `from` | The caller's mailboxes, `{ id, handle }`, and the one to preselect: the mailbox whose address is the issuer's primary email, else the first. |
| `to` | The primary email of the document's person, else empty. A company carries no email in Twenty, so a document billed to a company alone starts with no recipient. |
| `cc` | Empty. |
| `subject`, `message` | From the template (§7). |
| `attachment` | The file name the client will receive. |

Refusals, all reported together: `NOT_SENDABLE` (a draft invoice or credit
note, a cancelled invoice, a deleted document), `NO_PDF` (a quote with no PDF
yet), `NO_MAILBOX` (the caller has connected none).

## 6. Send

The person clicks Send. The form posts `{ step: 'send', object, recordId,
localDate, locale, from, to, cc, subject, message }`:

1. **Check the message**: at least one recipient; every address, in `to` and
   `cc`, split on commas and semicolons, looks like an address; at most 20 in
   all; a subject and a message that are not blank. `MISSING_RECIPIENT`,
   `INVALID_RECIPIENT` (naming the address), `TOO_MANY_RECIPIENTS`,
   `MISSING_SUBJECT`, `MISSING_MESSAGE`.
2. **Read the document again**, and refuse as Prepare does: it may have changed
   while the form was open.
3. **The caller's first write**: their own token rewrites `sentAt` as it is,
   so that Twenty's role check decides, as for every action, whether they may
   act on the document (`NOT_ALLOWED`).
4. **Send**, through the Mailer, as the person: the chosen mailbox, the
   recipients, the subject, the message as HTML, and the PDF as one attachment.
   A refusal of the permission is `EMAIL_NOT_ALLOWED`; any other failure
   `SEND_FAILED`, with Twenty's reason.
5. **Record it**, as the app: an Issued invoice becomes Sent, a Draft quote
   becomes Sent, and `sentAt` is set when it is empty, so it keeps the first
   send. A `billingSent` message names the recipients and the mailbox, in the
   document's language.

When step 5 fails the email has gone: the answer is still a success, saying
the document could not be marked and quoting a reference, and the route logs
it. A second click is ignored while a send is in flight.

**The attachment** is the document's current PDF: the first file of its `pdf`
field, the issued one for an invoice or credit note, the newest version for a
quote. Its name is the number (`F2026-0017.pdf`, `D2026-0004 v2.pdf`).

**The message as HTML**: special characters escaped, a blank line starts a new
paragraph, a single line break becomes `<br>`. Nothing else: no link or
markup a person typed is interpreted.

## 7. Templates

Each language pack holds a subject and a message for: an invoice, an overdue
invoice (a reminder: Issued or Sent, its due date before the caller's date),
a credit note, and a quote. They are filled with:

- the number, and for a quote its version;
- the seller's name (the issuer's trading name);
- the total, formatted in the document's currency and the profile's locale by
  the Renderer's own formatting;
- the due date (invoices), the validity date (quotes), the corrected invoice's
  number (credit notes), formatted as the PDF prints them;
- the buyer's name: the person's first name when a person is set, else none,
  and the greeting falls back to a neutral one.

For example, in English:

> Subject: Invoice F2026-0017 from Acme
>
> Hello Maria,
>
> Please find attached invoice F2026-0017 for 1,234.00 €, due on 31 October
> 2026.
>
> Kind regards,
> Acme

The person edits the text in the form before it goes. A business that wants its
own wording every time can change the pack in its fork, or contribute a
setting later: templates as records are out of scope for v1.

## 8. The form

- A small heading names the document ("Send invoice F2026-0017").
- From: a select when the person has more than one mailbox, else their address
  as text.
- To, Cc: text inputs, comma-separated.
- Subject: a text input. Message: a textarea, about twelve rows.
- The attachment's name, as a line of text.
- Send and Cancel buttons. Send is disabled while a request is in flight.
- Problems are listed above the buttons, worded by the route; the transport
  failures (no route, no network) use the buttons' own words, as in 4a.
- After a send, a snackbar says "Sent to maria@client.com" and the side panel
  closes.

Labels are in English and French, chosen from the person's Twenty locale, like
the buttons' transport messages. The form follows Twenty's light or dark scheme
(`useColorScheme`) with plain inline styles: it renders inside Twenty's side
panel, but cannot import Twenty's own components.

## 9. Setup a workspace needs

The README says it, in its email section:

1. Each person who sends connects their mailbox in Twenty (Settings →
   Accounts). Sending uses that mailbox, so the email appears in their sent
   folder.
2. Their role allows sending email (Settings → Roles → the role → "Send
   email"). The app's own role asks for it on install.

Without a mailbox, the form says how to connect one. Without the permission,
the Send answers `EMAIL_NOT_ALLOWED` and names the setting.

## 10. Messages and errors

New codes: `NOT_SENDABLE`, `NO_PDF`, `NO_MAILBOX`, `MISSING_RECIPIENT`,
`INVALID_RECIPIENT`, `TOO_MANY_RECIPIENTS`, `MISSING_SUBJECT`,
`MISSING_MESSAGE`, `EMAIL_NOT_ALLOWED`, `SEND_FAILED`. Messages: the sent
snackbar, the sent-but-not-marked answer, the timeline message, and the four
templates, in English and French.

| Failure | What the person sees |
|---|---|
| A check refuses | The problems, worded, under the form; HTTP 422. Nothing is sent or written. |
| The caller cannot edit the document | `NOT_ALLOWED`; HTTP 403. Nothing is sent. |
| The permission is missing | `EMAIL_NOT_ALLOWED`; HTTP 403. Nothing is sent. |
| The mail server refuses | `SEND_FAILED` with Twenty's reason; HTTP 502. |
| Anything unexpected | "Something went wrong (ref 7f3a…)"; HTTP 500, logged. |

## 11. Testing and acceptance

`node --test`:

- **email.ts**: what can be sent, for every type and status; the attachment
  and its name; each template in both languages, with and without a person,
  overdue or not; recipients split, checked and counted; the HTML escaping and
  paragraphs.
- **The route**, against the memory `Store` and a fake `Mailer`: Prepare's
  answer and its refusals; Send's checks, the caller's write (`NOT_ALLOWED`
  sends nothing), the Mailer's input, the status and `sentAt` for each type,
  `sentAt` kept on a second send, the timeline message, `EMAIL_NOT_ALLOWED`,
  `SEND_FAILED`, and a failure after the send answered as sent.
- **Bundles**: `billing-email` holds no pdfmake; the form imports no `node:`
  module.
- **Packs**: every new code, message and template in both languages.

On the test workspace, as a signed-in user with a connected mailbox, sending
only to an address the maintainer names:

1. An issued invoice: Send by email opens the form, prefilled. Send: the email
   arrives with the PDF; the invoice is Sent, `sentAt` set, a timeline row;
   the PDF is still in the invoice.
2. Send it again: `sentAt` unchanged, a second timeline row.
3. A quote with a PDF, and an issued credit note: both sent; the quote is Sent.
4. As a member whose role cannot send email: `EMAIL_NOT_ALLOWED`, nothing sent.

## 12. Files

```
lifecycle/email.ts                     sendable, attachment, templates' filling, recipients, HTML
lifecycle/mailer.ts                    the Mailer interface
lifecycle/lang/pack.ts, en.ts, fr.ts   codes, messages, templates
src/lib/mailer.ts                      the Mailer over the metadata client
src/logic-functions/billing-email.ts   the route
src/front-components/send-email-form.tsx, email-form.ts, send-invoice.tsx, send-credit-note.tsx, send-quote.tsx
src/command-menu-items/send-invoice, send-credit-note, send-quote
src/timeline-activity-types/billing-sent.ts
src/objects/billing-credit-note.object.ts (sentAt), src/roles/billing.role.ts (SEND_EMAIL_TOOL)
test/lifecycle/email.test.ts, test/email-route.test.ts
```

## Out of scope for 4c

Templates as records, sending several documents at once, scheduled reminders,
tracking opens, sending from a shared workspace address, and attaching anything
but the document's PDF.
