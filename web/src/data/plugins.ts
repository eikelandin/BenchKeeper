// What the plugins in plugins/ ship, written from their manifests, SKILL.md front matter and hooks.
export const tagline = 'Plugins for Claude Code that size each task and run its checks and reviews, set up and maintain repositories, and coordinate the issues of several projects.';

export const MARKETPLACE = 'cedarloom';
// The marketplace source the README names; SLUG stays the repository of the header link and the GitHub facts.
const MARKETPLACE_SOURCE = 'CedarLoom/cedarloom';
export const install: { command: string; text: string }[] = [
  { command: `claude plugin marketplace add ${MARKETPLACE_SOURCE}#stable`, text: 'Adds the CedarLoom marketplace at its stable branch.' },
  { command: `claude plugin install cedarloom@${MARKETPLACE}`, text: 'Installs the bundle: cl-workflow, cl-setup and cl-orchestration. Run /reload-plugins, or start a new session, and type /cl-workflow: to see the commands.' },
];
export const installOne = `claude plugin install cl-workflow@${MARKETPLACE}`;

export const requirements: [string, string][] = [
  ['Claude Code', '2.1.295 or later'],
  ['Node.js on the PATH', 'the hooks of the plugins run node'],
  ['Git and the GitHub CLI (gh)', 'for setting up repositories and for coordinating issue work'],
  ['Orca', 'optional, with its orchestration skill, for cl-orchestration only: without it, or with the runner claude-code set, workers run as background agents of the coordinator'],
];

export type Skill = { name: string; args?: string; text: string };
export type PluginInfo = { id: string; title: string; summary: string; skills: Skill[]; notes: string[] };

export const plugins: PluginInfo[] = [
  {
    id: 'cl-workflow',
    title: 'cl-workflow',
    summary: 'Picks the depth of a task and runs the checks and reviews that depth needs.',
    skills: [
      { name: 'workflow', text: 'Sorts a task into a software change, a docs pass or research, gives it a quick, standard or deep depth and runs the matching playbook. It loads on its own before the first edit.' },
      { name: 'plan', args: '<task>', text: 'Settles one task with you and writes the plan the workflow builds against: goal, scope, depth and risk, steps, an acceptance table and open questions.' },
      { name: 'ask', args: '[for 30m|until HH:MM|off]', text: 'Allows terminal questions (the question tool and plan mode) for a while.' },
      { name: 'questions', args: '[project name | deferred]', text: 'Asks you the open question issues of your hub repository in batches, records each answer on its issue and keeps deferred ones out of the queue.' },
    ],
    notes: [
      'Eight phase agents: gather, plan, implement, test, review, recheck, verify and research. The workflow starts them; you do not call them.',
      'Hooks: terminal questions stay off until you allow them, and a session without the coordinator role cannot merge or push to the default branch.',
      'An optional status band above the prompt, off until you turn on its option.',
    ],
  },
  {
    id: 'cl-setup',
    title: 'cl-setup',
    summary: 'Sets up and maintains the agent setup of a repository.',
    skills: [
      { name: 'setting-up-projects', text: 'Sets up or updates a repository for the agent: the rules block, the coordinator policy file, the dev container and where the agent runs, and the project parts of AGENTS.md.' },
      { name: 'maintaining-repos', text: 'Runs a repository-wide maintenance pass: dead code, duplicates, dependency cycles, a test audit by mutation, dependency audit, version pins, docs drift and repository hygiene.' },
      { name: 'reviewing-rules', args: '<rule file>', text: 'Reviews one rule file such as CLAUDE.md or AGENTS.md for contradictions, vague lines, lines a tool could enforce and lines that restate the code.' },
      { name: 'audit', args: '<path | instructions | docs | code>', text: 'Audits agent instructions, docs or code and reports findings with file and line evidence. Changes nothing.' },
      { name: 'improve', args: '<path | instructions | docs | code>', text: 'Turns audit findings into one diff per finding and applies the diffs you approve.' },
      { name: 'debloat', args: '<path | instructions | docs | code> [token budget]', text: 'Cuts text that carries no information from agent instructions and docs, measuring tokens before and after.' },
    ],
    notes: ['Each skill starts only when you call it.'],
  },
  {
    id: 'cl-orchestration',
    title: 'cl-orchestration',
    summary: 'Coordinates the issues of several projects from one session.',
    skills: [
      { name: 'orchestrating-projects', args: '[--runner <name>] <project paths>', text: 'Starts workers on labeled issues across the projects, has a fresh reviewer check each pull request and merges only where the repository\'s written policy allows.' },
    ],
    notes: [
      'Needs cl-workflow, which installing it brings along.',
      'A handoff file lets a coordinator that was cleared or compacted resume its run.',
    ],
  },
  {
    id: 'cedarloom',
    title: 'cedarloom',
    summary: 'The bundle: installs cl-workflow, cl-setup and cl-orchestration together.',
    skills: [],
    notes: ['A single plugin installs on its own as well.'],
  },
];

export const commands = plugins.flatMap((p) => p.skills.map((s) => ({ plugin: p.id, command: `/${p.id}:${s.name}`, args: s.args, text: s.text })));

export const defaults: { title: string; text: string }[] = [
  { title: 'Terminal questions are off', text: 'The question tool and plan mode are refused until you run /cl-workflow:ask. Until then the agent writes its open questions, each with a recommendation, into one issue per task, takes the safe and reversible ones and goes on.' },
  { title: 'Skills that change things wait for you', text: 'Every skill except workflow starts only when you call it.' },
  { title: 'No merges from a worker', text: 'A session that does not run as the coordinator, and every subagent, cannot merge, release, push tags or push to the default branch. The guard stops a session that forgets its role; the hard boundary is a gh token without those rights.' },
  { title: 'The status band is off', text: 'The band above the prompt appears only after you turn on its plugin option. It reads your working folder and git, and stores and sends nothing.' },
  { title: 'Coordinator rotation needs a handoff file', text: 'An idle coordinator is cleared and resumed only in the session whose id the handoff file of orchestrating-projects names.' },
];

export const hooks: { plugin: string; name: string; when: string; does: string }[] = [
  { plugin: 'cl-workflow', name: 'Terminal questions', when: 'Session start, /cl-workflow:ask and /cl-workflow:questions, and before the question tool or plan mode', does: 'Refuses the question tool and plan mode outside the window you opened. Keeps the window in one small file per Claude Code process in the plugin data folder, and removes ended windows at startup and resume.' },
  { plugin: 'cl-workflow', name: 'Role guard', when: 'Before Bash, Monitor and PowerShell commands', does: 'In a session that does not run as the coordinator (CEDARLOOM_ROLE=coordinator) and in every subagent, refuses merges, releases, tag pushes, pushes to the default branch, repository settings and security changes, gh auth, git config writes, git stash and sessions in bare mode. Writes nothing.' },
  { plugin: 'cl-workflow', name: 'Status band', when: 'Only with the tierBand option on', does: 'Shows project, branch, the last test run and lint or type check above the prompt. Reads your working folder, git, one Ponytail flag file and the commands and edits of the main loop; stores and sends nothing.' },
  { plugin: 'cl-orchestration', name: 'Coordinator rotation', when: 'When an idle coordinator ends a turn, and after /clear and compaction', does: 'With the handoff file .cedarloom/runs/handoff.md present, clears a coordinator whose context passed the configured size with /clear and resumes it from the file; at most once every 10 minutes. After a clear or compaction it hands the file back. Without the file nothing happens.' },
];

export const planned = {
  summary: 'A command line and a local browser app for setup are planned for 0.2. The plugins do not depend on them.',
  items: [
    'A command line that sets up a machine and its repositories.',
    'A local browser app that shows each change before it applies and can undo a run.',
    'Skill packs: the library of domain skills, installed through the command line.',
    'Scheduled automations such as issue triage and CI health checks.',
  ],
};
