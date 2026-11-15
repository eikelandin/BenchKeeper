// Writes the plugins' version (the bundle's .claude-plugin/plugin.json) into the plugin install lines of the docs that name a release tag:
// the marketplace ref `#cedarloom-v<version>` (Claude Code) or `@cedarloom-v<version>` (Codex). Other version mentions stay as written.
// Usage: node .github/scripts/version-pins.mjs [--check]   (--check: changes nothing; exit 1 when a file differs, or when
// the dev container's Playwright differs from web/)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Recorded history and benchmark arms keep the versions they name; text under plugins/ ships inside the release it would name.
export const SKIP = /^(bench\/|evaluations\/|CHANGELOG\.md|plugins\/)|package-lock\.json$/;

export function pins(text, version) {
  return text.replace(/([#@])cedarloom-v\d+\.\d+\.\d+/g, `$1cedarloom-v${version}`);
}

// As Docker reads the file: comment lines (a whole line starting with #) dropped, then continued lines joined, so an
// install command in a comment is not what the image runs and one spread over several lines is one command.
const commands = (dockerfile) => dockerfile.replace(/^[ \t]*#.*\r?\n?/gm, '').replace(/\\\r?\n/g, ' ');

// Dependabot raises @playwright/test in each package file but not the browser build the dev container installs.
export function playwrightDrift(dockerfile, packages) {
  // From the install command, not a comment; the whole token, so a prerelease such as 1.64.1-beta.0 counts as different.
  const image = commands(dockerfile).match(/\bnpm i\b[^\n#]*?\bplaywright@(\S+)/)?.[1];
  return { image, drift: Object.keys(packages).filter((f) => packages[f].devDependencies?.['@playwright/test'] !== image) };
}

if (isMain(import.meta.url)) {
  // The release tag cedarloom-v<version> is the bundle's (component cedarloom), as in release.yml.
  const { packages } = JSON.parse(readFileSync(`${root}/release-please-config.json`, 'utf8'));
  const bundle = Object.keys(packages).find((path) => packages[path].component === 'cedarloom');
  const { version } = JSON.parse(readFileSync(`${root}/${bundle}/.claude-plugin/plugin.json`, 'utf8'));
  const files = execFileSync('/usr/bin/git', ['ls-files', '*.md', '*.json', '*.tsx'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.test(f));
  const stale = [];
  for (const f of files) {
    const text = readFileSync(`${root}/${f}`, 'utf8');
    const next = pins(text, version);
    if (next === text) continue;
    stale.push(f);
    if (process.argv[2] !== '--check') writeFileSync(`${root}/${f}`, next);
  }
  if (process.argv[2] === '--check' && stale.length) {
    console.log(`::error::plugin install lines name another release than the plugins (${version}) in ${stale.join(', ')}: run node .github/scripts/version-pins.mjs`);
    process.exit(1);
  }
  if (process.argv[2] === '--check') {
    const manifests = ['web/package.json'];
    const packages = Object.fromEntries(manifests.map((f) => [f, JSON.parse(readFileSync(`${root}/${f}`, 'utf8'))]));
    const { image, drift } = playwrightDrift(readFileSync(`${root}/.devcontainer/Dockerfile`, 'utf8'), packages);
    if (!image) {
      console.log('::error::found no playwright@<version> in .devcontainer/Dockerfile');
      process.exit(1);
    }
    if (drift.length) {
      console.log(`::error::@playwright/test in ${drift.join(', ')} differs from playwright@${image} in .devcontainer/Dockerfile: set them equal`);
      process.exit(1);
    }
  }
}
