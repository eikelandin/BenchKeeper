# Changelog

## [0.1.0](https://github.com/eikelandin/BenchKeeper/compare/cedarloom-v6.27.0...cedarloom-v0.1.0) (2026-11-17)


### ⚠ BREAKING CHANGES

* the plugin cl-setup is now cl-repo, and the skills setting-up-projects, maintaining-repos, reviewing-rules and orchestrating-projects are now setup, maintain, audit (instructions) and coordinate.
* the license is ISC instead of MIT.
* **plugin:** split into the cl-workflow, cl-setup and cl-orchestration plugins and a cedarloom bundle ([#1370](https://github.com/eikelandin/BenchKeeper/issues/1370))
* **plugin:** setting-up-projects writes the rules block itself and no longer installs library packs or stack skills.
* **plugin:** sessions without CEDARLOOM_ROLE=coordinator can no longer merge, release, push tags, change repository settings, use gh auth, write git config or use git stash through the Bash tool. Start the coordinator's session with that variable.
* **plugin:** a coordinator run, handoff file or knowledge base under .cedarloom-app/ is no longer found. Move .cedarloom-app/runs to .cedarloom/runs and .cedarloom-app/knowledge to .cedarloom/knowledge, and exclude both, before updating. The old ref refs/cedarloom-app/policy is unused and can be deleted.
* **plugin:** the old /benchkeeper:* commands, benchkeeper:* skill and agent ids, the operating-benchkeeper skill and the npx benchkeeper calls in skill text are gone, with no aliases.
* **plugin:** /benchkeeper:tier is gone, and Tier: and Default tier: lines are no longer read. Name the depth in the request, a Depth: line or a Depth minimum: line instead.
* **plugin:** the board and doctor buttons are gone and statusStyle is no longer a plugin option; a value already in settings.json keeps working for the app's status line.
* **plugin:** the plugin is now cedarloom@cedarloom. Remove the benchkeeper@benchkeeper plugin and the benchkeeper marketplace, then install cedarloom@cedarloom; plugin options set under pluginConfigs."benchkeeper@benchkeeper" are not read.

### Features

* **cl-orca:** Orca runner as its own plugin ([#1404](https://github.com/eikelandin/BenchKeeper/issues/1404)) ([bb0df3d](https://github.com/eikelandin/BenchKeeper/commit/bb0df3d2c0aef1765406dcd5ee7a7b2d71f52cdf))
* **plugin:** app-free setting-up-projects and maintaining-repos ([#1356](https://github.com/eikelandin/BenchKeeper/issues/1356)) ([3785e87](https://github.com/eikelandin/BenchKeeper/commit/3785e87be10d4d97d59a53907078bcfe4e41be36))
* **plugin:** audit, improve and debloat skills ([#1355](https://github.com/eikelandin/BenchKeeper/issues/1355)) ([f479098](https://github.com/eikelandin/BenchKeeper/commit/f47909856053952babdcc8357d2db4792a2ca561))
* **plugin:** offer the default policy file, read the version from plugin.json, clear after settled tasks ([#1366](https://github.com/eikelandin/BenchKeeper/issues/1366)) ([d1f714f](https://github.com/eikelandin/BenchKeeper/commit/d1f714f8d5cde3183fef01c456185701a1e23ccb))
* **plugin:** one depth per task replaces the tiers ([#1361](https://github.com/eikelandin/BenchKeeper/issues/1361)) ([82065e3](https://github.com/eikelandin/BenchKeeper/commit/82065e343da1d980d2de0147eec14063418e817c))
* **plugin:** risk class gates start and merge ([#1367](https://github.com/eikelandin/BenchKeeper/issues/1367)) ([f84022b](https://github.com/eikelandin/BenchKeeper/commit/f84022b0bb5a783fa2912b3ad6b31d63904708ed))
* **plugin:** role guard for coordinator-only gh and git steps ([#1365](https://github.com/eikelandin/BenchKeeper/issues/1365)) ([c920a4c](https://github.com/eikelandin/BenchKeeper/commit/c920a4cddeba42ac99482b5c900c9035a04d1972))
* **plugin:** the workflow is complete without add-on skills, with a plan check and /cedarloom:plan ([#1368](https://github.com/eikelandin/BenchKeeper/issues/1368)) ([f7b025c](https://github.com/eikelandin/BenchKeeper/commit/f7b025c61093476a4ca83c20597d5b7ffa4956b4))


### Bug Fixes

* **plugin:** drop the band's board and doctor buttons and statusStyle ([#1359](https://github.com/eikelandin/BenchKeeper/issues/1359)) ([0810a73](https://github.com/eikelandin/BenchKeeper/commit/0810a73125117b7985140213dd151e21a526c0f1))
* **plugins:** low-severity hardening batch ([#1380](https://github.com/eikelandin/BenchKeeper/issues/1380)) ([3eb616a](https://github.com/eikelandin/BenchKeeper/commit/3eb616a9a27a4951a385aceb15d64cfbbe38209e))
* **plugins:** no npx of an unpublished package; digest guard denies by default ([#1378](https://github.com/eikelandin/BenchKeeper/issues/1378)) ([ac6d4c4](https://github.com/eikelandin/BenchKeeper/commit/ac6d4c4fa97d89b8c1d6e3f839d3b6669f8eaebb))
* **plugin:** trust only comment authors with write access ([#1354](https://github.com/eikelandin/BenchKeeper/issues/1354)) ([03ff708](https://github.com/eikelandin/BenchKeeper/commit/03ff708292ea29650fad375220a88b99c4466a08))
* point the marketplace source and links at the renamed account ([#1351](https://github.com/eikelandin/BenchKeeper/issues/1351)) ([c0e2cd0](https://github.com/eikelandin/BenchKeeper/commit/c0e2cd03210c96ea6785f47f862bc9ef2e56e091))


### Miscellaneous Chores

* license ISC ([#1369](https://github.com/eikelandin/BenchKeeper/issues/1369)) ([14ae279](https://github.com/eikelandin/BenchKeeper/commit/14ae279e8991d403c44059b8e728cf1f385ed95f))


### Code Refactoring

* **plugin:** rename skill ids, commands and app calls ([#1348](https://github.com/eikelandin/BenchKeeper/issues/1348)) ([d1fafa8](https://github.com/eikelandin/BenchKeeper/commit/d1fafa81e2e3bd6b70dbf698ff73ab8e040402ce))
* **plugin:** rename the plugin and marketplace to cedarloom ([#1346](https://github.com/eikelandin/BenchKeeper/issues/1346)) ([7930226](https://github.com/eikelandin/BenchKeeper/commit/79302265cf078d8c7797d44ae2a18e5a34b492b3))
* **plugin:** run folder .cedarloom and policy ref ([#1363](https://github.com/eikelandin/BenchKeeper/issues/1363)) ([4a35f4f](https://github.com/eikelandin/BenchKeeper/commit/4a35f4feac83d2faa2414b37d8285ef6f6f838c9))
* **plugin:** split into the cl-workflow, cl-setup and cl-orchestration plugins and a cedarloom bundle ([#1370](https://github.com/eikelandin/BenchKeeper/issues/1370)) ([de54c03](https://github.com/eikelandin/BenchKeeper/commit/de54c03535affa73c3530f809800fc39075801bf))
* rename cl-setup to cl-repo and use short skill names ([#1425](https://github.com/eikelandin/BenchKeeper/issues/1425)) ([5939316](https://github.com/eikelandin/BenchKeeper/commit/593931632f2c1c31c1ff088af540e37017ffcfe2))
