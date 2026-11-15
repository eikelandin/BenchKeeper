// BenchKeeper's rules, skills and library: packed into content/ for npm, read from the repository's plugin folders in a clone.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packed = fileURLToPath(new URL('../content/', import.meta.url));
const plugins = fileURLToPath(new URL('../../plugins/', import.meta.url));
const isPacked = existsSync(packed);
// The folders a part of the content lies in: content/<part> when packed, <plugin>/<part> of each plugin that has it in a clone.
const parts = (part) => (isPacked ? [join(packed, part)] : readdirSync(plugins).map((p) => join(plugins, p, part))).filter((d) => existsSync(d));
// The rules, eval sets, automations and content.json lie in the bundle plugin's folder in a clone.
export const contentDir = isPacked ? packed : join(plugins, 'cedarloom/');
// Own skill name to its folder, in the byte order readdir gives one folder.
export const ownSkills = () => new Map(parts('skills').flatMap((d) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => [e.name, join(d, e.name)])).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
export const libraryDir = parts('library')[0] ?? join(contentDir, 'library');
export const appVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const library = () => JSON.parse(readFileSync(join(libraryDir, 'library.json'), 'utf8'));

// content.json: { schemaVersion, contentVersion, minApp }. Content without the file (an older plugin) has no requirement.
const content = () => { try { return JSON.parse(readFileSync(`${contentDir}content.json`, 'utf8')); } catch { return {}; } };
export const contentVersion = content().contentVersion ?? appVersion;
// The content version of the content in dir, null when it has none in x.y.z form.
export function contentVersionOf(dir) {
  try { const v = JSON.parse(readFileSync(`${dir}/content.json`, 'utf8')).contentVersion; return /^\d+\.\d+\.\d+$/.test(v) ? v : null; } catch { return null; }
}
const older = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
// The message when the content in dir needs a newer app than version, else null. An unreadable file or a version that is not x.y.z needs nothing.
export function contentRefusal(dir, version = appVersion) {
  let minApp;
  try { minApp = JSON.parse(readFileSync(`${dir}/content.json`, 'utf8')).minApp; } catch { return null; }
  if (typeof minApp !== 'string' || !/^\d+\.\d+\.\d+$/.test(minApp) || !/^\d+\.\d+\.\d+$/.test(version) || !older(version, minApp)) return null;
  return `the content in ${dir} needs benchkeeper ${minApp} or newer, this is ${version}: run npx @cedarloom/app@${minApp.split('.')[0]}`;
}
