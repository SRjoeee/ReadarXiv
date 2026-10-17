// The served faces as the engine asks for them (its `faceSources`, the layer-only plan §6): a face's slices, each a file on
// our site and the code points it holds, read from the static faces' table our site serves (`/static-fonts/index.json` and `/static-fonts/<group>.json`, the web's build's own tables):
//
//   GET <api>/static-fonts/index.json                  { schema: 1, fonts, faces: { <face id>: { group }, … }, … }
//   GET <api>/static-fonts/<group>.json?fonts=<fonts>  { schema: 1, group, slices: [[start, end, …], …], faces: { <face id>: [{ path } | null, …] }, … }
//
// a group's table asked with the index's FONTS, as the web asks it (web/src/layer/faces.ts tableUrlsOf): the tables are
// immutable for a year and change only with FONTS, so that a browser holding one of another FONTS asks again
//
// each slice's file at `<api>/<path>` (`static-fonts/<16 hex>.woff2`). Only those fields are read; what else a table holds is
// another reader's. The index is read once a visit, a group's table the first time one of its faces is asked, each within its
// bounds; one that fails is forgotten, so that a later ask reads it again. The engine decides what a face it cannot have means
// (its units stay the original's): a face the index does not serve has no sources (null), and a table not to be had rejects.
// Nothing here fetches a font or makes a face: the engine loads the slices its text needs.
import { bodyWithin } from './server'

/** the index's bytes at most (the FONTS 4 table is 13 KB), a group's (the largest, a CJK group's, is 183 KB) */
export const INDEX_CAP = 256 * 1024
export const GROUP_CAP = 2 * 1024 * 1024
/** how long a table may take before it is given up: the engine waits for a face's sources before it lays the units set in it */
export const TABLE_MS = 20_000
const GROUP = /^[a-z0-9-]{1,40}$/
/** the tables' FONTS as the index names it (a version: `4`) */
const FONTS = /^[A-Za-z0-9._-]{1,32}$/
const FILE = /^static-fonts\/[0-9a-f]{16}\.woff2$/

export type FaceSources = (id: string) => Promise<readonly { url: string; ranges: readonly number[] }[] | null>

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
async function tableOf(f: typeof fetch, url: string, cap: number): Promise<unknown> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error(`${url} did not come within ${TABLE_MS} ms`)), TABLE_MS)
  try {
    const r = await f(url, { signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!r.ok) { void r.body?.cancel().catch(() => {}); throw new Error(`the faces' table ${url} answered ${r.status}`) }
    // (read as it comes, in bytes, and let go at the cap: a body with no length, or another than it says, is never read whole)
    const bytes = await bodyWithin(r, cap).catch((e: Error) => { throw new Error(`the faces' table ${url}: ${e.message}`) })
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } finally {
    clearTimeout(timer)
  }
}

/** the code points of a slice as the engine takes them, flat [start, end] pairs, or null */
function rangesOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.length || v.length % 2) return null
  for (let i = 0; i < v.length; i += 2) {
    const a = v[i], b = v[i + 1]
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b > 0x10ffff) return null
  }
  return v as number[]
}

/** the engine's faceSources over the served table at `api` (an origin) */
export function servedFaces(api: string, f: typeof fetch = (...a) => fetch(...a)): FaceSources {
  let index: Promise<{ faces: Record<string, unknown>; fonts: string | null }> | null = null
  const groups = new Map<string, Promise<{ slices: number[][]; faces: Record<string, unknown> }>>()
  const once = <T>(p: Promise<T>, forget: () => void) => { p.catch(forget); return p }
  const theIndex = () => (index ??= once((async () => {
    const v = await tableOf(f, `${api}/static-fonts/index.json`, INDEX_CAP)
    if (!isObject(v) || v.schema !== 1 || !isObject(v.faces)) throw new Error('the faces\' index is of another shape')
    return { faces: v.faces, fonts: typeof v.fonts === 'string' && FONTS.test(v.fonts) ? v.fonts : null }
  })(), () => { index = null }))
  const theGroup = (name: string, fonts: string | null) => {
    let g = groups.get(name)
    if (!g) {
      g = once((async () => {
        const v = await tableOf(f, `${api}/static-fonts/${name}.json${fonts === null ? '' : `?fonts=${encodeURIComponent(fonts)}`}`, GROUP_CAP)
        if (!isObject(v) || v.schema !== 1 || v.group !== name || !Array.isArray(v.slices) || !isObject(v.faces)) throw new Error(`the faces' table ${name} is of another shape`)
        const slices = v.slices.map(rangesOf)
        if (slices.some(s => s === null)) throw new Error(`the faces' table ${name}: a slice of another shape`)
        return { slices: slices as number[][], faces: v.faces }
      })(), () => { if (groups.get(name) === g) groups.delete(name) })
      groups.set(name, g)
    }
    return g
  }
  return async id => {
    const { faces, fonts } = await theIndex()
    const entry = Object.hasOwn(faces, id) ? faces[id] : undefined
    if (!isObject(entry) || typeof entry.group !== 'string' || !GROUP.test(entry.group)) return null
    const g = await theGroup(entry.group, fonts)
    const files = Object.hasOwn(g.faces, id) ? g.faces[id] : undefined
    if (!Array.isArray(files)) throw new Error(`the faces' table ${entry.group} holds no files of ${id}`)
    const out: { url: string; ranges: readonly number[] }[] = []
    g.slices.forEach((ranges, i) => {
      const file = files[i]
      if (isObject(file) && typeof file.path === 'string' && FILE.test(file.path)) out.push({ url: `${api}/${file.path}`, ranges })
    })
    return out
  }
}
