# Releasing

For the maintainer. A release is a pushed tag `vX.Y.Z`: the workflow in
`.github/workflows/release.yml` checks it, publishes the package to npm with provenance,
and creates the GitHub release. Twenty's marketplace lists the package on its own once it
is on npm.

## One-time setup

### npm

What this section says about npm's screens and limits is as npm's documentation says
(October 2026), except the 90 days a write token lives, which GitHub's changelog announced
in 2025. npm changes these, so read the current pages before you set anything up:
[Creating and viewing access tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens)
and [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers).

1. Create or sign in to the npm account that will own `twenty-app-billing-documents`, with
   two-factor authentication on.
2. Choose how the workflow signs in to npm:
   - **A token, for the first release (recommended).** Classic tokens, the automation kind
     included, no longer exist: npm supports granular access tokens only. On npmjs.com, click
     your profile picture → **Access Tokens → Generate New Token**, and set:
     - **Packages and scopes**: permission **Read and write (publish and stage)**, on **All
       Packages**. `0.1.0` does not exist yet, so the package cannot be picked by name. Not
       *stage only*: the workflow publishes directly, which npm refuses from a stage-only
       token (`E_STAGE_REQUIRED`).
     - **Bypass two-factor authentication**, ticked. Without it, a publish that nobody
       is there to type a one-time code for fails with E403.
     - **Expiration**: a token with write access expires after at most 90 days.

     Add it to the repository: **Settings → Secrets and variables → Actions → New repository
     secret**, named `NPM_TOKEN`. The provenance badge needs no more than this: the workflow
     already has `id-token: write`, and the repository must be public (see *GitHub*). npm
     plans to stop direct publishing with a granular token in January 2027, so the token is
     for the first release, not for good.
   - **Trusted publishing, afterwards.** npm cannot attach a trusted publisher to a package
     that does not exist yet, so `0.1.0` goes out with the token first. Then, on npmjs.com,
     open the package → **Settings → Trusted Publisher → GitHub Actions** and enter the
     owner `exceev-technology`, the repository `twenty-app-billing-documents` and the
     workflow `release.yml` (the file name only). Leave **Environment name** blank, unless
     you use `environment: release` (see *GitHub*): then enter exactly `release`. Under
     **Allowed actions**, allow `npm publish`. `npm stage publish` is always allowed, and a
     trusted publisher created after 3 September 2026 allows nothing more by default, but the
     workflow's `app:publish` runs a direct `npm publish --access public`, which npm would
     refuse. npm does not check the form when you save it, and a connection cannot be edited:
     a mistake shows at the next publish, and you delete the connection and add it again.
     Once a release has gone out that way, delete the `NPM_TOKEN` secret, revoke the token
     on npmjs.com, and delete the `env:` lines of the workflow's *Publish to npm* step.
   - **Publishing `0.1.0` by hand is a last resort**: that version gets no provenance badge.
     Once `0.1.0` is on npm, the workflow of a pushed `v0.1.0` tag fails at *Publish to npm*
     (npm refuses a version twice) and never reaches its release step. So, in this order:
     1. Do everything the release needs first: the screenshots, the changelog section dated,
        `version`, all merged to `main`. On `main`, run
        `npm run release:check -- --tag v0.1.0`, with npm's `ignore-scripts` unset (see
        *When something fails*).
     2. `npm login` (npm asks for a one-time code), then
        `./node_modules/.bin/twenty app:publish` in the same checkout.
     3. Push the tag `v0.1.0`. Expect one red run, at *Publish to npm*.
     4. Create the release by hand:
        `gh release create v0.1.0 --verify-tag --notes-file <(node scripts/release-notes.mjs v0.1.0)`.

   Never run `npm publish` in the repository root: Twenty publishes the build's own folder,
   `.twenty/output`, not the root. The root's `prepack` hook refuses to run outside that
   folder, on purpose (`prepack: not a Twenty build output …`), so a slip publishes nothing,
   and `npm pack` there fails the same way.

### GitHub

- Make the repository public before the first release: as npm's documentation says
  (October 2026), npm gives a package provenance only when it is published from a public
  repository.
- **Settings → Code security → Private vulnerability reporting**: turn it on. `SECURITY.md`
  and the issue chooser send people there.
- Keep `main` protected as for any change. The workflow refuses a tag whose commit is not
  on `main`, but that check lives in the tagged commit's own workflow file: someone with
  push access could tag a branch whose workflow lacks it. What really stops an unreviewed
  publish is a tag protection ruleset: **Settings → Rules → Rulesets → New ruleset → New
  tag ruleset**, target `v*`, restrict creations, and let only the maintainers bypass it.
- Optionally, add an environment named `release` (**Settings → Environments**) with a
  required reviewer, put `environment: release` under the job in
  `.github/workflows/release.yml`, and keep `NPM_TOKEN` as that environment's secret
  instead of a repository secret. A release then waits for the reviewer's approval, and a
  workflow file that does not name the environment gets no token.
- Create the labels `preset` and `language` (`bug` exists already): the issue forms apply them,
  and GitHub skips a label that does not exist.

## Before the first release: the Twenty screenshots

The listing's gallery holds four images (`galleryImages` in `src/application-config.ts`).
`npm run listing:images` draws one, the five PDF layouts. The other three are screenshots of
Twenty, which only a signed-in person can take. The [rehearsal on a local Twenty
server](#rehearsal-on-a-local-twenty-server), further down, is a good moment to take them:
that workspace holds none of your clients. Make up the companies, people and amounts in the
pictures, and leave out any record the image came with.

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

1. Make sure the identifiers are locked: run `npm run deploy -- --remote <name>` against
   the test workspace, which ends with `npm run ids:lock`, and commit `ids.lock.json`. A
   release makes identifiers permanent, so `release:check` refuses an unlocked one.
2. In `CHANGELOG.md`, date the version's section. For `0.1.0` the file already holds
   `## 0.1.0 - unreleased`: change that heading to `## 0.1.0 - <date>` and add no second
   one. For a later version, move what is under `## Unreleased` below a new heading
   `## X.Y.Z - <date>`. The section says what a user can do with this version, in plain
   words, and which preset corrections a user must apply by hand, since an upgrade never
   changes a preset a workspace already has. `release:check -- --tag` refuses a heading that
   still says "unreleased".
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

   Keep the `--` before `--tag`: without it npm takes `--tag` for itself (it is npm's own
   dist-tag option), and `release:check` refuses with `npm took --tag for itself`. Only this
   run ends with `Ready to release twenty-app-billing-documents@X.Y.Z as vX.Y.Z.`: a run
   without `--tag`, or with `--package-only`, ends by naming what it did not check, and is
   not a release check.

   Push the tag, as above; never create the release in GitHub's interface. Creating it there
   pushes the tag too, and the workflow's last step, which creates the release itself, then
   fails because the release already exists, after the package has gone out.

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
| npm refuses the publish (authentication) | As npm's documentation says (October 2026), check `NPM_TOKEN`: that it has not expired or been revoked, that it has **Read and write (publish and stage)** on **All Packages** (a stage-only token fails with `E_STAGE_REQUIRED`) and that **Bypass two-factor authentication** is ticked (without it: E403). Or check the trusted publisher: its owner, repository and workflow name, and that its **Allowed actions** include `npm publish` (one created after 3 September 2026 allows `npm stage publish` only, and the workflow runs `npm publish`). Re-run the failed job once it is fixed. |
| `NPM_TOKEN` has expired | A token with write access expires after at most 90 days. Create a new one as in *One-time setup* and replace the repository secret before the date npm shows for the old one, or move to trusted publishing. |
| npm published, the GitHub release failed | Do not re-run the workflow: its publish step comes first and npm refuses the same version twice. Create the release by hand: `gh release create vX.Y.Z --verify-tag --notes-file <(node scripts/release-notes.mjs vX.Y.Z)`, or write the notes to a file with `node scripts/release-notes.mjs vX.Y.Z > notes.md` and pass `--notes-file notes.md`. |
| The workflow's last step fails because the release already exists | The release was created in GitHub's interface, which pushed the tag too. The package is published. Put the changelog section (`node scripts/release-notes.mjs vX.Y.Z`) in that release's notes, and push the tag next time. |
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
