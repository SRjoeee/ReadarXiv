// A step of a browser check that settles in its time, or fails the run naming itself and what the browser says then.
//
// Playwright bounds neither a page's `evaluate` nor its `close`. The extension's pages share one renderer process and its one
// main thread, and while that thread does not come back an evaluate on any of them waits for good: measured on Chromium 153
// (2026-11-21), a page in a loop that does not end leaves its sibling's evaluate, DevTools' Debugger.enable and a trace's start
// unanswered, while each `close` still returns after Chrome's unload timeout (about half a second). Three hosted runs of round
// c4 printed nothing for 43 minutes after the settings section's last check in reader-v2.mjs, where the next awaits are an
// evaluate on an extension page and their closes, until the job's limit cancelled them, the log naming nothing; a renderer made
// to loop there gives the same log.
//
// A stuck thread can be asked nothing it was not prepared for: what needs the thread (enabling a debugger, starting a trace)
// must be done before it sticks. So a section whose readers may stick is watched from its start (`stallWatch`): each reader
// it opens gets a DevTools session with its debugger on (breakpoints off: a `debugger` statement pauses nothing), whose
// Debugger.pause V8 then delivers to a running JavaScript loop by an interrupt; and the browser records a trace into a ring
// buffer, whose CPU samples and tasks are written off that thread. On a stall the report gives the stack where a reader's
// thread runs JavaScript (and the built chunk's text around its top frame, a minified name being findable in the source), or
// says it is not in JavaScript (a native loop or a wait) and gives the trace's account of that thread; beside what the script
// itself knows (`known`), each page's answer or silence, the tabs' flags, and each process's share of a core.

const LATE = Symbol('late')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const seconds = ms => `${ms / 1000} s`
/** a promise's value, or `none` past `ms` (an error said as `threw …`) */
const within = (promise, ms, none = `no answer in ${seconds(ms)}`) => Promise.race([promise, sleep(ms).then(() => none)]).catch(e => `threw ${String(e?.message ?? e).slice(0, 80)}`)

/** `step()`'s value (or its own error); past `ms`, an Error naming `what` with what `tell()` says then (itself bounded by
 *  `tellMs`). The step goes on standing: the caller fails the run on the error and ends it */
export async function settles(what, step, { ms = 30_000, tell = null, tellMs = 15_000 } = {}) {
  let timer
  const late = new Promise(resolve => { timer = setTimeout(resolve, ms, LATE) })
  let won
  try {
    won = await Promise.race([Promise.resolve().then(step), late])
  } finally {
    clearTimeout(timer)
  }
  if (won !== LATE) return won
  const said = tell ? await Promise.race([Promise.resolve().then(tell).catch(e => `the report failed: ${e?.message ?? e}`), sleep(tellMs).then(() => `the report gave nothing in ${seconds(tellMs)}`)]) : ''
  throw new Error(`${what}: not settled in ${seconds(ms)}${said ? `; ${said}` : ''}`)
}

/** what the browser says of a check's pages while a step stands (one line): whether each page answers an evaluate in
 *  `answerMs`; each tab's flags as the extension's worker reads them (chrome.tabs: active, frozen, discarded); each of the
 *  browser's processes' share of a core over a second, where Playwright gives a session on the browser (SystemInfo) */
export async function stallReport({ context, worker }, { answerMs = 3000 } = {}) {
  const pages = await Promise.all(context.pages().map(async p => `${p.url().replace(/^chrome-extension:\/\/[a-z]+\//, '').replace(/[?#].*$/, '')} ${await within(p.evaluate(() => 'answers'), answerMs)}`))
  const flags = await within(worker.evaluate(() => chrome.tabs.query({}).then(tabs => tabs.map(t => ({ active: t.active, frozen: t.frozen, discarded: t.discarded })))), answerMs)
  const tabs = Array.isArray(flags) ? flags.map(t => [t.active && 'active', t.frozen && 'frozen', t.discarded && 'discarded'].filter(Boolean).join('+') || '-').join(', ') : flags
  return `pages: ${pages.join('; ')}; tabs: ${tabs}; processes: ${await processShares(context, answerMs)}`
}

/** each of the browser's processes, its type and its share of a core over a second (DevTools' SystemInfo, on the browser) */
async function processShares(context, answerMs) {
  const browser = context.browser?.()
  if (!browser) return 'no session on the browser'
  try {
    const session = await browser.newBrowserCDPSession()
    const read = () => Promise.race([session.send('SystemInfo.getProcessInfo'), sleep(answerMs).then(() => null)])
    const before = await read()
    await sleep(1000)
    const after = await read()
    await session.detach().catch(() => undefined)
    if (!before || !after) return 'no answer'
    const was = new Map(before.processInfo.map(p => [p.id, p.cpuTime]))
    return after.processInfo.map(p => `${p.type} ${p.id} ${Math.round(100 * (p.cpuTime - (was.get(p.id) ?? p.cpuTime)))} %`).join(', ')
  } catch (e) {
    return `unread: ${String(e?.message ?? e).slice(0, 80)}`
  }
}

/** a paused page's frames, one line each, the top first: function, the script's file (its address less the extension's
 *  origin), line and column (1-based) */
export function framesOf(callFrames, n = 12) {
  return callFrames.slice(0, n).map(f => `${f.functionName || '(anonymous)'} ${String(f.url || '(no file)').replace(/^chrome-extension:\/\/[a-z]+\//, '')}:${f.location.lineNumber + 1}:${(f.location.columnNumber ?? 0) + 1}`)
}

/** `width` characters of a source around a place (0-based line and column: a minified chunk's one long line) */
export function excerpt(source, lineNumber, columnNumber = 0, width = 200) {
  const line = String(source).split('\n')[lineNumber] ?? ''
  const from = Math.max(0, columnNumber - width / 2)
  return line.slice(from, from + width)
}

/**
 * A trace's account of the main thread of the renderer that hosts `origin`'s pages (Chrome's JSON trace events): its pid (the
 * processes whose events' arguments name the origin: a script's address, a request's, a frame's), its main thread
 * (CrRendererMain); the slices begun there and never ended, outermost first (the task that does not end, and what it was in:
 * a FunctionCall's function and place, a request's address), the last long complete events, the last events, and the leaf
 * frames the CPU profiler sampled most over the trace's last `recentMs` in that process. Null where no process names it
 */
export function traceStall(events, { origin, longMs = 50, last = 8, recentMs = 5000 }) {
  const named = new Map()
  for (const e of events) if (e.ph !== 'M' && e.args && JSON.stringify(e.args).includes(origin)) named.set(e.pid, (named.get(e.pid) ?? 0) + 1)
  const pids = [...named.keys()].filter(pid => events.some(e => e.ph === 'M' && e.pid === pid && e.name === 'thread_name' && e.args?.name === 'CrRendererMain'))
  if (!pids.length) return null
  const end = events.reduce((m, e) => Math.max(m, e.ts ?? 0), 0)
  const ms = us => `${Math.round(us / 1000)} ms`
  const file = url => String(url ?? '').replace(/^chrome-extension:\/\/[a-z]+\//, '')
  /** a slice's own detail: the function a FunctionCall runs and where, a request's address */
  const detail = e => {
    const d = e.args?.data ?? e.args?.beginData ?? {}
    if (d.functionName !== undefined || d.scriptName || (d.url && d.lineNumber !== undefined)) return ` [${d.functionName || '(anonymous)'} ${file(d.url ?? d.scriptName)}:${(d.lineNumber ?? 0) + 1}:${(d.columnNumber ?? 0) + 1}]`
    return d.url ? ` [${String(d.url).slice(0, 80)}]` : ''
  }
  const out = []
  for (const pid of pids) {
    const main = events.find(e => e.ph === 'M' && e.pid === pid && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')?.tid
    const on = events.filter(e => e.pid === pid && e.tid === main && e.ph !== 'M').sort((x, y) => x.ts - y.ts)
    const open = []
    for (const e of on) {
      if (e.ph === 'B') open.push(e)
      else if (e.ph === 'E') open.pop()
    }
    const begun = open.map(e => `${e.name}${detail(e)} (${e.cat}) begun ${ms(end - e.ts)} before the trace's end`)
    const long = on.filter(e => e.ph === 'X' && e.dur >= longMs * 1000).slice(-5).map(e => `${e.name}${detail(e)} ${ms(e.dur)}, ended ${ms(end - e.ts - e.dur)} before the trace's end`)
    const tail = on.slice(-last).map(e => `${e.name}${detail(e)}${e.ph === 'X' ? ` ${ms(e.dur)}` : ` (${e.ph})`}`)
    out.push(`renderer ${pid}, main thread ${main ?? 'unnamed'}: never ended: ${begun.join(' < ') || 'none'}; long: ${long.join('; ') || 'none'}; last: ${tail.join(', ') || 'none'}; sampled most in the last ${ms(recentMs * 1000)}: ${sampledMost(events, pid, end - recentMs * 1000) || 'no samples'}`)
  }
  return out.join(' | ')
}

/** the leaf frames V8's sampling profiler saw most in a process since `since` (µs): its Profile event's start, its
 *  ProfileChunk events' nodes (told once) and samples with their time deltas */
function sampledMost(events, pid, since) {
  const nodes = new Map(), counts = new Map(), clock = new Map()
  for (const e of events) if (e.pid === pid && e.name === 'Profile') clock.set(e.id, e.args?.data?.startTime ?? e.ts)
  for (const e of events.filter(x => x.pid === pid && x.name === 'ProfileChunk').sort((x, y) => x.ts - y.ts)) {
    const profile = e.args?.data?.cpuProfile ?? {}
    for (const n of profile.nodes ?? []) nodes.set(`${e.id}:${n.id}`, n.callFrame)
    const deltas = e.args?.data?.timeDeltas ?? []
    let t = clock.get(e.id) ?? e.ts
    ;(profile.samples ?? []).forEach((s, i) => {
      t += deltas[i] ?? 0
      if (t >= since) counts.set(`${e.id}:${s}`, (counts.get(`${e.id}:${s}`) ?? 0) + 1)
    })
    clock.set(e.id, t)
  }
  // (each isolate of the process has its profile: the main thread's and each worker's. A node told before the ring buffer's
  // start is unknown; the idle and the root are no one's work. `(program)` and `(garbage collector)` are kept: native time)
  const named = new Map()
  for (const [key, count] of counts) {
    const f = nodes.get(key)
    if (!f || f.functionName === '(idle)' || f.functionName === '(root)') continue
    const name = `${f.functionName || '(anonymous)'} ${String(f.url || '').replace(/^chrome-extension:\/\/[a-z]+\//, '')}:${(f.lineNumber ?? -1) + 1}:${(f.columnNumber ?? -1) + 1}`
    named.set(name, (named.get(name) ?? 0) + count)
  }
  return [...named].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([name, count]) => `${name} x${count}`).join(', ')
}

/**
 * The watch over a section whose readers may stick, started before any of them is opened: the browser's trace into a ring
 * buffer (where Playwright gives a session on the browser), and `watch(page)` for each reader as it is opened (a session, its
 * runtime and debugger on, breakpoints off). `report(named, known, print)` prints the whole account and returns one line;
 * `end()` stops the trace (its data dropped) and lets the sessions go. `worker`: the extension's (the tabs' flags);
 * `extensionDir`: the build the browser loaded, for the chunks' text; `origin`: the extension's
 */
export async function stallWatch({ context, worker, extensionDir, origin }) {
  const sessions = new Map()
  /** each watched page's scripts by id: their addresses, as its debugger told them */
  const scripts = new Map()
  let trace = null
  const browser = context.browser?.()
  // ---- what happens from the section's start, with its time: the browser's target events, each watched page's own (its
  // navigations, loads, close, crash, its DevTools session's detach), every dialog, the requests in flight
  const t0 = Date.now()
  const short = url => String(url ?? '').replace(/^chrome-extension:\/\/[a-z]+\//, '').slice(0, 90)
  const seen = []
  const log = (what, page = null) => { seen.push({ t: Date.now(), what, page }); if (seen.length > 600) seen.shift() }
  const targetOf = new Map()
  // (a dialog logged, then dismissed as Playwright dismisses one nobody listens for: the run behaves as without the watch)
  const onDialog = d => { log(`dialog ${d.type()} "${d.message().slice(0, 80)}"`, d.page()); d.dismiss().catch(() => undefined) }
  context.on('dialog', onDialog)
  const inFlight = new Map()
  const asker = r => { try { return r.serviceWorker() ? 'the service worker' : short(r.frame().url()) } catch { return 'a page' } }
  const onRequest = r => inFlight.set(r, { t: Date.now(), url: r.url(), from: asker(r) })
  const onDone = r => inFlight.delete(r)
  context.on('request', onRequest)
  context.on('requestfinished', onDone)
  context.on('requestfailed', onDone)
  let targets = null
  if (browser) {
    try {
      targets = await browser.newBrowserCDPSession()
      for (const ev of ['Target.targetCreated', 'Target.targetDestroyed', 'Target.targetInfoChanged', 'Target.targetCrashed', 'Target.detachedFromTarget']) {
        targets.on(ev, e => {
          const id = e.targetId ?? e.targetInfo?.targetId
          const info = e.targetInfo ? ` ${e.targetInfo.type} ${short(e.targetInfo.url)}${e.targetInfo.attached ? ' attached' : ''}` : ''
          log(`${ev.replace('Target.', '')} ${String(id).slice(0, 8)}${info}${e.status ? ` status ${e.status}` : ''}`, targetOf.get(id) ?? null)
        })
      }
      await within(targets.send('Target.setDiscoverTargets', { discover: true }), 5000)
    } catch {
      targets = null
    }
  }
  if (browser) {
    try {
      const s = await browser.newBrowserCDPSession()
      const started = await within(s.send('Tracing.start', { traceConfig: { recordMode: 'recordContinuously', traceBufferSizeInKb: 32 * 1024, includedCategories: ['disabled-by-default-v8.cpu_profiler', 'toplevel', 'blink', 'devtools.timeline'] }, transferMode: 'ReturnAsStream' }).then(() => true), 10_000)
      trace = started === true ? s : null
    } catch {
      trace = null
    }
  }
  /** the trace ended: its stream's text where `keep`, else dropped; bounded (20 s) */
  async function stopTrace(keep) {
    if (!trace) return 'no trace'
    const s = trace
    trace = null
    const complete = new Promise(resolve => s.once('Tracing.tracingComplete', resolve))
    const ended = await within(s.send('Tracing.end').then(() => complete), 20_000)
    if (!ended?.stream) return `the trace could not be ended: ${typeof ended === 'string' ? ended : 'no stream'}`
    try {
      if (!keep) return 'dropped'
      const parts = []
      const deadline = Date.now() + 20_000
      for (;;) {
        if (Date.now() > deadline) return 'the trace could not be read in 20 s'
        const r = await s.send('IO.read', { handle: ended.stream, size: 4 << 20 })
        parts.push(r.base64Encoded ? Buffer.from(r.data, 'base64').toString('utf8') : r.data)
        if (r.eof) break
      }
      return parts.join('')
    } finally {
      await s.send('IO.close', { handle: ended.stream }).catch(() => undefined)
      await s.detach().catch(() => undefined)
    }
  }
  async function stacks(named, print) {
    const watched = Object.entries(named).filter(([, p]) => sessions.has(p) && !p.isClosed())
    const paused = new Map()
    // (a frame's address from the scripts its session was told of: Chrome leaves CallFrame.url empty, deprecated for scriptId)
    const resolved = (p, e) => ({ ...e, callFrames: e.callFrames.map(f => ({ ...f, url: f.url || scripts.get(p)?.get(f.location.scriptId) || '' })) })
    for (const [name, p] of watched) sessions.get(p).once('Debugger.paused', e => paused.set(name, resolved(p, e)))
    await Promise.all(watched.map(([, p]) => within(sessions.get(p).send('Debugger.pause'), 5000)))
    for (let t = 0; t < 50 && paused.size < watched.length; t++) await sleep(100)
    const said = []
    for (const [name, p] of watched) {
      const e = paused.get(name)
      if (!e) {
        said.push(`${name}: ${paused.size ? `no pause in 5 s (its thread was in ${[...paused.keys()].join(', ')}'s JavaScript)` : 'not in JavaScript (no pause in 5 s)'}`)
        continue
      }
      const frames = framesOf(e.callFrames)
      said.push(`${name}: paused in JavaScript, ${frames[0]}`)
      print(`stall: reader ${name} paused in JavaScript (${e.reason}); its frames, the top first:`)
      for (const f of frames) print(`stall:   at ${f}`)
      const top = e.callFrames[0], built = e.callFrames.find(f => String(f.url).startsWith(origin))
      for (const f of new Set([top, built].filter(Boolean))) print(`stall:   ${f === top ? 'top frame' : 'topmost frame of the build'} ${framesOf([f])[0]}, its text: ${JSON.stringify(await textAt(sessions.get(p), f))}`)
      await within(sessions.get(p).send('Debugger.resume'), 3000)
    }
    return said
  }
  /** 200 characters around a frame: the built chunk's file where the frame is the build's, else the script DevTools holds */
  async function textAt(session, f) {
    try {
      if (String(f.url).startsWith(origin)) {
        const { readFileSync } = await import('node:fs')
        const path = new URL(f.url).pathname.replace(/^\//, '')
        return excerpt(readFileSync(`${extensionDir}/${path}`, 'utf8'), f.location.lineNumber, f.location.columnNumber)
      }
      const { scriptSource } = await session.send('Debugger.getScriptSource', { scriptId: f.location.scriptId })
      return excerpt(scriptSource, f.location.lineNumber, f.location.columnNumber)
    } catch (e) {
      return `(unread: ${String(e?.message ?? e).slice(0, 60)})`
    }
  }
  async function end() {
    await stopTrace(false)
    for (const s of sessions.values()) await within(s.detach(), 3000)
    sessions.clear()
    scripts.clear()
    context.off('dialog', onDialog)
    context.off('request', onRequest)
    context.off('requestfinished', onDone)
    context.off('requestfailed', onDone)
    if (targets) await within(targets.detach(), 3000)
    targets = null
  }
  /** each named page as the browser has it now: open or closed, its address, its document's state and visibility (3 s) */
  async function pagesNow(named) {
    return Promise.all(Object.entries(named).map(async ([name, p]) => {
      if (p.isClosed()) return `${name} closed`
      const doc = await within(p.evaluate(() => ({ ready: document.readyState, visible: document.visibilityState, url: location.href })), 3000)
      return `${name} ${typeof doc === 'string' ? doc : `${doc.ready}, ${doc.visible}, ${short(doc.url)}`} (target ${String([...targetOf].find(([, q]) => q === p)?.[0] ?? '?').slice(0, 8)})`
    }))
  }
  return {
    async watch(page) {
      try {
        // (the page's own events, kept: its navigations of the main frame, loads, close and crash)
        page.on('framenavigated', f => { if (f === page.mainFrame()) log(`navigated to ${short(f.url())}`, page) })
        page.on('domcontentloaded', () => log('domcontentloaded', page))
        page.on('load', () => log('load', page))
        page.on('close', () => log('close (Playwright\'s event)', page))
        page.on('crash', () => log('crashed', page))
        const s = await context.newCDPSession(page)
        const known = new Map()
        scripts.set(page, known)
        s.on('Debugger.scriptParsed', e => { if (e.url) known.set(e.scriptId, e.url) })
        s.on('Inspector.detached', e => log(`Inspector.detached ${e.reason}`, page))
        s.on('Inspector.targetCrashed', () => log('Inspector.targetCrashed', page))
        const info = await within(s.send('Target.getTargetInfo'), 3000)
        if (info?.targetInfo?.targetId) targetOf.set(info.targetInfo.targetId, page)
        await s.send('Inspector.enable').catch(() => undefined)
        await s.send('Runtime.enable')
        await s.send('Debugger.enable')
        await s.send('Debugger.setBreakpointsActive', { active: false })
        sessions.set(page, s)
      } catch {
        // (a page gone before it was watched: nothing to report of it)
      }
    },
    /** the whole account printed (`print` a line at a time), one line returned for the run's failure. `step`: the step that
     *  stands and when it was sent (ms since the epoch), for the events after it. (The pages' answers are read before any pause
     *  is asked: a pause asked of a page whose thread runs no JavaScript of its own waits for its next statement, which would be
     *  that evaluate's) */
    async report(named, known, print, step = null) {
      const nameOf = p => Object.entries(named).find(([, q]) => q === p)?.[0] ?? (p ? short(p.url()) : 'the browser')
      const rel = t => `+${((t - t0) / 1000).toFixed(2)} s`
      if (step) print(`stall: the step: ${step.what}, sent at ${rel(step.at)} of the section (${((Date.now() - step.at) / 1000).toFixed(1)} s ago)`)
      print(`stall: what the script knows: ${known()}`)
      print(`stall: the pages now: ${(await pagesNow(named)).join('; ')}`)
      print(`stall: dialogs since the section's start: ${seen.filter(e => e.what.startsWith('dialog')).map(e => `${rel(e.t)} ${nameOf(e.page)} ${e.what}`).join('; ') || 'none'}`)
      print(`stall: requests in flight: ${[...inFlight.values()].map(r => `${short(r.url)} from ${r.from}, ${((Date.now() - r.t) / 1000).toFixed(1)} s`).join('; ') || 'none'}`)
      for (const [name, p] of Object.entries(named)) print(`stall: ${name}'s events: ${seen.filter(e => e.page === p).map(e => `${rel(e.t)} ${e.what}`).join(', ') || 'none seen'}`)
      if (step) print(`stall: every event since the step was sent: ${seen.filter(e => e.t >= step.at).map(e => `${rel(e.t)} ${nameOf(e.page)}: ${e.what}`).join('; ') || 'none'}`)
      print(`stall: the browser: ${await stallReport({ context, worker })}`)
      const said = await stacks(named, print)
      for (const s of said) print(`stall: ${s}`)
      if (!said.some(s => s.includes('paused in JavaScript'))) {
        const text = await stopTrace(true)
        let account = text
        if (text.startsWith('{') || text.startsWith('[')) {
          try {
            const parsed = JSON.parse(text)
            account = traceStall(Array.isArray(parsed) ? parsed : parsed.traceEvents ?? [], { origin }) ?? 'the trace names no renderer of the extension'
          } catch (e) {
            account = `the trace could not be read: ${String(e?.message ?? e).slice(0, 60)}`
          }
        }
        print(`stall: the trace: ${account}`)
      } else await stopTrace(false)
      await end()
      return said.join('; ')
    },
    end,
  }
}
