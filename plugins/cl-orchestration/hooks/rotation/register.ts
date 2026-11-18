// Coordinator context rotation (cl-orchestration:coordinate): when the session's project root holds the coordinator's handoff
// file and the file names this session's id, an idle Stop above the plugin's threshold clears the context with /clear and
// submits a resume prompt, and the first prompt after a clear hands the file back to the model, with the git drift since
// the coordinator wrote it (restore.mjs, a SessionStart command hook, does so after a compaction). Otherwise every hook
// here passes. It writes only that file, reads git, and makes no network request of its own.
import type { EngineInterface, Register, Timer } from 'claude-code'

import { FILE, RUNS, STATUS, STATUS_ARGS, TOP_ARGS, changedPaths, claimed, commitArgs, drift, editedAt, fingerprint, mine, restored, stamped, statusBlock } from './handoff.mjs'

// A second /clear before the resume prompt of the first has carried the file back would start over an empty context.
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
// The id the first /clear of a row ended, kept across a second /clear: the next prompt or turn under another id moves a
// file that names it there. Any other session end, or that one use, disarms it.
let armed: string | null = null
// Set by a /clear until the next prompt that is no slash command carries the file back.
let cleared = false

// The text with its status block holding only this line, the block appended when the text has none.
export function withStatus(text: string, line: string): string {
  const block = `${STATUS[0]}\n${line}\n${STATUS[1]}`
  const at = statusBlock(text)
  if (at === null) return `${text.trimEnd()}\n\n${block}\n`
  return text.slice(0, at[0]) + block + text.slice(at[1])
}

const handoff = async ($: EngineInterface) => `${await $.session.root()}/${FILE}`

// The handoff file's text when it is this session's, else null. A -p run that resumes the coordinator's session carries
// its id but draws on no surface, so it never counts as the coordinator.
async function own($: EngineInterface) {
  if ((await $.session.surfaces()).length === 0) return null
  const text = await $.fs.read(await handoff($)).catch(() => null)
  return text !== null && mine(String(text), await $.session.id()) ? String(text) : null
}
const slashes = (path?: string) => path?.replaceAll('\\', '/')

// A program from an absolute folder of PATH, never by its bare name: Windows looks in the working folder, a project, first.
async function program($: EngineInterface, name: string) {
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  for (const folder of ((await $.env.get('PATH')) ?? (await $.env.get('Path')) ?? '').split(windows ? ';' : ':')) {
    if (!(windows ? /^[A-Za-z]:[\\/]/ : /^\//).test(folder)) continue
    const path = `${folder.replace(/[\\/]+$/, '')}/${name}${windows ? '.exe' : ''}`
    if ((await $.fs.stat(path, { resolve: true }).catch(() => null))?.kind === 'file') return path
  }
  throw new Error(`no ${name} in an absolute folder of PATH`)
}

// Whether the file is the coordinator's own, not one a repository commits or a link leads to: a regular file reached
// through no link, in a git work tree whose .cedarloom/runs git tracks nothing in. Any git failure refuses, so a broken
// repository or one git distrusts (another owner) never counts as untracked.
async function safe($: EngineInterface) {
  try {
    const root = await $.session.root()
    const [folder, file] = await Promise.all([$.fs.stat(root, { resolve: true }), $.fs.stat(await handoff($), { resolve: true })])
    if (file.kind !== 'file' || file.isLink || slashes(file.realPath) !== `${slashes(folder.realPath)}/${FILE}`) return false
    const git = await $.process.run([await program($, 'git'), '-c', 'core.fsmonitor=false', 'ls-files', '--', RUNS], { cwd: root })
    return git.exitCode === 0 && git.stdout === ''
  } catch {
    return false
  }
}
const vetted = async ($: EngineInterface) => {
  const text = await own($)
  return text !== null && (await safe($)) ? text : null
}
// After a /clear gave this process a new session id: a file that names the id the clear ended moves to the new one, also
// in a process that ran no turn yet. A compaction keeps the id. A file another session took over, a run on no surface (a -p
// run), or a /clear whose session.end never reached this module leaves it as it is.
async function takeOver($: EngineInterface) {
  if (armed === null || (await $.session.surfaces()).length === 0) return
  const id = await $.session.id()
  if (!id || id === armed) return
  const from = armed
  armed = null
  const text = await $.fs.read(await handoff($)).catch(() => null)
  if (text !== null && mine(String(text), from) && (await safe($))) {
    const usage = await $.session.usage().catch(() => null)
    await status($, claimed(String(text), id), 'moved to a new session id', usage?.context.tokens)
  }
}
// The drift since the coordinator last wrote the file: the time the status line carries, else the file's mtime. Any
// failure of git or a stat means no drift, never a failed restore.
async function drifted($: EngineInterface, text: string) {
  try {
    const root = await $.session.root()
    const since = editedAt(text) ?? (await $.fs.stat(await handoff($))).mtimeMs
    const git = await program($, 'git')
    const run = (args: string[]) => $.process.run([git, ...args], { cwd: root })
    const [top, log, status] = await Promise.all([run(TOP_ARGS), run(commitArgs(since)), run(STATUS_ARGS)])
    if (top.exitCode !== 0 || log.exitCode !== 0 || status.exitCode !== 0) return ''
    const stats = await Promise.all(changedPaths(status.stdout).map(async (path) => ({ path, stat: await $.fs.stat(`${top.stdout.trim()}/${path}`).catch(() => null) })))
    return drift(since, log.stdout.split('\n').filter(Boolean), stats.filter(({ stat }) => stat !== null && stat.mtimeMs > since).map(({ path }) => path))
  } catch {
    return ''
  }
}
// After a clear: moves the file to the new session id and returns the text that hands it back, or null. A prompt that
// arrives during the plugin's own clear gets no file; the resume prompt behind it carries it.
async function handBack($: EngineInterface) {
  cleared = false
  await takeOver($).catch(() => undefined)
  const text = await vetted($)
  return text === null ? null : restored(text, await drifted($, text))
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

async function rotate($: EngineInterface, why: string, now: number, seen: number, before: number | null) {
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
      if (expired) return
      // A plugin's own prompt takes no context, and on some versions its prompt.submit hook does not see it: the text carries the file.
      const back = await handBack($)
      const submitted = await $.prompt.submit({ text: back === null ? resume(why) : `${resume(why)}\n\n${back}` })
      if (submitted.drop !== undefined) {
        cleared = true
        throw new Error(`the resume prompt was dropped: ${submitted.drop}`)
      }
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
async function decide($: EngineInterface, atTokens: number, atPercent: number) {
  const now = await $.clock.now()
  if (lastEnd !== null && now - lastEnd < GAP_MS) return
  const text = await own($)
  if (text === null) return
  const { context } = await $.session.usage()
  const figure = atPercent > 0 ? context.percent : context.tokens
  if (figure === undefined) {
    if (noted) return
    noted = true
    await note($, 'CedarLoom cannot read the context size of this session, so it will not clear this coordinator at its threshold.')
    if (await safe($)) await status($, text, 'usage unread', context.tokens).catch(() => undefined)
    return
  }
  if (figure < (atPercent > 0 ? atPercent : atTokens)) return
  const why = `at ${atPercent > 0 ? `${figure}% of its context window` : `${figure} tokens`}`
  if (!(await safe($))) return
  await status($, text, `clearing ${why}`, context.tokens).catch(() => undefined)
  // The gap starts now, so a timer that never fires cannot let a second clear through.
  const before = lastEnd
  lastEnd = now
  // A command run from the Stop hook would wait on the turn the hook holds. The timer runs it once the hook has returned,
  // a second later: a prompt queued during the turn that starts within that second makes the clear give up; one that
  // starts later still waits for the clear.
  const seen = turns
  $.clock.after(1000, () => void rotate($, why, now, seen, before))
}

export const register: Register = (on, options) => {
  const atTokens = typeof options.rotateAtTokens === 'number' ? options.rotateAtTokens : 200000
  const atPercent = typeof options.rotateAtPercent === 'number' ? options.rotateAtPercent : 0

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turns++
      // A turn after a /clear that no prompt carried the file to (a cron wake, a task notification).
      await takeOver($).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // No $ calls: all session.end hooks share 1.5 s. Any other reason (a /resume) disarms the takeover.
  on('session.end', ($, e, next) => {
    cleared = e.reason === 'clear'
    armed = cleared ? (armed ?? (e.sessionId || null)) : null
    return next(e)
  }).catch(($, e, next) => next(e))

  // A slash command's context may never reach the model, so the file waits for the next prompt.
  on('prompt.submit', async ($, e, next) => {
    if (!cleared || e.command) return next(e)
    const back = await handBack($)
    if (back === null) return next(e)
    const result = await next({ ...e, context: [...(e.context ?? []), back] })
    // A dropped prompt never reaches the model, so the next one carries the file.
    if (result.drop !== undefined) cleared = true
    return result
  }).catch(($, e, next) => next(e))

  on('classic.PreCompact', async ($, e, next) => {
    if (!e.agent_id) {
      const text = await vetted($)
      const usage = await $.session.usage().catch(() => null)
      if (text !== null) await status($, text, 'compacting', usage?.context.tokens).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The only hook that schedules a clear. Where Claude Code's built-in guard loads it never runs, so there no clear comes
  // and the context grows until auto-compaction, or to the window limit when that is off; keep the clear off native events, which carry no background-task list.
  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    // A background task, a Stop hook's re-prompt or a hook that blocked the stop means the turn is not idle. Session crons
    // (e.session_crons) are future wakes that survive /clear, not work in flight, so they do not hold rotation back.
    if (e.agent_id || e.stop_hook_active || !Array.isArray(e.background_tasks) || e.background_tasks.length || running || deciding) return result
    if (result.block !== undefined || result.preventContinuation) return result
    if (atPercent <= 0 && atTokens <= 0) return result
    deciding = true
    try {
      await decide($, atTokens, atPercent)
    } finally {
      deciding = false
    }
    return result
  }).catch(($, e, next) => next(e))
}
