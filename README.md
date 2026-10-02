# Billing Documents for Twenty

Quotes, invoices and credit notes, issued as PDFs, inside [Twenty](https://twenty.com).
Your clients are already in Twenty, so your documents can be too.

- Quotes that become invoices, invoices that are numbered and locked when issued, and credit notes to correct them.
- Any country, any currency: legal identifiers, tax codes, mentions and numbering rules are records you edit in Twenty, with presets for 12 countries plus a generic one to start from.
- Five PDF layouts in English or French, and an email form that sends the PDF from your own mailbox.
- Free and open source, MIT licensed. It is a Twenty app: nothing to host beside Twenty itself.

![The five PDF layouts, one invoice](https://raw.githubusercontent.com/exceev-technology/twenty-app-billing-documents/main/public/gallery/layouts.png)

## Install

**From Twenty's marketplace.** In Twenty, open **Settings → Applications → Marketplace**, turn off the **Vetted only** filter (Twenty marks only its own apps as vetted), search for *Billing Documents* and install it. The installation creates the objects, the views, the buttons and the country presets: nothing else to set up. A new package reaches the marketplace at its next catalog sync, within the hour.

**From the source, on a server that does not list it.** You need Node 24 and a user who can install applications on the server:

```bash
git clone https://github.com/exceev-technology/twenty-app-billing-documents.git
cd twenty-app-billing-documents
npm ci
./node_modules/.bin/twenty remote:add --url https://your-twenty-server --as mine
./node_modules/.bin/twenty app:publish --private --remote mine
./node_modules/.bin/twenty app:install --remote mine
```

`remote:add` signs you in (it opens your browser, or asks for an API key). `app:publish --private` builds the app and uploads it to your server only; `app:install` installs it in the workspace the remote points to.

## Requirements

- A Twenty server at version 2.43.0 or later. Twenty refuses to install the app on an older one and says why.
- On a self-hosted server, logic functions enabled (`LOGIC_FUNCTION_TYPE`). They are off by default, and without them nothing works: the presets are not seeded, totals are not computed, issued documents are not protected, and the buttons answer that logic functions are turned off.

## Your first invoice

The presets are seeded in the background just after the install: wait until **Billing → Profiles** lists them.

1. **Pick a profile.** In **Billing → Profiles**, open the one for your country (or *Generic*): it holds the identifiers your country requires, the tax codes, the numbering pattern and the language.
2. **Create your issuer**, the business that sells: open **Issuers** from the command menu (Ctrl+K or Cmd+K) and add one with its trading name, legal name, address, an email, the *Profile* you picked, and its default currency when the profile has none (*Generic* has none).
3. **Add its legal identifiers**, on the issuer, under *Legal identifiers*: one record per identifier the profile requires, with its *Type* and *Value* (a VAT number, a company number).
4. **Have a client.** Any company or person in Twenty will do. Where your country asks for the client's identifiers, add them the same way.
5. **Write a draft invoice.** In **Billing → Invoices**, add one: a *Subject*, the *Issuer*, the *Company* (or *Person*), then its *Lines*: a description, a quantity, a unit price and a tax code each.
6. **Issue it.** Select the invoice and click **Issue**. If something is missing, the message lists all of it; fix it and click again. The invoice gets the next number, its PDF is rendered into its *PDF* field, and it is locked.

**Preview PDF** renders the draft, marked DRAFT, as often as you like before you issue.

## What it installs

Fourteen objects, all prefixed `billing` so they never clash with objects you built yourself: profiles, identifier types, legal identifiers, issuers, tax codes and their components, catalog items, quotes, invoices, credit notes, their lines, and the numbering ledger. Companies, people and opportunities gain relations to them. A **Billing** folder in the sidebar holds quotes, invoices, credit notes, the overdue view, the catalog, tax codes and profiles.

On install and on every upgrade, the app creates the country presets that are missing. It never changes a record that exists: your edits always win, and a preset you delete stays deleted.

## Issuing documents

Select one draft invoice or credit note: **Preview PDF** and **Issue** appear at the top of the record and in the command menu. On a quote, **Generate PDF**.

- **Preview PDF**, like Issue, first fills what the draft leaves empty: the issue date (today), the currency, the language and the due date. It then renders the document, marked DRAFT, into its PDF field. It numbers nothing and can be run as often as you like. A draft previewed on one day and issued later keeps the preview's issue date, unless you change it.
- **Issue** fills what is left empty (issue date, currency, language, due date), checks everything at once and lists every problem it finds, then gives the document the next number of its sequence, renders the PDF, and freezes the document with a copy of what was printed and the PDF's SHA-256 hash.
- **Generate PDF** fills a quote's empty defaults the same way (its validity in place of a due date), numbers it on its first PDF, then adds a new version (v2, v3…) each time. The quote stays editable; its PDF field keeps the last ten.

The buttons act as you: anyone whose role can edit the document can issue it, and no one else. Messages follow your Twenty language.

**Totals** are computed by the app a moment after a line changes. A line with a catalog item takes the item's description, unit, price and tax code where it has none.

## Numbering

Each issuer has its own sequence per document type and per period (yearly, monthly or never reset, from the profile), in the pattern the profile sets, for example `F{YYYY}-{SEQ:4}` for `F2026-0001`. Numbers have no gaps. To carry on from an older system, create a *Numbering sequence* record for the issuer, type and period, with *Last number* set to the last number already used: the next document takes the one after. Once a sequence has given out a number, its last number can only rise.

## Issued documents are locked

An issued invoice or credit note cannot be changed. A change to what was printed (subject, buyer, dates, currency, lines, notes…) is put back a moment later, and the record's timeline says what was put back and why. Deleting an issued or numbered document restores it. Its status can still move between issued, sent and paid, and the sent date, paid date, opportunity and quote stay free. To correct an issued invoice, issue a credit note that names it.

## From a quote to an invoice

**Create invoice**, on a quote in Draft, Sent or Accepted, makes a draft invoice that copies it: issuer, buyer, opportunity, currency, price basis, language, notes and every line. The draft opens in the side panel, and the quote becomes Invoiced. A quote has one invoice: delete that draft (before it is numbered: a numbered draft is restored) and the quote is Accepted again. An invoiced quote stays Invoiced while its invoice lives. Moving a quote to Sent or Accepted fills its *Sent at* or *Accepted on* when it is empty.

## Credit notes and cancelling

**Credit note**, on an issued invoice, makes a draft credit note holding what remains to credit, each line linked to the invoice line it credits. Lower a quantity or remove a line for a partial correction, then issue it.

**Cancel invoice**, in the invoice's command menu, asks for a confirmation, then issues a credit note for everything that remains and marks the invoice Cancelled. When a credit note made earlier changed a price, what remains cannot be worked out: use Credit note and adjust it.

An invoice whose issued credit notes credit all of it is marked Cancelled, whichever way they were made. A numbered invoice that its credit notes cancelled stays Cancelled: a move out of Cancelled is put back. No credit note may credit more than remains, nor leave the invoice with less than nothing.

## Payment status

Set an issued invoice to Sent or Paid: the app fills *Sent at* and *Paid on* when they are empty (you can change them). Setting it back from Paid empties *Paid on*. A draft cannot be Sent or Paid. Overdue is not a status: the **Overdue invoices** view, in the Billing folder, lists the issued or sent invoices whose due date has passed.

## Views

Invoices: Drafts, Unpaid, Overdue, Paid. Quotes: Open, To invoice, and a Pipeline board by status. Credit notes: Drafts. They add up no amounts: documents in several currencies cannot be summed.

## Sending documents by email

**Send by email**, on an issued invoice (Issued, Sent or Paid), an issued credit note, or a quote that has a PDF, opens a form in the side panel: from, to, cc, subject and message, prefilled in the document's language, with the PDF attached. Review it, change what you like, and click **Send**. The email goes from your own mailbox, so it appears in your sent folder, and Twenty imports it with your other emails when that mailbox syncs.

- The message starts from a template for each document type, and from a reminder for an invoice, Issued or Sent, whose due date has passed. The templates are in the app's language files (`lifecycle/lang/en.ts` and `fr.ts`): change them in your fork to use your own wording every time.
- *To* starts with the email of the person the document is billed to, and is filled only when you can see that person: a role that cannot read People gets an empty *To*, and a greeting with no name. A company has no email address in Twenty, so a document billed to a company alone starts with an empty *To*. Separate several addresses with commas.
- *From* starts with the mailbox whose address is the issuer's email, when you have connected it. A mailbox whose connection has failed in Twenty, or that was archived, is not offered: reconnect it in **Settings → Accounts**.
- A quote sends its newest generated PDF, so run **Generate PDF** after changing a quote, before you send it. The message carries the quote's current total, which may differ from the total printed on an older PDF.
- After a send, an Issued invoice becomes Sent and a Draft quote becomes Sent; *Sent at* keeps the date of the first send; every send leaves a row on the document's timeline naming who received it.
- When the form says the email may have gone, or that it could not confirm that the email was sent (the connection dropped, or Twenty did not answer in time), the email may have gone: either message tells you to check your Sent folder, and the second also the document's timeline, before sending it again. The form keeps Send disabled until you reopen it.

Before anyone sends:

1. Each person who sends connects their mailbox in **Settings → Accounts**. Without one, the form says how.
2. Their role allows sending email: **Settings → Roles**, the role, **Send email**. The app's own role asks for it on install. Without it, Send answers that the role cannot send email, and names that setting.

## Roles to set

Twenty can delete a record permanently ("destroy" it, for example by emptying the deleted records). The app brings back a deleted invoice, but it cannot bring back a destroyed one, and a destroyed invoice leaves a gap in your numbering that your tax authority may ask about. The app never destroys anything, and its role cannot.

In **Settings → Roles**, turn off the permission to destroy records on the billing objects, for every role that can edit them (API keys included). Give **Send email** to the roles that send documents (see above).

## Countries, taxes and languages

- [Presets for 12 countries plus a generic one](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/presets), each with its sources and what its PDF does not cover. Presets are starting points, not legal advice: check them with your accountant before you issue documents.
- Taxes with several components (for example GST plus QST), exemptions and reverse charge with the wording the law requires, and prices entered with or without tax.
- A product and service catalog fills the lines.
- Where a country requires structured e-invoicing, the PDF is a courtesy copy, and the country preset says so.
- PDFs and messages come in English or French, in [five layouts](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/templates.md). The embedded font draws Latin, Greek and Cyrillic; a document with Arabic, Hebrew, Devanagari, Thai or CJK text is refused rather than printed with empty boxes.

## Upgrading

When a new version is published, the marketplace shows it after its next catalog sync, and Twenty offers the upgrade in **Settings → Applications**. Workspaces that turned on automatic upgrades for the app (in its *General* tab) are upgraded in the background. Twenty refuses a version that is not higher than the one installed, and a version whose required server version your server does not meet.

An upgrade keeps your data: released identifiers are permanent, so Twenty upgrades the same objects and fields in place, and the changelog says if a version ever removes anything. It creates the presets, identifier types and tax codes that are missing and changes none that exist, so a correction to a preset in a new version does not alter your copy: the changelog names it, and you edit your record. [CHANGELOG.md](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/CHANGELOG.md) lists every version.

## Uninstalling

**Uninstalling removes the app's objects and every document in them**: profiles, issuers, quotes, invoices, credit notes, their lines, numbering sequences and the PDFs. It cannot be undone. Keep your issued PDFs somewhere else first: many countries require you to keep issued invoices for years.

Uninstall from **Settings → Applications**, on the app's page, or with `./node_modules/.bin/twenty app:uninstall --remote <name>`.

## Limits

- Not in this version: deposit invoices, recurring invoices, payment records and partial payments (an invoice is Issued, Sent or Paid, and Overdue is a view), online payment links, and submission to government e-invoicing systems (Italy's SDI, Peppol in Belgium, India's IRN, France's 2026 reform and others).
- PDFs and messages come in English and French only. Another language is one file per pack: see [CONTRIBUTING.md](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/CONTRIBUTING.md).
- The embedded font covers Latin, Greek and Cyrillic: other scripts are refused.
- A quote has one invoice, and its PDF field keeps its last ten versions.
- The views add up no amounts, since documents may be in several currencies.
- A company has no email address in Twenty, so a document billed to a company alone starts with an empty *To*.
- The app cannot stop a user whose role may destroy records from destroying them: see *Roles to set*.
- The presets were checked on the date each page states; laws change. They are no substitute for your accountant.

## Contributing

Bug reports, preset corrections with their official source, new languages and code are welcome: see [CONTRIBUTING.md](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/CONTRIBUTING.md). Report a security problem privately, as [SECURITY.md](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/SECURITY.md) says.

## Design

- [Product overview](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-09-21-product-overview.md)
- [Foundation design](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-09-21-foundation-design.md)
- [Engine design](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-09-22-engine-design.md)
- [Rendering design](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-09-24-rendering-design.md)
- [Issue path design](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-09-26-issue-path-design.md)
- [Flows design](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-10-01-flows-design.md): quotes to invoices, credit notes, cancelling, payment status, views
- [Email design](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-10-01-email-design.md)
- [Publish design](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/specs/2026-10-01-publish-design.md)
- [The five templates](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/templates.md)
- Plans: [Foundation](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/plans/2026-09-21-foundation.md), [Engine](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/plans/2026-09-22-engine.md), [Issue path](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/plans/2026-09-26-issue-path.md), [Flows](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/plans/2026-10-01-flows.md), [Email](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/plans/2026-10-01-email.md), [Publish](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/docs/superpowers/plans/2026-10-02-publish.md)

## Author

Exceev Technology. Released under the [MIT licence](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/LICENSE). The PDF layouts take their look from pdfcn's invoice designs, see [THIRD_PARTY_NOTICES.md](https://github.com/exceev-technology/twenty-app-billing-documents/blob/main/THIRD_PARTY_NOTICES.md).
