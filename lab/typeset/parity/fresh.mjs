// lab/typeset/parity/fresh.mjs: the parity's fresh rows (lane parity-fresh). The sheet lays v2 with today's stored replies (the
// door's rows), which serve v2's unit only where v2 cuts it as today did: a unit v2 holds otherwise (an identifier now an
// element, a bold run stated as a group, a figure line joined, a unit today never had) has no stored row that says it, and
// v2 was drawn there as the original's, which a reader of the site never sees. So each such member is laid with the row a
// reader gets: the translate package's own chain (packages/translate chainOf: the wire, the read, `accept`, the groups placed,
// the runs floor) over the keyless Microsoft adapter, production's default lane, through a cache in lab-data keyed by the
// chain's own key (`keyOf`: translator identity, target, the wire's digest), so that each wire is asked of the endpoint once
// ever and every later sheet is drawn offline. Today's side keeps its stored rows. Filling the cache is its own step
// (v2.mjs --fresh=fill): a run that is not told to fill never asks the network, and names the rows its cache lacks.
// Lab-data only: the cache holds the papers' text.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chainOf, Fault, keyOf, microsoft, unitInOf } from '../../../packages/translate/src/index.ts'
import { LAB } from '../../../packages/typeset/tests/replay/tap.ts'

/** the cache: AXT_PARITY_FRESH_ROWS, else lab-data's parity/fresh-rows */
export const FRESH_ROWS = process.env.AXT_PARITY_FRESH_ROWS || join(LAB, 'refactor-2026-11', 'parity', 'fresh-rows')
/** the project's User-Agent, as every lab probe of a translator sends it */
export const UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
/** the fill's pace: one request at a time, this long apart (the free endpoint is the product's real bottleneck) */
export const FILL_PACE_MS = 1500

const sha = (s) => createHash('sha256').update(s).digest('hex')
const fileOf = (dir, key) => {
  const h = sha(key)
  return join(dir, h.slice(0, 2), `${h}.json`)
}
/** the cache's entry of a chain key: `{ key, wire, raw }`, the raw reply the endpoint gave that wire; null where none */
export function cachedOf(dir, key) {
  const f = fileOf(dir, key)
  if (!existsSync(f)) return null
  const e = JSON.parse(readFileSync(f, 'utf8'))
  return e?.key === key && typeof e.raw === 'string' ? e : null
}
function record(dir, key, wire, raw) {
  const f = fileOf(dir, key)
  mkdirSync(join(f, '..'), { recursive: true })
  const tmp = `${f}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ key, wire, raw, at: new Date().toISOString() })}\n`)
  renameSync(tmp, f)
}

/** the cache as the chain's Store (packages/translate contract.ts): a key's raw reply, whatever its judgement; a write keeps
 *  what is already there (the translator below records every reply as it comes) */
export function folderStore(dir) {
  return {
    read: async (keys) => keys.map((k) => cachedOf(dir, k)?.raw ?? null),
    write: async (entries) => {
      for (const [k, v] of entries) if (!cachedOf(dir, k)) record(dir, k, null, v)
    },
  }
}

/**
 * `base` (a translator of the package) with its requests answered from the cache `dir` first: a wire the cache holds is given
 * its recorded reply, accepted or not, so that a refusal is replayed as one; one it lacks is sent to the endpoint only where
 * `fill`, its reply recorded under the chain's key before the chain reads it, else the request fails over to the caller as
 * unavailable (Fault 'pass': no backoff, no cooldown) and its key is named in `missed`. The identity, digest, limits and the
 * read are the base's, so the keys are the chain's own.
 */
export function cachedTranslator(base, { dir, fill = false }) {
  const missed = new Set()
  const asked = []
  return {
    ...base,
    missed,
    asked,
    async *send(wires, call, signal) {
      const keys = wires.map((w) => keyOf(base, call.target, w, call.context))
      const left = []
      for (const [i, k] of keys.entries()) {
        const e = cachedOf(dir, k)
        if (e) yield [i, e.raw]
        else left.push(i)
      }
      if (!left.length) return
      if (!fill) {
        for (const i of left) missed.add(keys[i])
        throw new Fault('pass', 'network', `parity fresh rows: ${left.length} wires not in the cache (no fill asked)`)
      }
      asked.push(left.length)
      for await (const [j, raw] of base.send(
        left.map((i) => wires[i]),
        call,
        signal,
      )) {
        const i = left[j]
        record(dir, keys[i], wires[i], raw)
        yield [i, raw]
      }
    },
  }
}

/** the platform's fetch with the project's User-Agent, one request at a time `pace` ms apart (the fill's alone) */
export function pacedFetch(pace = FILL_PACE_MS) {
  let last = 0
  let queue = Promise.resolve()
  return (url, init) => {
    const go = queue.then(async () => {
      const wait = last + pace - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      try {
        const r = await fetch(url, { method: init.method, headers: { ...init.headers, 'User-Agent': UA }, body: init.body, signal: init.signal })
        const text = await r.text()
        return { ok: r.ok, status: r.status, headers: { get: (k) => r.headers.get(k) }, text: async () => text }
      } finally {
        last = Date.now()
      }
    })
    queue = go.catch(() => {})
    return go
  }
}

/** the translator the fresh rows come from: Microsoft's keyless adapter (production's default lane), one request in flight,
 *  over the cache; it fetches only where `fill` */
export function freshTranslator(dir = FRESH_ROWS, { fill = false, fetch: f } = {}) {
  const none = async () => {
    throw new Error('parity fresh rows: no network outside the fill')
  }
  return cachedTranslator(microsoft({ fetch: fill ? (f ?? pacedFetch()) : none, limits: { inFlight: 1 } }), { dir, fill })
}

/**
 * The fresh rows of `units` (the bundle's units, format's shape) into `target`, through the chain over `translator`
 * (freshTranslator's, or any made by cachedTranslator) with the cache as its store: `rows` id -> the chain's Result (ok or
 * not), `missing` the ids whose wire the cache lacks (a run not told to fill), `asked` how many wires went to the endpoint
 */
export async function freshRowsOf(units, target, { dir = FRESH_ROWS, translator } = {}) {
  const t = translator ?? freshTranslator(dir)
  const rows = new Map()
  const ins = [...new Map(units.map((u) => [u.id, u])).values()].map(unitInOf)
  for await (const r of chainOf({ store: folderStore(dir) }).translate(ins, target, { translators: [t] })) rows.set(r.id, r)
  // (unavailable: the cache holds no reply of its wire, a run not told to fill, or the endpoint did not answer the fill)
  const missing = [...rows.values()].filter((r) => !r.ok && r.why.kind === 'unavailable').map((r) => r.id)
  return { rows, missing, asked: (t.asked ?? []).reduce((a, b) => a + b, 0) }
}

/**
 * The members laid with a fresh row, over `members` (every member of the paper's parts, once): ord -> `{ id, cause }`.
 * `rows` the entry's rows (gate-l1.ts: get by unit id; kept; `said`, the ids whose row is today's row of another unit said in
 * v2's: today's flat text of a figure text v2 holds a group in, a unit whose kept runs v2 holds as elements); `units` the
 * bundle's units by id; `decided(m)` whether today's own group decision kept the member's unit (its door row `kept`, the reply
 * not stored: a table's cell today left the original's by its group). Causes: 'no-row', a text no stored row serves (v2.mjs's
 * `noRow` before this lane); 'group', a cell today's group decision kept, so that v2's own decision runs on what the site
 * would get (the coordinator's ruling of 2026-11-11: the stored rows hold no reply of it, so like-for-like is not to be had);
 * 'unit', a text whose stored row answered another unit than v2's. A member the prepare states a reason for (`why`), or the
 * paper keeps, is sent nothing.
 */
export function freshNeeds(members, rows, units, { decided = () => false } = {}) {
  const out = new Map()
  for (const m of members) {
    if (typeof m.text !== 'string' || m.why || rows.kept?.(m.text) || !units.has(m.text)) continue
    if (!rows.get(m.text)) out.set(m.ord, { id: m.text, cause: decided(m) ? 'group' : 'no-row' })
    else if (rows.said?.(m.text)) out.set(m.ord, { id: m.text, cause: 'unit' })
  }
  return out
}

/** `rows` with each id of `fresh` (id -> the chain's Result) answered by its fresh row where that is a translation; every
 *  other id, and `rows` itself where `fresh` is null, as they are */
export function withFresh(rows, fresh) {
  if (!fresh || !rows) return rows
  return {
    ...rows,
    get(k) {
      const r = fresh.get(k)
      return r?.ok ? r : rows.get(k)
    },
  }
}
