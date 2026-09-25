# Sub-project 4a: Issue path, design

Status: proposed 2026-09-26, for review. Read [the product overview](2026-09-21-product-overview.md),
[the Foundation design](2026-09-21-foundation-design.md), [the Engine design](2026-09-22-engine-design.md)
and [the Rendering design](2026-09-24-rendering-design.md) first; this spec does not
repeat their decisions.

Lifecycle is split in three: 4a the issue path, 4b the flows between documents,
4c email. 4a turns the objects, the Engine and the Renderer into documents a
business can issue. It keeps totals current while lines change, renders PDFs,
allocates numbers, issues invoices and credit notes, freezes what was issued,
and guards it afterwards. It meets the product's success test: on a workspace
holding only Twenty's standard objects, a user configures a seller, picks a
country preset and issues a first numbered invoice as a PDF, with no schema
work.

## 1. Decisions

| Topic | Decision |
|---|---|
| Documents | All three. Invoices and credit notes are previewed and issued. A quote gets a PDF, numbered on the first and versioned after it (Engine §9). |
| Lock | Fields only the app sets are app-only, so the server refuses them to anyone else. Content fields and lines stay editable, as drafts need, and a trigger puts back any change to an issued document. |
| Status | Users change it. A trigger reverts the moves reserved to the app (§7). |
| Issue date | The user's date, or today. Never later than today, never earlier than the latest issued document of the same sequence. |
| Draft PDF | A preview marked DRAFT, replaced by the next preview, removed at issue. |
| Shape | One action route, the only function that bundles pdfmake; small triggers; headless buttons. |
| Permission | No model of its own. An action's first write is made with the caller's token, so Twenty's role check decides who may act. |

## 2. What the platform allows

Measured on a Twenty 2.41.0 server (the demo-exceev test workspace,
2026-09-25) and read in the server source at tag `twenty/v2.41.0`:

- An app cannot run code before a write. A database event trigger runs after
  the commit, as a queued job, about 150 ms later. It receives the record
  before and after and the fields changed. The app's own writes arrive too,
  marked `updatedBy.source: APPLICATION`, so a trigger that writes must not
  loop.
- A field with `writability: APPLICATION` is refused to users and API keys
  ("not writable through the API") and accepted from the app. A user token
  Twenty mints for the app counts as the app.
- A field with `isUnique` gets a unique index. Blank values do not collide. A
  duplicate is refused with HTTP 400 and the message "A duplicate entry was
  detected". A soft-deleted record keeps its value.
- A soft-deleted record can be restored (`PATCH /rest/<objects>/<id>/restore`).
  A soft delete does not change `updatedBy`, so its event cannot say who
  deleted.
- Row-level permissions need an Enterprise licence, and they hide records
  rather than freeze them. This design does not use them.

The button path is the one the Engine spec's §9 records.

## 3. Data model changes

Nothing is removed or renamed.

New fields:

| Object | Field | Type | Purpose |
|---|---|---|---|
| billingQuote, billingInvoice, billingCreditNote | `numberKey` | TEXT, unique, app-only | `<issuerId>:<number>`, blank until numbered. The guarantee that no number is held twice, and why two issuers can both have `INV-2026-0001`. |
| billingSequence | `scopeKey` | TEXT, unique, app-only | `<issuerId>:<documentType>:<periodKey>`. One ledger row per scope. |
| billingIssuer | `template` | SELECT: `classic` (default), `modern`, `compact`, `letterhead`, `receipt` | Rendering §12. |
| billingQuote | `version` | NUMBER, integer, app-only | Empty before the first PDF, then 1, 2, 3. |

Existing fields that become app-only:

- on the three documents: `number`, `snapshot`, `documentHash`, `pdf`,
  `subtotal`, `discountTotal`, `taxTotal`, `total`;
- on invoices and credit notes: `issuedAt`;
- on the three line objects: `lineTotal`.

`status` stays editable (§7). The ledger's `issuer`, `documentType`,
`periodKey` and `lastValue` stay editable, so a business can create the row for
a scope before its first document and continue from its old system's numbers
(§5).

A timeline activity type, "Billing", carries the messages the guards leave on a
record (§7).

## 4. Components

```
 button ── POST /s/billing/action ──> billing-action route (bundles pdfmake)
                                        lifecycle/actions: preview, issue, quote PDF
                                        gate → number → render → store

 record change ── event ──> seven triggers ──> lifecycle/guards, lifecycle/totals
```

- **`lifecycle/`** at the repository root, beside `engine/` and `render/`,
  holds the rules. It imports the Engine, and its actions import the Renderer.
  It imports nothing from `twenty-sdk` or `twenty-client-sdk`: everything it
  reads and writes goes through a `Store` interface, backed by the REST client
  in production (`src/lib/rest-store.ts`) and by memory in tests. The clock,
  the caller and SHA-256 (Web Crypto) are passed in.
- **The route**, `billing-action`: `httpRouteTriggerSettings` with path
  `/billing/action`, POST, authentication required; timeout 60 s. It is the
  only function that bundles pdfmake.
- **Seven triggers**, timeout 30 s: `billingInvoice.*`, `billingCreditNote.*`,
  `billingQuote.*`, their three line objects, and `billingSequence.*`. They
  import `lifecycle/guards` and `lifecycle/totals`, never the Renderer. A test
  checks that their bundles hold no pdfmake.
- **Five buttons.** A command menu item opens a headless front component that
  calls the route: Preview PDF and Issue on invoices and credit notes, shown on
  one selected DRAFT record; Generate PDF on quotes, shown on one selected
  record. The front component context does not name its object, so each button
  has its own small component; the five share one body. They are browser
  bundles and import only the SDK's front-component module and the identifier
  map (`src/ids.ts`, not `src/lib/id.ts`, which uses `node:crypto`).

## 5. Numbering

**Scope.** A sequence is issuer × document type × period. The period is the
Engine's `periodKey` for the profile's `numberingReset` and the document's issue
date. Quotes, invoices and credit notes each have their own pattern
(`quoteNumberPattern`, `invoiceNumberPattern`, `creditNoteNumberPattern`) and
their own sequence.

**Allocation**, inside the route:

1. Check the profile's pattern for the document type with `validatePattern`, on
   every allocation. A bad pattern is refused, naming the profile field.
2. Read the ledger row for the scope, found by issuer, type and period. If
   there is none, create it with `lastValue` 0 and its `scopeKey`. If that
   creation is refused as a duplicate, someone created it at the same moment:
   read it again.
3. Read the document. A number it already holds is reused, and allocation
   ends. The ledger is read before the document, so two requests for the same
   draft converge on the same number: whichever reads second sees the first
   one's claim, or claims the same number on the same record.
4. Take `n = lastValue + 1` and `number = formatNumber(pattern, n, issueDate)`.
5. Claim it: write `number` and `numberKey` on the document, as the app. If the
   unique key refuses it, another document holds that number: try `n + 1`.
   After 50 refusals, stop with `LEDGER_BEHIND`, naming the sequence.
6. Raise the ledger to `max(lastValue, n)`, from a fresh read. Two issues
   racing may leave the ledger briefly behind; the next allocation steps over
   the numbers already taken. The unique key is the guarantee, not the ledger.

**No gaps.** A claimed number stays with its document even if a later step
fails, and the next Issue on that document reuses it. A numbered document
cannot be deleted: the guard restores it (§7). Every check, a trial render
included, runs before a number is claimed (§6), so nothing that can be refused
strands a number.

**Dates.** An invoice or credit note cannot be issued with a date later than
the clicking user's local date, nor earlier than the latest issue date among
the numbered documents of its scope, deleted ones included. Quotes are exempt:
a quote carries the date on its record, today when empty, and the user may
change it before each version.

**The ledger** stays editable, and its trigger keeps it sound:

- A row a user creates gets its `scopeKey`. A second row for a scope that has
  one is soft-deleted, with a timeline message.
- Until the scope's first number is given out, a row may be changed freely: a
  starting value, a typo.
- After that, `lastValue` may only rise, the scope fields are fixed, and the
  row cannot be deleted. A change that breaks this is put back. A scope has
  given out a number when a document of that issuer and type holds a
  `numberKey` and an issue date inside the period.

**Starting from a given number.** A business creates the ledger row for the
scope (issuer, type, period) with `lastValue` set to the last number its old
system used. The next document takes the one after.

## 6. Actions

**Request.** A button posts `{ action, object, recordId, localDate, locale }`:
`action` is `preview`, `issue` or `quotePdf`; `object` is the document's object
name; `localDate` is the user's date (`YYYY-MM-DD`) from the browser; `locale`
is their Twenty locale, for the messages. The route refuses a `localDate` more
than a day away from the server's UTC date, since a clock that far off is
wrong. The front component ignores a second click while one is in flight.

**Response.** `{ ok: true, number?, version?, message }`, or
`{ ok: false, problems: [{ code, message, field? }] }`. The button shows it in
a snackbar: the message, or the first five problems and "and 3 more".

**Who may act.** The route first reads the document: an issued one answers
`ALREADY_ISSUED`, with its number. Its first write then fills the draft's empty
defaults with the caller's own token: issue date (their local date), currency
(the issuer's, else the profile's), language (the profile's), due date (issue
date plus the profile's payment term; invoices), validity (issue date plus the
profile's quote validity; quotes). Twenty's role check therefore decides: a
caller who cannot edit the document gets `NOT_ALLOWED` and nothing else
happens. The write is made even when no default is missing, rewriting the issue
date as it is. Everything after it is written as the app.

**The gate.** The same checks run before every action, and all problems are
reported, not the first:

1. The status allows the action: DRAFT for preview and issue.
2. The issuer is set and has a profile; the currency is known; the profile's
   pattern for the type is valid.
3. A buyer is set: a company, a person, or both.
4. A credit note names an invoice that is issued, with the same issuer and the
   same currency.
5. The seller has every identifier its profile requires, matching the type's
   `validationPattern`; a business buyer has the ones required of it
   (Foundation §1); every identifier involved has exactly one owner.
6. The Engine's `checkDocument` finds nothing.
7. The dates of §5 (issue only), and a due date not earlier than the issue
   date.
8. A render succeeds, with the number the document will carry: none for a
   preview; for an issue or a quote's first PDF, the number it is about to get
   (the next one in the ledger), in a trial run before that number is claimed.
   Unsupported characters, a bad logo or a QR code that cannot fit are refused
   here.

**Issue** (invoices and credit notes), once the gate passes:

1. Claim the number (§5).
2. Render the final PDF. When the claimed number is the one the trial used,
   the trial's bytes are the final bytes: rendering is deterministic.
3. Upload it into the document's `pdf` field. `documentHash` is the SHA-256 of
   its bytes.
4. Write each line's `lineTotal`, then, in one write on the document: status
   ISSUED, `issuedAt` (server time), `issueDate`, `snapshot`, `documentHash`,
   `pdf` holding the issued PDF alone (the previews go), and the totals.
5. Raise the ledger (§5). Add a timeline message: "Issued as INV-2026-0017".

A step that fails leaves the document DRAFT with its number, and the next Issue
resumes from step 2.

**The snapshot** is a JSON object with two parts:

- `printed`: the Renderer's input as rendered, with the logo replaced by its
  file id and the SHA-256 of its bytes;
- `record`: the document's fields and each line's fields, by record id, as
  they were at issue.

`printed` is the audit copy of what the PDF says. `record` is what the guards
restore (§7). An issued document is never rendered again: its PDF is the legal
copy.

**Preview** (invoices and credit notes in DRAFT): the gate without the date
rules. Its render, with no number, prints the draft marker. The PDF replaces
the previous preview in `pdf` and is labelled `Preview <date>.pdf`.

**Quote PDF**: the gate, then a number on the first PDF (§5) and version 1, or
the same number and the next version. The PDF is added to `pdf`, newest first;
the field keeps ten, so the oldest goes. Quotes have no snapshot and no lock.

## 7. Lock and guards

A document is **numbered** when it holds a `numberKey`, and **issued** when it
is an invoice or credit note with a `snapshot`.

**Status.** Three rules, for every document type:

1. Only the app moves a document into ISSUED (invoices, credit notes) or
   INVOICED (quotes, done by 4b).
2. A numbered invoice or credit note never returns to DRAFT, and only the app
   cancels one (4b, through a credit note).
3. Every other move is free: ISSUED, SENT and PAID in any order, a quote's
   SENT, ACCEPTED, DECLINED and EXPIRED, cancelling or reviving a draft that
   has no number.

A move that breaks a rule is put back to the previous status.

**An issued invoice or credit note.**

| Change | What the guard does |
|---|---|
| A locked field differs from `snapshot.record` | Writes the snapshot's value back. |
| A line changed | Writes the line's fields back from the snapshot. |
| A line added | Soft-deletes it. |
| A line deleted | Restores it. |
| A line moved in or out | Moves it back. |
| The document soft-deleted | Restores it. |

The locked fields are those the issued document depends on: `subject`,
`issuer`, `company`, `person`, `issueDate`, `dueDate`, `currencyCode`,
`pricesIncludeTax`, `language`, `notes` and `buyerReference`, plus a credit
note's `invoice` and `reason`. After issue,
`sentAt`, `paidAt`, `opportunity` and `quote` stay free, and `status` follows
the rules above.

**A numbered draft** invoice or credit note (a number claimed, the issue not
finished) stays editable,
so its problem can be fixed, but a soft delete is restored: its number must not
be lost.

**A record created with a status other than DRAFT**, by an import for
instance, is set to DRAFT.

**How a guard writes.** It compares the record with the state it should have
and writes only the differences, as the app. The platform's retries are
therefore harmless, and a guard's own write produces an event in which nothing
differs, so nothing loops. Status rules look at `after.updatedBy.source`: a
move made by the app is always allowed. Deletions are restored whoever made
them, since their events cannot say.

**Telling the user.** Each correction adds a "Billing" timeline activity to the
record, in the document's language: what was put back and why. For example,
"This invoice is issued: the change to Subject was put back. Correct it with a
credit note." Without it, an edit that snaps back after a moment would look
like a fault. How Twenty's timeline shows an app activity's text was not
checked by the spike; if it cannot show it, the message becomes a note on the
record instead, which gives the app's role create rights on notes.

**What the guards cannot do.**

- A change is visible for about 300 ms before it is put back. The PDF is not
  affected: it was rendered at issue and is never rendered again.
- A record destroyed (deleted permanently) cannot be brought back. The app
  never destroys and its role cannot. The README asks administrators not to
  let users destroy billing records.

## 8. Totals and the catalog

**When.** The line triggers react to a line created, restored, deleted, or
changed in a field other than `lineTotal`. The document triggers react to a
change of `currencyCode`, `pricesIncludeTax` or `issuer`, which changes the
rounding mode through the profile.

**What.** For a draft invoice or credit note, or any quote: load the document,
its lines, their tax codes with their components, and the profile's rounding
mode; run `checkDocument`. With no problem, `computeDocument`, then write every
`lineTotal` and document total that differs, as the app. With problems, the
totals are emptied: a total that ignores an incomplete line would mislead, and
the buttons name what is missing. An issued document is left to the guards.

Only values that differ are written, and a change to `lineTotal` alone does not
trigger a recomputation, so the totals do not loop.

A tax code whose rate is edited later does not recompute the drafts that use
it until one of their lines changes. Preview and Issue always compute afresh.

**The catalog.** When a line is created with a catalog item, the item's
`description`, `unit`, `unitPrice` and `taxCode` fill the line's empty fields.
When the line's catalog item changes, the four fields are replaced. The line
stays editable (Foundation §1). The totals follow from the filled line.

## 9. From records to inputs

`lifecycle/map.ts` turns the loaded records into the Engine's `DocumentInput`
and the Renderer's `RenderInput`.

| Input | From |
|---|---|
| lines | ordered by `sortOrder`, then creation time; each tax code as `{ code: record id, name, category, components }`, without deleted components |
| rounding, locale, amount in words, titles, mentions | the profile (`roundingMode`, `locale`, `amountInWords`, `invoiceTitle` or `creditNoteTitle`, the type's mentions) |
| language | the document's, else the profile's |
| template, brand | the issuer: `template`, `accentColor`, `footerNote`, `paymentDetails`, and the logo's bytes, downloaded from its file field |
| seller | the issuer: name, legal name, legal form, `postalAddress`, primary email, phone and website |
| buyer | the company when one is set, else the person, with their address and contacts |
| identifiers | the issuer's and the buyer's, whose type is printed, in the type's `sortOrder` |
| unit | translated from the unit list by Lifecycle's language packs |
| `taxNames`, `taxNotes` | each code used: its name, and its printed note in recap order |
| `corrects` | a credit note's invoice: its number and issue date |
| `qr` | the profile's `qrMode`; none on a preview, which has no number |

Rich text (notes, mentions, payment details) is printed as plain text: the
markdown Twenty stores, with its markup removed.

**Addresses** are printed in the order the country uses, from a small table:
postcode before the city for most of Europe and Morocco; city, state and
postcode on one line for the United States, Canada and India; city and
postcode on their own lines for the United Kingdom. The buyer's country is
printed when it differs from the seller's.

**The QR code** encodes a generic payload,
`<number>;<issueDate>;<total>;<currency>;<the seller's first printed identifier>`,
with `verificationBaseUrl` as the base for `URL_WITH_PAYLOAD`. Country payloads
(EPC transfer codes, tax-authority formats) are later work.

## 10. Messages and errors

Lifecycle words everything a person reads, in English and French, from
`lifecycle/lang/en.ts` and `fr.ts`, which satisfy one type: its own problems,
the Renderer's problems (Rendering does not word them), the unit names and the
timeline messages. The Engine's problems use the Renderer's `describeProblem`.
A button's messages follow the caller's Twenty locale, English when no pack
matches. Timeline messages follow the document's language.

Lifecycle's problem codes: `NOT_ALLOWED`, `WRONG_STATUS`, `ALREADY_ISSUED`,
`MISSING_ISSUER`, `MISSING_PROFILE`, `MISSING_BUYER`, `MISSING_CURRENCY`,
`MISSING_IDENTIFIER`, `INVALID_IDENTIFIER`, `IDENTIFIER_OWNER`,
`MISSING_INVOICE`, `INVOICE_NOT_ISSUED`, `INVOICE_MISMATCH`, `DATE_IN_FUTURE`,
`DATE_BEFORE_LAST`, `DUE_BEFORE_ISSUE`, `CLOCK_SKEW`, `LEDGER_BEHIND`.

| Failure | What the person sees |
|---|---|
| The gate refuses | The problems, worded; HTTP 422. Nothing is written but the defaults. |
| The caller cannot edit | `NOT_ALLOWED`; HTTP 403. |
| Anything unexpected | "Something went wrong (ref 7f3a…)"; HTTP 500. The route logs the reference with the document, the action and the step. |
| Logic functions disabled on the server | The button catches the failed request and says the billing actions need logic functions enabled, pointing to the README. |

Triggers are retried by the platform. Because every guard and totals write
compares first, a retry repeats nothing.

## 11. Testing and acceptance

`node --test`, in `test/lifecycle/`, against the in-memory `Store`:

- **Mapping**: records to `DocumentInput` and `RenderInput`, field by field;
  line order; address order per country; units in both languages; rich text to
  plain text.
- **Gate**: each check, one test each, and all problems reported together.
- **Numbering**: first number of a scope; a ledger row created on the way; a
  duplicate stepped over; the 50-refusal stop; resuming with a held number;
  two requests for the same draft, interleaved step by step, ending with one
  number; two drafts at once ending with two consecutive numbers; a starting
  value; the date rules.
- **Issue**: a failure injected after each step, then a second Issue that
  finishes with the same number; the snapshot's two parts; previews removed;
  `ALREADY_ISSUED`.
- **Guards**: every row of the tables in §7; the status rules for each type;
  applying a guard's own write yields no further write; a retried event
  changes nothing; the ledger rules.
- **Totals**: recomputed on each kind of change; only differences written;
  emptied on a problem; the catalog fill and replace.
- **Packs**: both languages carry every Lifecycle problem, every Rendering
  problem, every unit and every timeline message.
- **Bundles**: the route bundles with the SDK's esbuild options; the trigger
  bundles hold no pdfmake; the front components import no `node:` module.

On the test workspace, with a signed-in user clicking the buttons. The spike
could not check a real user acting through the app, so step 1 comes first:

1. Issue as a user whose role cannot edit invoices: refused with
   `NOT_ALLOWED`. Then as an editor: allowed.
2. From a fresh install with presets: an issuer on the `fr` profile, a buyer
   company with its identifiers, a draft invoice with three lines. The totals
   appear as the lines are typed.
3. Preview: a PDF marked DRAFT. Issue: `INV-2026-0001`, one PDF, a snapshot, a
   hash.
4. On the issued invoice, change the subject, change a line, add a line,
   delete the invoice, set it back to DRAFT: each is put back, with a timeline
   message. Set it to PAID: kept.
5. A quote: Generate PDF twice gives one number, v1 then v2.
6. A credit note naming the invoice: `CN-2026-0001`, printed as correcting
   `INV-2026-0001`.
7. A ledger row for a new scope with `lastValue` 1233: the next invoice is
   1234.
8. Two drafts issued at the same moment: two consecutive numbers.

## 12. Files

```
lifecycle/store.ts            the Store interface: the reads and writes Lifecycle needs
lifecycle/load.ts             a document and everything it needs, as one plain shape
lifecycle/map.ts              that shape to DocumentInput and RenderInput; addresses, units, rich text
lifecycle/gate.ts             the checks, as problems
lifecycle/numbering.ts        allocation and the ledger rules
lifecycle/actions.ts          preview, issue, quote PDF, the snapshot
lifecycle/guards.ts           the status rules, reverts and restores
lifecycle/totals.ts           recomputation and the catalog fill
lifecycle/lang/pack.ts, en.ts, fr.ts
src/lib/rest-store.ts         the Store over Twenty's REST client
src/logic-functions/billing-action.ts
src/logic-functions/guard-*.ts                 the seven triggers
src/front-components/*.tsx, src/command-menu-items/*.ts
src/timeline-activity-types/billing.ts
test/lifecycle/*.test.ts, test/lifecycle/helpers/memory-store.ts
```

`tsconfig.json` includes `lifecycle/**/*.ts`. The README gains a section on
issuing, and the warning about destroy permissions.

## 13. Carried to other sub-projects

- **4b** converts a quote into an invoice and marks it INVOICED; creates a
  credit note from an invoice with its lines, and cancels the invoice a full
  credit note reverses; adds buttons for sending and payment if the free
  status proves too loose; and ships the views (drafts, overdue, paid) and
  navigation.
- **4c** sends documents by email. From the spike: sending needs a token
  backed by a user, so it starts from a button, and both the app's role and
  the user's role need the send-email permission.

## Out of scope for 4a

A permission of its own for issuing, rendering an issued document again,
country QR payloads, bringing back destroyed records, and e-invoicing.
