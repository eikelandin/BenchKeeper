// The window file of this Claude Code process, read alike by the plugin's hooks ask.mjs and role-guard.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SESSION } from './window.mjs';

// One file per Claude Code process (CLAUDE_PID, which it sets for hook commands): /clear and compaction keep the window.
export const windowDir = () => (process.env.CLAUDE_PLUGIN_DATA ? join(process.env.CLAUDE_PLUGIN_DATA, 'ask') : null);
export const windowFile = () => { const dir = windowDir(); return dir && join(dir, `${process.env.CLAUDE_PID ?? process.ppid}.json`); };

// A window file's end while it is open (Infinity for the session), else null; with questions, only a window /cl-workflow:questions opened.
export function openUntil(path, now, questions = false) {
  try {
    const window = JSON.parse(readFileSync(path, 'utf8'));
    const end = window.askUntil === SESSION ? Infinity : Date.parse(window.askUntil);
    return end > now && (!questions || window.questions === true) ? end : null;
  } catch {
    return null;
  }
}
