# Releasing

BenchKeeper releases only when the owner merges the release pull request or starts a release workflow by hand. No workflow merges that pull request or enables auto-merge on it.

A release ships the plugins only, and no release publishes to npm.

## Components

| Component | Files | Version | Tag | Changelog |
| --- | --- | --- | --- | --- |
| Plugins | `plugins/<name>/`: the bundle `cedarloom` and the plugins `cl-workflow`, `cl-setup`, `cl-orchestration` and `cl-orca` | one version for all five (`linked-versions`), in each plugin's `.claude-plugin/plugin.json` and, where a plugin ships for Codex, its `.codex-plugin/plugin.json`. Below 1.0 (`bump-minor-pre-major`) `feat` and breaking changes raise the minor version, `fix` and `perf` the patch | `cedarloom-v<x.y.z>` for the bundle and the Release, `cedarloom-<name>-v<x.y.z>` for each plugin | `plugins/<name>/CHANGELOG.md`; the Release holds the sections of all five |

The first release is 0.1.0, set with `release-as` on each plugin in `release-please-config.json`. Remove those five lines after that release: while they stay, every release pull request proposes 0.1.0 again.

`CHANGELOG.md` at the repository root (up to 6.25) and the tags `setup-v*` and `app-v*` (up to 6.27) belong to the legacy app.

## Steps

1. Pull requests target `main`, squash-merged; the title is a Conventional Commit and becomes the changelog line (`.github/workflows/pr-title.yml`). `docs`, `refactor`, `test`, `chore` and `ci` release nothing.
2. On every push to `main`, release-please (`.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json`) keeps one release pull request open with the new versions and changelogs, titled `chore(main): release cedarloom` (the title of a pull request that groups components carries no version; its body lists each component with its version). The same workflow sets the plugin install lines in the docs that name a release tag (`#cedarloom-v<x.y.z>`, `@cedarloom-v<x.y.z>`) to the new version on that branch (`.github/scripts/version-pins.mjs`).
3. The owner merges the release pull request.
4. The job `release` of the Release workflow, on that merge:
   1. tags each plugin at the version of its `.claude-plugin/plugin.json` and creates the Release `cedarloom-v<x.y.z>`;
   2. moves the branch `stable` (the ref users add the marketplace at) to the commit of that tag;
   3. starts `.github/workflows/pages.yml`;
   4. labels the release pull request `autorelease: tagged`, so release-please opens the next one;
   5. starts the Release workflow once more, so release-please sees the new label even when a push during the release ran it before the label changed.

A failed step moves nothing after it. Rerun the job after the fix: each step skips what an earlier run did. Until then release-please opens no new release pull request.

Pushes to `main` right after the merge do not stop the release. The job `release` has a concurrency group per commit, so a later push never cancels the run of the release merge; its own run of the job finds no release pull request and does nothing. Only the job `release-please` shares one group: a pending one that a newer push replaces is dropped, and the newer one updates the release pull request. A release-please job that runs while the job `release` is still running finds the pending pull request and does nothing; step 5 runs it again afterwards.

## Site

`.github/workflows/pages.yml` builds one Pages artifact on pushes to `main`, on `release: published` and by hand:

- `/BenchKeeper/`: the newest Release `cedarloom-v<x.y.z>`, built from its tag. Without one the root redirects to `/next/`.
- `/BenchKeeper/next/`: `main` (`SITE_EDITION=next`).

Both editions share one origin, so `next` stores its color scheme under its own key (`web/src/lib/edition.ts`).

## Owner settings

- A release GitHub App (variable `RELEASE_APP_CLIENT_ID`, secret `RELEASE_APP_PRIVATE_KEY`) or a token, so checks run on the release pull request. Without it the owner approves its runs.
- The `github-pages` environment allows `main` and the release tags `cedarloom-v*`.
- The ruleset keeps the required check names and lets the owner merge the release pull request.
