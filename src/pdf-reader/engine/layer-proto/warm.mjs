// src/pdf-reader/engine/layer-proto/warm.mjs
// The faces a page's units will be drawn in, asked of the host's served slices at once, before the page is laid
// (docs/PDF-READER.md §11.8, "The faces, in one wave"). v0 checks and loads the faces of each unit as it lays it, one unit
// after another (run.mjs layOnce: FS.check, E2), so a page whose units bring new characters waited for one round trip a unit:
// 2602.23285v2 in Chinese asked 38 font files in 12 waves before its first page, 4.3 to 9.2 s of a cold visit (2026-10-24,
// production). Here the slices the rows of a page's units need are asked together, as soon as the rows and the parts are in
// (before the composed document has opened), so that v0's own checks find them loaded or loading, and its lay waits on no
// further round trip. Nothing here decides what a unit is drawn in, nor whether it can be: v0's check does, unchanged; a
// character this asks for in a face v0 does not draw it in costs its slice's bytes and nothing else, and those bytes share
// the line with what the page waits for besides, so the wave asks what v0 will draw and nothing it will not:
// - a unit's translated text (its row's strings) in the face of the style its original is set in on the page: its lines'
//   most common font by width (pagesOfParts), as v0 takes the most common class of the unit's characters, formulas aside
//   (layer2.mjs originalStyle); a heading's text in the bold face where the layout tells no font. An author's unit is
//   never drawn (run.mjs skips it, `author`), and its names are the rarest characters of a page: none of it is asked
//   (2602.23285v2's page 1, 2026-10-24: its authors' names alone took 16 slices of 256 code points, 1.7 MB, beside the
//   1.4 MB its drawn units take);
// - the page's babel names (abstract, figure, …: the layout's `names`) in the target's words (the rules' labels), in their
//   font's style, as v0 sets them (run.mjs paintNames);
// - the alphabet's slice of each text font the original sets the page in (not a formula's), which v0 asks before it
//   measures the page's own characters (run.mjs, the page's Latin faces);
// - with `likely`, the faces v0 warms on page 1 (layer2.mjs warmFaces: one character in the body's regular, bold and italic,
//   CJK and Latin).
// Before any part is read (a first open: the rows come while the box lays the paper out, its head and parts at the end), a first
// page's units are not known, nor their styles: firstPageUnits estimates them from the units' kinds and the rows read so far,
// and the wave asks their CJK characters alone (`cjkOnly`), in the CJK face the target sets them in whatever the paper's family
// (Regular and Bold beside every family), so that the slices come during the box's run instead of after its first part.
// A bold or italic run inside a paragraph, a caption's label and a character only the original's text holds (its
// punctuation measured in the target's fallback) ask their slices when v0 lays the page, as before. The paper's family,
// which decides its Latin runs' faces (a CJK target's weights it no longer does: Regular and Bold beside every family, the
// ruling of 2026-10-29), is read from the parts' layouts: each font weighted by the lines set in it (familyOfParts), where
// v0 weights page 1's characters. The two agree on
// the seven papers of the gate pack (2026-10-24: times, palatino, cm and charter, against page 1's lines by width); where
// they do not, the slices of the other weight were asked for nothing and v0 asks its own.
//
// An original module (no port statement).
import { NAME_FLAG } from '../layout/file.mjs'
import { NAME_KEYS } from '../layout/names.mjs'
import { familyOfFonts, rolesFor } from '../rules/font-roles.mjs'
import { BUILTIN_RULES, resolveRules } from '../rules/layout.mjs'
import { classifyFont, faceOfRoles, fontString, roleFaceSet } from './fonts.mjs'
import { cjkClassRe } from './layer2.mjs'

/** the slices the wave loads at a time. The edge answers the streams of a connection side by side, whatever their priority
 *  (2026-10-24, staging: a High fetch of 120 KB asked beside 28 slices loaded as fonts, VeryHigh, ended at 175 to 470 ms, as
 *  beside 28 asked Low or High), so a read of the original's PDF asked while the wave is in flight shares the line with
 *  every slice in flight; the composed document reads the PDF one range after another, each waiting for the last. A few
 *  slices at a time keep the line busy across their round trips and leave those reads a share of it */
export const WAVE_SLOTS = 4
/** the CJK characters of a first page as firstPageUnits counts them. Measured on seven papers in Chinese (2026-10-30, staging,
 *  each page 1's units by its layout against this estimate, in shs-sc's slices): at 800 the estimate's slices held 100 % of page
 *  1's CJK bytes on four, 92 % (2610.31506v1), 90 % (2602.23285v2: an ink unit, told with the head) and 55 % (2610.31351v1: its
 *  abstract set in bold, asked in the regular), and asked 0 to 1.07 MB (median 0.39) of slices page 1 does not draw; at 600 three
 *  of the seven fell to 84-87 %, at 1600 the slices not drawn rose to 0.12-1.38 MB */
export const FIRST_PAGE_CHARS = 800
/** a character a first page's budget counts (FIRST_PAGE_CHARS): a Han, kana or Hangul one */
const CJK_COUNT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
/** the characters v0 warms each face with on page 1 (layer2.mjs warmFaces): a CJK one and a Latin one */
const LIKELY_CJK = '\u6c38', LIKELY_LATIN = 'a'

/**
 * Page 1's units as they can be told before any part is read, for the warmer (`warm(page, 'other', { cjkOnly: true })`): the
 * units in id order (the source's, title and abstract first) whose texts `texts` holds (each unit's translated text by id: the
 * rows read so far), an author's aside (never drawn), until their CJK characters reach `chars` (the unit that reaches it
 * included); and every place of the author block (kind `affiliation`: units of their own, after every other in id order, on the
 * first page wherever their ids stand). `kinds`: each unit's kind by id (the units chunks'; null for none). Each with no style
 * (st null: the warmer's plain face, a heading's the bold). An estimate: a unit it misses is asked by the wave of its page once
 * the parts locate it, a slice it asks for nothing costs its bytes alone, while the box runs
 */
export function firstPageUnits(kinds, texts, { chars = FIRST_PAGE_CHARS } = {}) {
  const out = []
  let count = 0
  const ids = [...(texts?.keys?.() ?? [])].filter(id => Number.isSafeInteger(id)).sort((a, b) => a - b)
  for (const id of ids) {
    const kind = kinds?.[id] ?? null, text = texts.get(id)
    if (kind === null || kind === 'author' || typeof text !== 'string' || !text) continue
    if (count >= chars && kind !== 'affiliation') continue
    out.push({ kind, text, st: null })
    if (kind !== 'affiliation') for (const ch of text) if (CJK_COUNT.test(ch)) count++
  }
  return out
}

/**
 * The paper's English family as its parts' layouts set it: each font name of a part's layout weighted by the lines set in it
 * (a line row's eighth number is its font's index), through the role table's familyOfFonts. `parts`: read parts (readPart's),
 * a part with no layout (`layout: null`) counting nothing; 'other' with none
 */
export function familyOfParts(parts) {
  const weights = new Map()
  for (const p of parts ?? []) {
    const L = p?.layout
    if (!L || !Array.isArray(L.fonts) || !Array.isArray(L.lines)) continue
    for (const [, rows] of L.lines) {
      if (!rows) continue
      for (let i = 7; i < rows.length; i += 8) {
        const name = L.fonts[rows[i]]
        if (typeof name === 'string') weights.set(name, (weights.get(name) ?? 0) + 1)
      }
    }
  }
  return familyOfFonts([...weights.keys()], [...weights.values()])
}

/**
 * What each page of the parts read so far sets, as the warmer reads it, by page: `units`, each unit with a line on the page
 * and the style its original is set in there (classifyFont's of its lines' most common font by width, formulas' fonts
 * aside; null where the layout tells none: a part with no layout locates its units by their left rectangles); `names`, the
 * babel names the layout sets on it ({ key, capitals, st }); `fonts`, the classes of the fonts its lines are set in; `serif`,
 * the serif design most of its lines are set in (v0's `designs.serif` on page 1), null with none; `covered`, whether a part
 * read covers the page (its `pages`): a page reached only by a unit running on to it from an earlier part has more to come,
 * its own part's names, fonts and units. A line row is [page, x0, x1, baseline, top, bottom, size, font]; a name row's page
 * is its third number, its font its tenth
 */
export function pagesOfParts(parts) {
  const classes = new Map()
  const classOf = name => classes.get(name) ?? classes.set(name, classifyFont(name)).get(name)
  const pages = new Map()
  const pageOf = q => pages.get(q) ?? pages.set(q, { units: new Map(), names: [], fonts: new Map(), serifs: new Map(), covered: false }).get(q)
  for (const p of parts ?? []) {
    if (Array.isArray(p?.pages) && Number.isSafeInteger(p.pages[0]) && Number.isSafeInteger(p.pages[1])) for (let q = p.pages[0]; q <= p.pages[1]; q++) pageOf(q).covered = true
    const L = p?.layout
    if (L && Array.isArray(L.fonts) && Array.isArray(L.lines)) {
      for (const [id, rows] of L.lines) {
        if (!rows) continue
        for (let i = 0; i + 7 < rows.length; i += 8) {
          const pg = pageOf(rows[i]), name = L.fonts[rows[i + 7]], width = Math.max(0, rows[i + 2] - rows[i + 1])
          const tally = pg.units.get(id) ?? pg.units.set(id, new Map()).get(id)
          if (typeof name !== 'string') continue
          const st = classOf(name)
          if (st.fam === 'math') continue
          pg.fonts.set(name, st)
          tally.set(name, (tally.get(name) ?? 0) + width)
          if (st.fam === 'serif') pg.serifs.set(st.design, (pg.serifs.get(st.design) ?? 0) + width)
        }
      }
      for (const r of Array.isArray(L.names) ? L.names : []) {
        const key = NAME_KEYS[r?.[1]], name = L.fonts[r?.[9]]
        if (key) pageOf(r[2]).names.push({ key, capitals: (r[10] & NAME_FLAG.CAPITALS) !== 0, st: typeof name === 'string' ? classOf(name) : null })
      }
    } else {
      for (const [id, , rects] of p?.left ?? []) for (const r of rects ?? []) { const pg = pageOf(r[0]); if (!pg.units.has(id)) pg.units.set(id, new Map()) }
    }
  }
  const out = new Map()
  for (const [q, pg] of pages) {
    const units = new Map()
    for (const [id, tally] of pg.units) {
      const best = [...tally].sort((a, b) => b[1] - a[1])[0]
      units.set(id, best ? classOf(best[0]) : null)
    }
    const serif = [...pg.serifs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    out.set(q, { units, names: pg.names, fonts: [...pg.fonts.values()], serif, covered: pg.covered })
  }
  return out
}

/**
 * A warmer of one target's faces over the host's served slices (`faceSources`, the reader's): `warm(page, family)` asks, at
 * once and together, the slices that hold what v0 will draw of a page, in the faces of the target's roles for the paper's
 * English `family` (CJK characters by the rules' class, cjkClassRe, in the CJK face; every other in the style's Latin face):
 * `page.units` ({ kind, text, st }: a unit's kind, its translated text and its original's style there, pagesOfParts'; an
 * author's is never drawn and is not asked), `page.names` (pagesOfParts', in the target's words), `page.fonts` (the classes
 * of the original's text fonts on the page: each face's alphabet slice) and `page.likely` (the serif design of page 1, for
 * the faces v0 warms there; null: none). The slices are loaded WAVE_SLOTS at a time, in the order the page asks them; a
 * slice v0 asks meanwhile v0 loads at once, as before; `signal` aborted, no slice more is begun (those loading settle). It
 * resolves once each has loaded or failed, or the signal has stopped it; it never rejects. A slice loaded or loading is not
 * asked again. Its face set lets nothing go that failed (keepFailed): a slice that fails here
 * fails v0's check of the units that need it, as if v0 had asked it itself; a run's open forgets it, and asks again
 */
export function faceWarmer({ faceSources, target, rules = BUILTIN_RULES }) {
  const R = resolveRules(rules, target)
  const cjkRe = cjkClassRe(R.params.cjkQuotes)
  const FS = roleFaceSet({ faceSources, keepFailed: true })
  const rolesOf = new Map()
  return {
    async warm(page, family, { signal = null, cjkOnly = false } = {}) {
      let roles = rolesOf.get(family)
      if (!roles) rolesOf.set(family, (roles = rolesFor(target, family, R.cjkFaces)))
      const design = page?.likely ?? (family === 'other' ? 'times' : family)
      /** the characters each face is asked for, by its font string */
      const runs = new Map()
      const ask = (st, cls, chars) => {
        const face = faceOfRoles(roles, st, cls), key = fontString(face, 100)
        const r = runs.get(key) ?? runs.set(key, { face, chars: new Set() }).get(key)
        for (const ch of chars) r.chars.add(ch)
      }
      // (cjkOnly: the CJK characters alone, whose face is the target's whatever the family; a Latin one's is the family's)
      const text = (st, s) => { for (const ch of s) { if (/\s/u.test(ch)) continue; const cjk = cjkRe.test(ch); if (cjk || !cjkOnly) ask(st, cjk ? 'cjk' : 'latin', [ch]) } }
      const plain = bold => ({ fam: 'serif', bold, italic: false, caps: false, design })
      for (const u of page?.units ?? []) {
        if (u?.kind === 'author' || typeof u?.text !== 'string' || !u.text) continue
        text(u.st && u.st.fam !== 'math' ? u.st : plain(u.kind === 'heading'), u.text)
      }
      for (const n of cjkOnly ? [] : page?.names ?? []) {
        const word = R.labels?.[n.key]
        if (!word) continue
        const s = n.capitals ? word.toLocaleUpperCase(target) : word
        // (one face for the name, as v0 sets it: the CJK one where it holds a CJK character)
        const cls = [...s].some(ch => cjkRe.test(ch)) ? 'cjk' : 'latin'
        ask(n.st && n.st.fam !== 'math' ? n.st : plain(false), cls, [...s].filter(ch => !/\s/u.test(ch)))
      }
      for (const st of cjkOnly ? [] : page?.fonts ?? []) if (st?.known && st.fam !== 'math') ask(st, 'latin', [LIKELY_LATIN])
      if (page?.likely && !cjkOnly) {
        for (const x of [{ bold: false, italic: false }, { bold: true, italic: false }, { bold: false, italic: true }]) {
          const st = { fam: 'serif', caps: false, design: page.likely, ...x }
          if (R.params.cjk) ask(st, 'cjk', [LIKELY_CJK])
          ask(st, 'latin', [LIKELY_LATIN])
        }
      }
      // (each run's slices not loaded yet, in the order the page asks them, each slice once; loaded WAVE_SLOTS at a time)
      const lists = await Promise.all([...runs.values()].map(r => FS.unloaded(r.face, [...r.chars].join('')).catch(() => [])))
      const queue = [...new Set(lists.flat())]
      await Promise.all(Array.from({ length: Math.min(WAVE_SLOTS, queue.length) }, async () => {
        for (let f = queue.shift(); f && !signal?.aborted; f = queue.shift()) await f.load().catch(() => null)
      }))
    },
  }
}
