// A window's history as the reader's HostHistory (session/jumps.ts; the design's L2, Q7): the reader's state under one key of
// `history.state`, the host's own state kept beside it, the address never touched (pushState and replaceState are given no
// URL, so the document's stays what it is). A host gives it as `Host.history` where its page's history is the reader's to add to
// (the website's page, the extension's own tab and its frame over arXiv's PDF page: PDF-READER §11.9 "The way back").
//
// `unwind`: the reader's own entries stepped back over before a host takes the reader away in the ordinary way (the extension's
// frame closed while arXiv's page stays), so that none lingers in the page's history: one traversal of `n` entries, the
// reader told nothing of it (nothing moves, nothing lights), resolved once it has landed.
import { type Entry, entryOf, type HostHistory } from './jumps.ts'

export interface WindowHistory extends HostHistory {
  /** the reader's entries gone back over to its first (none told to the reader); resolved once landed, or at once where there is
   *  none; within `ms` whatever the browser does */
  unwind(ms?: number): Promise<void>
}

/** how long an unwind waits for its traversal to land before it lets the host go on (ms); a ruling, unmeasured */
const UNWIND_MS = 1000

export function windowHistory(win: Window, key = 'axt'): WindowHistory {
  const hist = win.history
  /** the host's state with the reader's beside it */
  const withEntry = (e: Entry) => {
    const s = hist.state
    const base = s && typeof s === 'object' && !Array.isArray(s) ? (s as Record<string, unknown>) : {}
    return { ...base, [key]: e }
  }
  const read = (s: unknown) =>
    s && typeof s === 'object' && !Array.isArray(s) ? entryOf((s as Record<string, unknown>)[key]) : null
  /** an unwind under way: its traversal is told to no listener */
  let unwinding = false
  return {
    mark(e) {
      hist.replaceState(withEntry(e), '')
    },
    push(e) {
      hist.pushState(withEntry(e), '')
    },
    back() {
      hist.back()
    },
    listen(f) {
      const on = (e: PopStateEvent) => {
        if (!unwinding) f(read(e.state))
      }
      win.addEventListener('popstate', on)
      return () => win.removeEventListener('popstate', on)
    },
    current: () => read(hist.state),
    unwind(ms = UNWIND_MS) {
      const n = read(hist.state)?.n ?? 0
      if (n <= 0) return Promise.resolve()
      unwinding = true
      return new Promise<void>((resolve) => {
        const done = () => {
          win.clearTimeout(timer)
          win.removeEventListener('popstate', done)
          // (after every listener of this traversal has heard it, and heard nothing)
          win.setTimeout(() => {
            unwinding = false
            resolve()
          }, 0)
        }
        const timer = win.setTimeout(done, ms)
        win.addEventListener('popstate', done)
        hist.go(-n)
      })
    },
  }
}
