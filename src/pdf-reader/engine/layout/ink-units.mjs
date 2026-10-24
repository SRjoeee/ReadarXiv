// The ink units of our final pass (docs/route/orphan-text.md, stage 2): text TeX sets that no source unit owns — the running
// heads and feet, the contents and the lists, a note with no unit, prose the front end did not cut — made units from our own
// glyphs, so that it is translated and drawn as any unit. Read from the ledger's lines (layout/ledger.mjs: each line of glyphs
// no unit owns, in stream order, with its class), our pages' glyphs, and the paper's source units; nothing of arXiv's PDF, no
// position estimated: every coordinate is a glyph's our compile set.
//
// The rules (each tested):
//   1. the classes made units: heads (`inkheads`), contents (`inkcontents`), notes (`inknotes`), orphans (`inkorphan`); a line
//      of another class is never one;
//   2. a line's words: its glyphs left to right, a word ended where two stand a fifth of their size apart; a head's or a list's
//      line keeps its numbering and its page number the original's ink (a leading section number, a trailing run of leader
//      dots and a number: no unit's, never erased), so that a contents entry's title is drawn up to its leaders;
//   3. a unit: a head's line alone; the others' lines while they follow on one page and in one region, each within BLOCK_DY of
//      its size below the one before and meeting it across, and in one paragraph of TeX's (ink.mjs `paras`: a contents entry,
//      a note, a paragraph); where the compile marked none, a list's line with the next where it ends in no page number (an
//      entry continued), a note's or an orphan's while they follow;
//   4. inside a unit, a run of a math face's glyphs or of a typewriter face's is a placeholder (`math`, `url`): its ink kept,
//      its source the run's characters; a word that is a web address is one in whatever face (a note of an address alone
//      is then no unit);
//   5. echo: a unit whose letters (stream.mjs spellOf) and count of kept runs equal a source unit's letters and count of
//      visible placeholders (a heading first, then a caption, then any) takes that unit's pieces, each visible placeholder
//      placed by its kept run in turn, and is drawn with its row: the contents read as the headings they repeat, and no
//      translation is made for them; one that equals no source unit but an ink unit before it (a running head on every
//      page) echoes that one;
//   6. its rows as the layout maker writes a unit's (layout/make.mjs rowsOf): each line's box, baseline, size and face from its
//      glyphs, its erase rectangles merged as there, its frames by page and column with the room below each, a placeholder's
//      segments its glyphs' boxes, a head's line centred where TeX centred it on the page;
//   7. what it owns: its text glyphs `u<id>`, its placeholders' `u<id>.p` (own.mjs's groups), claimed in the wrap
//      (claimInk), every one a glyph no unit owned;
//   8. a block of notes or orphans whose letters are mostly an author unit's words (NAMES_SHARE) is its names (`inknames`): of
//      the names toggle, as the author block is, not always translated (REVTeX's names its marks do not own).
// Pure arithmetic; an original module (no port statement).
import { classifyFont } from '../layer-proto/fonts.mjs'
import { utf8 } from '../translate/mt.mjs'
import { classOf } from './marks.mjs'
import { spellOf } from './stream.mjs'

/** the ledger's classes made units, and each one's kind (rules/content-classes.mjs UNIT_CLASS gives the class back) */
export const INK_KIND = Object.freeze({ heads: 'inkheads', contents: 'inkcontents', notes: 'inknotes', orphan: 'inkorphan', names: 'inknames' })
/** a block of the names an author unit holds: this share of its letters, at least, in words of an author unit's (rule 8) */
export const NAMES_SHARE = 0.6
/** a block's next line: within this many of its size below the one before */
export const BLOCK_DY = 1.75
/** two glyphs one word: closer than this share of their size */
const WORD_GAP = 0.12
/** a word that numbers a heading or an entry: 1, 1.2, A.3, IV, (a) */
const NUMBERING = /^\(?(?:\d{1,4}|[ivxlcdm]{1,6}|[IVXLCDM]{1,6}|[A-Z])(?:[.\-–](?:\d{1,4}|[A-Za-z]))*[.:)]?$/u
/** a page number at a line's end: arabic or roman */
const PAGE_NUMBER = /^(?:\d{1,4}|[ivxlcdm]{1,8})$/
/** a word that is a web address, a note's mark before it or not */
const URL_WORD = /(?:https?|ftp):\/\/|^\d{0,3}www\.[^\s.]+\.[a-z]/iu
/** a leader: dots alone */
const LEADER = /^[.·•…]+$/u
/** a line's erase rectangles at most, merged where they meet (layout/make.mjs MERGE, ERASE_MAX) */
const MERGE = 0.5, ERASE_MAX = 16
/** a placeholder's segments at most, an inline one's (layout/file.mjs SEGS_INLINE) */
const SEGS_INLINE = 4
/** the room below a frame where nothing is below it: to the page's foot, less this (layout/make.mjs FOOT) */
const FOOT = 36
/** a head's line centred: its middle within this of its page's, PDF units */
const CENTRE = 4
const r2 = v => Math.round(v * 100) / 100
const PAIR = /\p{L}{2}/u

/** a text as the front end holds a source's: its UTF-8 bytes in a Latin-1 view (latex-front.mjs latin1, read back by mt.mjs utf8) */
const ENCODER = new TextEncoder()
function sourceView(s) {
  const b = ENCODER.encode(s)
  let out = ''
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
  return out
}

/** the font family of a face, read once a face */
function famOf(cache, name) {
  let f = cache.get(name)
  if (f === undefined) { f = classifyFont(name ?? '').fam; cache.set(name, f) }
  return f
}

/** a line's words, left to right: { gs (glyph indices), text, fam (math, mono, or text) } */
function wordsOf(G, gs, fams) {
  const order = [...gs].filter(g => G[g] && !G[g].blank && /\S/u.test(G[g].u ?? '')).sort((a, b) => G[a].x0 - G[b].x0)
  const out = []
  let cur = null, prev = null
  for (const g of order) {
    const x = G[g], f = famOf(fams, x.font), fam = f === 'math' ? 'math' : f === 'mono' ? 'mono' : 'text'
    if (!cur || (prev !== null && x.x0 - G[prev].x1 > WORD_GAP * Math.max(x.size, G[prev].size)) || cur.fam !== fam) { cur = { gs: [], text: '', fam }; out.push(cur) }
    cur.gs.push(g); cur.text += x.u
    prev = g
  }
  // (an address set in the text's face, \urlstyle{same}: a typewriter run as any, kept, rule 4)
  for (const w of out) if (w.fam === 'text' && URL_WORD.test(w.text)) w.fam = 'mono'
  return out
}

/** a list's or a head's line less its numbering and its page number: [kept words, whether it ended in a page number] */
function trimmed(words, cls) {
  if (cls !== 'heads' && cls !== 'contents') return [words, false]
  let a = 0, b = words.length
  let ended = false
  while (b > a && (LEADER.test(words[b - 1].text) || (PAGE_NUMBER.test(words[b - 1].text) && b - 1 > a))) { if (PAGE_NUMBER.test(words[b - 1].text)) ended = true; b-- }
  while (a < b - 1 && NUMBERING.test(words[a].text) && words[a].fam === 'text') a++
  // (a leading page number on a head's even page)
  if (cls === 'heads' && a < b - 1 && PAGE_NUMBER.test(words[a].text)) a++
  return [words.slice(a, b), ended]
}

/** a source unit's echo key: the letters of its text pieces (stream.mjs spellOf; its text the source's bytes in a Latin-1 view,
 *  latex-front.mjs, read as UTF-8 first: mt.mjs utf8) and the count of its visible placeholders (marks.mjs classOf: one that sets
 *  ink), where its pieces are text, placeholders and a group's open and close alone (no nested unit); null else */
function echoKey(u) {
  if (!u?.pieces?.every(p => p.t === 'text' || p.t === 'ph' || p.t === 'open' || p.t === 'close')) return null
  const s = spellOf(utf8(u.pieces.filter(p => p.t === 'text').map(p => p.s ?? '').join(' ')))
  return s.length < 4 ? null : `${s}#${u.pieces.filter(p => p.t === 'ph' && classOf(p) !== null).length}`
}
const ECHO_ORDER = { heading: 0, caption: 1 }

/**
 * The ink units of a document. `pages` as the wrap reads them (layout/wrap.mjs: each glyph { u, x0, x1, ix0, ix1, y, size, top,
 * bottom, font, blank? }, its points, its view); `ledger` ledgerOf's over them (its `lines`); `units` the paper's source units,
 * their ids their indices, or null (no echo). Ids from units.length on. Returns [{ id, kind, cls, echo, pieces, glyphs: { text:
 * [[page, g]], ph: [[page, g]] }, rows: { unit: [id, kind, depth, flags, pieces], lines (8 a line, the face's name at 7),
 * frames, erase, ph } }]
 */
export function inkUnitsOf(pages, ledger, { units = null } = {}) {
  const fams = new Map()
  const base = units?.length ?? 0
  // the source units an ink unit may echo, by their letters
  const echoOf = new Map()
  if (units) units.forEach((u, i) => {
    const key = echoKey(u)
    if (key === null) return
    const at = echoOf.get(key)
    if (at === undefined || (ECHO_ORDER[u.kind] ?? 9) < (ECHO_ORDER[units[at].kind] ?? 9)) echoOf.set(key, i)
  })
  // each line of a class made units, its words trimmed (rule 2)
  const segs = []
  for (const L of ledger.lines ?? []) {
    if (!Object.hasOwn(INK_KIND, L.cls) || L.cls === 'names') continue
    const G = pages[L.page - 1]?.glyphs ?? []
    const [words, ended] = trimmed(wordsOf(G, L.gs, fams), L.cls)
    if (!words.some(w => w.fam === 'text' && PAIR.test(w.text.normalize('NFKC')))) continue
    segs.push({ ...L, words, ended })
  }
  // units of lines (rule 3)
  const groups = []
  for (const s of segs) {
    const last = groups.at(-1), prev = last?.at(-1)
    const follows = prev && prev.page === s.page && prev.cls === s.cls && prev.region === s.region && prev.y - s.y > 0 && prev.y - s.y <= BLOCK_DY * Math.max(prev.size, s.size) && s.x0 < prev.x1 && s.x1 > prev.x0
    // (by TeX's paragraphs where the compile marked them, ink.mjs `paras`: a block one paragraph, a contents entry one; else by the
    // lines' places, as before)
    const paras = prev && prev.para !== null && prev.para !== undefined && s.para !== null && s.para !== undefined
    // (a paragraph with no point of its own reads as the one before: a contents line ending in its page number ends its entry
    // whatever its point)
    const joins = follows && s.cls !== 'heads' && (s.cls !== 'contents' || !prev.ended) && (paras ? prev.para === s.para : s.cls === 'notes' || s.cls === 'orphan' || s.cls === 'contents')
    if (joins) last.push(s)
    else groups.push([s])
  }
  const out = []
  // (the ink units an ink unit may echo, by their letters: each one echoing none, rule 5)
  const inkEchoOf = new Map()
  // (the author units' words: a block whose letters are an author unit's names is that unit's, of the names toggle, rule 8)
  const authorWords = new Set()
  if (units) for (const u of units) if (u?.kind === 'author') for (const w of utf8(u.pieces.filter(p => p.t === 'text').map(p => p.s ?? '').join(' ')).split(/[^\p{L}]+/u)) { const s = spellOf(w); if (s.length >= 2) authorWords.add(s) }
  const namesOf = lines => {
    if (!authorWords.size) return false
    let all = 0, named = 0
    for (const l of lines) for (const w of l.words) if (w.fam === 'text') for (const part of w.text.split(/[^\p{L}]+/u)) { const s = spellOf(part); if (!s) continue; all += s.length; if (authorWords.has(s)) named += s.length }
    return all > 0 && named >= NAMES_SHARE * all
  }
  for (const lines of groups) {
    const id = base + out.length, cls = (lines[0].cls === 'orphan' || lines[0].cls === 'notes') && namesOf(lines) ? 'names' : lines[0].cls, page = lines[0].page, P = pages[page - 1]
    const G = P.glyphs
    // pieces: text words joined, a run of math or typewriter words a placeholder (rule 4)
    const pieces = [], phs = []
    let text = '', plain = ''
    const flushText = () => { if (text) { pieces.push({ t: 'text', s: sourceView(text) }); plain += text; text = '' } }
    lines.forEach((l, li) => {
      l.words.forEach((w, wi) => {
        const space = wi > 0 || li > 0
        if (w.fam === 'text') {
          // (a hyphen ending a line before a lowercase letter: the word goes on)
          if (space && !(wi === 0 && li > 0 && /-$/.test(text) && /^\p{Ll}/u.test(w.text))) text += ' '
          else if (wi === 0 && li > 0 && /-$/.test(text)) text = text.slice(0, -1)
          text += w.text
        } else {
          const lastPh = phs.at(-1)
          if (lastPh && lastPh.open && lastPh.fam === w.fam) { lastPh.gs.push(...w.gs.map(g => [l.page, g])); lastPh.src += w.text; return }
          if (space) text += ' '
          flushText()
          const ph = { k: pieces.length, fam: w.fam, gs: w.gs.map(g => [l.page, g]), src: w.text, open: true }
          phs.push(ph)
          pieces.push({ t: 'ph', src: sourceView(w.fam === 'math' ? `$${w.text.replace(/[$\\{}]/g, '')}$` : `\\url{${w.text.replace(/[\\{}]/g, '')}}`) })
          return
        }
        for (const p of phs) p.open = false
      })
    })
    flushText()
    // echo (rule 5): its letters and its placeholders' count a source unit's; its pieces then that unit's, each visible placeholder
    // of it placed by the ink unit's kept run in its turn
    let echo = null, own = pieces, kept = phs
    const spell = spellOf(plain), key = `${spell}#${phs.length}`
    const e = units ? echoOf.get(key) : undefined
    const before = e === undefined && spell.length >= 4 ? inkEchoOf.get(key) : undefined
    if (e !== undefined || before !== undefined) {
      echo = e ?? out[before].id
      own = (e !== undefined ? units[e].pieces : out[before].pieces).map(p => ({ ...p }))
      const visible = own.flatMap((p, k) => (p.t === 'ph' && classOf(p) !== null ? [k] : []))
      kept = phs.map((p, j) => ({ ...p, k: visible[j] }))
    }
    const textGlyphs = lines.flatMap(l => l.words.filter(w => w.fam === 'text').flatMap(w => w.gs.map(g => [l.page, g])))
    if (echo === null && spell.length >= 4 && !inkEchoOf.has(key)) inkEchoOf.set(key, out.length)
    out.push({ id, kind: INK_KIND[cls], cls, echo, pieces: own, glyphs: { text: textGlyphs, ph: kept.flatMap(p => p.gs) }, rows: rowsOf(id, INK_KIND[cls], cls, lines, kept, own.length, pages) })
  }
  return out
}

/** the most frequent of values */
function modeOf(values) {
  const n = new Map()
  let best = values[0], most = 0
  for (const v of values) { const c = (n.get(v) ?? 0) + 1; n.set(v, c); if (c > most) { most = c; best = v } }
  return best
}

/** a page's columns, by its column mark (MARK_DEF's c<n>-<k>): 1 or 2 */
const columnsOf = P => { for (const pt of P.points ?? []) { const m = /^c([12])-\d+$/.exec(pt.name); if (m) return Number(m[1]) } return 1 }

/** an ink unit's rows (rule 6) */
function rowsOf(id, kind, cls, lines, phs, nPieces, pages) {
  const lineRows = [], erase = [], frames = []
  const fs = []
  lines.forEach((l, j) => {
    const P = pages[l.page - 1], G = P.glyphs, view = P.view
    const gs = l.words.flatMap(w => w.gs)
    const tg = l.words.filter(w => w.fam === 'text').flatMap(w => w.gs)
    let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
    for (const g of gs) { const x = G[g]; x0 = Math.min(x0, x.x0, x.ix0 ?? x.x0); x1 = Math.max(x1, x.x1, x.ix1 ?? x.x1); top = Math.max(top, x.top); bottom = Math.min(bottom, x.bottom) }
    const base = modeOf(tg.map(g => r2(G[g].y))), size = modeOf(tg.map(g => r2(G[g].size))), font = modeOf(tg.map(g => G[g].font ?? '?'))
    const [a, c, b, d] = solid(view, x0, Math.min(bottom, base), x1, Math.max(top, base))
    lineRows.push(l.page, a, b, Math.min(d, Math.max(c, base)), d, c, Math.min(200, size), font)
    // the erase: the line's text glyphs' boxes, merged (layout/make.mjs rowsOf)
    const rects = tg.map(g => { const x = G[g]; return [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top, x.size] }).sort((p, q) => p[0] - q[0])
    const merged = []
    for (const e of rects) {
      const last = merged.at(-1)
      if (last && e[0] - last[2] <= MERGE * Math.max(last[4], e[4])) merged[merged.length - 1] = [Math.min(last[0], e[0]), Math.min(last[1], e[1]), Math.max(last[2], e[2]), Math.max(last[3], e[3]), Math.max(last[4], e[4])]
      else merged.push(e)
    }
    while (merged.length > ERASE_MAX) {
      let best = 0, gap = Infinity
      for (let q = 0; q + 1 < merged.length; q++) { const g = merged[q + 1][0] - merged[q][2]; if (g < gap) { gap = g; best = q } }
      const p = merged[best], q = merged[best + 1]
      merged.splice(best, 2, [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3]), Math.max(p[4], q[4])])
    }
    for (const e of merged) erase.push(j, ...solid(view, e[0], e[1], e[2], e[3]))
    const cols = columnsOf(P), mid = (view[0] + view[2]) / 2
    const col = cols < 2 ? 0 : a < mid - 4 && b > mid + 4 ? 2 : (a + b) / 2 >= mid ? 1 : 0
    const lastF = fs.at(-1)
    if (lastF && lastF.page === l.page && lastF.col === col) lastF.n++
    else fs.push({ page: l.page, col, first: j, n: 1 })
  })
  // frames: by page and column, each with its share of the text and the room below it
  const total = lines.reduce((n, l) => n + l.words.length, 0) || 1
  let share = -1, seen = 0
  fs.forEach((f, q) => {
    if (q > 0) share = Math.max(share, 0, Math.min(1000, Math.round((1000 * seen) / total)))
    for (let j = f.first; j < f.first + f.n; j++) seen += lines[j].words.length
    const P = pages[f.page - 1], view = P.view, G = P.glyphs
    const last = f.first + f.n - 1, bottomOf = lineRows[8 * last + 5], fx0 = Math.min(...Array.from({ length: f.n }, (_, k) => lineRows[8 * (f.first + k) + 1])), fx1 = Math.max(...Array.from({ length: f.n }, (_, k) => lineRows[8 * (f.first + k) + 2]))
    const foot = bottomOf - 0.5
    let next = -Infinity
    for (const x of G) if (x.top < foot && x.x1 > fx0 && x.x0 < fx1 && x.top > next) next = x.top
    const H = view[3] - view[1]
    const below = Math.min(H, Math.max(0, r2(bottomOf - (Number.isFinite(next) ? next : view[1] + FOOT))))
    frames.push(f.page, f.col, f.first, f.n, q === 0 ? -1 : share, below)
  })
  // a head's line centred where it stands on its page's middle and short of its width (rule 6)
  let flags = 0
  if (cls === 'heads' && lines.length === 1) {
    const view = pages[lines[0].page - 1].view, mid = (view[0] + view[2]) / 2, a = lineRows[1], b = lineRows[2]
    if (Math.abs((a + b) / 2 - mid) <= CENTRE && b - a < 0.8 * (view[2] - view[0])) flags = 4
  }
  const ph = phs.map(p => {
    const segs = []
    for (const l of lines) {
      const mine = p.gs.filter(([pg, g]) => pg === l.page && l.words.some(w => w.gs.includes(g)))
      if (!mine.length) continue
      const G = pages[l.page - 1].glyphs, view = pages[l.page - 1].view
      let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
      for (const [, g] of mine) { const x = G[g]; x0 = Math.min(x0, x.ix0 ?? x.x0); x1 = Math.max(x1, x.ix1 ?? x.x1); top = Math.max(top, x.top); bottom = Math.min(bottom, x.bottom) }
      const [a, c, b, d] = solid(view, x0, bottom, x1, top)
      segs.push(l.page, a, Math.min(d, Math.max(c, r2(G[mine[0][1]].y))), b, d, c)
    }
    return segs.length / 6 > SEGS_INLINE ? null : [p.k, p.fam === 'math' ? 'math' : 'url', 0, ...segs]
  }).filter(Boolean)
  return { unit: [id, kind, 9, flags, nPieces], lines: lineRows, frames, erase, ph }
}

/** a rectangle as the layout file holds it (layout/make.mjs solid): to a hundredth, within its view, a hundredth across at least */
function solid(view, x0, y0, x1, y1) {
  const cx = v => Math.min(view[2], Math.max(view[0], r2(v))), cy = v => Math.min(view[3], Math.max(view[1], r2(v)))
  let a = cx(x0), b = cx(x1), c = cy(y0), d = cy(y1)
  if (b <= a) { if (a + 0.01 <= view[2]) b = r2(a + 0.01); else a = r2(b - 0.01) }
  if (d <= c) { if (c + 0.01 <= view[3]) d = r2(c + 0.01); else c = r2(d - 0.01) }
  return [a, c, b, d]
}

/** the ink units' glyphs claimed in own.mjs's ownership (rule 7): `own.glyphs[p - 1][g]` set to `u<id>` (text) or `u<id>.p`
 *  (a placeholder) where no unit owns it; returns the glyphs claimed */
export function claimInk(own, ink) {
  let n = 0
  for (const u of ink) {
    for (const [p, g] of u.glyphs.text) if (own.glyphs[p - 1] && own.glyphs[p - 1][g] == null) { own.glyphs[p - 1][g] = `u${u.id}`; n++ }
    for (const [p, g] of u.glyphs.ph) if (own.glyphs[p - 1] && own.glyphs[p - 1][g] == null) { own.glyphs[p - 1][g] = `u${u.id}.p`; n++ }
  }
  return n
}

/** the ink units the wrap could not hide alone, as it reads a source unit (wrap.mjs `unhidden`): one with a glyph on a page it did
 *  not wrap, or a placeholder on a page whose groups it merged (its placeholder's ink then folded into its text's). `pages` the
 *  wrap's (wrapOf's `pages`: page -> { ok, merged }). The page pass lays none of them (pipeline/ink-pass.mjs inkOfHost `off`) */
export function inkOff(ink, pages) {
  const out = []
  for (const u of ink) {
    const on = new Set([...u.glyphs.text, ...u.glyphs.ph].map(([p]) => p)), ph = new Set(u.glyphs.ph.map(([p]) => p))
    for (const p of on) { const x = pages.get(p); if (!x?.ok || (x.merged && ph.has(p))) { out.push(u.id); break } }
  }
  return out
}
