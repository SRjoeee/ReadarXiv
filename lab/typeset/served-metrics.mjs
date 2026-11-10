// lab/typeset/served-metrics.mjs: a Metrics (design-a §1.2, packages/typeset/src/types.ts) that measures in Node what the
// reader's canvas measures in the browser: the same faces, the same shaping. The faces are the files the reader is served
// (the web's static faces' tables, `web/src/fonts/static/*.json`: each face's slices by code point; the slices' woff2 files,
// the sweep cache's), each slice registered as a typeface of its own; the shaping is Skia's canvas (@napi-rs/canvas, pdfjs-
// dist's optional dependency: Skia with HarfBuzz, the canvas Chrome draws and measures with). A text in a canvas font string
// (today's fontString: style, weight, size, a list of families) is measured as Chrome measures it: each character set in the
// first family of the list whose face for that weight and style (CSS's matching: the style, then the nearest weight) holds a
// slice with the character, a run of characters in one slice shaped and measured alone, the runs' advances summed; its ink
// the runs' highest ascent, deepest descent and furthest right. Deterministic: the same files, the same library. Its numbers
// against the reader's own (the tap's metrics tables, every first measure of a run): lab/typeset/served-check.mjs. Lab only:
// the package's Metrics adapters are the table and the host's canvas.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { FACES } from '../../packages/typeset/src/data/faces.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const require = createRequire(join(ROOT, 'node_modules/.pnpm/pdfjs-dist@6.3.289/node_modules/pdfjs-dist/package.json'))
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas')

export const TABLES = process.env.AXT_FACE_TABLES ?? '/Users/cheongzhiyan/Developer/readarxiv-web-wt/refactor-read/web/src/fonts/static'
export const SLICES = (process.env.AXT_FACE_SLICES ?? '/Users/cheongzhiyan/Developer/readarxiv-web-wt/sweep/sweep-data/cache/static/static-fonts:/Users/cheongzhiyan/Developer/readarxiv-web-wt/rate-limit/web/public/static-fonts').split(':')
export const hasServed = existsSync(join(TABLES, 'index.json')) && SLICES.some((d) => existsSync(d))

/** a text no served face holds (Chrome would draw it in a system font: no measure of the reader's own) */
export class Unserved extends Error {
  constructor(font, text) {
    super(`no served face holds ${JSON.stringify(text.slice(0, 20))} in ${font}`)
    this.name = 'Unserved'
  }
}

/** the families' faces and their slices, each slice registered once as a typeface of its own (its alias) */
function catalogue() {
  const index = JSON.parse(readFileSync(join(TABLES, 'index.json'), 'utf8'))
  const groups = new Map()
  const group = (name) => {
    if (!groups.has(name)) groups.set(name, JSON.parse(readFileSync(join(TABLES, `${name}.json`), 'utf8')))
    return groups.get(name)
  }
  const families = new Map()
  for (const [id, f] of Object.entries(FACES)) {
    const entry = index.faces[id]
    if (!entry) continue
    const g = group(entry.group)
    const slices = (g.faces[id] ?? []).flatMap((s, k) => {
      if (!s) return []
      const file = SLICES.map((d) => join(d, s.path.split('/').pop())).find((p) => existsSync(p))
      return file ? [{ file, ranges: g.slices[k], alias: `served:${id}:${k}` }] : []
    })
    const list = families.get(f.family) ?? []
    list.push({ id, weight: f.weight, style: f.style, slices })
    families.set(f.family, list)
  }
  return families
}

/** CSS's face matching within a family: the style asked (italic, else normal), then the weight asked, else the nearest
 *  lighter one first for 500 and under, heavier first over 500 */
function faceOf(list, weight, style) {
  const styled = list.filter((f) => f.style === style)
  const pool = styled.length ? styled : list.filter((f) => f.style === 'normal').length ? list.filter((f) => f.style === 'normal') : list
  const exact = pool.find((f) => f.weight === weight)
  if (exact) return exact
  const lighter = pool.filter((f) => f.weight < weight).sort((a, b) => b.weight - a.weight)
  const heavier = pool.filter((f) => f.weight > weight).sort((a, b) => a.weight - b.weight)
  return (weight <= 500 ? [...lighter, ...heavier] : [...heavier, ...lighter])[0]
}

/** a canvas font string read: its style, weight, size in px and families (today's fontString's two forms) */
function parse(font) {
  const m = /^(italic )?(small-caps )?(?:(\d+) |(bold) )?([\d.]+)px (.+)$/.exec(font)
  if (!m) throw new Error(`a font string of another shape: ${font}`)
  const families = [...m[6].matchAll(/"([^"]+)"|([^,\s][^,]*)/g)].map((x) => (x[1] ?? x[2]).trim())
  return { style: m[1] ? 'italic' : 'normal', caps: !!m[2], weight: m[3] ? Number(m[3]) : m[4] ? 700 : 400, px: Number(m[5]), families }
}

/** a character of the CJK scripts, which Chrome's canvas sets unkerned (the kana's pairs a served face kerns, haranoaji's
 *  bold, it measures at their full advances: 17 of 17 such runs of the tap's tables), Skia's kerned: measured with kerning
 *  off, in runs of their own */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef\u30fc]/u
const inRanges = (r, cp) => {
  for (let i = 0; i < r.length; i += 2) if (cp >= r[i] && cp <= r[i + 1]) return true
  return false
}

/** the Metrics over the served faces (FaceId: a canvas font string at 100 px, as the tap's tables key them) */
export function servedMetrics() {
  const families = catalogue()
  const registered = new Set()
  const ctx = createCanvas(16, 16).getContext('2d')
  const resolved = new Map()
  /** the runs of a text in a font: [alias, the run's text, the face's weight and style] */
  const runsOf = (font, text) => {
    const key = `${font}\u0000${text}`
    if (resolved.has(key)) return resolved.get(key)
    const f = parse(font)
    const faces = f.families.map((fam) => families.get(fam)).filter(Boolean).map((list) => faceOf(list, f.weight, f.style))
    const runs = []
    for (const ch of text) {
      const cp = ch.codePointAt(0)
      let at = null
      for (const face of faces) {
        const s = face?.slices.find((x) => inRanges(x.ranges, cp))
        if (s) {
          at = { s, face }
          break
        }
      }
      if (!at) {
        // (a blank or a mark Chrome sets in the run it follows: none of the served slices holds it)
        if (runs.length && /\s/.test(ch)) {
          runs.at(-1).text += ch
          continue
        }
        throw new Unserved(font, text)
      }
      const last = runs.at(-1)
      const cjk = CJK.test(ch)
      if (last && last.s === at.s && last.cjk === cjk) last.text += ch
      else runs.push({ s: at.s, face: at.face, text: ch, cjk })
    }
    for (const r of runs)
      if (!registered.has(r.s.alias)) {
        GlobalFonts.registerFromPath(r.s.file, r.s.alias)
        registered.add(r.s.alias)
      }
    const out = { px: f.px, runs }
    resolved.set(key, out)
    return out
  }
  const measured = new Map()
  const measure = (font, text) => {
    const key = `${font}\u0000${text}`
    let m = measured.get(key)
    if (m) return m
    const { px, runs } = runsOf(font, text)
    let w = 0
    let a = Number.NEGATIVE_INFINITY
    let d = Number.NEGATIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    if (!runs.length) a = d = right = 0
    for (const r of runs) {
      // (measured at 100 px and scaled to the string's: Skia's canvas parses no size of many decimals, the Korean face's
      // 95.89999999999999 px, and a glyph's advance scales with its size, unhinted)
      ctx.font = `${r.face.style === 'italic' ? 'italic ' : ''}${r.face.weight} 100px "${r.s.alias}"`
      ctx.fontKerning = r.cjk ? 'none' : 'normal'
      const t = ctx.measureText(r.text)
      const k = px / 100
      a = Math.max(a, t.actualBoundingBoxAscent * k)
      d = Math.max(d, t.actualBoundingBoxDescent * k)
      right = Math.max(right, w + t.actualBoundingBoxRight * k)
      w += t.width * k
    }
    m = [w, a, d, right]
    measured.set(key, m)
    return m
  }
  // (a measure in the font string as it is, at its own px: a face's size correction, the Korean face's 95.9 px, is in it; at
  // another size than 100, scaled as tableMetrics scales the table's)
  const at = (v, _px, size) => (size === 100 ? v : (v * size) / 100)
  return {
    ready: () => true,
    advance: (face, size, text) => {
      const m = measure(face, text)
      return at(m[0], runsOf(face, text).px, size)
    },
    ink: (face, size, text) => {
      const m = measure(face, text)
      const px = runsOf(face, text).px
      return [at(m[1], px, size), at(m[2], px, size), at(m[3], px, size)]
    },
  }
}

/** a Metrics that answers from `first` and, where it throws MissingMeasure, from `then` (the table, then the measurer) */
export function layered(first, then) {
  const or = (f, g) => (...a) => {
    try {
      return f(...a)
    } catch (e) {
      if (e?.name !== 'MissingMeasure') throw e
      return g(...a)
    }
  }
  return {
    // (ready where either is: the table holds the faces today measured, the measurer every served face)
    ready: (face, text) => {
      const a = first.ready(face, text)
      return a === true ? a : then.ready(face, text)
    },
    advance: or(first.advance, then.advance),
    ink: or(first.ink, then.ink),
  }
}
