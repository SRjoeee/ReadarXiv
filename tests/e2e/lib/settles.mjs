// A step of a browser check that settles in its time, or fails the run naming itself and what the browser says then.
//
// Playwright bounds neither a page's `evaluate` nor its `close`. The extension's pages share one renderer process and its one
// main thread, and while that thread does not come back an evaluate on any of them waits for good: measured on Chromium 153
// (2026-11-21), a page in a loop that does not end leaves its sibling's evaluate, DevTools' Debugger.enable and a trace's start
// unanswered, while each `close` still returns after Chrome's unload timeout (about half a second). Three hosted runs of round
// c4 printed nothing for 43 minutes after the settings section's last check in reader-v2.mjs, where the next awaits are an
// evaluate on an extension page and their closes, until the job's limit cancelled them, the log naming nothing; a renderer made
// to loop there gives the same log. Once a renderer stands, DevTools can no longer ask it anything: what can still be read is each
// page's answer or silence, the tabs as the browser keeps them, and how much CPU each of the browser's processes takes (a
// loop holds a whole core; a wait holds none).

const LATE = Symbol('late')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const seconds = ms => `${ms / 1000} s`

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
  const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => `no answer in ${seconds(ms)}`)]).catch(e => `threw ${String(e?.message ?? e).slice(0, 80)}`)
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
    return after.processInfo.map(p => `${p.type} ${Math.round(100 * (p.cpuTime - (was.get(p.id) ?? p.cpuTime)))} %`).join(', ')
  } catch (e) {
    return `unread: ${String(e?.message ?? e).slice(0, 80)}`
  }
}
