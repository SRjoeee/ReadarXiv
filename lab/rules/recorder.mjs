// lab/rules/recorder.mjs: the rule ledger's instrument, its run-time half (design-reduction-2026-11-13.md §3c, R4). The
// instrumented code (transform.mjs, the site map of sites.mjs) calls `globalThis.__axtRules` at each site; this records,
// per site: how often it ran and each outcome's count; for a comparison and a Math.min / max, the nearest case on each
// side of the bound (the rule's value): the effective operand (the value of the rule's literal or constant at which that
// case would decide the other way), the paper (or the test) and the run's ordinal; for a list, each entry's hits; for
// each outcome, the tests that took it. Writes one raw record a process (or a test file) under AXT_RULES_OUT; merge.mjs
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
  let ctx = Object.freeze({ paper, test: null })
  let flushes = 0
  const t0 = performance.now()

  const recOf = id => (R[id] ??= { n: 0, t: 0, f: 0, nan: 0, near: [null, null], tests: [null, null], hits: null, reads: null })
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
    if (!cur || d < cur.d) r.near[slot] = { d, eff, x: other, b: side, k: r.n, paper: ctx.paper, test: ctx.test }
  }
  const cmp = (id, a, b, result) => {
    const r = recOf(id)
    r.n++
    if (result) r.t++
    else r.f++
    const bd = S[id].bounds[0]
    if (bd) near(id, r, result, bd.at === 'left' ? b : a, bd.at === 'left' ? a : b)
    noteTest(r, result ? 1 : 0)
    return result
  }
  const outcome = (id, result) => {
    const r = recOf(id)
    r.n++
    if (result) r.t++
    else r.f++
    noteTest(r, result ? 1 : 0)
    return result
  }
  /** Math.min / Math.max: the bound decided where it is strictly beyond every other argument */
  const minmax = (id, args, min) => {
    const res = min ? Math.min(...args) : Math.max(...args)
    const r = recOf(id)
    r.n++
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
    // (a test by a predicate: each entry it holds true is a hit; the call's outcome is whether any was)
    for (const name of ['some', 'find', 'findIndex', 'findLast', 'findLastIndex', 'filter', 'every'])
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
    for (const name of ['forEach', 'map', 'join', 'reduce', 'slice', 'concat', 'flatMap'])
      define(name, function (...a) {
        read(id, name)
        return A[name].apply(this, a)
      })
    define(Symbol.iterator, function () {
      read(id, 'iterate')
      return A[Symbol.iterator].call(this)
    })
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
    for (const name of ['forEach', 'values', 'keys', 'entries'])
      define(name, function (...a) {
        for (const id of ids) read(id, name)
        return SP[name].apply(this, a)
      })
    define(Symbol.iterator, function () {
      for (const id of ids) read(id, 'iterate')
      return SP[Symbol.iterator].call(this)
    })
    return P
  }
  const RP = RegExp.prototype
  const entryOf = (id, text) => {
    // (the alternative a match stands for: the longest of the list's entries its text holds)
    const s = S[id]
    const t = s.flags?.includes('i') ? text.toLowerCase() : text
    let best = null
    for (const e of s.entries) {
      const w = s.flags?.includes('i') ? e.toLowerCase() : e
      if (t.includes(w) && (!best || w.length > best.length)) best = e
    }
    return best
  }
  const matched = (id, m) => {
    outcome(id, m !== null)
    if (m) hit(id, entryOf(id, m[0]) ?? '(no entry)')
    return m
  }
  const reProto = id => {
    const P = Object.create(RP)
    Object.defineProperty(P, MARK, { value: [id] })
    Object.defineProperty(P, 'exec', {
      value: function (s) {
        return matched(id, RP.exec.call(this, s))
      },
      writable: true,
      configurable: true,
    })
    // (matchAll matches with a copy its species makes, which is RegExp's: its matches are read off the iterator)
    Object.defineProperty(P, Symbol.matchAll, {
      value: function* (s) {
        for (const m of RP[Symbol.matchAll].call(this, s)) {
          matched(id, m)
          yield m
        }
      },
      writable: true,
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
      recOf(id).n++
      return x
    },
    ls: (id, arr) => (Array.isArray(arr) ? Object.setPrototypeOf(arr, protoFor(`l${id}`, () => listProto(id))) : arr),
    st: (id, set) => (set instanceof Set ? Object.setPrototypeOf(set, protoFor(`s${id}`, () => setProto([id]))) : set),
    re: (id, rx) => (rx instanceof RegExp ? Object.setPrototypeOf(rx, protoFor(`r${id}`, () => reProto(id))) : rx),
    /** a Set made of other things: the lists among them (marked by their prototypes) give it their sites */
    ns: (set, ...sources) => {
      const ids = [...new Set(sources.flatMap(s => marksOf(s) ?? []))].filter(id => S[id].kind !== 're').sort((a, b) => a - b)
      return ids.length ? Object.setPrototypeOf(set, protoFor(`s${ids.join(',')}`, () => setProto(ids))) : set
    },
    /** the context the next cases are recorded with: a paper, a test */
    context: next => {
      ctx = Object.freeze({ ...ctx, ...next })
    },
    get current() {
      return ctx
    },
    /** what is recorded so far, as a raw record (merge.mjs) */
    snapshot: () => {
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
        }
      }
      return { format: RAW_FORMAT, map: map.digest, input, pid: process.pid, paper: ctx.paper, argv: process.argv.slice(1), ms: Math.round(performance.now() - t0), sites }
    },
    /** the record written under AXT_RULES_OUT (or `out`), and the recorder emptied */
    flush: (label = null) => {
      if (!out) return null
      const snap = api.snapshot()
      if (!Object.keys(snap.sites).length) return null
      mkdirSync(out, { recursive: true })
      const name = `${(label ?? ctx.paper ?? 'run').replace(/[^\w.-]+/g, '_')}-${process.pid}-${flushes++}.json`
      writeFileSync(join(out, name), JSON.stringify(snap))
      R.fill(undefined)
      return join(out, name)
    },
  }
  return api
}

/** the process's recorder, made once from AXT_RULES_SITES (the site map) and AXT_RULES_OUT (where records go); the paper
 *  from AXT_RULES_PAPER or the runner's `--id=`; the input from AXT_RULES_INPUT */
export function install() {
  if (globalThis.__axtRules) return globalThis.__axtRules
  const sites = process.env.AXT_RULES_SITES
  if (!sites) throw new Error('lab/rules: AXT_RULES_SITES (the site map, sites.json) is not set')
  const map = JSON.parse(readFileSync(sites, 'utf8'))
  const paper = process.env.AXT_RULES_PAPER ?? process.argv.find(a => a.startsWith('--id='))?.slice(5) ?? null
  // (the input a record is of: `tests`, `corpus` (the default), `holdout`, as the run says)
  globalThis.__axtRules = recorderOf(map, { out: process.env.AXT_RULES_OUT ?? null, paper, input: process.env.AXT_RULES_INPUT ?? 'corpus' })
  return globalThis.__axtRules
}
