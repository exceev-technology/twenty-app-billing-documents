# Releasing

For the maintainer. A release is a pushed tag `vX.Y.Z`: the workflow in
`.github/workflows/release.yml` checks it, publishes the package to npm with provenance,
and creates the GitHub release. Twenty's marketplace lists the package on its own once it
is on npm.

## One-time setup

### npm

1. Create or sign in to the npm account that will own `twenty-app-billing-documents`, with
   two-factor authentication on.
2. Choose how the workflow signs in to npm:
   - **A token, for the first release.** Create an npm access token that can publish
     (a granular token with read and write access to packages, or a classic automation
     token) and add it to the repository: **Settings → Secrets and variables → Actions →
     New repository secret**, named `NPM_TOKEN`. The provenance badge needs no more than
     this: the workflow already has `id-token: write`.
   - **Trusted publishing, afterwards.** npm cannot attach a trusted publisher to a package
     that does not exist yet, so publish `0.1.0` with the token first. Then, on npmjs.com,
     open the package → **Settings → Trusted Publisher → GitHub Actions** and enter the
     owner `exceev-technology`, the repository `twenty-app-billing-documents` and the
     workflow `release.yml`. Once a release has gone out that way, delete the `NPM_TOKEN`
     secret and the `env:` lines of the workflow's *Publish to npm* step.
   - Publishing `0.1.0` by hand instead (`./node_modules/.bin/twenty app:publish` from your
     machine) gives that version no provenance badge. If you do, do not push the `v0.1.0`
     tag until trusted publishing works, and create the GitHub release yourself. Check
     first that npm's `ignore-scripts` is not set (see *When something fails*).

   Never run `npm publish` in the repository root: Twenty publishes the build's own folder,
   `.twenty/output`, not the root. The root's `prepack` hook refuses to run outside that
   folder, on purpose (`prepack: not a Twenty build output …`), so a slip publishes nothing,
   and `npm pack` there fails the same way.

### GitHub

- **Settings → Code security → Private vulnerability reporting**: turn it on. `SECURITY.md`
  and the issue chooser send people there.
- Keep `main` protected as for any change: the workflow refuses a tag whose commit is not
  on `main`.
- Create the labels `preset` and `language` (`bug` exists already): the issue forms apply them,
  and GitHub skips a label that does not exist.

## Before the first release: the Twenty screenshots

The listing's gallery holds four images (`galleryImages` in `src/application-config.ts`).
`npm run listing:images` draws one, the five PDF layouts. The other three are screenshots of
Twenty, which only a signed-in person can take:

| File | Shows |
|---|---|
| `public/gallery/invoice-issued.png` | An issued invoice, with its **Preview PDF**, **Issue**… buttons and its PDF |
| `public/gallery/overdue-view.png` | The **Overdue invoices** view |
| `public/gallery/email-form.png` | The **Send by email** form in the side panel, prefilled |

1. On the test workspace, with sample data only: made-up companies, people and amounts. No
   image may show a real client, a real email address or a real number.
2. Capture at 1600 × 1000 pixels (the marketplace shows a gallery in an 8:5 frame), PNG, each
   well under 10 MB (the marketplace skips a larger one).
3. Save them under the names above, in `public/gallery/`.
4. List them in `src/application-config.ts`, in the order a visitor should see them:

   ```ts
   galleryImages: [
     'public/gallery/invoice-issued.png',
     'public/gallery/layouts.png',
     'public/gallery/overdue-view.png',
     'public/gallery/email-form.png',
   ],
   ```

`npm test` then checks that each listed file exists, is a PNG and is small enough, and
`npm run release:check -- --tag vX.Y.Z` refuses a release with fewer than four.

## Each release

1. Make sure the identifiers are locked: deploy to the test workspace
   (`npm run deploy -- --remote <name>`), which ends with `npm run ids:lock`, and commit
   `ids.lock.json`. A release makes identifiers permanent, so `release:check` refuses an
   unlocked one.
2. In `CHANGELOG.md`, move what is under `## Unreleased` below a new heading
   `## X.Y.Z - <date>`: what a user can do with this version, in plain words. Say which
   preset corrections a user must apply by hand, since an upgrade never changes a preset a
   workspace already has.
3. Set `version` in `package.json` (a new field or button is a minor version, a fix a patch).
   If the version needs a newer Twenty server, change `engines.twenty` and the version the
   README names in *Requirements*, and say so in the changelog.
4. Open a pull request with these, wait for CI, merge it.
5. On `main`, check the release, then tag the merge commit and push the tag:

   ```bash
   git checkout main && git pull
   npm ci
   npm run release:check -- --tag vX.Y.Z
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   `release:check` runs the tests, the typecheck and the identifier lock, builds the package
   with no server and lists what `npm publish` would send, and refuses a tag that does not
   match `package.json`, a version with no changelog section and an incomplete gallery. The
   workflow runs the same command before it publishes.

   Never publish with npm's `ignore-scripts` set, whether in an `.npmrc`, in the
   environment or as a flag: it skips the `prepack` script that adds `LICENSE` and
   `THIRD_PARTY_NOTICES.md` to the package, and the version would go out without its
   licence. `release:check`'s package check refuses a package without them, so run it on
   the machine that publishes.

## After the tag

1. The **Release** run in the repository's Actions tab is green, and the GitHub release
   exists, with the changelog section as its notes.
2. The package's page on npmjs.com shows the provenance badge, and
   `npm view twenty-app-billing-documents version` prints the version.
3. The marketplace picks the package up at its next catalog sync (hourly). A server
   administrator can run one at once: `./node_modules/.bin/twenty dev:catalog-sync --remote <name>`.
   Twenty lists community apps when the **Vetted only** filter is off.

## When something fails

| What | What to do |
|---|---|
| `release:check` fails before the tag | Read its list; fix it in a pull request. Nothing was published. |
| `release:check` says the package does not hold `LICENSE` or `THIRD_PARTY_NOTICES.md` | npm skipped the `prepack` script that adds them: `ignore-scripts` is set (`npm config get ignore-scripts` prints `true`, or an `.npmrc` or `npm_config_ignore_scripts` sets it). Unset it, run `release:check` again, and never publish with it set. |
| The workflow's check fails after the tag | Delete the tag (`git push origin :refs/tags/vX.Y.Z`, `git tag -d vX.Y.Z`), fix it in a pull request, tag again. |
| npm refuses the publish (authentication) | Check `NPM_TOKEN`, or the trusted publisher's owner, repository and workflow name. Re-run the failed job. |
| npm published, the GitHub release failed | Create it by hand: `node scripts/release-notes.mjs vX.Y.Z > notes.md`, then `gh release create vX.Y.Z --verify-tag --notes-file notes.md`. |
| A published version is wrong | Publish a fixed patch version. npm does not let a version be published twice. |

## Rehearsal on a local Twenty server

Before the first release, and before any release that changes the schema, install the
package on a Twenty server that never saw the app. The server needs Docker.

```bash
./node_modules/.bin/twenty docker:start 2.43.0
./node_modules/.bin/twenty docker:status
```

`docker:start` pulls `twentycrm/twenty-app-dev:v2.43.0` the first time (pass the version
`engines.twenty` names to rehearse the lowest server the app supports; without one it picks
the newest image that satisfies the range), serves it on http://localhost:2020 and writes a
remote named `local`. `docker:status` prints the URL, the version and the login of the
workspace the image comes with. Then sign the CLI in, which opens your browser:

```bash
./node_modules/.bin/twenty remote:add --as local
./node_modules/.bin/twenty remote:use <the remote you usually use>
```

`remote:add` makes the remote it adds the default: `remote:use` puts yours back.

In that workspace, under **Settings → Data model**, create a custom object labelled
"Invoice" first: the app must install beside it, and both objects must show. Then:

```bash
./node_modules/.bin/twenty app:publish --private --remote local
./node_modules/.bin/twenty app:install --remote local
```

`app:publish --private` builds the app and uploads it to that server only; `app:install`
installs it, and the install runs the post-install function, which seeds the presets in the
background. Then, in the workspace:

1. **Billing → Profiles** lists the presets. No tool had to be run.
2. Follow the README's *Your first invoice*: it ends with a numbered PDF.
3. To rehearse an upgrade, raise `version` in `package.json` (do not commit it), publish and
   install again: no data is lost, no preset appears twice, a preset you edited is kept.
   The server refuses a version that is not higher than the one installed.

`docker:stop` stops the server and keeps its data; `docker:reset` wipes it.
