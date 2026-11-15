// A plugin runs without the app: no file of a folder under plugins/ names the app or imports from outside that folder.
// Usage: node .github/scripts/plugin-boundary.mjs   (exit 1 on a reference that is not in plugin-boundary-allow.json, or an allow entry that no longer matches)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Rule name to the text it forbids. `app/dependabot` is GitHub's bot account, not a path.
export const REFERENCES = {
  'app-path': /(?<![\w./-])app\/(?!dependabot|renovate)[\w.*{-]|(?:--prefix|\bcd)\s+app\b/,
  'app-package': /\bbenchkeeper\b|@cedarloom\/app\b/i,
  'app-state': /cedarloom-app|CEDARLOOM_APP/i,
};

const CODE = /\.(?:[cm]?js|[cm]?ts|tsx)$/;
// Specifiers of import and export statements, dynamic import, require, and `new URL('<path>', import.meta.url)`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\(\s*)(['"])([^'"\n]+)\1|new URL\(\s*(['"])([^'"\n]+)\3\s*,\s*import\.meta\.url/g;
// What Claude Code supplies to a plugin's mods besides Node's built-ins.
const PROVIDED = /^(?:node:|claude-code(?:\/|$))/;

const GENERATED = /(?:^|\/)CHANGELOG\.md$/;

// Rule names that match in `text` of the file `path` (relative to the repository root), `plugin` being the plugin's folder.
export function offences(path, text, plugin) {
  const found = new Set(Object.keys(REFERENCES).filter((name) => REFERENCES[name].test(text)));
  if (CODE.test(path)) {
    for (const match of text.matchAll(SPECIFIER)) {
      const spec = match[2] ?? match[4];
      if (spec.startsWith('.')) {
        const target = posix.join(posix.dirname(path), spec);
        if (target !== plugin && !target.startsWith(`${plugin}/`)) found.add('import-outside');
      } else if (match[2] !== undefined && !PROVIDED.test(spec)) found.add('import-outside');
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

// Offending file to its rule names, over every tracked file of every folder under plugins/.
export function scan(cwd = root) {
  const files = execFileSync('/usr/bin/git', ['ls-files', '-z', '--', 'plugins'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  const result = {};
  for (const path of files) {
    if (GENERATED.test(path)) continue;
    const buffer = readFileSync(resolve(cwd, path));
    if (buffer.includes(0)) continue;
    const plugin = path.split('/').slice(0, 2).join('/');
    const names = offences(path, buffer.toString('utf8'), plugin);
    if (names.length) result[path] = names;
  }
  return result;
}

// Lines that tell what to add to or take from the allow list.
export function differences(found, allowed) {
  const lines = [];
  for (const path of Object.keys({ ...found, ...allowed }).sort((a, b) => a.localeCompare(b))) {
    const now = found[path] ?? [];
    const listed = allowed[path] ?? [];
    for (const name of now) if (!listed.includes(name)) lines.push(`${path}: ${name} is a new reference to the app or a path outside the plugin`);
    for (const name of listed) if (!now.includes(name)) lines.push(`${path}: ${name} no longer matches: remove it from plugin-boundary-allow.json`);
  }
  return lines;
}

if (isMain(import.meta.url)) {
  const allowed = JSON.parse(readFileSync(new URL('./plugin-boundary-allow.json', import.meta.url), 'utf8'));
  const lines = differences(scan(), allowed);
  for (const line of lines) console.error(line);
  process.exit(lines.length ? 1 : 0);
}
