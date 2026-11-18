# Releasing

A release ships the plugins only; nothing publishes to npm. No workflow merges the release pull request or enables auto-merge on it.

## Branches and commits

- Pull requests target `main` and are squash-merged. The title is a Conventional Commit (`.github/workflows/pr-title.yml`) and becomes the changelog line.
- `docs`, `refactor`, `test`, `chore` and `ci` release nothing. Below 1.0, `feat` and breaking changes raise the minor version, `fix` and `perf` the patch. A `release-as` on a package in `release-please-config.json` sets its next version instead, and comes out after the release it names.
- The branch `stable` points at the latest release: users add the marketplace at it.

## Release flow

1. On every push to `main`, release-please (`.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json`) keeps one release pull request open, titled `chore(main): release cedarloom`, with the new versions and changelogs. The bundle `cedarloom` and the plugins `cl-workflow`, `cl-repo` and `cl-orchestration` share one version (`linked-versions`), set in each `.claude-plugin/plugin.json` and in the `.codex-plugin/plugin.json` of the three plugins (the bundle has none); each plugin's changes go to `plugins/<name>/CHANGELOG.md`. The same workflow sets the install lines in the docs that name a release tag to the new version (`.github/scripts/version-pins.mjs`).
2. A maintainer merges the release pull request once the last `Checks` run on `main` passed: the job `release` waits for no check, and while the repository is private the macOS plugin tests run only on pushes to `main`.
3. The job `release` tags each plugin with its release-please component (`cedarloom-workflow-v<x.y.z>`, `cedarloom-repo-v<x.y.z>`, `cedarloom-orchestration-v<x.y.z>`) and the bundle `cedarloom-v<x.y.z>`, creates the Release `cedarloom-v<x.y.z>` with the sections of all four changelogs, and moves `stable` to the tagged commit.
4. A failed step moves nothing after it, and a rerun of the job skips the steps an earlier run did. When only the last step, `Run release-please again`, failed, the rerun finds no release pull request: start the Release workflow by hand (`gh workflow run release.yml --ref main`).
