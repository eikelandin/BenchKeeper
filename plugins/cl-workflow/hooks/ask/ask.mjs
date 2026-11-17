// The question tool's switch for three hooks: UserPromptExpansion sets the window of /cl-workflow:ask and /cl-workflow:questions, PreToolUse refuses outside it, SessionStart says the mode.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { OFF, SESSION, allowed, askUntil } from './window.mjs';
import { openUntil, windowDir, windowFile } from './window-file.mjs';

const dir = windowDir();
const file = windowFile();

const line = (now) => {
  const end = openUntil(file, now);
  return end === null ? OFF : allowed(end, now);
};
const say = (event, fields) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, ...fields } }));

const input = await text(process.stdin).then(JSON.parse).catch(() => null);
const event = input?.hook_event_name;
const now = Date.now();
if (input === null || typeof input !== 'object' || Array.isArray(input)) {
  // Exit 2 refuses the question tool; onFailure "block" also refuses it when the hook cannot start.
  process.stderr.write('CedarLoom ask hook: the hook input is no JSON object.\n');
  process.exitCode = 2;
} else if (event === 'PreToolUse') {
  if (openUntil(file, now) === null) say(event, { permissionDecision: 'deny', permissionDecisionReason: OFF });
} else if (event === 'SessionStart') {
  // A new process or a resumed conversation starts with questions off; ended windows of earlier processes go too.
  // shortcut: a quit process's session window stays (a few bytes) until a process with its id starts; prune by age if they pile up.
  if (dir && (input.source === 'startup' || input.source === 'resume')) {
    rmSync(file, { force: true });
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { /* no window was ever opened */ }
    // Window files only: rmSync without recursive throws on a folder.
    for (const entry of entries) if (entry.isFile() && openUntil(join(dir, entry.name), now) === null) rmSync(join(dir, entry.name), { force: true });
  }
  say(event, { additionalContext: line(now) });
} else if (event === 'UserPromptExpansion' && ['cl-workflow:ask', 'cl-workflow:questions'].includes(input.command_name)) {
  // Only a typed command expands; a scheduled or delivered prompt with the same text does not.
  // claude -p expands one (https://code.claude.com/docs/en/headless), so role-guard.mjs refuses such a launch.
  if (!file) throw new Error(`the plugin has no data folder (CLAUDE_PLUGIN_DATA), so /${input.command_name} cannot keep its window`);
  const args = String(input.command_args ?? '');
  // Running the question queue is the user allowing terminal questions for the rest of the session.
  const end = input.command_name === 'cl-workflow:questions' ? Infinity : askUntil(args, now);
  if (end === undefined) {
    say(event, { additionalContext: `/cl-workflow:ask read no window in "${args}", so nothing changed: use it alone (30 minutes), for 30m, for 2h, until 14:30 or off. ${line(now)}` });
  } else if (end === null || end <= now) {
    rmSync(file, { force: true });
    say(event, { additionalContext: OFF });
  } else {
    mkdirSync(dir, { recursive: true });
    // The flag lets this session, and no other, write answers into the local question queue (role-guard.mjs).
    const questions = input.command_name === 'cl-workflow:questions' || undefined;
    writeFileSync(file, `${JSON.stringify({ askUntil: end === Infinity ? SESSION : new Date(end).toISOString(), questions })}\n`);
    say(event, { additionalContext: allowed(end, now) });
  }
}
