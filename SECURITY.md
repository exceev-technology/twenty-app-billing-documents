# Security

## Reporting a problem

Report a vulnerability privately, through GitHub's security advisories:
<https://github.com/exceev-technology/twenty-app-billing-documents/security/advisories/new>.
Please do not open a public issue for it.

Say what you found, how to reproduce it, and which version of the app and of Twenty you
ran. The maintainer will acknowledge your report and say when a fix can be expected.

## What counts

The app runs inside your Twenty server, with the role it asks for on install: it reads and
writes its own records, reads companies, people and opportunities, writes timeline
messages, uploads PDFs and sends email for the person who clicks Send by email. It never
destroys a record. Examples of what to report: a way to change an issued document, to read
or write records the caller's role does not allow, to send email as someone else, or a
secret committed to the repository.

## Supported versions

The latest published version. Upgrade before reporting, when you can.
