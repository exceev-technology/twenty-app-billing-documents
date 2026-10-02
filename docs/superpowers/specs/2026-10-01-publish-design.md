# Sub-project 5: Publish, design

Status: built 2026-10-02 (proposed 2026-10-01). Read [the product overview](2026-09-21-product-overview.md)
first. What differs from the text below is in *As built*.

Publish makes the app installable by anyone running Twenty: an npm package
with provenance, listed in Twenty's marketplace, with a README that serves as
both the listing and the guide. It also closes the product's success test the
way a stranger meets it: installed from the package, on a workspace that never
had it, with the presets seeded by the install itself.

## As built

Where the build differs from what follows, the build is right:

- **The CLI** is `./node_modules/.bin/twenty`, never `npx twenty`: npm has an unrelated
  package of that name. §7's `npx twenty app:publish` and §8's `twenty dev:catalog-sync` are
  run that way, and the workflow does the same.
- **npm credentials.** npm has no classic automation token any more. The first release signs
  in with a granular access token (Read and write on All Packages, Bypass two-factor
  authentication ticked, valid 90 days at most), set as the `NPM_TOKEN` secret that §8 calls
  an automation token. Trusted publishing replaces it afterwards, with `npm publish` among
  the trusted publisher's *Allowed actions*, since the workflow publishes directly.
- **`npm run release:check` has modes** (§3). Run alone, it runs the tests, the typecheck, the
  identifier lock, the build and the package check, and ends by naming what it did not check.
  `--package-only` (CI, which has run the tests) builds and checks the package and says only
  that. `--tag vX.Y.Z` adds that the tag matches `package.json`, that `CHANGELOG.md` has the
  version under a heading with an ISO date, that the gallery holds four images, and that every
  identifier is in the lock; only the full run with a tag says "Ready to release". It refuses
  an unknown argument, and a `--tag` that npm took for itself (`npm run release:check --tag …`
  without the `--`).
- **Guards beyond §3 and §7.** The workflow refuses a tag whose commit is not on `main`,
  needs npm 11.5.1 or later, restores no cache and keeps no checkout token (it holds
  `id-token: write`), and times out after 30 minutes. The package check refuses files that must
  not ship (state, tests, archives, keys), a package without `LICENSE` or the notices, a source
  map or bundle that names the builder's folder (but not another tool's URL, such as
  pdfmake's own `webpack://` sources), and an unlocked identifier. `prepack` refuses to run
  outside `.twenty/output`.
- **The gallery is gated by the maintainer's screenshots.** `npm run listing:images` draws the
  logo and the layouts picture (1600 × 1000 on the canvas, written at twice that size, to
  fit the marketplace's 8:5 frame); the other three images are screenshots of Twenty that
  only the maintainer can take, and `release:check --tag` refuses a release with fewer than
  four.
- **Third-party notices.** `THIRD_PARTY_NOTICES.md` carries, besides the pdfcn notice (§6),
  the licences of the npm packages and the fonts the published bundles hold. `npm run
  notices` writes that part from the build's source maps (`npm run build` first), and
  `release:check` refuses a package the file does not name.

## 1. Decisions

| Topic | Decision |
|---|---|
| Package | `twenty-app-billing-documents` on npm, unscoped and public: the name `package.json` already carries. |
| Version | The first release is `0.1.0` (Foundation §2), tagged `v0.1.0`. Then semver: a new field or button is a minor version, a fix a patch. |
| Publishing | `twenty app:publish`, run by a GitHub Actions workflow on a version tag, so npm records the build's provenance. |
| Listing | Twenty's marketplace lists the package on its own: it reads the manifest the build puts in it. The listing's logo, gallery and links come from `defineApplication`; its text is the README. |
| Who publishes | The maintainer. The npm account and its token or trusted publisher are theirs; the repository ships the workflow and a runbook. |
| Required server | The lowest Twenty version the app is verified on, written in `engines.twenty`, which the build turns into the manifest's required range. |

## 2. What the platform does

Read in the SDK 2.43.0 and the server source at tag `twenty/v2.43.0`:

- `twenty app:publish` builds the app into its own output folder (the
  manifest, the bundled functions and components, the public assets, the
  `package.json` and the README) and runs `npm publish --access public` there.
  Inside GitHub Actions, with an OIDC token available, it adds
  `--provenance`.
- npm refuses a package marked `"private": true`.
- The marketplace searches the npm registry for the keyword `twenty-app` and
  reads each package's `manifest.json` from the registry's CDN. It keeps the
  application's `universalIdentifier`, name, logo and gallery images, and
  copies the images to its own storage.
- The build reads the logo and gallery images from the app's `public/` folder;
  an external image URL is ignored. Without gallery images it makes a cover from
  the logo.
- The build sets the listing's about text from `README.md`, and the required
  server range from `engines.twenty`.
- On install, Twenty runs the app's post-install function, which seeds the
  presets. `twenty apply` never did, which is why acceptance so far used the
  `create-missing-presets` tool.

## 3. The package

- `package.json`: `"private": true` removed; `version` `0.1.0`; `engines.twenty`
  set to the verified version (§1); `keywords` keep `twenty-app`; `files` is
  left to the build, which publishes its own folder.
- The published folder is checked before the first publish with
  `npm pack --dry-run` in it: it holds the manifest, the bundles, `public/`,
  `README.md`, `LICENSE` and `THIRD_PARTY_NOTICES.md`, and no source map with a
  local path, no `.twenty/` state, no test.
- `npm run release:check` (new) runs the tests, the typecheck, the identifier
  lock and that dry run, and compares the version with the tag being released.

## 4. The listing

`defineApplication` gains:

| Field | Value |
|---|---|
| `logo` | `public/logo.png`, 512 × 512: a document glyph on the accent colour, drawn for the app. |
| `galleryImages` | Four PNGs in `public/gallery/`: an issued invoice in Twenty with its buttons; the five PDF layouts side by side; the Overdue view; the email form. |
| `websiteUrl` | The repository. |
| `issueReportUrl` | The repository's issues. |
| `aboutDescription` | Set by the build from the README. |

The gallery's screenshots are taken from the test workspace with sample data
only (made-up companies and people), and the layouts image is drawn from
`npm run render:samples`. No image shows a real client.

## 5. The README

The README is the marketplace listing and the user's guide at once, so it opens
with what a person deciding to install needs:

1. What the app does, in four lines, and a screenshot.
2. Install: from Twenty's marketplace (Settings → Applications), or with
   `twenty app:install` for a server that does not list it.
3. Requirements: the server version, logic functions on a self-hosted server.
4. First invoice in six steps: pick a profile, create an issuer, add its
   identifiers, a client company, a draft invoice with lines, Issue.

Then the reference sections, most of which exist: issuing, numbering, the lock,
quotes to invoices, credit notes and cancelling, payment status, the views,
sending by email (its setup), the roles to set, presets and languages,
upgrading, uninstalling, and limits. The "under construction" warning goes.

**Uninstalling** says it plainly: removing the app removes its objects and
every document in them. A business keeps its issued PDFs elsewhere before it
uninstalls.

## 6. Repository files

| File | Content |
|---|---|
| `CHANGELOG.md` | One section per version, starting with `0.1.0`: what a user can do. |
| `CONTRIBUTING.md` | Setup, tests, identifiers (`ids:sync`, never editing `src/ids.ts`), adding a language pack, adding or correcting a preset with its sources, deploying to a test workspace, the pull request rules. |
| `SECURITY.md` | Report privately through GitHub's security advisories. |
| `.github/ISSUE_TEMPLATE/` | Bug, preset correction (country, what is wrong, the official source), new language. |
| `.github/pull_request_template.md` | What changed, how it was tested, identifiers locked. |
| `.github/workflows/release.yml` | §7. |
| `docs/releasing.md` | The runbook (§8). |

## 7. The release workflow

On a pushed tag `v*`:

1. Check out, Node from `.nvmrc`, `npm ci`.
2. `npm run release:check`, which fails when the tag and `package.json`
   disagree.
3. `npx twenty app:publish`, with `id-token: write` so npm records provenance.
   It authenticates with npm's trusted publishing when the maintainer has set
   it up for this repository and workflow, otherwise with an `NPM_TOKEN`
   secret.
4. Create the GitHub release for the tag, its notes taken from the tag's
   `CHANGELOG.md` section.

Its permissions are `contents: write` (the release) and `id-token: write`
(provenance and trusted publishing), nothing else. CI's existing checks run on
the tagged commit as on any push.

## 8. The runbook

`docs/releasing.md`, for the maintainer:

1. First time only: create or sign in to the npm account, then either add
   `NPM_TOKEN` (an automation token) to the repository's secrets, or publish
   `0.1.0` by hand once and then set up trusted publishing for
   `.github/workflows/release.yml`. npm cannot attach a trusted publisher to a
   package that does not exist yet.
2. Each release: move the `CHANGELOG.md` section, bump `version`, open a pull
   request, merge it, tag the merge commit `vX.Y.Z` and push the tag.
3. Check: the package page shows the provenance badge; `npm view
   twenty-app-billing-documents` shows the version.
4. The marketplace picks the package up at its next catalog sync. A server
   administrator can run one at once with `twenty dev:catalog-sync`.

## 9. Acceptance

On a workspace that never had the app, holding only Twenty's standard objects,
on the test server, with the maintainer's help for the workspace and the
publish:

1. Before installing, create a custom object labelled "Invoice": the app still
   installs, and both objects show (Foundation §7, step 4).
2. Install from the marketplace, or from the package with `twenty app:install`.
   The fourteen objects, the views, the buttons and the presets exist: the
   post-install seeded them, without the `create-missing-presets` tool.
3. Run the product's success test: an issuer on a profile, a client company, a
   draft invoice with two lines, Issue: a numbered PDF.
4. Upgrade: publish a patch version, update the app: no data lost, no preset
   duplicated, an edited preset kept.

Steps that need the npm account or a workspace the maintainer creates are
listed as the maintainer's in the plan; the rest is done and reported.

## 10. Files

```
package.json, README.md, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md
src/application-config.ts                      listing fields
public/logo.png, public/gallery/*.png
scripts/release-check.mjs
.github/workflows/release.yml, .github/ISSUE_TEMPLATE/*, .github/pull_request_template.md
docs/releasing.md
test/application.test.ts                       listing fields and their files exist
```

## Out of scope for 5

A paid listing, a hosted demo workspace, translations of the README, and
migrating the internal Exceev app to this one (private, outside this
repository).
