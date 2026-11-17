# Changelog

## [0.1.0](https://github.com/eikelandin/BenchKeeper/compare/cedarloom-workflow-v6.27.0...cedarloom-workflow-v0.1.0) (2026-11-17)


### ⚠ BREAKING CHANGES

* the plugin cl-setup is now cl-repo, and the skills setting-up-projects, maintaining-repos, reviewing-rules and orchestrating-projects are now setup, maintain, audit (instructions) and coordinate.
* drop the hub tracker option and use the cedarloom label set ([#1422](https://github.com/eikelandin/BenchKeeper/issues/1422))
* the license is ISC instead of MIT.
* **plugin:** split into the cl-workflow, cl-setup and cl-orchestration plugins and a cedarloom bundle ([#1370](https://github.com/eikelandin/BenchKeeper/issues/1370))

### Features

* **cl-orchestration:** issue tracker per project, repo or hub ([#1391](https://github.com/eikelandin/BenchKeeper/issues/1391)) ([0b15d2e](https://github.com/eikelandin/BenchKeeper/commit/0b15d2ebb4d13ddca4f125a1ca8c7992ba36aa04))
* **cl-workflow:** hub repository as a plugin option ([#1385](https://github.com/eikelandin/BenchKeeper/issues/1385)) ([5559ef2](https://github.com/eikelandin/BenchKeeper/commit/5559ef24566d459890f09ef69b211f6c376c1e93))
* **cl-workflow:** local question queue when no hub is set ([#1388](https://github.com/eikelandin/BenchKeeper/issues/1388)) ([63135f9](https://github.com/eikelandin/BenchKeeper/commit/63135f9158521e1da45b0bae5399d758279c3620))
* drop the hub tracker option and use the cedarloom label set ([#1422](https://github.com/eikelandin/BenchKeeper/issues/1422)) ([faa9c98](https://github.com/eikelandin/BenchKeeper/commit/faa9c98455bb9868ddd28b285236b551c347174d))
* question layout with context and source lines, first lines for worker status comments ([#1424](https://github.com/eikelandin/BenchKeeper/issues/1424)) ([42f84d1](https://github.com/eikelandin/BenchKeeper/commit/42f84d10be54c2542d318e632caa3b5740e8b96e))


### Bug Fixes

* **cl-orchestration:** move answered questions out of the question labels on every path ([#1412](https://github.com/eikelandin/BenchKeeper/issues/1412)) ([c093339](https://github.com/eikelandin/BenchKeeper/commit/c09333919de91e8e480ce92a9be80842cffd0c18))
* **cl-orchestration:** pass workers and reviewers only trusted issue and review thread text ([#1390](https://github.com/eikelandin/BenchKeeper/issues/1390)) ([a7fe748](https://github.com/eikelandin/BenchKeeper/commit/a7fe748d93571b77cac25bee53df1e21748292be))
* **cl-workflow:** role guard denies direct commits through gh api ([#1375](https://github.com/eikelandin/BenchKeeper/issues/1375)) ([3fc8f5c](https://github.com/eikelandin/BenchKeeper/commit/3fc8f5c9c660a8756e9fb236b04a3bf0d5742a5b))
* **plugins:** low-severity hardening batch ([#1380](https://github.com/eikelandin/BenchKeeper/issues/1380)) ([3eb616a](https://github.com/eikelandin/BenchKeeper/commit/3eb616a9a27a4951a385aceb15d64cfbbe38209e))


### Miscellaneous Chores

* license ISC ([#1369](https://github.com/eikelandin/BenchKeeper/issues/1369)) ([14ae279](https://github.com/eikelandin/BenchKeeper/commit/14ae279e8991d403c44059b8e728cf1f385ed95f))


### Code Refactoring

* **plugin:** split into the cl-workflow, cl-setup and cl-orchestration plugins and a cedarloom bundle ([#1370](https://github.com/eikelandin/BenchKeeper/issues/1370)) ([de54c03](https://github.com/eikelandin/BenchKeeper/commit/de54c03535affa73c3530f809800fc39075801bf))
* rename cl-setup to cl-repo and use short skill names ([#1425](https://github.com/eikelandin/BenchKeeper/issues/1425)) ([5939316](https://github.com/eikelandin/BenchKeeper/commit/593931632f2c1c31c1ff088af540e37017ffcfe2))
