// Coordinator context rotation (orchestrating-projects): when the session's project root holds the coordinator's handoff
// file and the file names this session's Orca terminal, an idle Stop above the plugin's threshold, or after the set number
// of settled Orca tasks, clears the context with /clear and submits a resume prompt, and a clear or compaction hands the
// file back to the model, with the git drift since the coordinator wrote it. Otherwise every hook here passes. It reads
// and writes that one file, reads git and Orca's task list, and sends nothing.
import type { EngineInterface, Register, Timer } from 'claude-code'

import { FILE, RUNS, STATUS, STATUS_ARGS, TOP_ARGS, changedPaths, commitArgs, drift, editedAt, fingerprint, mine, restored, stamped, statusBlock } from './handoff.mjs'

// A second /clear while the restore hook of the first still runs cuts that hook off and loses its context.
const GAP_MS = 10 * 60 * 1000
// Longer than the gap, so a slow clear still resumes; past it, a clear that never settles no longer holds rotation off.
const WATCHDOG_MS = 15 * 60 * 1000
const resume = (why: string) => `CedarLoom cleared this coordinator's context ${why} to save tokens. Run the Resume steps of the handoff file in your context now, before anything else, then continue from its Next section.`

// Per Claude Code process: the module stays loaded across /clear.
let running = false
// Set while a Stop awaits its checks, so a second Stop meanwhile cannot schedule a second clear.
let deciding = false
let lastEnd: number | null = null
let noted = false
// Main-loop turns started in this process: a turn that starts between the decision and the clear makes it stale.
let turns = 0
type Settled = { run: string; count: number }
// The settled tasks at the last clear, or at the first read of this run in this process.
let counted: Settled | null = null

// The text with its status block holding only this line, the block appended when the text has none.
export function withStatus(text: string, line: string): string {
  const block = `${STATUS[0]}\n${line}\n${STATUS[1]}`
  const at = statusBlock(text)
  if (at === null) return `${text.trimEnd()}\n\n${block}\n`
  return text.slice(0, at[0]) + block + text.slice(at[1])
}

const handoff = async ($: EngineInterface) => `${await $.session.root()}/${FILE}`

// The handoff file's text when it is this session's, else null. A -p child of the coordinator's shell inherits its
// ORCA_TERMINAL_HANDLE but draws on no surface, so it never counts as the coordinator.
async function own($: EngineInterface) {
  if ((await $.session.surfaces()).length === 0) return null
  const text = await $.fs.read(await handoff($)).catch(() => null)
  return text !== null && mine(String(text), await $.env.get('ORCA_TERMINAL_HANDLE')) ? String(text) : null
}
const slashes = (path?: string) => path?.replaceAll('\\', '/')

// Whether the file is the coordinator's own, not one a repository commits or a link leads to: a regular file reached
// through no link, in a git work tree whose .cedarloom/runs git tracks nothing in. Any git failure refuses, so a broken
// repository or one git distrusts (another owner) never counts as untracked.
async function safe($: EngineInterface) {
  try {
    const root = await $.session.root()
    const [folder, file] = await Promise.all([$.fs.stat(root, { resolve: true }), $.fs.stat(await handoff($), { resolve: true })])
    if (file.kind !== 'file' || file.isLink || slashes(file.realPath) !== `${slashes(folder.realPath)}/${FILE}`) return false
    const git = await $.process.run(['git', '-c', 'core.fsmonitor=false', 'ls-files', '--', RUNS], { cwd: root })
    return git.exitCode === 0 && git.stdout === ''
  } catch {
    return false
  }
}
const vetted = async ($: EngineInterface) => {
  const text = await own($)
  return text !== null && (await safe($)) ? text : null
}
// The drift since the coordinator last wrote the file: the time the status line carries, else the file's mtime. Any
// failure of git or a stat means no drift, never a failed restore.
async function drifted($: EngineInterface, text: string) {
  try {
    const root = await $.session.root()
    const since = editedAt(text) ?? (await $.fs.stat(await handoff($))).mtimeMs
    const run = (args: string[]) => $.process.run(['git', ...args], { cwd: root })
    const [top, log, status] = await Promise.all([run(TOP_ARGS), run(commitArgs(since)), run(STATUS_ARGS)])
    if (top.exitCode !== 0 || log.exitCode !== 0 || status.exitCode !== 0) return ''
    const stats = await Promise.all(changedPaths(status.stdout).map(async (path) => ({ path, stat: await $.fs.stat(`${top.stdout.trim()}/${path}`).catch(() => null) })))
    return drift(since, log.stdout.split('\n').filter(Boolean), stats.filter(({ stat }) => stat !== null && stat.mtimeMs > since).map(({ path }) => path))
  } catch {
    return ''
  }
}
const stamp = (ms: number) => new Date(ms).toISOString()

// Rewrites the status line of the vetted handoff text. Its last fields carry when the coordinator last wrote the file: the
// file's mtime, unless the previous status line saw the same text outside the block, then the time that line carried.
async function status($: EngineInterface, text: string, event: string, tokens: number | undefined) {
  const context = tokens === undefined ? 'unread' : `${tokens} tokens`
  const path = await handoff($)
  const [now, { mtimeMs }] = await Promise.all([$.clock.now(), $.fs.stat(path)])
  const print = fingerprint(text)
  const previous = stamped(text)
  const edited = previous !== null && previous.text === print ? previous.edited : mtimeMs
  await $.fs.write(path, withStatus(text, `${stamp(now)} ${event}; context: ${context}; last clear: ${lastEnd === null ? 'none' : stamp(lastEnd)}; edited: ${stamp(edited)}; text: ${print}`))
}

// A row of the transcript the person sees and the model does not read.
const note = ($: EngineInterface, text: string) => $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })

// The completed and failed tasks of the Orca run bound to this terminal; null when Orca gives no such list.
async function settledTasks($: EngineInterface): Promise<Settled | null> {
  try {
    const out = await $.process.run(['orca', 'orchestration', 'task-list', '--json'], { cwd: await $.session.root() })
    const result = (JSON.parse(out.stdout) as { result?: { runId?: unknown; tasks?: unknown } } | null)?.result
    if (out.exitCode !== 0 || typeof result?.runId !== 'string' || !Array.isArray(result.tasks)) return null
    return { run: result.runId, count: result.tasks.filter((task: { status?: unknown } | null) => task?.status === 'completed' || task?.status === 'failed').length }
  } catch {
    return null
  }
}

async function rotate($: EngineInterface, why: string, now: number, seen: number, before: number | null, tasks: Settled | null) {
  // A prompt queued during the judged turn (an Orca wake) has started a new one: give up and let its Stop judge again.
  if (turns !== seen) {
    lastEnd = before
    return
  }
  running = true
  let expired = false
  let watchdog: Timer | undefined
  try {
    const clearing = async () => {
      await $.command.run({ command: 'clear' })
      // Only a clear that happened restarts the task count, so a failed or abandoned one is retried after the gap.
      if (tasks !== null) counted = tasks
      if (expired) return
      const submitted = await $.prompt.submit({ text: resume(why) })
      if (submitted.drop !== undefined) throw new Error(`the resume prompt was dropped: ${submitted.drop}`)
    }
    const late = new Promise<never>((_, fail) => {
      watchdog = $.clock.after(WATCHDOG_MS, () => {
        expired = true
        fail(new Error(`the clear did not finish within ${WATCHDOG_MS / 60_000} minutes`))
      })
    })
    await Promise.race([clearing(), late])
  } catch (error) {
    await note($, `CedarLoom could not clear and resume this coordinator: ${error instanceof Error ? error.message : String(error)}`).catch(() => undefined)
  } finally {
    watchdog?.cancel()
    lastEnd = await $.clock.now().catch(() => now)
    running = false
  }
}

// The checks that need the engine, once the turn is known to be idle; schedules the clear when it is due.
async function decide($: EngineInterface, atTokens: number, atPercent: number, afterTasks: number) {
  const now = await $.clock.now()
  if (lastEnd !== null && now - lastEnd < GAP_MS) return
  const text = await own($)
  if (text === null) return
  const tasks = afterTasks > 0 ? await settledTasks($) : null
  // A new run, or a list that shrank, starts the count again.
  if (tasks !== null && (counted === null || counted.run !== tasks.run || tasks.count < counted.count)) counted = tasks
  const settled = tasks !== null && counted !== null ? tasks.count - counted.count : 0
  const { context } = await $.session.usage()
  const bySize = atPercent > 0 || atTokens > 0
  const figure = atPercent > 0 ? context.percent : context.tokens
  if (bySize && figure === undefined && !noted) {
    noted = true
    await note($, 'CedarLoom cannot read the context size of this session, so it will not clear this coordinator at its threshold.')
    if (await safe($)) await status($, text, 'usage unread', context.tokens).catch(() => undefined)
  }
  const why =
    bySize && figure !== undefined && figure >= (atPercent > 0 ? atPercent : atTokens)
      ? `at ${atPercent > 0 ? `${figure}% of its context window` : `${figure} tokens`}`
      : afterTasks > 0 && settled >= afterTasks
        ? `after ${settled} settled tasks`
        : null
  if (why === null) return
  if (!(await safe($))) return
  await status($, text, `clearing ${why}`, context.tokens).catch(() => undefined)
  // The gap starts now, so a timer that never fires cannot let a second clear through.
  const before = lastEnd
  lastEnd = now
  // A command run from the Stop hook would wait on the turn the hook holds. The timer runs it once the hook has returned,
  // a second later: a prompt queued during the turn that starts within that second makes the clear give up; one that
  // starts later still waits for the clear.
  const seen = turns
  $.clock.after(1000, () => void rotate($, why, now, seen, before, tasks))
}

export const register: Register = (on, options) => {
  const atTokens = typeof options.rotateAtTokens === 'number' ? options.rotateAtTokens : 200000
  const atPercent = typeof options.rotateAtPercent === 'number' ? options.rotateAtPercent : 0
  const afterTasks = typeof options.rotateAfterTasks === 'number' ? options.rotateAfterTasks : 0

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) turns++
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SessionStart', { source: ['clear', 'compact'] }, async ($, e, next) => {
    const result = await next(e)
    const text = await vetted($)
    if (text === null) return result
    return { ...result, additionalContext: [...(result.additionalContext ?? []), restored(text, await drifted($, text))] }
  }).catch(($, e, next) => next(e))

  on('classic.PreCompact', async ($, e, next) => {
    if (!e.agent_id) {
      const text = await vetted($)
      const usage = await $.session.usage().catch(() => null)
      if (text !== null) await status($, text, 'compacting', usage?.context.tokens).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    // A background task, a Stop hook's re-prompt or a hook that blocked the stop means the turn is not idle. Session crons
    // (e.session_crons) are future wakes that survive /clear, not work in flight, so they do not hold rotation back.
    if (e.agent_id || e.stop_hook_active || !Array.isArray(e.background_tasks) || e.background_tasks.length || running || deciding) return result
    if (result.block !== undefined || result.preventContinuation) return result
    if (atPercent <= 0 && atTokens <= 0 && afterTasks <= 0) return result
    deciding = true
    try {
      await decide($, atTokens, atPercent, afterTasks)
    } finally {
      deciding = false
    }
    return result
  }).catch(($, e, next) => next(e))
}
