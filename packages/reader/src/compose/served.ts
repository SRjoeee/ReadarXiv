// The served faces and the typesetter's Metrics over them (the default engine's: compose/typeset.ts). The faces are the files
// our site serves, as today's reader reads them (src/pdf-reader/session/faces.ts servedFaces, layer-proto/fonts.mjs sliceFace):
//
//   GET /static-fonts/index.json                  { schema: 1, fonts, faces: { <face id>: { group }, … } }
//   GET /static-fonts/<group>.json?fonts=<fonts>  { schema: 1, group, slices: [[start, end, …], …], faces: { <id>: [{ path } | null, …] } }
//   GET /<path>                                   a slice's woff2 (`static-fonts/<16 hex>.woff2`)
//   GET /hyph/<lang>.json                         a language's hyphenation patterns ({ patterns, exceptions })
//
// every one through the host's fetch, a path its fetch resolves against our server (the website's origin; the extension's our
// server's). Each is asked as every ask of our server is (session/client.ts `request`): its answer and its body within
// REQUEST_MS, the network, a 5xx or nothing in time asked once more after RETRY_MS; and any other answer but the file, a 404
// or a 410 (a 408 or 429 above all: our site's visitor limit) asked once more after its Retry-After, BUSY_MAX_MS at most
// (RETRY_MS where it names none). A 404, a 410 or a table of another shape is not there; anything else that fails is a failure
// for now. A table (the index, a group's, a language's patterns) is asked once a visit: one not there, or failing for now, is
// none for the visit (the faces it would give lost, told once each; the language hyphenates nothing). A slice is fetched as
// data and made a FontFace of its face's family, weight and style, its code points as its unicode-range (never imported:
// compose/faces.ts says why), added to the document with the other slices of the ask that needs it, in one stretch once they
// are all in (`addIn`: one change of the document's fonts an ask), while the reader lives, and taken out with it; one not there
// is lost at once, one failing for now asked again by the next wave that wants it, and lost if it fails again.
// A face is the typesetter's font string (typeset types.ts FaceId: `400 100px "axt-nimbus-roman", "axt-lm-math"`), each family
// the catalogue's (typeset data/faces.ts FACES), never a system face nor a generic family.
//
// The Metrics measure as lane L7's spec for the reader says (lanes/L7-converge.md "The reader's own Metrics", held in a browser
// by lab/typeset/metrics-browser.mjs's `rules` mode, equal to the measurer on 98,862 of 98,862): a text cut where its
// characters' slice changes (the first family of the string whose face, by CSS's matching, has a slice declaring the
// character), each run measured alone in the font string without small capitals, a run of CJK characters unkerned and cut
// between two adjacent CJK punctuation marks (no text-spacing-trim), the runs' widths summed; the ink their highest ascent,
// deepest descent and furthest right. `ready` is true where every slice the text needs is loaded, 'never' where a character is
// in no slice of the string's faces (a face whose table cannot be had holds none), or its slice is lost (an answer no ask would
// mend, or a failure met twice), else false: the typesetter waits for the face (the page's `wait.faces`), and the composer asks
// it here (`faces.ready`), whose answer is each face's table read or found not to be had, never a wait asked again at once.
import { FACES, hyphenationOf, type Metrics, type Patterns } from '@readarxiv/typeset'
import { type Fetch, realTimers, type Timers } from '../bytes/source.ts'
import { bodyWithin, RETRY_MS, request } from '../session/client.ts'
import { type Faces, WAVE_SLOTS } from './faces.ts'
import type { FaceId } from './page.ts'

/** the index's bytes at most (the FONTS 6 table is 13 KB), a group's (the largest, a CJK group's, is 183 KB), a language's
 *  patterns (German's, 90 KB), a slice's */
const CAPS = { index: 256 * 1024, group: 2 * 1024 * 1024, hyph: 1024 * 1024, slice: 4 * 1024 * 1024 }
const GROUP = /^[a-z0-9-]{1,40}$/
const FONTS = /^[A-Za-z0-9._-]{1,32}$/
const FILE = /^static-fonts\/[0-9a-f]{16}\.woff2$/
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

/** the longest Retry-After waited for before the one more ask: our site's visitor limit's own (readarxiv-web
 *  worker/src/rate-limit.ts LIMIT_PERIOD_S, the longest its count takes to fall below the limit again) */
export const BUSY_MAX_MS = 60_000

/** a pseudo-face the default engine's lay waits on while a language's patterns come (compose/typeset.ts): `ready` loads them */
export const HYPH_WAIT = 'axt-hyph'
/** the face the overlay's text rendering is probed in (Faces.probeFace, text-rendering.ts): Computer Modern's serif, the
 *  served Latin face of the most papers' text (TeX's default, the role table's `cm` design) */
export const PROBE_FACE = '400 100px "axt-cmun-serif"'

interface Slice {
  key: string
  path: string
  ranges: readonly number[]
}
interface ServedFace {
  id: string
  family: string
  weight: number
  style: 'normal' | 'italic'
  /** null until its group's table is read */
  slices: Slice[] | null
}
/** a run of a text: one slice's characters (a CJK run apart), its face */
interface Run {
  slice: Slice
  face: ServedFace
  text: string
  cjk: boolean
}

/** a character of the CJK scripts, set unkerned in a run of its own */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef\u30fc]/u
/** the CJK punctuation Chrome's text-spacing-trim narrows where two stand together: a CJK run is cut between two of them */
const PUNCT = /[\u3001-\u3003\u3008-\u3011\u3014-\u301f\u30fb\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]/u
const inRanges = (r: readonly number[], cp: number) => {
  for (let i = 0; i + 1 < r.length; i += 2) if (cp >= (r[i] as number) && cp <= (r[i + 1] as number)) return true
  return false
}
const hex = (n: number) => n.toString(16).toUpperCase()
/** a slice's unicode-range descriptor from its [start, end] pairs (today's layer-proto/fonts.mjs unicodeRangeOf) */
export const unicodeRangeOf = (ranges: readonly number[]): string => {
  const out: string[] = []
  for (let i = 0; i + 1 < ranges.length; i += 2) {
    const a = ranges[i] as number,
      b = ranges[i + 1] as number
    out.push(a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)
  }
  return out.join(', ')
}

/** a canvas font string read: its style, small capitals, weight, size and families */
export function parseFont(font: string): {
  style: 'normal' | 'italic'
  caps: boolean
  weight: number
  px: number
  families: string[]
} | null {
  const m = /^(italic )?(small-caps )?(?:(\d+) |(bold) )?([\d.]+)px (.+)$/.exec(font)
  if (!m) return null
  const families = [...(m[6] as string).matchAll(/"([^"]+)"|([^,\s][^,]*)/g)].map((x) => (x[1] ?? x[2] ?? '').trim())
  return {
    style: m[1] ? 'italic' : 'normal',
    caps: !!m[2],
    weight: m[3] ? Number(m[3]) : m[4] ? 700 : 400,
    px: Number(m[5]),
    families,
  }
}

/** CSS's face matching within a family: the style asked (else normal, else any), then the weight asked, else the nearest lighter
 *  one first for 500 and under, heavier first over 500 */
function faceOf(list: readonly ServedFace[], weight: number, style: string): ServedFace | undefined {
  const styled = list.filter((f) => f.style === style)
  const normal = list.filter((f) => f.style === 'normal')
  const pool = styled.length ? styled : normal.length ? normal : list
  const exact = pool.find((f) => f.weight === weight)
  if (exact) return exact
  const lighter = pool.filter((f) => f.weight < weight).sort((a, b) => b.weight - a.weight)
  const heavier = pool.filter((f) => f.weight > weight).sort((a, b) => a.weight - b.weight)
  return (weight <= 500 ? [...lighter, ...heavier] : [...heavier, ...lighter])[0]
}

/** the parts a text is measured in: [the font string without small capitals, text, unkerned] */
export function partsOf(font: string, runs: readonly { text: string; cjk: boolean }[]): [string, string, boolean][] {
  const out: [string, string, boolean][] = []
  const plain = font.replace(/^(italic )?small-caps /, '$1')
  for (const r of runs) {
    if (!r.cjk) {
      out.push([plain, r.text, false])
      continue
    }
    let cur = '',
      prev = ''
    for (const ch of r.text) {
      if (cur && PUNCT.test(prev) && PUNCT.test(ch)) {
        out.push([plain, cur, true])
        cur = ''
      }
      cur += ch
      prev = ch
    }
    out.push([plain, cur, true])
  }
  return out
}

/** what the served faces need of the browser: a canvas measure, and a FontFace made from a slice's bytes (a test's own) */
export interface Platform {
  measure(
    font: string,
    text: string,
    unkerned: boolean,
  ): { width: number; ascent: number; descent: number; right: number }
  face(
    family: string,
    bytes: BufferSource,
    d: { weight: string; style: string; unicodeRange: string },
  ): Promise<FontFaceLike>
}
export interface FontFaceLike {
  add(): void
  remove(): void
}
/** the browser's: a canvas element's 2D context (OffscreenCanvas is not in every browser the website serves), the document's
 *  fonts */
export function browserPlatform(): Platform {
  let ctx: CanvasRenderingContext2D | null = null
  const fin = (v: number) => (Number.isFinite(v) ? v : 0)
  return {
    measure(font, text, unkerned) {
      ctx ??= document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
      ctx.font = font
      ctx.fontKerning = unkerned ? 'none' : 'normal'
      const m = ctx.measureText(text)
      return {
        width: m.width,
        ascent: fin(m.actualBoundingBoxAscent),
        descent: fin(m.actualBoundingBoxDescent),
        right: fin(m.actualBoundingBoxRight),
      }
    },
    async face(family, bytes, d) {
      const f = new FontFace(family, bytes, d)
      await f.load()
      return { add: () => document.fonts.add(f), remove: () => document.fonts.delete(f) }
    },
  }
}

export interface Served {
  /** the typesetter's Metrics over the faces loaded */
  readonly metrics: Metrics
  /** the composer's faces: a font string's class and family, its slices for a text loaded (`[face, text]`) */
  readonly faces: Faces
  /** the hyphenation patterns of `langs`, each as the typesetter reads it (hyphenationOf), null where it cannot be had */
  hyph(langs: readonly string[]): Promise<Record<string, Patterns | null>>
  /** the patterns of a language read already (null: none to be had), undefined while not */
  hyphNow(lang: string): Patterns | null | undefined
  /** the tables these font strings' faces need read ahead (the faces' index, their groups'), no slice: so that a page's first
   *  slices wait for no table */
  warm(fonts: readonly string[]): Promise<void>
}

class Answer extends Error {
  readonly status: number
  constructor(status: number) {
    super(`answered ${status}`)
    this.status = status
  }
}
/** a 404 or a 410: not there, and will not be (anything else may pass) */
const lasting = (e: unknown) => e instanceof Answer && (e.status === 404 || e.status === 410)
/** an answer under 500 that is not the file and may pass (a 408 or 429 above all): the wait before its one more ask, its
 *  Retry-After (seconds or a date) at most BUSY_MAX_MS, RETRY_MS where it names none */
function againAfter(r: Response): number | null {
  if (r.ok || r.status === 404 || r.status === 410) return null
  const v = r.headers.get('retry-after')?.trim() ?? ''
  const ms = /^\d+$/.test(v) ? Number(v) * 1000 : v ? Date.parse(v) - Date.now() : Number.NaN
  return Number.isFinite(ms) ? Math.min(BUSY_MAX_MS, Math.max(0, ms)) : RETRY_MS
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
function rangesOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.length || v.length % 2) return null
  for (let i = 0; i < v.length; i += 2) {
    const a = v[i],
      b = v[i + 1]
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b > 0x10ffff) return null
  }
  return v as number[]
}

export function createServed(o: {
  fetch: Fetch
  root: HTMLElement
  platform?: Platform
  warn?(what: string, e: unknown): void
  /** a face lost (one of its slices, or its table), told once a face */
  lost?(id: FaceId): void
  /** the clock the tables' asks are bounded by and paused on (a test's own) */
  timers?: Timers
}): Served {
  const P = o.platform ?? browserPlatform()
  // (the reader closed: a table's ask let go, its pause before the next ask too)
  const closed = new AbortController()
  const ask = { fetch: o.fetch, signal: closed.signal, timers: o.timers ?? realTimers }
  let gone = false
  /** a file of our site's within `cap` bytes, as the header says it is asked; an Answer thrown where the last answer is not it */
  const fileOf = async (url: string, cap: number): Promise<Uint8Array<ArrayBuffer>> => {
    const got = await request(
      ask,
      url,
      {},
      async (r) => {
        if (r.ok) return bodyWithin(r, cap)
        void r.body?.cancel().catch(() => {})
        return r.status
      },
      againAfter,
    )
    if (typeof got === 'number') throw new Answer(got)
    return got
  }
  /** a table of our site's read by `shape`, or null where it cannot be had (warned): not there (a 404, a 410, a body past
   *  `cap`, not JSON, of another shape) at once, else once it fails again */
  const tableOf = async <T>(what: string, url: string, cap: number, shape: (v: unknown) => T): Promise<T | null> => {
    try {
      return shape(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await fileOf(url, cap))))
    } catch (e) {
      if (!gone) o.warn?.(what, e)
      return null
    }
  }
  // ---- the catalogue: each family's faces, their slices once their group's table is read
  const families = new Map<string, ServedFace[]>()
  const byId = new Map<string, ServedFace>()
  for (const [id, f] of Object.entries(FACES)) {
    const face: ServedFace = { id, family: f.family, weight: f.weight, style: f.style, slices: null }
    byId.set(id, face)
    const list = families.get(f.family) ?? []
    list.push(face)
    families.set(f.family, list)
  }
  // (each table asked once a visit: its answer, or null where it cannot be had, kept)
  let index: Promise<{ groups: Record<string, string>; fonts: string | null } | null> | null = null
  const groups = new Map<string, Promise<boolean>>()
  const theIndex = () =>
    (index ??= tableOf("the faces' index", '/static-fonts/index.json', CAPS.index, (v) => {
      if (!isObject(v) || v.schema !== 1 || !isObject(v.faces)) throw new Error("the faces' index is of another shape")
      const out: Record<string, string> = {}
      for (const [id, e] of Object.entries(v.faces))
        if (isObject(e) && typeof e.group === 'string' && GROUP.test(e.group)) out[id] = e.group
      return { groups: out, fonts: typeof v.fonts === 'string' && FONTS.test(v.fonts) ? v.fonts : null }
    }))
  /** a face's group read: every face of the group given its slices (a face the group holds none of: none); false where the
   *  table cannot be had */
  const theGroup = (name: string, fonts: string | null) => {
    let g = groups.get(name)
    if (!g) {
      const url = `/static-fonts/${name}.json${fonts === null ? '' : `?fonts=${encodeURIComponent(fonts)}`}`
      g = tableOf(`the faces' table ${name}`, url, CAPS.group, (v) => {
        if (!isObject(v) || v.schema !== 1 || v.group !== name || !Array.isArray(v.slices) || !isObject(v.faces))
          throw new Error(`the faces' table ${name} is of another shape`)
        const slices = v.slices.map(rangesOf)
        for (const [id, files] of Object.entries(v.faces)) {
          const face = byId.get(id)
          if (!face || !Array.isArray(files)) continue
          const out: Slice[] = []
          files.forEach((file, k) => {
            const ranges = slices[k]
            if (ranges && isObject(file) && typeof file.path === 'string' && FILE.test(file.path))
              out.push({ key: `${id}:${k}`, path: file.path, ranges })
          })
          face.slices = out
        }
        return true
      }).then((read) => read !== null)
      groups.set(name, g)
    }
    return g
  }
  /** a font string's faces, one a family (CSS's matching), and whether every one's table is read */
  const facesOf = (font: string) => {
    const f = parseFont(font)
    if (!f) return null
    const list = f.families
      .map((fam) => families.get(fam))
      .filter((l): l is ServedFace[] => !!l)
      .map((l) => faceOf(l, f.weight, f.style))
      .filter((x): x is ServedFace => !!x)
    return { faces: list, read: list.every((x) => x.slices !== null) }
  }
  /** a text's runs in a font: each a slice's characters, CJK apart; a blank no slice holds in the run before it. 'never' where a
   *  character no served face holds is in it, null while a table is not read */
  const runsCache = new Map<string, Run[] | 'never'>()
  const runsOf = (font: string, text: string): Run[] | 'never' | null => {
    const key = `${font}\u0000${text}`
    const hit = runsCache.get(key)
    if (hit) return hit
    const fs = facesOf(font)
    if (!fs) return 'never'
    if (!fs.read) return null
    const runs: Run[] = []
    for (const ch of text) {
      const cp = ch.codePointAt(0) as number
      let at: { slice: Slice; face: ServedFace } | null = null
      for (const face of fs.faces) {
        const slice = face.slices?.find((s) => inRanges(s.ranges, cp))
        if (slice) {
          at = { slice, face }
          break
        }
      }
      if (!at) {
        const last = runs.at(-1)
        if (last && /\s/.test(ch)) {
          last.text += ch
          continue
        }
        runsCache.set(key, 'never')
        return 'never'
      }
      const last = runs.at(-1)
      const cjk = CJK.test(ch)
      if (last && last.slice === at.slice && last.cjk === cjk) last.text += ch
      else runs.push({ slice: at.slice, face: at.face, text: ch, cjk })
    }
    runsCache.set(key, runs)
    return runs
  }
  // ---- the slices loaded, WAVE_SLOTS at a time
  const loaded = new Set<string>(),
    loading = new Map<string, Promise<void>>(),
    failed = new Set<string>(),
    lost = new Set<string>(),
    told = new Set<string>()
  const added: FontFaceLike[] = []
  /** the slices loaded and not in the document yet: each added with the others of the ask that needs it (`addIn`) */
  const inn = new Map<string, FontFaceLike>()
  /**
   * The slices of `keys` loaded and not in the document yet, added in one stretch, and only then ready to be measured: one
   * change of the document's fonts an ask instead of one a slice. Chromium re-lays every text node laid out at each change
   * ("Fonts changed"), so a slice added as it came made up to two whole-document relayouts a page (41-48 a scroll, against
   * today's 22-25, which adds a wave's faces in one task: verification/reader-perf.md §3f). An ask is one page's (the
   * composer asks a page's faces apart, so that no page waits for another's), so no page is held by another's slices; and none
   * is measured or drawn with a fallback face, since a slice is ready (`loaded`) only once it is in the document
   */
  const addIn = (keys: Iterable<string>) => {
    if (gone) return
    for (const k of keys) {
      const f = inn.get(k)
      if (!f) continue
      inn.delete(k)
      f.add()
      added.push(f)
      loaded.add(k)
    }
  }
  /** a face lost: its texts left the original's, told once; one lost while only the text rendering's probe asked it
   *  (`quiet`), told once a page's text asks it (a face no page draws is no loss of the page's) */
  const unseen = new Set<string>()
  const tellLost = (id: string, quiet = false) => {
    if (told.has(id)) return
    if (quiet) {
      unseen.add(id)
      return
    }
    told.add(id)
    o.lost?.(id)
  }
  let busy = 0,
    asked = 0,
    most = 0
  const waiting: ((held: boolean) => void)[] = []
  /** a slot of the wave: true where one is held (to be freed), false where the reader closed while this waited */
  const slot = () =>
    new Promise<boolean>((go) => {
      if (busy < WAVE_SLOTS) {
        busy++
        most = Math.max(most, busy)
        go(true)
      } else waiting.push(go)
    })
  const free = () => {
    const next = waiting.shift()
    if (next) next(true)
    else busy--
  }
  /** the demands of each slice waiting for its slot: let go there, never asked, where none of them wants it any more */
  const demands = new Map<string, (() => boolean)[]>()
  const loadSlice = (face: ServedFace, slice: Slice, wanted: () => boolean, quiet = false): Promise<void> => {
    if (loaded.has(slice.key) || inn.has(slice.key) || lost.has(slice.key)) return Promise.resolve()
    let p = loading.get(slice.key)
    if (p) {
      demands.get(slice.key)?.push(wanted)
      return p
    }
    demands.set(slice.key, [wanted])
    p = (async () => {
      const held = await slot()
      const want = demands.get(slice.key) ?? []
      demands.delete(slice.key)
      if (!held) return
      try {
        // (a reader closed while this waited asks nothing; nor a slice no page wants any more (a page scrolled away, a
        // generation before): it is forgotten, and a later ask asks it)
        if (gone || !want.some((f) => f())) return
        asked++
        const bytes = await fileOf(`/${slice.path}`, CAPS.slice)
        if (gone) return
        const f = await P.face(face.family, bytes, {
          weight: String(face.weight),
          style: face.style,
          unicodeRange: unicodeRangeOf(slice.ranges),
        })
        if (gone) return
        // (in the document with the others of its ask, once they are all in: addIn)
        inn.set(slice.key, f)
      } finally {
        free()
      }
    })().catch((e) => {
      // (the reader closed: its asks let go, nothing told)
      if (gone) return
      o.warn?.(`the face ${face.id}'s slice ${slice.path}`, e)
      // (not there, or a failure for now met twice: lost, its texts left the original's; else asked again next time)
      if (lasting(e) || failed.has(slice.key)) {
        lost.add(slice.key)
        tellLost(face.id, quiet)
      }
      failed.add(slice.key)
    })
    loading.set(slice.key, p)
    void p.finally(() => {
      if (loading.get(slice.key) === p) loading.delete(slice.key)
    })
    return p
  }
  /** the tables a font string's faces need read: the index, then the group of each face not read yet */
  const tablesOf = async (font: string, quiet = false) => {
    // (nothing asked once the reader is closed: not before the index, nor after an index or a table that came in since)
    if (gone) return
    const fs = facesOf(font)
    if (!fs) return
    if (!fs.read) {
      const ix = await theIndex()
      if (gone) return
      const unread = fs.faces.filter((f) => f.slices === null)
      // (a face the index names no group of holds no character, and is no loss; one whose index or table cannot be had is)
      const had = await Promise.all(
        unread.map((f) => {
          const g = ix?.groups[f.id]
          return !ix ? false : g ? theGroup(g, ix.fonts) : true
        }),
      )
      if (gone) return
      unread.forEach((f, k) => {
        if (had[k]) f.slices ??= []
        else {
          f.slices = []
          tellLost(f.id, quiet)
        }
      })
      runsCache.clear()
    }
  }
  /** the tables a font string needs read, then the slices its text needs loaded, while `wanted`: the slices' keys (added to
   *  the document by the ask, addIn) */
  const load = async (font: string, text: string, wanted: () => boolean, quiet = false): Promise<string[]> => {
    await tablesOf(font, quiet)
    // (a face whose table only the probe found not to be had, now asked by a page: told)
    if (!quiet) for (const f of facesOf(font)?.faces ?? []) if (unseen.has(f.id) && !f.slices?.length) tellLost(f.id)
    if (gone || !wanted()) return []
    const runs = runsOf(font, text)
    if (!runs || runs === 'never') return []
    await Promise.all(runs.map((r) => loadSlice(r.face, r.slice, wanted, quiet)))
    // (a slice only the probe found lost, now needed by a page: its face told)
    if (!quiet) for (const r of runs) if (unseen.has(r.face.id) && lost.has(r.slice.key)) tellLost(r.face.id)
    return runs.map((r) => r.slice.key)
  }
  // ---- the patterns
  const hyphs = new Map<string, Promise<Patterns | null>>()
  const hyphDone = new Map<string, Patterns | null>()
  const hyphOf = (lang: string): Promise<Patterns | null> => {
    let p = hyphs.get(lang)
    if (!p) {
      // (a language whose patterns cannot be had, in time, hyphenates nothing this visit: no page waits on them again)
      p = !LANG.test(lang)
        ? Promise.resolve(null)
        : tableOf(`the patterns of ${lang}`, `/hyph/${lang}.json`, CAPS.hyph, (v) => {
            if (!isObject(v) || !Array.isArray(v.patterns))
              throw new Error(`the patterns of ${lang} are of another shape`)
            return hyphenationOf({
              patterns: v.patterns.filter((x): x is string => typeof x === 'string'),
              exceptions: Array.isArray(v.exceptions)
                ? v.exceptions.filter((x): x is string => typeof x === 'string')
                : [],
            })
          })
      void p.then((v) => hyphDone.set(lang, v))
      hyphs.set(lang, p)
    }
    return p
  }

  // ---- the Metrics: 100 px measures, cached, scaled to the size asked
  const measures = new Map<string, [number, number, number, number]>()
  const measured = (font: string, text: string): [number, number, number, number] => {
    const key = `${font}\u0000${text}`
    const hit = measures.get(key)
    if (hit) return hit
    const runs = runsOf(font, text)
    const parts = runs && runs !== 'never' ? partsOf(font, runs) : [[font, text, false] as [string, string, boolean]]
    let w = 0,
      a = parts.length ? Number.NEGATIVE_INFINITY : 0,
      d = a,
      right = a
    for (const [pf, pt, flat] of parts) {
      const m = P.measure(pf, pt, flat)
      a = Math.max(a, m.ascent)
      d = Math.max(d, m.descent)
      right = Math.max(right, w + m.right)
      w += m.width
    }
    const out: [number, number, number, number] = [w, a, d, right]
    measures.set(key, out)
    return out
  }
  const metrics: Metrics = {
    ready(face, text) {
      const runs = runsOf(face, text)
      if (runs === 'never') return 'never'
      if (!runs) return false
      for (const r of runs) {
        if (lost.has(r.slice.key)) return 'never'
        if (!loaded.has(r.slice.key)) return false
      }
      return true
    },
    advance: (face, size, text) => (measured(face, text)[0] * size) / 100,
    ink(face, size, text) {
      const [, a, d, r] = measured(face, text)
      return [(a * size) / 100, (d * size) / 100, (r * size) / 100]
    },
  }

  // ---- the composer's faces: a class a font string, its slices loaded for the texts asked
  let rid = 0
  const sheet = document.createElement('style')
  o.root.append(sheet)
  const classes = new Map<FaceId, string>()
  const familyOf = (id: FaceId) =>
    parseFont(id)
      ?.families.map((f) => JSON.stringify(f))
      .join(', ') ?? 'serif'
  const faces: Faces = {
    classOf(id) {
      let c = classes.get(id)
      if (c) return c
      c = `axt-sf-${++rid}`
      classes.set(id, c)
      const f = parseFont(id)
      // (no synthesis of what the face lacks, no trim of CJK punctuation, no glyph of another language's (`locl`): as measured.
      // A face's `locl` swaps a mark for another region's where the run's script names one, and not in a run of no script
      // (digits and marks alone): Source Han Serif TC under a zh-CN page drew its full stop as Simplified's, low at its em's
      // start, after a Han character, and as its own, in the middle, on a line of a digit, a bracket and the stop
      // (2611.03953v2-zh-TW p13). Off, every mark is its face's default glyph wherever it stands, the one the typesetter's
      // measure of it is (docs/PDF-READER.md §18.48))
      sheet.sheet?.insertRule(
        `.${c}{font-family:${familyOf(id)};font-weight:${f?.weight ?? 400};font-style:${f?.style ?? 'normal'};font-variant-caps:${f?.caps ? 'small-caps' : 'normal'};font-synthesis:none;text-spacing-trim:space-all;font-feature-settings:"locl" 0}`,
      )
      return c
    },
    familyOf,
    async probeFace(text) {
      addIn(
        await load(PROBE_FACE, text, () => true, true).catch((e) => {
          o.warn?.(`the faces of ${PROBE_FACE}`, e)
          return []
        }),
      )
      return metrics.ready(PROBE_FACE, text) === true ? PROBE_FACE : null
    },
    async ready(items, wanted = () => true) {
      const waits: Promise<unknown>[] = []
      const keys: string[] = []
      for (const it of items) {
        if (typeof it === 'string') continue
        const [id, text] = it
        if (id === HYPH_WAIT) waits.push(hyphOf(text))
        else
          waits.push(
            load(id, text, wanted).then(
              (k) => void keys.push(...k),
              (e) => o.warn?.(`the faces of ${id}`, e),
            ),
          )
      }
      await Promise.all(waits)
      // (the ask's slices in the document together, once every one is in, or let go: those of a page gone that did come in
      // are added all the same, ready for the page that asks them next)
      addIn(keys)
    },
    get asked() {
      return asked
    },
    get most() {
      return most
    },
    dispose() {
      gone = true
      closed.abort()
      for (const go of waiting.splice(0)) go(false)
      for (const f of added) f.remove()
      added.length = 0
      inn.clear()
      sheet.remove()
    },
  }
  return {
    metrics,
    faces,
    async hyph(langs) {
      const out: Record<string, Patterns | null> = {}
      await Promise.all(
        langs.map(async (l) => {
          out[l] = await hyphOf(l)
        }),
      )
      return out
    },
    hyphNow: (lang) => (hyphDone.has(lang) ? (hyphDone.get(lang) as Patterns | null) : undefined),
    async warm(fonts) {
      if (gone) return
      await Promise.all([theIndex(), ...fonts.map((f) => tablesOf(f).catch((e) => o.warn?.(`the faces of ${f}`, e)))])
    },
  }
}
