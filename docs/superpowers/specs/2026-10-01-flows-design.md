# Sub-project 4b: Flows between documents, design

Status: proposed 2026-10-01, for review. Read [the issue path design](2026-09-26-issue-path-design.md)
first; this spec builds on its route, its triggers, its gate and its guards, and
does not repeat them.

4a made each document on its own: a quote with a PDF, an invoice issued and
frozen, a credit note naming an invoice. 4b joins them. A quote becomes an
invoice. An issued invoice is corrected by a credit note or cancelled in one
click. Payment is followed by status, and ready-made views list the drafts, the
unpaid and the overdue invoices. Email is 4c.

## 1. Decisions

| Topic | Decision |
|---|---|
| Quote to invoice | One invoice per quote, from a quote in Draft, Sent or Accepted. The invoice is a draft that copies the quote. The quote becomes Invoiced, and returns to Accepted if that draft is deleted before it is numbered. |
| Credit note | A button on an issued invoice makes a draft credit note holding what remains to credit, each line linked to the invoice line it credits. The person edits it down for a partial correction, then issues it. |
| Cancel | A button issues, after a confirmation, a credit note for everything that remains, then marks the invoice Cancelled. |
| Fully credited | An invoice whose issued credit notes credit everything it billed is marked Cancelled by the app, whichever button made them. |
| Payments | Status and dates: Sent and Paid only on an issued invoice; the app stamps the sent and paid dates. No payment records, no partial payments. |
| Views | Saved views on quotes, invoices and credit notes, and an "Overdue invoices" entry in the sidebar. No dashboard. |
| Shape | Three new actions in the existing `billing-action` route, three buttons on 4a's pattern, and the guards extended. |

## 2. What the platform allows

Read in the server and SDK source at tag `twenty/v2.43.0`; the SDK is pinned to
2.43.0 since PR #10.

- A front component can open a record in the side panel
  (`openSidePanelPage({ page: ViewRecord, recordId, objectNameSingular })`) and
  ask for a confirmation (`openCommandConfirmationModal`, with a `danger`
  accent). A button can therefore show the document it has just made, and
  confirm a cancellation before it calls the route.
- An app declares views (`defineView`): table or kanban, with filters (`IS`,
  `IS_IN_PAST`, …), filter groups, sorts and visible fields. The server adds
  them next to the default view of each object. A sidebar item of type `VIEW`
  opens one.
- The front component context still does not name its object, so each button
  keeps its own small component, as in 4a.

Three things are checked live before the code that depends on them (plan,
Task 1): the value shape a `SELECT` filter takes for several options, whether
`IS_IN_PAST` on a date field needs a value, and that a headless button can open
a record in the side panel after its command has run.

## 3. Data model changes

Nothing is removed or renamed.

| Object | Field | Type | Purpose |
|---|---|---|---|
| billingCreditNoteLine | `invoiceLine` | RELATION → billingInvoiceLine, on delete SET_NULL, app-only | The invoice line this line credits. Set by the Credit note and Cancel buttons. Empty on a line a person adds. |
| billingInvoiceLine | `creditNoteLines` | the reverse side | |
| billingQuote | `sentAt` | DATE_TIME | Stamped when the quote first moves to Sent (§8). 4c stamps it too. |

`invoiceLine` is app-only so that the link always points into the credit note's
own invoice: the gate can trust it. On an issued credit note it is locked with
the other line fields, and the snapshot keeps it.

Three timeline activity types join 4a's two, each with the same expandable
message component:

| Type | Collapsed row | Left on |
|---|---|---|
| `billingInvoiced` | "Twenty invoiced <quote>" | the quote, when its invoice is made |
| `billingCredited` | "Twenty credited <invoice>" | the invoice, when a credit note against it is issued and it is not fully credited |
| `billingCancelled` | "Twenty cancelled <invoice>" | the invoice, when it becomes fully credited |

## 4. Components

```
 Create invoice ─┐
 Credit note ────┼─ POST /s/billing/action ──> billing-action route
 Cancel invoice ─┘   (confirmation first)        lifecycle/flows: copies, remainder, credit checks
                                                 lifecycle/actions: invoiceQuote, creditNote, cancelInvoice,
                                                                    and issue, which now settles the invoice

 record change ── event ──> triggers ──> lifecycle/guards: status rules, date stamps, quote reopened
```

- **`lifecycle/flows.ts`** (new, pure): what each flow copies, the remainder of
  an invoice, whether a credit note fits it, and whether an invoice is fully
  credited. It reads and writes through 4a's `Store`.
- **`lifecycle/actions.ts`**: three new action names. A response may now name
  the document an action created, so the button can open it:
  `{ ok, message, created?: { object, recordId } }`, and a refusal may carry
  `created` too (§6, Cancel).
- **`lifecycle/gate.ts`**: check 4 (a credit note's invoice) gains two rules
  (§6).
- **`lifecycle/guards.ts`**: the status rules and the date stamps of §8, and the
  quote's return to Accepted.
- **Buttons**: Create invoice (quotes), Credit note and Cancel invoice
  (invoices). Each is a headless component on 4a's `ActionCommand`, extended to
  open the created document and, for Cancel, to ask first.
- **Views**: one file per view in `src/views/`, and one sidebar item.

## 5. Quote to invoice

**Button.** "Create invoice", on one selected quote in Draft, Sent or Accepted.

**Action** `invoiceQuote`:

1. Read the quote. Refused with `QUOTE_NOT_OPEN` when it is Declined, Expired
   or Invoiced, and with `ALREADY_INVOICED` when a live invoice already points
   to it: the problem names it by its number, else its subject (without a name
   when it has neither), and the answer names it in `created` so the button
   opens it.
2. Create the invoice **with the caller's own token**: this is the action's
   first write, so Twenty's role check decides who may act (`NOT_ALLOWED`
   otherwise, as in 4a). The invoice is a DRAFT and copies the quote's
   `subject`, `issuer`, `company`, `person`, `opportunity`, `currencyCode`,
   `pricesIncludeTax`, `language` and `notes`, and points to the quote
   (`quote`). It copies no number, date, buyer reference, PDF, total or
   snapshot: the issue date, due date and totals are filled as for any draft.
3. Copy each live quote line, in order, as the app: `description`,
   `sortOrder`, `catalogItem`, `quantity`, `unit`, `unitPrice`,
   `discountPercent`, `taxCode`, `periodStart`, `periodEnd`. The catalog fill
   leaves them as they are, since they are not empty, and the line triggers
   compute the totals.
4. Mark the quote, as the app: status INVOICED, and `acceptedAt` the caller's
   date when it is empty. Leave a `billingInvoiced` message on the quote.

The answer names the new invoice, and the button opens it in the side panel.

**A failure part-way** leaves a draft invoice holding the lines copied so far,
and the quote as it was. A second click answers `ALREADY_INVOICED` and opens
that draft: the person finishes it, or deletes it to start again.

**The quote follows its invoice.** When that invoice is deleted while it is an
unnumbered draft, and the quote has no other live invoice, the guard sets the
quote back to Accepted and says so on its timeline. When the invoice is
restored, the quote becomes Invoiced again. A numbered invoice cannot be
deleted (4a, §7), so an issued invoice always keeps its quote Invoiced.

## 6. Credit notes

### What remains of an invoice

All the arithmetic below is in `lifecycle/flows.ts`, on quantities as integer
thousandths (the Engine's scale), never on floating point.

- A credit-note line **matches** an invoice line when it is linked to it
  (`invoiceLine`), the invoice line belongs to the credit note's invoice, and
  its `unitPrice`, `discountPercent` and `taxCode` are the invoice line's. Its
  quantity is then credited against that line.
- The **remainder** of an invoice is known when every line of its issued credit
  notes matches. It is then, for each invoice line, its quantity less the
  quantities credited against it, leaving out the lines with nothing left.
- An invoice is **fully credited** when its remainder is known and empty, or,
  when its remainder is not known, when the totals of its issued credit notes
  add up to at least its own total. The first test is exact whatever the
  rounding mode; the second catches credit notes a person made by hand. A known
  remainder decides alone: totals that reach the invoice's while a rebate line
  is left do not make it fully credited.

The invoice's lines are read from its snapshot (`snapshot.record.lines`), which
is what was issued.

### The Credit note button

"Credit note", on one selected invoice that is issued (status Issued, Sent or
Paid). Action `creditNote`:

1. Refused with `NOT_ISSUED` for an invoice that is not issued, and
   `INVOICE_CANCELLED` for a cancelled one.
2. Compute the remainder. When it is known and empty: `NOTHING_TO_CREDIT`.
   When a credit note against the invoice holds a number but was never issued
   (its Issue failed after the claim, or the recheck refused it):
   `NUMBERED_CREDIT_NOTE_PENDING`, naming it in `created` so the button opens
   it. It is finished (or corrected) first: another credit note issued
   meanwhile could cancel the invoice and strand it with its number.
3. Create the credit note with the caller's own token: a DRAFT that points to
   the invoice and copies, from its snapshot, `subject`, `issuer`, `company`,
   `person`, `currencyCode`, `pricesIncludeTax` and `language`. `reason` stays
   empty for the person to fill.
4. Add its lines as the app, each linked to its invoice line: the remainder
   when it is known, every invoice line in full when it is not.

The button opens the draft. The person lowers a quantity, removes a line, or
changes a price, then previews and issues it as any credit note.

### The Cancel invoice button

"Cancel invoice", on the same selection. The button first asks: "Cancel this
invoice? A credit note for everything that remains is issued, and the invoice
is marked Cancelled. This cannot be undone." (The button knows only the
selected record's id, so the question does not name the number.) Action
`cancelInvoice`:

1. Refused with `NOT_ISSUED` or `INVOICE_CANCELLED` as above.
2. Compute the remainder. When it is not known: `REMAINDER_UNKNOWN` (a credit
   note against the invoice changed a price or added a line, so the person uses
   Credit note and adjusts it). When it is empty, the invoice is fully credited
   already: mark it Cancelled (step 6) and stop.
3. Reuse the newest draft credit note against the invoice whose lines are
   exactly the remainder: a previous Cancel that stopped at the gate. Otherwise
   create one, with the caller's own token, as the Credit note button does,
   with `reason` set to "Cancellation of F2026-0001" in the invoice's language,
   and add the remainder's lines as the app. A numbered credit note never
   issued is reused only when it is such a previous Cancel's; any other is
   refused with `NUMBERED_CREDIT_NOTE_PENDING`, as above.
4. Issue it: 4a's issue action, from its read to its ledger, as the same
   caller, with the same date.
5. When the issue is refused, answer its problems, and name the draft credit
   note in `created` so the button opens it: the person fixes what the gate
   found and clicks Cancel again, or issues the draft.
6. When it is issued, the issue settles the invoice (below): it is now fully
   credited, so it becomes Cancelled.

### Issuing a credit note settles its invoice

After a credit note is issued (step 5 of 4a's Issue), as the app:

- When its invoice is now fully credited: the invoice's status becomes
  CANCELLED, and a `billingCancelled` message says by which credit note.
- Otherwise: a `billingCredited` message on the invoice names the credit note
  and its total.

A failure here is logged and leaves the credit note issued. The next Cancel on
the invoice finds it fully credited and marks it (step 2 above).

### The gate

Check 4 of 4a's gate (a credit note's invoice) gains two rules:

- The invoice is not cancelled: `INVOICE_CANCELLED`.
- The credit note does not credit more than remains, `OVER_CREDIT`:
  - when the remainder is known and every line of the credit note matches, no
    line credits more than its invoice line has left (`field` names the line).
    When every line matches, the credit note also may not leave the invoice
    with less than nothing (a rebate line credited away would credit more than
    was billed);
  - otherwise, its total does not exceed the invoice's total less the totals of
    the issued credit notes by more than one minor unit per tax component it
    prints. That margin absorbs the rounding of two separate documents, which
    can each round a component half a unit apart.

## 7. Actions and buttons

The three actions follow 4a's route exactly: the request
`{ action, object, recordId, localDate, locale }`, the clock-skew check, the
caller's first write, every later write as the app, all problems reported at
once, and an unexpected failure answered with a reference.

| Button | Object | Shown on | Action |
|---|---|---|---|
| Create invoice | quote | one selected quote, not deleted, in Draft, Sent or Accepted | `invoiceQuote` |
| Credit note | invoice | one selected invoice, not deleted, in Issued, Sent or Paid | `creditNote` |
| Cancel invoice | invoice | the same | `cancelInvoice`, after the confirmation |

`ActionCommand` gains two options: `opensCreated` (after a success, or a refusal
that names a created document, open it in the side panel) and `confirm` (the
words of a confirmation; nothing is posted when the person declines). The
confirmation's words are the buttons' own, in English and French, like their
transport messages, since they are shown before the route answers.

Answers are worded by Lifecycle's packs: "Draft invoice created from this
quote.", "Draft credit note created for F2026-0001.", "F2026-0001 is cancelled
by credit note AV2026-0003."

## 8. Status and payment

4a's three status rules stay. 4b adds two, and the date stamps.

**Rules.**

4. An invoice moves to Sent or Paid only once it is issued. A draft set to
   Sent or Paid is put back, with a message.
5. A quote leaves Invoiced only through the app: a person's move away from
   Invoiced, while the quote has a live invoice, is put back.

**Stamps**, written by the document trigger as the app, only into an empty
field, and only for a person's move (an app move sets its own dates):

| Move | Stamp |
|---|---|
| invoice to Sent | `sentAt`: now |
| invoice to Paid | `paidAt`: the server's date (UTC), or the issue date when that is later |
| invoice from Paid to Issued or Sent | `paidAt` emptied: it was not paid after all |
| quote to Sent | `sentAt`: now |
| quote to Accepted | `acceptedAt`: the server's date (UTC), or the quote's issue date when that is later |

The stamped dates stay editable. A person who fills `paidAt` first and then
sets Paid keeps their date. A person's move whose event is handled after the
record moved again (a later move, or the app's own, such as Cancelled) is
neither put back nor stamped: the later event handles where it stands.
Overdue is not a status: it is a view (§9).

**Cancelled.** 4a already refuses a person's move of a numbered invoice to
Cancelled. The app's moves (§6) are allowed, as every app move is.

## 9. Views

Views are added next to the default "All" view of each object. Their fields are
the document's label (`subject`) first, then:

| Object | View | Type | Filter | Sort | Fields |
|---|---|---|---|---|---|
| Invoices | Drafts | table | status is Draft | updated, newest first | issuer, company, person, total, updated |
| Invoices | Unpaid | table | status is Issued or Sent | due date, oldest first | number, company, person, issue date, due date, total, status |
| Invoices | Overdue | table | status is Issued or Sent, and due date in the past | due date, oldest first | number, company, person, due date, total, sent at |
| Invoices | Paid | table | status is Paid | paid on, newest first | number, company, person, total, paid on |
| Quotes | Open | table | status is Draft or Sent | valid until, soonest first | number, company, person, total, valid until, status |
| Quotes | To invoice | table | status is Accepted | accepted on, oldest first | number, company, person, total, accepted on |
| Quotes | Pipeline | kanban by status | none | updated, newest first | number, company, total, valid until |
| Credit notes | Drafts | table | status is Draft | updated, newest first | invoice, company, total |

The sidebar's Billing folder gains "Overdue invoices", which opens the Overdue
view, after the Invoices entry.

No view sums amounts: documents in several currencies would add euros to
dirhams. No dashboard, for the same reason; a workspace with one currency can
build one on these views.

Moving a card in the quotes' Pipeline changes the status like any edit, so the
guards apply: dropping a quote into Invoiced is put back.

## 10. Messages and errors

New Lifecycle problem codes, worded in English and French:

| Code | What the person reads |
|---|---|
| `QUOTE_NOT_OPEN` | This quote is declined, expired or already invoiced: it cannot become an invoice. |
| `ALREADY_INVOICED` | This quote already has an invoice, <number or subject>: finish it, or delete it to start again. (Without either: This quote already has an invoice: finish it, or delete it to start again.) |
| `NOT_ISSUED` | This invoice is not issued: a draft is corrected by editing it. |
| `INVOICE_CANCELLED` | This invoice is cancelled: it has nothing left to credit. |
| `NOTHING_TO_CREDIT` | Everything on this invoice is credited already. |
| `REMAINDER_UNKNOWN` | A credit note against this invoice changed a price or added a line, so what remains cannot be worked out: use Credit note and adjust it. |
| `OVER_CREDIT` | This credit note credits more than remains on the invoice (line 2). |
| `NUMBERED_CREDIT_NOTE_PENDING` | Credit note AV2026-0001 already holds a number: finish it (or correct it) before making another. |

New status rule messages: "Only an issued invoice can be Sent or Paid: the
status was put back to Draft." and "This quote has an invoice: it stays
Invoiced. Delete the invoice to reopen the quote."

## 11. Testing and acceptance

`node --test`, against the in-memory `Store`:

- **Flows**: what a quote's invoice copies and what it leaves out; a credit
  note's draft from the snapshot; matching; the remainder after none, one and
  two credit notes; an unknown remainder; fully credited by remainder and by
  totals; `OVER_CREDIT` by line and by total, with the rounding margin, in both
  rounding modes.
- **Actions**: each new action's refusals, its caller write (`NOT_ALLOWED`),
  its answer naming the created document; a failure after each step and the
  click that follows; Cancel reusing its stopped draft; an issued credit note
  settling its invoice, Cancelled or credited.
- **Guards**: rules 4 and 5 for every status; each stamp, and that an app move
  stamps nothing; the quote back to Accepted when its draft invoice is deleted,
  and Invoiced again when it is restored; a numbered invoice's deletion still
  restored.
- **Views**: every filter, sort and field names a field the object has, and
  every option value exists.
- **Buttons**: the availability expressions, and that the components import no
  `node:` module.
- **Packs**: every new code and message in both languages.

On the test workspace, as a signed-in user:

1. An Accepted quote with two lines: Create invoice opens a draft invoice with
   both lines and its totals; the quote is Invoiced. Delete that draft: the
   quote is Accepted again, with a timeline message. Create it again.
2. Issue the invoice. Set it to Paid: Paid on is today. Back to Sent: Paid on is
   empty. A draft invoice set to Paid is put back.
3. Credit note: a draft with both lines, linked. Lower one quantity, issue: the
   invoice stays as it was, with a "credited" message.
4. Cancel invoice, confirm: a credit note for what remains is issued, and the
   invoice is Cancelled. Credit note and Cancel are refused on it now.
5. The eight views list the right documents; "Overdue invoices" opens from the
   sidebar.

## 12. Files

```
lifecycle/flows.ts                  copies, remainder, matching, fully credited, over-credit
lifecycle/actions.ts                invoiceQuote, creditNote, cancelInvoice; issue settles the invoice
lifecycle/gate.ts                   INVOICE_CANCELLED, OVER_CREDIT
lifecycle/guards.ts                 rules 4 and 5, stamps, the quote following its invoice
lifecycle/load.ts                   credit-note lines lock invoiceLine
lifecycle/store.ts                  three timeline kinds
lifecycle/lang/pack.ts, en.ts, fr.ts
src/objects/billing-credit-note-line.object.ts, billing-invoice-line.object.ts, billing-quote.object.ts
src/timeline-activity-types/billing-invoiced.ts, billing-credited.ts, billing-cancelled.ts
src/front-components/action-command.tsx, action-feedback.ts, create-invoice.tsx, credit-note.tsx, cancel-invoice.tsx
src/command-menu-items/create-invoice, credit-note, cancel-invoice
src/views/*.view.ts, src/navigation-menu-items/overdue-invoices.navigation-menu-item.ts
test/lifecycle/flows.test.ts, and the existing suites extended
```

## Out of scope for 4b

Payment records and partial payments, deposit and recurring invoices, several
invoices from one quote, printing the quote's number on its invoice, a
dashboard, and quotes expiring by themselves when their validity passes (the
Open view sorts them by validity instead).
