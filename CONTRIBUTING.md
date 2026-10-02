# Contributing

Thank you for helping. This page says how to set the project up, what the tests guard, and
what a pull request needs. Report a security problem privately, as [SECURITY.md](SECURITY.md)
says, and never in a public issue.

## Set up

You need Node 24 (`.nvmrc` names it: `nvm use` reads it) and npm.

```bash
git clone https://github.com/exceev-technology/twenty-app-billing-documents.git
cd twenty-app-billing-documents
npm ci
npm test
npm run typecheck
```

`npm test` runs every suite in `test/` with Node's own test runner (type stripping, no build
step) and takes under ten seconds. The code is TypeScript with relative imports that keep
their `.ts` extension; `erasableSyntaxOnly` and `verbatimModuleSyntax` are on, so no enums
and `import type` for types.

## How the code is laid out

```
engine/      money, tax components, rounding, numbering: pure, no Twenty import
render/      the PDF: language packs, layouts, fonts
lifecycle/   what Issue, Credit note, Send… do: pure, the store and clock come in as arguments
src/         the Twenty app: objects, fields, views, buttons, logic functions, front components
docs/        a page per preset, the templates, the designs and plans
```

`lifecycle/` imports nothing from Twenty and no `node:` module: a test
(`test/lifecycle/purity.test.ts`) fails when it does. Read the design in
`docs/superpowers/specs/` before a larger change.

## Identifiers

Twenty tells an object, a field or a view from another by a universal identifier. They are
generated, never typed:

- After declaring an object, a field, an option or any other entity, run `npm run ids:sync`.
- Never edit or delete an entry of `src/ids.ts`.
- `ids.lock.json` lists the identifiers that have reached a workspace. Only `npm run deploy`
  then `npm run ids:lock` change it, and a test fails when a locked identifier changes: Twenty
  would read it as deleting the object and creating another.

## Adding or correcting a preset

A preset is one file per country in `src/presets/` (`fr.ts` is a good model).

1. Change the preset. A country preset carries `verifiedOn` (the date you checked) and
   `sources`: links to the law, the tax authority or the official guidance for every rate,
   identifier and mention it states. A correction without an official source cannot be made.
2. Run `npm run presets:docs`, which rewrites the page in `docs/presets/`. A test fails when
   a page and its data disagree.
3. A new country is also added to `PRESETS` in `src/presets/index.ts`, and `npm test` shows
   what else its tests ask for (unique keys, number patterns, valid tax codes, cited sources).

Presets are starting points, not legal advice, and an upgrade never changes a preset a
workspace already has. Say in the pull request what a user must edit by hand.

## Adding a language

A language is two packs and a few words:

1. `render/lang/<code>.ts`: the labels and titles the PDF prints. Add the code to `Language`
   and `PACKS` in `render/lang/pack.ts`.
2. `lifecycle/lang/<code>.ts`: the problems, messages and email templates. Add it to `PACKS`
   in `lifecycle/lang/pack.ts`, and to `packFor`, which picks a pack from a Twenty locale.
3. `src/schema/options.ts`: append the language to `LANGUAGES` (options are append-only),
   then run `npm run ids:sync`.
4. The words the buttons and the email form show in the person's own language:
   `src/front-components/action-feedback.ts` and `src/front-components/email-form.ts`.

`test/render/lang.test.ts` and `test/lifecycle/packs.test.ts` list what every pack must
carry. The embedded font draws Latin, Greek and Cyrillic only: a language in another script
needs a font first, so open an issue before writing it.

## Deploying to a test workspace

Work against a workspace of your own that holds nothing you need. Add it once with
`./node_modules/.bin/twenty remote:add`, then:

```bash
npm run deploy -- --remote <name>
```

It runs the tests and the typecheck, prints the plan, asks you to type the remote's name,
applies without ever destroying anything, checks that the plan is then empty, and runs
`npm run ids:lock`. Always name the remote: the CLI's default may be another workspace.
The CLI is `./node_modules/.bin/twenty`, never `npx twenty`: npm has an unrelated package
with that name.

A deploy is a development sync, so it does not run the post-install function and does not
seed the presets, and on a production server the CLI cannot run a function (that needs a
signed-in user, and the CLI signs in with an API key). Run the `create-missing-presets`
tool instead, from Twenty's AI assistant or an MCP client (`app_create_missing_presets`).
It is safe to run again: it never changes an existing record or brings back a deleted one.
Installing the package (`app:install`, the marketplace) does run the post-install function.

## Pull requests

- One change per pull request, with the template filled in: what changed, how it was
  tested, identifiers locked.
- `npm test` and `npm run typecheck` pass. CI also builds the package
  (`npm run release:check -- --package-only`) and scans the history for secrets.
- Comments say why, not what. The words people read come from the language packs.
- Releases are the maintainer's: see [docs/releasing.md](docs/releasing.md).
