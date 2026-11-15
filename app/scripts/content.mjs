// prepack: copies the rules, own skills, library catalog and eval sets of every plugin folder into content/, so the npm
// package plans and applies them offline. --clean (postpack) removes the copy, so a clone reads the repository again.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../content/', import.meta.url));
const plugins = fileURLToPath(new URL('../../plugins/', import.meta.url));
export const PARTS = ['rules', 'skills', 'library', 'evals', 'automations', 'content.json'];

rmSync(out, { recursive: true, force: true });
if (!process.argv.includes('--clean')) {
  for (const plugin of readdirSync(plugins)) for (const p of PARTS) if (existsSync(join(plugins, plugin, p))) cpSync(join(plugins, plugin, p), join(out, p), { recursive: true, errorOnExist: true, force: false });
}
