# Changelog

## [0.1.0](https://github.com/eikelandin/BenchKeeper/compare/cedarloom-orchestration-v6.27.0...cedarloom-orchestration-v0.1.0) (2026-11-17)


### ⚠ BREAKING CHANGES

* the plugin cl-setup is now cl-repo, and the skills setting-up-projects, maintaining-repos, reviewing-rules and orchestrating-projects are now setup, maintain, audit (instructions) and coordinate.
* drop the hub tracker option and use the cedarloom label set ([#1422](https://github.com/eikelandin/BenchKeeper/issues/1422))
* **cl-orchestration:** start workers only through Orca 1.4.259 or later ([#1416](https://github.com/eikelandin/BenchKeeper/issues/1416))
* **cl-orchestration:** the rotateAfterTasks option of cl-orchestration is removed, and the handoff file names its coordinator with a Session: line in place of Terminal:. A handoff file that holds only a Terminal: line gets no restore or rotation until its header holds Session: <id>.
* the license is ISC instead of MIT.
* **plugin:** split into the cl-workflow, cl-setup and cl-orchestration plugins and a cedarloom bundle ([#1370](https://github.com/eikelandin/BenchKeeper/issues/1370))

### Features

* **cl-orca:** Orca runner as its own plugin ([#1404](https://github.com/eikelandin/BenchKeeper/issues/1404)) ([bb0df3d](https://github.com/eikelandin/BenchKeeper/commit/bb0df3d2c0aef1765406dcd5ee7a7b2d71f52cdf))
* **cl-orchestration:** act on Orca stop escalations and reopen supervised workers by send ([#1427](https://github.com/eikelandin/BenchKeeper/issues/1427)) ([f01ad2e](https://github.com/eikelandin/BenchKeeper/commit/f01ad2e7403673eca27429826b2f3a0b1ba6bd73))
* **cl-orchestration:** issue tracker per project, repo or hub ([#1391](https://github.com/eikelandin/BenchKeeper/issues/1391)) ([0b15d2e](https://github.com/eikelandin/BenchKeeper/commit/0b15d2ebb4d13ddca4f125a1ca8c7992ba36aa04))
* **cl-orchestration:** Orca task per item and owner gates ([#1426](https://github.com/eikelandin/BenchKeeper/issues/1426)) ([21039fb](https://github.com/eikelandin/BenchKeeper/commit/21039fb7bd4a4e0d1aa91e70c4ef6403a85b47a3))
* **cl-orchestration:** owner-only decisions block only their item ([#1405](https://github.com/eikelandin/BenchKeeper/issues/1405)) ([cbb2b82](https://github.com/eikelandin/BenchKeeper/commit/cbb2b82239e3f8c06a55d4a2ac843f5d636f18e2))
* **cl-orchestration:** runner interface and the built-in claude-code runner ([#1401](https://github.com/eikelandin/BenchKeeper/issues/1401)) ([1821532](https://github.com/eikelandin/BenchKeeper/commit/18215324af2a0af69321f6c3e5ba3604b327f308))
* **cl-orchestration:** start workers only through Orca 1.4.259 or later ([#1416](https://github.com/eikelandin/BenchKeeper/issues/1416)) ([fe8f9ba](https://github.com/eikelandin/BenchKeeper/commit/fe8f9baf59f0655884c1762a8a39425ade3a2a25))
* **cl-orchestration:** supervised and automatic modes ([#1403](https://github.com/eikelandin/BenchKeeper/issues/1403)) ([eb6b1a6](https://github.com/eikelandin/BenchKeeper/commit/eb6b1a6d16f5a3058623f6fa535e4152668fdd56))
* **cl-workflow:** hub repository as a plugin option ([#1385](https://github.com/eikelandin/BenchKeeper/issues/1385)) ([5559ef2](https://github.com/eikelandin/BenchKeeper/commit/5559ef24566d459890f09ef69b211f6c376c1e93))
* **cl-workflow:** local question queue when no hub is set ([#1388](https://github.com/eikelandin/BenchKeeper/issues/1388)) ([63135f9](https://github.com/eikelandin/BenchKeeper/commit/63135f9158521e1da45b0bae5399d758279c3620))
* drop the hub tracker option and use the cedarloom label set ([#1422](https://github.com/eikelandin/BenchKeeper/issues/1422)) ([faa9c98](https://github.com/eikelandin/BenchKeeper/commit/faa9c98455bb9868ddd28b285236b551c347174d))
* question layout with context and source lines, first lines for worker status comments ([#1424](https://github.com/eikelandin/BenchKeeper/issues/1424)) ([42f84d1](https://github.com/eikelandin/BenchKeeper/commit/42f84d10be54c2542d318e632caa3b5740e8b96e))


### Bug Fixes

* **cl-orchestration:** automatic workers report as their final answer ([#1419](https://github.com/eikelandin/BenchKeeper/issues/1419)) ([215e38b](https://github.com/eikelandin/BenchKeeper/commit/215e38b121f43cf3967b0dbbcbebfe8f9e248bf0))
* **cl-orchestration:** deny rules for supervised workers instead of ask ([#1411](https://github.com/eikelandin/BenchKeeper/issues/1411)) ([8213642](https://github.com/eikelandin/BenchKeeper/commit/8213642683be852c8f32b8e8cb9802f38e17142c))
* **cl-orchestration:** move answered questions out of the question labels on every path ([#1412](https://github.com/eikelandin/BenchKeeper/issues/1412)) ([c093339](https://github.com/eikelandin/BenchKeeper/commit/c09333919de91e8e480ce92a9be80842cffd0c18))
* **cl-orchestration:** owner-only paths cover agent and container files ([#1377](https://github.com/eikelandin/BenchKeeper/issues/1377)) ([cd781dc](https://github.com/eikelandin/BenchKeeper/commit/cd781dcf847d0a499ac6d3f4470e160deda07287))
* **cl-orchestration:** pass workers and reviewers only trusted issue and review thread text ([#1390](https://github.com/eikelandin/BenchKeeper/issues/1390)) ([a7fe748](https://github.com/eikelandin/BenchKeeper/commit/a7fe748d93571b77cac25bee53df1e21748292be))
* **cl-orchestration:** rotation follows the session, not an Orca terminal ([#1402](https://github.com/eikelandin/BenchKeeper/issues/1402)) ([dcf017c](https://github.com/eikelandin/BenchKeeper/commit/dcf017c58007e992c7737b61dc1989af8b34c827))
* **plugins:** low-severity hardening batch ([#1380](https://github.com/eikelandin/BenchKeeper/issues/1380)) ([3eb616a](https://github.com/eikelandin/BenchKeeper/commit/3eb616a9a27a4951a385aceb15d64cfbbe38209e))


### Miscellaneous Chores

* license ISC ([#1369](https://github.com/eikelandin/BenchKeeper/issues/1369)) ([14ae279](https://github.com/eikelandin/BenchKeeper/commit/14ae279e8991d403c44059b8e728cf1f385ed95f))


### Code Refactoring

* **plugin:** split into the cl-workflow, cl-setup and cl-orchestration plugins and a cedarloom bundle ([#1370](https://github.com/eikelandin/BenchKeeper/issues/1370)) ([de54c03](https://github.com/eikelandin/BenchKeeper/commit/de54c03535affa73c3530f809800fc39075801bf))
* rename cl-setup to cl-repo and use short skill names ([#1425](https://github.com/eikelandin/BenchKeeper/issues/1425)) ([5939316](https://github.com/eikelandin/BenchKeeper/commit/593931632f2c1c31c1ff088af540e37017ffcfe2))
