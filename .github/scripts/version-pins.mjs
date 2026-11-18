// Writes the plugins' version (the bundle's .claude-plugin/plugin.json) into the plugin install lines of the docs that name a release tag:
// the marketplace ref `#cedarloom-v<version>` (Claude Code) or `@cedarloom-v<version>` (Codex). Other version mentions stay as written.
// Usage: node .github/scripts/version-pins.mjs [--check]   (--check: changes nothing; exit 1 when a file differs)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Text under plugins/ ships inside the release it would name.
export const SKIP = /^plugins\/|package-lock\.json$/;

export function pins(text, version) {
  return text.replace(/([#@])cedarloom-v\d+\.\d+\.\d+/g, `$1cedarloom-v${version}`);
}

if (isMain(import.meta.url)) {
  // The release tag cedarloom-v<version> is the bundle's (component cedarloom), as in release.yml.
  const { packages } = JSON.parse(readFileSync(`${root}/release-please-config.json`, 'utf8'));
  const bundle = Object.keys(packages).find((path) => packages[path].component === 'cedarloom');
  const { version } = JSON.parse(readFileSync(`${root}/${bundle}/.claude-plugin/plugin.json`, 'utf8'));
  const files = execFileSync('/usr/bin/git', ['ls-files', '*.md', '*.json'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.test(f));
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
}
