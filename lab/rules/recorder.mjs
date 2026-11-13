// lab/rules/recorder.mjs: the rule ledger's instrument, its run-time half (design-reduction-2026-11-13.md §3c, R4). The
// instrumented code (transform.mjs, the site map of sites.mjs) calls `globalThis.__axtRules` at each site; this records,
// per site: how often it ran and each outcome's count; for a comparison and a Math.min / max, the nearest case on each
// side of the bound (the rule's value): the effective operand (the value of the rule's literal or constant at which that
// case would decide the other way), both operands, the paper (or the test), the page where the lab's runner sets it, and
// the run's ordinal; for a list, each entry's hits; for each outcome, the tests that took it. A margin is information
// for whoever reads a row: it never decides a removal (ledger.mjs). Writes one raw record a process (or a test file) under AXT_RULES_OUT; merge.mjs
// sums them. Installed once a process: by register.mjs (Node) or vitest-setup.mjs. Not shipped.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const RAW_FORMAT = 'readarxiv/rules-raw 1'
/** the tests kept per outcome of a site (beyond them, counted) */
const TESTS_KEPT = 50
const MARK = Symbol.for('axt.rules.site')

/** a recorder over a site map (sites.json's content) */
export function recorderOf(map, { out = null, paper = null, input = 'corpus' } = {}) {
  const S = map.sites
  const R = new Array(S.length)
  // (the context: the paper or pair, the test and its file, and the page a lab runner says it lays: lab/typeset's gate)
  let ctx = Object.freeze({ paper, test: null, file: null, page: null })
  // (every paper a process records cases of: a lay's runner lays several in one process)
  const papers = new Set(paper ? [paper] : [])
  // (every module of the site map the process loaded)
  const loaded = new Set()
  let flushes = 0
  const t0 = performance.now()

  const recOf = id => (R[id] ??= { n: 0, t: 0, f: 0, nan: 0, near: [null, null], tests: [null, null], hits: null, reads: null, pl: undefined, ps: null })
  // (a run counted, and the paper it ran on noted where the paper changed since the site's last run: the papers a site
  // ran on, for a process that lays several (the lay's runner); one comparison a run)
  const ran = r => {
    r.n += 1
    if (r.pl !== ctx.paper) {
      r.pl = ctx.paper
      if (ctx.paper) (r.ps ??= new Set()).add(ctx.paper)
    }
  }
  const noteTest = (r, slot) => {
    const t = ctx.test
    if (!t) return
    const s = (r.tests[slot] ??= { last: null, kept: new Set(), more: 0 })
    if (s.last === t) return
    s.last = t
    if (s.kept.has(t)) return
    if (s.kept.size < TESTS_KEPT) s.kept.add(t)
    else s.more++
  }
  /** the value of the rule's number at which this case decides the other way, by the operand's shape (sites.mjs usageOf) */
  const effOf = (bd, other, side) => {
    if (typeof other !== 'number' || typeof side !== 'number') return Number.NaN
    switch (bd.shape) {
      case 'direct':
        return other
      case 'scale':
        return side === 0 ? Number.NaN : (bd.value * other) / side
      case 'inverse':
        return other === 0 ? Number.NaN : (bd.value * side) / other
      case 'shift+':
        return bd.value + (other - side)
      case 'shift-':
        return bd.value - (other - side)
      default:
        // (any other shape: the comparison's slack, its own units, about 0)
        return other - side
    }
  }
  const near = (id, r, result, other, side) => {
    const bd = S[id].bounds[0]
    if (!bd) return
    const eff = effOf(bd, other, side)
    if (Number.isNaN(eff)) {
      r.nan++
      return
    }
    const centre = bd.shape === 'other' ? 0 : bd.value
    const d = Math.abs(eff - centre)
    const slot = result ? 1 : 0
    const cur = r.near[slot]
    if (!cur || d < cur.d) r.near[slot] = { d, eff, x: other, b: side, k: r.n, paper: ctx.paper, page: ctx.page, test: ctx.test }
  }
  const cmp = (id, a, b, result) => {
    const r = recOf(id)
    ran(r)
    if (result) r.t++
    else r.f++
    const bd = S[id].bounds[0]
    if (bd) near(id, r, result, bd.at === 'left' ? b : a, bd.at === 'left' ? a : b)
    noteTest(r, result ? 1 : 0)
    return result
  }
  const outcome = (id, result) => {
    const r = recOf(id)
    ran(r)
    if (result) r.t++
    else r.f++
    noteTest(r, result ? 1 : 0)
    return result
  }
  /** Math.min / Math.max: the bound decided where it is strictly beyond every other argument */
  const minmax = (id, args, min) => {
    const res = min ? Math.min(...args) : Math.max(...args)
    const r = recOf(id)
    ran(r)
    const bd = S[id].bounds[0]
    const at = typeof bd?.at === 'number' ? bd.at : -1
    if (at < 0 || at >= args.length) return res
    let o = min ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
    for (let i = 0; i < args.length; i++) if (i !== at) o = min ? Math.min(o, args[i]) : Math.max(o, args[i])
    const bv = args[at]
    const decided = min ? bv < o : bv > o
    if (decided) r.t++
    else r.f++
    near(id, r, decided, o, bv)
    noteTest(r, decided ? 1 : 0)
    return res
  }

  // ---- lists: each literal's prototype swapped for one of its site's that records every membership test
  const hit = (id, entry) => {
    const r = recOf(id)
    r.hits ??= new Map()
    const k = String(entry)
    r.hits.set(k, (r.hits.get(k) ?? 0) + 1)
  }
  const read = (id, how) => {
    const r = recOf(id)
    r.reads ??= {}
    r.reads[how] = (r.reads[how] ?? 0) + 1
  }
  const member = (id, x, found) => {
    outcome(id, found)
    if (found) hit(id, x)
    return found
  }
  const A = Array.prototype
  const protos = new Map()
  // (a list copied into a Set (sites.mjs `ns`): the copy's iteration of it is the Set's making, not a read; `hush` names the
  // objects whose next iteration is that copy's)
  const hushed = new WeakMap()
  const iterated = (ids, obj) => {
    const n = hushed.get(obj) ?? 0
    if (n > 1) hushed.set(obj, n - 1)
    else if (n === 1) hushed.delete(obj)
    else for (const id of ids) read(id, 'iterate')
  }
  /** every method of a prototype the swapped one does not take itself: a read of the list, by the method's name (what is
   *  not a membership test uses the entries whole: a list read so is not judged by its entries' hits) */
  const readsAll = (P, base, ids, own) => {
    for (const name of Object.getOwnPropertyNames(base)) {
      if (name === 'constructor' || own.has(name)) continue
      const d = Object.getOwnPropertyDescriptor(base, name)
      if (typeof d?.value !== 'function') continue
      const fn = d.value
      Object.defineProperty(P, name, {
        value: function (...a) {
          for (const id of ids) read(id, name)
          return fn.apply(this, a)
        },
        writable: true,
        configurable: true,
      })
    }
  }
  const listProto = id => {
    const P = Object.create(A)
    Object.defineProperty(P, MARK, { value: [id] })
    const define = (name, fn) => Object.defineProperty(P, name, { value: fn, writable: true, configurable: true })
    define('includes', function (x, from) {
      return member(id, x, A.includes.call(this, x, from))
    })
    define('indexOf', function (x, from) {
      const i = A.indexOf.call(this, x, from)
      member(id, x, i !== -1)
      return i
    })
    define('lastIndexOf', function (x, ...from) {
      const i = A.lastIndexOf.call(this, x, ...from)
      member(id, x, i !== -1)
      return i
    })
    // (a test by a predicate: the entries it held true for are hits (`some` and the finds stop at the first); the call's
    // outcome is whether any was)
    for (const name of ['some', 'find', 'findIndex', 'findLast', 'findLastIndex', 'filter'])
      define(name, function (fn, thisArg) {
        let any = false
        const res = A[name].call(this, (v, i, a) => {
          const ok = fn.call(thisArg, v, i, a)
          if (ok) {
            any = true
            hit(id, v)
          }
          return ok
        })
        outcome(id, any)
        return res
      })
    // (`every` is a conjunction: the entry it stops at, its predicate false there, is the one that decided the call; a call
    // that held for every entry was decided by none of them, any one taken away)
    define('every', function (fn, thisArg) {
      const res = A.every.call(this, (v, i, a) => {
        const ok = fn.call(thisArg, v, i, a)
        if (!ok) hit(id, v)
        return ok
      })
      outcome(id, res)
      return res
    })
    define(Symbol.iterator, function () {
      iterated([id], this)
      return A[Symbol.iterator].call(this)
    })
    readsAll(P, A, [id], new Set(['includes', 'indexOf', 'lastIndexOf', 'some', 'find', 'findIndex', 'findLast', 'findLastIndex', 'filter', 'every']))
    return P
  }
  const SP = Set.prototype
  const setProto = ids => {
    const P = Object.create(SP)
    Object.defineProperty(P, MARK, { value: ids })
    const define = (name, fn) => Object.defineProperty(P, name, { value: fn, writable: true, configurable: true })
    define('has', function (x) {
      const found = SP.has.call(this, x)
      // (a set made of several lists: the test is each list's; the hit is the list's that holds the entry)
      if (ids.length === 1) return member(ids[0], x, found)
      for (const id of ids) member(id, x, found && S[id].entries.includes(x))
      return found
    })
    define(Symbol.iterator, function () {
      iterated(ids, this)
      return SP[Symbol.iterator].call(this)
    })
    readsAll(P, SP, ids, new Set(['has']))
    return P
  }

  // ---- patterns. One outcome a consumption: each call that hands the pattern a text (exec, test, a string's match,
  // matchAll, replace, replaceAll, search, split) records false where it found no match in it, true where it found one, and
  // a hit for each match it read. Test, match, replace and search run their own exec calls: those are the consumption's,
  // read when it ends (`frames`); matchAll and split match with a copy their species makes, so their matches are read off
  // the iterator, or found again by a plain copy; an exec the code calls itself is a consumption of its own (a loop's last
  // call, which finds none, one false). The pattern's source read (`.source`, its text) is a read: what is made of it no
  // site sees
  const RP = RegExp.prototype
  const rxExec = RP.exec
  const sourceOf = Object.getOwnPropertyDescriptor(RP, 'source').get
  const flagsOf = Object.getOwnPropertyDescriptor(RP, 'flags').get
  // (a match's hits: the entries whose alternatives its path went through (pattern.mjs): the shadow run at the match's place
  // on its text takes the same path, and an entry's capture is defined where its alternative was on it; an entry in a
  // repeated group, or every entry of a pattern with no shadow, a hit where the match's text holds its word. A match through
  // no entry is a hit of '(no entry)'; a shadow that did not take the match's path, '(unread)', its entries read by their
  // words)
  const shadows = new Map()
  const shadowOf = id => {
    if (shadows.has(id)) return shadows.get(id)
    const s = S[id]
    const fold = s.flags?.includes('i') ? x => x.toLowerCase() : x => x
    const words = (s.alts?.words ?? (s.entries ?? []).map(w => ({ w }))).map(x => ({ ...x, f: fold(x.w) }))
    const rx = s.alts?.shadow != null ? new RegExp(s.alts.shadow, `${s.flags.replace(/[gy]/g, '')}y`) : null
    const out = { fold, words, rx, marks: s.alts?.marks ?? [], plain: rx ? words.filter(x => x.rep && !x.look) : words.filter(x => x.look !== 'neg') }
    shadows.set(id, out)
    return out
  }
  const attribute = (id, m) => {
    const sh = shadowOf(id)
    const text = sh.fold(m[0])
    let any = false
    const byWord = xs => {
      for (const x of xs)
        if (text.includes(x.f)) {
          hit(id, x.w)
          any = true
        }
    }
    if (sh.rx && sh.words.some(x => !x.rep && (x.look === 'pos' || (!x.look && text.includes(x.f))))) {
      sh.rx.lastIndex = m.index
      const sm = rxExec.call(sh.rx, m.input)
      if (sm && sm.index === m.index && sm[0] === m[0]) {
        for (const [k, g] of sh.marks)
          if (sm[g] !== undefined) {
            hit(id, sh.words[k].w)
            any = true
          }
      } else {
        hit(id, '(unread)')
        byWord(sh.words.filter(x => !x.look && !x.rep))
      }
    }
    byWord(sh.plain)
    if (!any) hit(id, '(no entry)')
  }
  const consumed = (id, matches) => {
    outcome(id, matches.length > 0)
    for (const m of matches) attribute(id, m)
  }
  const frames = []
  const within = (id, rx, run) => {
    const frame = { rx, matches: [] }
    frames.push(frame)
    try {
      return run()
    } finally {
      frames.splice(frames.lastIndexOf(frame), 1)
      consumed(id, frame.matches)
    }
  }
  const reProto = id => {
    const P = Object.create(RP)
    Object.defineProperty(P, MARK, { value: [id] })
    const define = (name, fn) => Object.defineProperty(P, name, { value: fn, writable: true, configurable: true })
    define('exec', function (s) {
      const m = rxExec.call(this, s)
      const top = frames.at(-1)
      if (top?.rx === this) {
        if (m) top.matches.push(m)
      } else consumed(id, m ? [m] : [])
      return m
    })
    define('test', function (s) {
      return within(id, this, () => RP.test.call(this, s))
    })
    for (const k of [Symbol.match, Symbol.replace, Symbol.search])
      define(k, function (...a) {
        return within(id, this, () => RP[k].apply(this, a))
      })
    define(Symbol.matchAll, function* (s) {
      let any = false
      try {
        for (const m of RP[Symbol.matchAll].call(this, s)) {
          if (!any) {
            any = true
            outcome(id, true)
          }
          attribute(id, m)
          yield m
        }
      } finally {
        if (!any) outcome(id, false)
      }
    })
    define(Symbol.split, function (s, limit) {
      const out = RP[Symbol.split].call(this, s, limit)
      const copy = new RegExp(sourceOf.call(this), `${flagsOf.call(this).replace(/[gy]/g, '')}g`)
      consumed(id, [...String(s).matchAll(copy)])
      return out
    })
    Object.defineProperty(P, 'source', {
      get() {
        read(id, 'source')
        return sourceOf.call(this)
      },
      configurable: true,
    })
    return P
  }
  const protoFor = (key, make) => protos.get(key) ?? protos.set(key, make()).get(key)
  const marksOf = x => {
    if (!x || typeof x !== 'object') return null
    const p = Object.getPrototypeOf(x)
    return p?.[MARK] ?? null
  }

  const api = {
    map,
    lt: (id, a, b) => cmp(id, a, b, a < b),
    le: (id, a, b) => cmp(id, a, b, a <= b),
    gt: (id, a, b) => cmp(id, a, b, a > b),
    ge: (id, a, b) => cmp(id, a, b, a >= b),
    eq: (id, a, b) => outcome(id, a === b),
    ne: (id, a, b) => outcome(id, a !== b),
    // biome-ignore lint/suspicious/noDoubleEquals: the site's own operator, kept
    leq: (id, a, b) => outcome(id, a == b),
    // biome-ignore lint/suspicious/noDoubleEquals: the site's own operator, kept
    lne: (id, a, b) => outcome(id, a != b),
    mn: (id, ...args) => minmax(id, args, true),
    mx: (id, ...args) => minmax(id, args, false),
    v: (id, x) => {
      ran(recOf(id))
      return x
    },
    ls: (id, arr) => (Array.isArray(arr) ? Object.setPrototypeOf(arr, protoFor(`l${id}`, () => listProto(id))) : arr),
    st: (id, set) => (set instanceof Set ? Object.setPrototypeOf(set, protoFor(`s${id}`, () => setProto([id]))) : set),
    re: (id, rx) => (rx instanceof RegExp ? Object.setPrototypeOf(rx, protoFor(`r${id}`, () => reProto(id))) : rx),
    /** before a Set is made of other things (sites.mjs's `new Set(x)` edit): each list among them is iterated once by the
     *  making, which is no read of it */
    hush: (...sources) => {
      for (const s of sources) if (marksOf(s)) hushed.set(s, (hushed.get(s) ?? 0) + 1)
    },
    /** a Set made of other things: the lists among them (marked by their prototypes) give it their sites */
    ns: (set, ...sources) => {
      // (a source the making did not iterate after all: its hush taken back)
      for (const s of sources) if (hushed.has(s)) hushed.delete(s)
      const ids = [...new Set(sources.flatMap(s => marksOf(s) ?? []))].filter(id => S[id].kind !== 're').sort((a, b) => a - b)
      return ids.length ? Object.setPrototypeOf(set, protoFor(`s${ids.join(',')}`, () => setProto(ids))) : set
    },
    /** a module of the site map loaded (transform.mjs puts the call first in each): the modules an input exercised */
    loaded: path => {
      loaded.add(path)
    },
    /** the context the next cases are recorded with: a paper, a test */
    context: next => {
      ctx = Object.freeze({ ...ctx, ...next })
      if (next.paper) papers.add(next.paper)
    },
    get current() {
      return ctx
    },
    /** what is recorded so far, as a raw record (merge.mjs) */
    snapshot: (extra = {}) => {
      const sites = {}
      for (let id = 0; id < R.length; id++) {
        const r = R[id]
        if (!r) continue
        sites[id] = {
          n: r.n,
          t: r.t,
          f: r.f,
          ...(r.nan ? { nan: r.nan } : {}),
          ...(r.near[0] || r.near[1] ? { near: r.near } : {}),
          ...(r.tests[0] || r.tests[1] ? { tests: r.tests.map(s => (s ? { kept: [...s.kept], more: s.more } : null)) } : {}),
          ...(r.hits ? { hits: Object.fromEntries(r.hits) } : {}),
          ...(r.reads ? { reads: r.reads } : {}),
          ...(r.ps ? { ps: [...r.ps] } : {}),
        }
      }
      return { format: RAW_FORMAT, map: map.digest, input, file: ctx.file, pid: process.pid, paper: ctx.paper, papers: [...papers], argv: process.argv.slice(1), ms: Math.round(performance.now() - t0), ...extra, loaded: [...loaded].sort(), sites }
    },
    /** the record written under AXT_RULES_OUT (or `out`), with `extra` fields (vitest-setup.mjs: `labRead`), and the
     *  recorder emptied */
    flush: (label = null, extra = {}) => {
      if (!out) return null
      const snap = api.snapshot(extra)
      if (!Object.keys(snap.sites).length && !snap.loaded.length) return null
      mkdirSync(out, { recursive: true })
      const name = `${(label ?? ctx.paper ?? 'run').replace(/[^\w.-]+/g, '_')}-${process.pid}-${flushes++}.json`
      writeFileSync(join(out, name), JSON.stringify(snap))
      R.fill(undefined)
      loaded.clear()
      return join(out, name)
    },
  }
  return api
}

/** the process's recorder, made once from AXT_RULES_SITES (the site map) and AXT_RULES_OUT (where records go); the paper
 *  from AXT_RULES_PAPER or the runner's `--id=`; the input from `input` (vitest-setup.mjs: `tests`), else AXT_RULES_INPUT */
export function install({ input = null } = {}) {
  if (globalThis.__axtRules) return globalThis.__axtRules
  const sites = process.env.AXT_RULES_SITES
  if (!sites) throw new Error('lab/rules: AXT_RULES_SITES (the site map, sites.json) is not set')
  const map = JSON.parse(readFileSync(sites, 'utf8'))
  const paper = process.env.AXT_RULES_PAPER ?? process.argv.find(a => a.startsWith('--id='))?.slice(5) ?? null
  // (the input a record is of: `tests`, `corpus` (the default), `holdout`, as the run says)
  globalThis.__axtRules = recorderOf(map, { out: process.env.AXT_RULES_OUT ?? null, paper, input: input ?? process.env.AXT_RULES_INPUT ?? 'corpus' })
  return globalThis.__axtRules
}
