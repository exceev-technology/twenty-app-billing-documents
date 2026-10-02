# Changelog

Each section says what a user can do with that version. A release moves the work under
`## Unreleased` below a heading with the version and its date, in the pull request that
bumps `version` in `package.json`.

## Unreleased

## 0.1.0 - unreleased

The first release.

- Issue invoices and credit notes: each gets the next number of its sequence, a PDF, and is locked, so what was printed can no longer change. Preview the PDF of a draft as often as you like.
- Make a quote's PDF, with a new version each time, turn a quote into a draft invoice, correct an issued invoice with a credit note for what remains, or cancel it in one step.
- Follow an invoice to payment (Issued, Sent, Paid), and see what is overdue in the Overdue invoices view; other views list drafts, unpaid and paid invoices, open quotes and credit notes.
- Send an invoice, a credit note or a quote by email from the side panel, from your own mailbox, with the PDF attached and a message prefilled in the document's language.
- Work in any country and currency: legal identifiers, tax codes with several components, exemptions, reverse charge, numbering patterns and mentions are records you edit, with presets for Morocco, France, the United Kingdom, the United States, Canada, Germany, Spain, Belgium, the Netherlands, Italy, India and the United Arab Emirates, and a generic one.
- Print in English or French, in one of five layouts: classic, modern, compact, letterhead, receipt.
- Keep a catalog of products and services that fills the lines.
- The install creates the objects, the views, the buttons and the presets, and requires a Twenty server at version 2.43.0 or later.
