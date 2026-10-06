// src/pdf-reader/engine/layer-proto/layer2.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/layer2.js), 2026-10-06, as the instant layer's v0: the layer itself (iterations 2 and
// 3). Our own code, so no licence applies; the provenance is kept so that every number the prototype was approved on
// traces back to it. Unchanged in behaviour: the changes are the module paths, CJK characters written as \u escapes
// (the English gate), imports nothing uses left out, and what is named below. The prototype's own description follows.
//
// v0's changes here: the linter's, none of which changes what runs: `!st?.known` for `!st || !st.known`, and two
// unused locals and two unused names of a destructuring left out.
// And the size correction of a role table face (fonts.mjs setRoleFaces) on each run's SVG size, 1 for the prototype's.
// And step 3 (2026-10-07): a unit's leading relative to the original's own pitch (leadOf); the display environments the
// engine knows (layer1.mjs DISPLAY); and no unit drawn in part: past the fit's last state the host's further steps
// (run.mjs fitFurther: a single line widened over the paper beside it, the text run past a display, the size on below
// its floor, P.further and P.floorMin), the flow past a display being this module's (breakLines 'flow', P.flowPast).
// And prepareUnit in parts (step 2 of the layer's new direction, 2026-10-06), so that the four which read the page's
// geometry (lines, erase extents, labels, placeholder renderings) can come from another source: its statements moved
// into the parts as they were, in the same order; a set of claimed characters, which nothing read, left out. Every
// record, erase, crop, restore and SVG is the same on all 29 outputs.
//
// The instant translation layer, second iteration (and third, below). What changed from layer.js (iteration 1), each measured in the report:
//
// - Styles per run. Each unit's base style (class, weight, slant) and size are the original's own: the majority of the
//   characters of its words on the page (the source's words, as the alignment with `src` finds them), each character's
//   font classified by its PostScript name (fonts.js). The units' open/close pieces and switches (\textbf, \emph,
//   {\bf …}, \texttt…) change the style from there; \emph toggles. Each run is drawn in the target's face for its
//   class (fonts.js faceOf): CJK serif or sans, its bold, Kai or an oblique for italic.
// - Baselines. Every line sits on the original's measured baseline (the median baseline of its characters in the text
//   layer), at the original's measured size (the transform's scale), never on a guess from the line's box. Text is
//   drawn as SVG <text>, whose `y` is the alphabetic baseline by definition for every face, so no font's ascent or
//   descent enters the position.
// - Fit before shrink, in an order given by the parameters (the sweep): tracking (CJK: punctuation compressed, then
//   tighter tracking; alphabets: letter spacing), the white space below the unit (an ink map of the original page),
//   leading (down to the script's floor), and only then the size, in steps, down to its floor; past it, clipped.
// - Line breaking: CJK kinsoku (as before), Korean at spaces with a cap on word spacing (ragged past it), alphabets at
//   spaces with TeX's patterns for hyphenation (hyph.js), CJK–Latin autospace in Chinese and Japanese.
// - DOM text: an SVG per page over the page's copy, one <text> per line and a <tspan> per run, positioned from canvas
//   measurements (no layout read-back): selectable, copyable, searchable, vector at any zoom. The canvas copy keeps the
//   erasing and the crops of math.
//
// Iteration 3 (completeness, measured by check.js): nothing of the original may be lost or drawn twice.
// - Displayed formulas stay where they are: their source read as math (texToText2), their lines never moved before the
//   keep split (blocksOf2), all the lines they hold kept (displayTouched), the text after one starting below it (block
//   breaks, in reading order), a second alignment without their lines' words (a source word a formula also writes).
// - Placeholders: a gap holding two renderings cut into atoms and aligned as runs; the paper's own macros looked for
//   (phClass2) by name, weakly by place, and learnt per paper; citations by their keys' surnames and years, cut out of
//   merged gaps; references and footnote marks by atoms too; brackets the translation sets itself not doubled; a
//   placeholder drawn from its source given a second chance at a rendering no other took.
// - Characters: owned by the line their baseline most likely is (charsOfUnit2), measured in their own design's widths,
//   small capitals and spacing accents kept in their words, radicals hanging from their baseline; lines grown over a
//   formula's tail and an item's rest, a far-in first line from its block's edge before the alignment; labels with
//   their punctuation and caption labels kept.
// - Erasing: what a unit's erasing covers that no painted unit accounts for is put back from the original (kept lines
//   whole, the ink no accounted character stands on); crops grown over the ink they touch and darkened in.
import { blocksOf, CITE, gapClass, lcsMatched, median, NO_END, NO_START, norm, phClass, texToText, wordsOf } from './layer1.mjs'
import { CJK_TARGETS, faceOf, fontString, OBLIQUE_DEG, styleKey } from './fonts.mjs'
import { breakPoints } from './hyph.mjs'

// ---- parameters: per script, each a prior from the public repo's typesetting research, swept on the layer

/** step 3: the fit's further steps for a unit its states leave clipped (run.mjs fitFurther), in order, and the size the
 *  last may go down to: on the gate's 29 outputs they took clipped characters from 943 to 140 (widen 100, flow 138, the
 *  size 465), most below the floor at 0.775 */
const FURTHER = Object.freeze(['widen', 'flow', 'shrink']), FLOOR_MIN = 0.6
/** the defaults, before the sweep chose (main.js overrides any of them from the query) */
export function defaultParams(to) {
  const cjk = CJK_TARGETS.has(to)
  if (to === 'zh' || to === 'zh-TW') return { cjk: true, leadBase: 1.3, leadFloor: 1.0, trackMin: -0.03, compressMax: to === 'zh-TW' ? 0 : 2, borrow: 1, borrowGap: 0.35, floor: 0.8, step: 0.025, grid: 1, order: ['track', 'borrow', 'lead', 'shrink'], cjkJust: 0.25, spaceMax: 1.0, autospace: 0.2, spaceMin: 0.8, hyphen: 1, further: FURTHER, floorMin: FLOOR_MIN, pitchLead: true }
  if (cjk) return { cjk: true, leadBase: 1.0, leadFloor: 1.0, trackMin: -0.03, compressMax: 2, borrow: 1, borrowGap: 0.35, floor: 0.8, step: 0.025, grid: 1, order: ['track', 'borrow', 'lead', 'shrink'], cjkJust: 0.25, spaceMax: 1.0, autospace: to === 'ja' ? 0.2 : 0, spaceMin: 0.8, hyphen: 1, further: FURTHER, floorMin: FLOOR_MIN, pitchLead: true }
  return { cjk: false, leadBase: 1.0, leadFloor: 0.95, trackMin: 0, compressMax: 0, borrow: 1, borrowGap: 0.35, floor: 0.8, step: 0.025, grid: 0, order: ['track', 'borrow', 'lead', 'shrink'], cjkJust: 0.12, spaceMax: 1.2, autospace: 0, spaceMin: 0.8, hyphen: 1, further: FURTHER, floorMin: FLOOR_MIN, pitchLead: true }
}

// ---- the page's characters, each with its font's class

const mctx = new OffscreenCanvas(8, 8).getContext('2d')
const refW = new Map()
const wRef = ch => {
  let w = refW.get(ch)
  if (w === undefined) {
    mctx.font = '100px "Times New Roman", Times'
    w = mctx.measureText(ch).width
    refW.set(ch, w)
  }
  return w
}
/** a character's width at 100 px in its item's own design (iteration 3: Times' for all, before, which put a Palatino
 *  or Computer Modern line's characters points off by its end: a caption's label read "2" for "Figure 2:") */
const designW = new Map()
const wDesign = (ch, st) => {
  if (!st?.known) return wRef(ch)
  const font = fontString(faceOf({ ...st, fam: st.fam === 'math' ? 'serif' : st.fam }, 'latin', 'en'), 100)
  const key = `${font}|${ch}`
  let w = designW.get(key)
  if (w === undefined) {
    mctx.font = font
    w = mctx.measureText(ch).width
    designW.set(key, w)
  }
  return w
}
/** a spacing accent TeX sets over a letter as a glyph of its own ("Zu¨rich"): no width of its own */
export const ACCENT = /^(?:[\u00A8\u00B4\u00B8\u00AF\u02C6-\u02DD\u0060\u005E\u007E]|\p{M})$/u
/** a page's text content as characters: each item's width shared by its design's widths (what is left over, a justified
 *  line's stretch, by its spaces where it has any), and the item's font class (`st`, from fontOf(fontName)) on every
 *  character */
export function pageChars2(textContent, fontOf) {
  const out = []
  for (const [item, it] of textContent.items.entries()) {
    if (!it.str || !it.transform) continue
    const [a, b, , d, x, y] = it.transform
    if (Math.abs(b) > 0.01 || d < 0) continue
    const size = Math.hypot(a, b) || it.height
    const st = fontOf(it.fontName)
    const chars = [...it.str]
    const nat = chars.map(ch => (ACCENT.test(ch) && chars.length > 1 ? 0 : wDesign(ch, st) || 50))
    const sum = nat.reduce((s, v) => s + v, 0) || 1
    const scale = size / 100
    const extra = it.width - sum * scale
    const spaces = chars.filter(ch => ch === ' ').length
    const ws = extra > 0 && spaces && extra < 0.6 * size * spaces ? nat.map((v, k) => v * scale + (chars[k] === ' ' ? extra / spaces : 0)) : nat.map(v => (it.width * v) / sum)
    let cx = x
    chars.forEach((ch, k) => {
      const w = ws[k]
      // a radical hangs from its baseline (CMSY10's √: 0.04 em high, 0.96 em deep): its line is the one below
      const hang = ch === '√' && st?.fam === 'math' ? { ybEff: y - 0.75 * size } : null
      out.push({ ch, x0: cx, x1: cx + w, yb: y, size, item, ix: x, k, st, ...hang })
      cx += w
    })
  }
  return out
}

// ---- the original: each line's baseline and size, the unit's style

const rectKey = r => `${r[0]}|${r.slice(1).join()}`
/**
 * Each of a unit's rectangles: its baseline and size as its characters give them (exact), else from its box. The
 * baselines are the unit's characters' own (those of its main size, in clusters), each rectangle taking, top to bottom,
 * the highest cluster within it at least half a line below the one before: a rectangle is its words' ascent and
 * descent, and a line with Computer Modern's symbols (CMSY10's descent is 0.96 em) reaches almost a line lower, so
 * neither its box nor the nearest-foot ownership of its characters says which line it is (1512.03385 page 2: two
 * lines measured 5 pt apart, drawn over each other).
 */
function lineInfoOf(rects, uc) {
  const real = uc.filter(c => !c.sep && !c.space && c.size && /\S/.test(c.ch) && c.st?.fam !== 'math')
  const all = real.length ? real : uc.filter(c => !c.sep && !c.space && c.size && /\S/.test(c.ch))
  const sizes = new Map()
  for (const c of all) { const z = Math.round(c.size * 4) / 4; sizes.set(z, (sizes.get(z) ?? 0) + 1) }
  const main = sizes.size ? [...sizes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] : 0
  // the baselines the unit's characters of its main size stand on, with how many stand on each
  const ys = all.filter(c => Math.abs(c.size - main) <= 0.12 * main).map(c => c.yb).sort((a, b) => b - a)
  const clusters = []
  for (const y of ys) {
    const c = clusters.at(-1)
    if (c && c.top - y < 0.15 * main) { c.n++; c.sum += y }
    else clusters.push({ top: y, n: 1, sum: y })
  }
  for (const c of clusters) c.y = c.sum / c.n
  const out = new Map()
  let prev = Infinity, prevRect = null
  for (const r of rects) {
    const k = rectKey(r)
    // a new column or page starts again: the rectangle stands above the one before (1512.03385 page 3: a paragraph
    // continued at the next column's top was put below the first column's last line, over another unit)
    if (prevRect && (prevRect[0] !== r[0] || r[2] > prevRect[4])) prev = Infinity
    prevRect = r
    const within = clusters.filter(c => c.y >= r[2] - 0.5 && c.y <= r[4] + 0.5 && c.y < prev - 0.5 * main)
    // the first line: the cluster with most characters; after it, the highest left below the line before
    const pick = within.length ? (prev === Infinity ? within.reduce((a, b) => (b.n > a.n ? b : a)) : within[0]) : null
    let info
    if (pick) info = { baseline: pick.y, size: main, exact: true }
    else {
      // the rectangle is the ascent and descent of its words (anchors.mjs lineRects): Times' share of them
      const h = r[4] - r[2]
      info = { baseline: Math.min(r[2] + 0.24 * h, prev - 0.8 * (main || h)), size: main || h / 0.894, exact: false }
    }
    prev = info.baseline
    out.set(k, info)
    out.set(`${r[0]}|${r[2]}|${r[3]}|${r[4]}`, info)
  }
  return out
}

// ---- iteration 3: what each placeholder is, and which of the page's characters a unit holds

/** a placeholder's source as plain text, its environment, label and alignment marks left out (iteration 1's texToText
 *  gave "equationeq:identity y= F(x, Wi) + x. equation" for a displayed equation, which no rendering resembles) */
const MORE_SYMBOLS = { downarrow: '↓', uparrow: '↑', Downarrow: '⇓', Uparrow: '⇑', leftrightarrow: '↔', longrightarrow: '⟶', dagger: '†', ddagger: '‡', varnothing: '∅', emptyset: '∅', ell: 'ℓ', prime: '′', bullet: '•', checkmark: '✓', triangle: '△', square: '□', blacksquare: '■', diamond: '◇', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', hbar: 'ℏ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wedge: '∧', vee: '∨', neg: '¬', lnot: '¬', setminus: '∖', subsetneq: '⊊', supset: '⊃', supseteq: '⊇', ni: '∋', perp: '⊥', parallel: '∥', angle: '∠', models: '⊨', vdash: '⊢', gg: '≫', ll: '≪', equiv: '≡', cong: '≅', asymp: '≍', doteq: '≐', bigcup: '⋃', bigcap: '⋂', oint: '∮', iint: '∬', coloneqq: '≔', mapsto: '↦', leadsto: '⇝', circledast: '⊛', textdagger: '†', textbullet: '•', S: '§', P: '¶' }
const ACCENTS = { '~': '\u0303', "'": '\u0301', '"': '\u0308', '`': '\u0300', '^': '\u0302', '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030C', H: '\u030B', c: '\u0327', k: '\u0328', r: '\u030A' }
export function texToText2(src) {
  // an accent over its letter, composed: \~{n} is "ñ", \"u "ü"
  const acc = src.replace(/\\([~'"`^=.]|[uvHckr](?![A-Za-z]))\s*\{?\\?([A-Za-z])\}?/g, (m, a, l) => `${l}${ACCENTS[a]}`.normalize('NFC'))
  if (acc !== src) return texToText2(acc)
  const sym = src.replace(/\\([A-Za-z]+)\b/g, (m, name) => (MORE_SYMBOLS[name] ? MORE_SYMBOLS[name] : m))
  if (sym !== src) return texToText2(sym)
  const bare = src.replace(/\\(?:begin|end)\{[^}]*\}(?:\{[^}]*\})?/g, ' ').replace(/\\(?:label|tag)\*?\{[^}]*\}/g, ' ').replace(/\\(?:nonumber|notag)\b/g, ' ').replace(/\\\\/g, ' ').replace(/&/g, ' ')
  return bare === src ? texToText(src) : texToText(bare.trim())
}
/** a command's own name: what a paper's macro (\bert, \imagenet, $\dmodel$) is called, its rendering's likely spelling */
const nameOf = src => (src.match(/\\([A-Za-z]+)/g) ?? []).map(m => m.slice(1)).join('')
/**
 * phClass, with the paper's own macros told apart: a command no table knows (\bert, \oursfull{}, $\dmodel$, $\cla$) has
 * no plain text, which iteration 1 called a symbol and drew as nothing, though the page renders it ("BERT",
 * "ImageNet", "d_model"): 'umacro' for one in text (drawn as the page's text), 'other' with `unknown` for one in math
 * (a crop). Its rendering is looked for on the page like any other.
 */
const STRUCTURAL = new Set(['sqrt', 'frac', 'dfrac', 'tfrac', 'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'mathfrak', 'boldsymbol', 'bm', 'text', 'textrm', 'textbf', 'textit', 'mbox', 'hbox', 'operatorname', 'hat', 'widehat', 'tilde', 'widetilde', 'bar', 'overline', 'underline', 'vec', 've', 'dot', 'ddot', 'limits', 'nolimits', 'displaystyle', 'textstyle', 'scriptstyle', 'begin', 'end', 'label', 'nonumber', 'notag', 'quad', 'qquad'])
/** whether a source holds a command no table renders (a paper's own: \dmodel in $\sqrt{\dmodel}$) */
const unknownCommand = src => (src.match(/\\([A-Za-z]+)/g) ?? []).some(m => !STRUCTURAL.has(m.slice(1)) && !texToText2(m) && !texToText2(`$${m}$`))
export function phClass2(src) {
  const c = phClass(src)
  // a symbol's source that holds a paper's own macro is looked for on the page (iteration 2 drew "√(" for
  // $\sqrt{\dmodel}$, the macro being nothing to it)
  if (c === 'symbol' && texToText2(src) && /^\$|^\\\(/.test(src) && unknownCommand(src)) return { cls: 'other', unknown: true }
  if (c !== 'symbol' || texToText2(src)) return { cls: c }
  const inner = src.replace(/^\$+|\$+$/g, '').replace(/^\\\(|\\\)$/g, '').trim()
  if (!inner) return { cls: 'zero' }
  const ci = phClass(inner)
  if (ci === 'zero' || ci === 'space') return { cls: ci }
  if (!/\\[A-Za-z]/.test(inner)) return { cls: c }
  return /^\$|^\\\(/.test(src) ? { cls: 'other', unknown: true } : { cls: 'umacro', unknown: true }
}

/**
 * charsOfUnit (layer.js), with each character owned by the rectangle whose line it most likely stands on. A line's
 * baseline is 0.22 em above its rectangle's foot or 0.69 em below its top, whichever of the two the character is
 * nearer: a line with Computer Modern's symbols (CMSY10's descent is 0.96 em) has a rectangle reaching almost a line
 * lower, and by its foot alone it took the next line's characters (1512.03385 page 3: "becomes" and the next line's
 * "F(x)+x" read as one word, so neither was found). Also: the lines one rectangle holds are kept apart by a space; a
 * size change alone is no word break (small capitals: "A" "N" for "AN", 0.8 pt apart); a tall rectangle is erased only
 * to its own characters' depth.
 * `exact` (a layout file's lines, tex.mjs): each rectangle's baseline and size, known; a line then holds the characters
 * within its ink's extent (a point either side, a character's place in its item being an estimate) that stand on its
 * baseline, scripts and all (within a script's window of it, as the layout maker takes a line's glyphs), each the line's
 * whose baseline is nearest.
 */
export function charsOfUnit2(rects, charsByPage, extents, exact = null) {
  const out = []
  const yOf = c => c.ybEff ?? c.yb
  const holds = exact
    ? (r, c) => { const cx = (c.x0 + c.x1) / 2; return cx >= r[1] - 1 && cx <= r[3] + 1 && Math.abs(yOf(c) - exact.get(r).baseline) < 0.6 * Math.max(c.size, 5) + 1.5 }
    : (r, c) => {
        const cx = (c.x0 + c.x1) / 2, cy = yOf(c) + c.size * 0.3
        return cx >= r[1] - (r === rects[0] ? 0.5 : 6) && cx <= r[3] + 6 && cy >= r[2] - 1 && cy <= r[4] + 1
      }
  const sizeOf = new Map()
  for (const r of rects) {
    if (exact) { sizeOf.set(r, exact.get(r).size); continue }
    const cs = (charsByPage[r[0] - 1] ?? []).filter(c => /\S/.test(c.ch) && holds(r, c))
    sizeOf.set(r, cs.length ? median(cs.map(c => c.size)) : (r[4] - r[2]) / 0.894)
  }
  const dist = exact ? (r, c) => Math.abs(yOf(c) - exact.get(r).baseline) : (r, c) => { const z = sizeOf.get(r); return Math.min(Math.abs(yOf(c) - (r[2] + 0.22 * z)), Math.abs(yOf(c) - (r[4] - 0.69 * z))) }
  const owner = new Map()
  for (const r of rects) for (const c of charsByPage[r[0] - 1] ?? []) {
    if (!holds(r, c)) continue
    const best = owner.get(c)
    if (!best || dist(r, c) < dist(best, c) - 1e-6) owner.set(c, r)
  }
  for (const r of rects) {
    const [page, x0, y0, x1, y1] = r
    const inside = (charsByPage[page - 1] ?? []).filter(c => owner.get(c) === r)
    const lines = []
    for (const c of [...inside].sort((a, b) => b.size - a.size)) {
      const l = lines.find(l => Math.abs(l.yb - yOf(c)) < 0.6 * l.size)
      if (l) l.chars.push(c)
      else lines.push({ yb: yOf(c), size: c.size || 1, chars: [c] })
    }
    lines.sort((a, b) => b.yb - a.yb)
    lines.forEach((l, li) => {
      if (li > 0) out.push({ ch: ' ', page, x0, x1, yb: l.yb, size: 0, rect: [x0, y0, x1, y1], space: true })
      // a spacing accent last on its line: between its letter and the next it broke the word ("Zu¨rich")
      const sorted = l.chars.sort((a, b) => a.ix - b.ix || a.item - b.item || a.k - b.k)
      const cs = [...sorted.filter(c => !ACCENT.test(c.ch)), ...sorted.filter(c => ACCENT.test(c.ch))]
      cs.forEach((c, n) => {
        const prev = cs[n - 1]
        const gap = prev ? c.x0 - prev.x1 : 0
        if (prev && prev.item !== c.item && !/\s/.test(prev.ch) && !/\s/.test(c.ch) && (gap > 0.12 * c.size || Math.abs(c.yb - prev.yb) > 0.2 * c.size)) out.push({ ch: ' ', page, x0: prev.x1, x1: c.x0, yb: c.yb, size: 0, rect: [x0, y0, x1, y1], space: true })
        out.push({ ...c, page, rect: [x0, y0, x1, y1] })
      })
    })
    if (extents && inside.length) {
      const z = sizeOf.get(r)
      // a rectangle much deeper than its line: its foot is a symbol's box, not ink (the next line stands there)
      const deep = y1 - y0 > 1.35 * 0.894 * z
      const foot = deep ? Math.max(y0, Math.min(...inside.map(c => c.yb - c.size * 0.3))) : y0
      extents.set(r, [Math.min(x0, ...inside.map(c => c.x0)), Math.min(foot, ...inside.map(c => c.yb - c.size * 0.22)), Math.max(x1, ...inside.map(c => c.x1)), Math.max(y1, ...inside.map(c => c.yb + c.size * 0.72))])
    }
    out.push({ ch: ' ', page, x0: x1, x1, yb: y0, size: 0, rect: [x0, y0, x1, y1], sep: true })
  }
  return out
}

/**
 * A unit's line rectangles grown over what stands beside them on their baselines and is no other unit's (iteration 2's
 * extendRects, which grew only over the source's own words): also over a formula's tail (math glyphs, brackets,
 * digits, operators: "(z) =" at a line's end), and a line that is not its block's last, being justified, out to its
 * block's right edge. Before, those characters were erased with the line (its erasing reaches the block's edge) though
 * no placeholder held them. Mutates the rectangles.
 */
export function extendRects2(rects, charsByPage, others, src, wordsOfFn, normFn, pageViews, wordChars = charsByPage) {
  let grown = extendRects(rects, charsByPage, others, src, wordsOfFn, normFn, wordChars)
  const blocks = blocksOf(rects, pageViews)
  const lastOf = new Set(blocks.map(b => b.rects.at(-1).join()))
  const edgeOf = new Map()
  const blockX0 = new Map()
  for (const b of blocks) for (const r of b.rects) { edgeOf.set(r.join(), b.x1); blockX0.set(r.join(), b.x0) }
  for (const r of rects) {
    const page = charsByPage[r[0] - 1] ?? []
    // by their centres: a character's place in its item is an estimate, off by a point or two at an item's end
    const inside = page.filter(c => (c.x0 + c.x1) / 2 >= r[1] - 0.5 && (c.x0 + c.x1) / 2 <= r[3] + 0.5 && c.yb >= r[2] - 0.2 && c.yb <= r[4] && /\S/.test(c.ch))
    if (!inside.length) continue
    const yb = median(inside.map(c => c.yb)), size = median(inside.map(c => c.size))
    const line = page.filter(c => Math.abs(c.yb - yb) < 0.45 * size && /\S/.test(c.ch) && !inside.includes(c)).sort((a, b) => a.x0 - b.x0)
    const foreign = c => (others[r[0]] ?? []).some(o => c.x0 >= o[1] - 0.5 && c.x1 <= o[3] + 0.5 && c.yb >= o[2] - 0.2 && c.yb <= o[4])
    const mathy = c => c.st?.fam === 'math' || /^[()[\]{}=+−\-×·<>≤≥|,.;:0-9∗*′]$/.test(c.ch)
    const key = r.join()
    const edge = !lastOf.has(key) ? edgeOf.get(key) : null
    // never out of the unit's own block (a column's paragraph took the next column's equation number "(4)")
    const bx0 = blockX0.get(key) ?? -Infinity, bx1 = edgeOf.get(key) ?? Infinity
    // an item the line holds the start of and that ends less than 8 pt past it is the line's to its end (an item's
    // extent is exact, its characters' places estimates: "FLOPs)." had its ")." left out)
    let x = Math.max(...inside.map(c => c.x1))
    for (const it of new Set(inside.map(c => c.item))) {
      const cs = page.filter(c => c.item === it).sort((a, b) => a.k - b.k)
      const end = Math.max(...cs.map(c => c.x1))
      if (end <= r[3] + 8) { x = Math.max(x, end); continue }
      // or over its rest: the word the line ends inside, then what is no word ("PosUnk [39]": a table cell's citation)
      let q = Math.max(...cs.map((c, n) => (inside.includes(c) ? n : -1)))
      let spaced = false, last = q
      for (q++; q < cs.length; q++) {
        const c = cs[q]
        if (/\s/.test(c.ch)) { spaced = true; continue }
        if (/[\p{L}]/u.test(c.ch) ? spaced : !mathy(c) && !/\d/.test(c.ch)) break
        last = q
      }
      x = Math.max(x, cs[last].x1)
    }
    // to the right: math always; anything while the line is a justified one, up to its block's edge
    let to = x
    for (const c of line.filter(c => c.x0 >= x - 0.1)) {
      if (c.x0 - to > 1.2 * size || foreign(c) || c.x1 > bx1 + 3) break
      if (!(mathy(c) || (edge !== null && c.x1 <= edge + 1))) break
      to = c.x1
    }
    // to the left: math only (a formula the line starts with), never before the unit's first line
    let from = Math.min(...inside.map(c => c.x0))
    if (r !== rects[0]) for (const c of line.filter(c => c.x1 <= from + 0.1).reverse()) {
      if (from - c.x1 > 0.6 * size || foreign(c) || !mathy(c) || c.x0 < bx0 - 1) break
      from = c.x0
    }
    if (to > r[3] + 0.05) { r[3] = Math.round(to * 100) / 100 + 0.01; grown++ }
    if (from < r[1] - 0.05) { r[1] = Math.round(from * 100) / 100; grown++ }
  }
  return grown
}

/**
 * A block's first line that starts far in (more than a quarter of its width): a line whose start the anchors did not
 * take, being no source word (a URL, a formula), starts at its block's edge, as blocksOf made it; done here, before the
 * unit is aligned, so that what it now holds is the unit's (1512.03385 page 1: the footnote's mark and URL were erased
 * with the line, though neither was the unit's). Not over another unit's line. Mutates the rectangles.
 */
export function extendFirstLines(rects, pageViews, others) {
  for (const b of blocksOf(rects, pageViews)) {
    // blocksOf has moved its copy of the line already: the unit's own rectangle is found by the rest of its corners
    const r0 = b.rects[0]
    const r = rects.find(q => q[0] === r0[0] && q[2] === r0[2] && q[4] === r0[4] && q[3] === r0[3])
    if (!r || r[1] - b.x0 <= 0.25 * (b.x1 - b.x0)) continue
    const x0 = b.x0
    const h = r[4] - r[2]
    const blocked = (others[r[0]] ?? []).some(o => o[3] > x0 && o[1] < r[1] - 0.5 && Math.min(o[4], r[4]) - Math.max(o[2], r[2]) > 0.5 * h)
    if (!blocked) r[1] = x0
  }
}

/**
 * blocksOf (layer.js) with its kept lines (a displayed formula) never moved: blocksOf started a far-in first line at its
 * block's edge before it split the block around the kept lines, so a formula that began a block (the unit's text went
 * on below it) lost its key, was laid over and erased (1512.03385 page 3's equations (1) and (2)). Each block also says
 * how many of the unit's kept regions come before it (`after`, counting those in `referenced`): the text that follows a
 * formula in the translation starts below it.
 * A far-in first line is not moved to its block's edge here (v0's change, step 2): extendFirstLines has moved every one
 * whose start the anchors missed, and left one where another unit's line stands before it (a run-in heading: 1810.04805's
 * "Model Architecture", 1706.03762's "Encoder:"), over which the translation was laid and which it never erased; a
 * layout file's first line starts at the unit's own mark (IEEE's "Index Terms—" before it).
 */
export function blocksOf2(rects, pageViews, keep = null, regionOf = null, referenced = null) {
  const kept = r => !!keep?.has(rectKey(r))
  const blocks = []
  let cur = null
  for (const [page, x0, y0, x1, y1] of rects) {
    const prev = cur?.rects.at(-1)
    const pitchSoFar = cur && cur.rects.length > 1 ? cur.rects.at(-2)[4] - prev[4] : prev ? (prev[4] - prev[2]) * 1.4 : 0
    const follows = cur && cur.page === page && x0 < prev[3] && x1 > prev[1] && y1 < prev[4] && prev[2] - y1 < Math.max(pitchSoFar, (prev[4] - prev[2]) * 1.4) * 0.9
    if (!follows) {
      cur = { page, rects: [] }
      blocks.push(cur)
    }
    cur.rects.push([page, x0, y0, x1, y1])
  }
  for (const b of blocks) {
    const rs = b.rects
    b.x0 = Math.min(...rs.map(r => r[1]))
    b.x1 = Math.max(...rs.map(r => r[3]))
    b.top = Math.max(...rs.map(r => r[4]))
    b.bottom = Math.min(...rs.map(r => r[2]))
    b.h = median(rs.map(r => r[4] - r[2]))
    b.pitch = rs.length > 1 ? median(rs.slice(1).map((r, i) => rs[i][4] - r[4])) : b.h * 1.38
    b.indent = Math.max(0, rs[0][1] - b.x0)
    const centres = rs.map(r => (r[1] + r[3]) / 2)
    const view = pageViews[b.page - 1]
    const pageCentre = view ? (view[0] + view[2]) / 2 : 306
    const widthsVary = Math.max(...rs.map(r => r[3] - r[1])) - Math.min(...rs.map(r => r[3] - r[1])) > 6
    b.centred = rs.length > 1 ? Math.max(...centres) - Math.min(...centres) < 3 && widthsVary : Math.abs(centres[0] - pageCentre) < 3 && b.x1 - b.x0 < 0.8 * (view ? view[2] - view[0] : 612)
  }
  if (!keep?.size) { for (const b of blocks) b.after = 0; return blocks }
  let after = 0
  return blocks.flatMap(b => {
    const runs = []
    let run = null
    b.rects.forEach((r, i) => {
      if (kept(r)) {
        run = null
        const g = regionOf?.get(rectKey(r))
        if (g !== undefined && referenced?.has(g)) after = Math.max(after, g + 1)
      } else {
        if (!run) {
          run = { ...b, rects: [], indent: i === 0 ? b.indent : 0, after }
          runs.push(run)
        }
        run.rects.push(r)
      }
    })
    for (const r of runs) {
      r.top = Math.max(...r.rects.map(x => x[4]))
      r.bottom = Math.min(...r.rects.map(x => x[2]))
    }
    return runs
  })
}

/**
 * gapsOf (layer.js), with the words of some lines (`deny`: a displayed formula's, prepareUnit's second pass) kept from
 * the alignment, so that a source word the formula also writes is found in the text (2610.02069's "…using the RMSE:",
 * whose "RMSE" was taken from "RMSE_i(t) = …" below it: the text line joined the formula's gap, was kept, and the
 * translation was laid over the formula). Sets gapsOf2.unsourced and gapsOf2.last as gapsOf sets its own.
 */
export function gapsOf2(unitChars, src, deny = null) {
  const gaps = gapsOfOnce(unitChars, src, true, deny?.size ? deny : null)
  gapsOf2.unsourced = gapsOfOnce.unsourced
  gapsOf2.last = gapsOfOnce.last
  gapsOf2.denied = deny ?? new Set()
  return gaps
}
function gapsOfOnce(unitChars, src, merge = false, deny = null) {
  let S = wordsOf([...src].map(ch => ({ ch })))
  // iteration 2 (merge): a page word the source spells as two or three ("B idirectional" for a bold-initial
  // "Bidirectional") is one word of the source
  if (merge) {
    const page = new Set(wordsOf(unitChars).map(w => w.w))
    const out = []
    for (let i = 0; i < S.length; i++) {
      const two = S[i + 1] && S[i].w + S[i + 1].w, three = S[i + 2] && two + S[i + 2].w
      if (!page.has(S[i].w) && three && page.has(three)) { out.push({ ...S[i], w: three, end: S[i + 2].end }); i += 2 }
      else if (!page.has(S[i].w) && two && page.has(two)) { out.push({ ...S[i], w: two, end: S[i + 1].end }); i++ }
      else out.push(S[i])
    }
    S = out
  }
  const O = wordsOf(unitChars, new Set(S.map(x => x.w)))
  const lineOf = o => `${unitChars[o.start].page}|${unitChars[o.start].rect.join()}`
  const matched = lcsMatched(S.map(x => x.w), O.map((x, q) => (deny?.has(lineOf(x)) ? `\u0000${q}` : x.w)))
  // the lines on which no word of the source stands: what they hold is a placeholder's rendering (a displayed
  // formula), never the unit's text
  const words = new Map(), sourced = new Set()
  O.forEach((o, q) => {
    const key = `${unitChars[o.start].page}|${unitChars[o.start].rect.join()}`
    words.set(key, (words.get(key) ?? 0) + 1)
    if (matched[q]) sourced.add(key)
  })
  gapsOfOnce.unsourced = [...words.keys()].filter(k => !sourced.has(k))
  // iteration 2 reads the alignment itself: the page's words and which of them are the source's text
  gapsOfOnce.last = { O, matched }
  const gaps = []
  let run = null
  for (let q = 0; q < O.length; q++) {
    if (!matched[q]) {
      // one rendering: the page's words left over with none of the source's between them (a citation may draw
      // several brackets: IEEE's "[4], [5]", "[11]–[13]")
      if (run) run.end = O[q].end
      else {
        run = { start: O[q].start, end: O[q].end }
        gaps.push(run)
      }
    } else run = null
  }
  return gaps.map(g => {
    let { start, end } = g
    // its brackets, a pair at a time (across a line's end or start): "[21, 22]", "(1)", never the ")" of "(Fig. 7)"
    const open = k => { let q = k - 1; while (q >= 0 && /\s/.test(unitChars[q].ch)) q--; return q >= 0 && /[([{]/.test(unitChars[q].ch) ? q : -1 }
    const close = k => { let q = k + 1; while (q < unitChars.length && /\s/.test(unitChars[q].ch)) q++; return q < unitChars.length && /[)\]}]/.test(unitChars[q].ch) ? q : -1 }
    for (let a = open(start), b = close(end); a >= 0 && b >= 0; a = open(start), b = close(end)) { start = a; end = b }
    // and a bracket the rendering opened or closed itself: "H(x" takes its ")"
    const depth = () => { let d = 0; for (let q = start; q <= end; q++) d += /[([{]/.test(unitChars[q].ch) ? 1 : /[)\]}]/.test(unitChars[q].ch) ? -1 : 0; return d }
    for (let d = depth(), b = close(end); d > 0 && b >= 0; d = depth(), b = close(end)) end = b
    for (let d = depth(), a = open(start); d < 0 && a >= 0; d = depth(), a = open(start)) start = a
    const chars = unitChars.slice(start, end + 1)
    return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars }
  })
}


/** the unit's words on the page that are the source's (the alignment's matched words), by style: { key, st, size, runs } */
function originalStyle(uc, O, matched) {
  const runs = [], tally = new Map(), sizes = []
  // by character, over the source's words: a word's bold initial is a run of its own (1810.04805's
  // **B**idirectional **E**ncoder…), a math glyph is no run
  O.forEach((o, q) => {
    if (!matched[q]) return
    for (const c of uc.slice(o.start, o.end + 1)) {
      if (c.sep || c.space || !c.st || !/\S/.test(c.ch) || c.st.fam === 'math') continue
      const key = styleKey(c.st)
      sizes.push(c.size)
      tally.set(key, (tally.get(key) ?? 0) + 1)
      const last = runs.at(-1)
      if (last?.key === key) last.n++
      else runs.push({ key, n: 1, st: c.st })
    }
  })
  if (!runs.length) return null
  const key = [...tally].sort((a, b) => b[1] - a[1])[0][0]
  return { key, st: runs.find(r => r.key === key).st, size: median(sizes), runs: runs.map(r => ({ key: r.key, n: r.n })) }
}

/** the original's style for a unit with no aligned words: the majority of the characters in its rectangles */
function rectStyle(uc) {
  const cnt = new Map(), sizes = []
  for (const c of uc) {
    if (c.sep || c.space || !c.st || c.st.fam === 'math' || !/\S/.test(c.ch)) continue
    const k = styleKey(c.st)
    cnt.set(k, (cnt.get(k) ?? 0) + 1)
    sizes.push(c.size)
  }
  if (!cnt.size) return null
  const key = [...cnt].sort((a, b) => b[1] - a[1])[0][0]
  const st = uc.find(c => c.st && styleKey(c.st) === key).st
  return { key, st, size: median(sizes), runs: [{ key, n: sizes.length }] }
}

/**
 * A unit against its original page: v0's per-unit reading of it (`Prepared`, whose contract layer2.d.mts writes), which
 * the rest of the layer reads (its blocks, tokens, drawing, restore and checker). It is made in parts, each filling its own
 * fields; the four that read the page's geometry are v0's heuristics here, or a layout file's where it locates the unit
 * whole (`parts`):
 *   1. frames and lines (linesOf): the unit's characters on its lines, each line's baseline and size;
 *   2. erase extents (the lines' own, linesOf's): each line's box to erase, before the drawing's padding;
 *   then the alignment (alignUnit, either source's lines): which characters are the source's words, the original's
 *   style, where the first word starts, the lines none of whose words are the source's (kept);
 *   3. labels (labelOf): a label the class sets before the unit's first line, kept as the original's;
 *   4. placeholder renderings (v0Renderings): which of the page's ink each placeholder is, and where it sits;
 *   then the resolution's rules (resolvePlaceholders, either source's renderings): how each placeholder is drawn, the
 *   paper's citations and macros learnt; and the finish (finishUnit): the kept lines in regions, each character's
 *   category (what the restore and the checker read).
 * `charsByPage`: pageChars2's (the unit's own part of each page).
 */
export function prepareUnit(unit, rects, charsByPage, citeMap = null, deny = null, parts = null) {
  const phs = placeholdersOf(unit)
  const out = new Map()
  const lines = (parts?.lines ?? linesOf)(rects, charsByPage)
  out.extents = parts?.extents ? parts.extents(lines, rects) : lines.extents
  // the checker's view (check.js): the unit's characters on the page, which of them are its source's words, and which
  // gap each placeholder took
  out.uc = lines.uc
  out.lineInfo = lines.lineInfo
  const aligned = alignUnit(out, unit, rects, deny)
  // (the lines part 1's source says the unit's source does not write: kept as the original's, as a display's are)
  if (lines.held?.length) out.keep = [...new Set([...(out.keep ?? []), ...lines.held])]
  const gaps = (parts?.label ?? labelOf)(out, unit, rects, charsByPage, aligned)
  resolvePlaceholders(out, { unit, phs, rects, charsByPage, citeMap, gaps }, parts?.renderings ?? v0Renderings)
  finishUnit(out, unit, rects, charsByPage)
  // a displayed formula found, whose lines hold words the alignment took for the source's ("RMSE" in "RMSE_i(t) =",
  // while the text says "…using the RMSE:"): aligned again without its lines' words, once
  if (!deny) {
    const touched = displayTouched(out, out.uc)
    const matchedThere = touched.size > 0 && out.uc.some(c => !c.sep && !c.space && touched.has(`${c.page}|${c.rect.join()}`) && out.matchedKeys.has(charKey(c)))
    if (touched.size && matchedThere) return prepareUnit(unit, rects, charsByPage, citeMap, touched, parts)
  }
  out.displayLines = displayTouched(out, out.uc)
  return out
}

/** a unit's placeholders by piece index, each with its source and class (phClass2); a nested footnote is its mark */
export function placeholdersOf(unit) {
  const phs = []
  unit.pieces.forEach((p, k) => {
    if (p.t === 'ph') phs.push({ k, src: p.src, ...phClass2(p.src) })
    else if (p.t === 'nested') phs.push({ k, src: '\\footnotemark', cls: 'num', nested: true })
  })
  return phs
}

/**
 * Part 1, frames and lines, and part 2, erase extents, v0's: the unit's characters by its rectangles (charsOfUnit2,
 * which measures each line's extent as it reads it) and each line's baseline and size (lineInfoOf).
 */
export function linesOf(rects, charsByPage) {
  const extents = new Map()
  const uc = charsOfUnit2(rects, charsByPage, extents)
  return { uc, extents, lineInfo: lineInfoOf(rects, uc) }
}

/**
 * The unit's words against its source (gapsOf2), on whichever lines part 1 gave: which page characters are its text
 * (matchedKeys), its original style (orig), where its first word starts (firstX0), and the lines none of whose words are
 * the source's, kept as the original's (keep). Returns the gaps: the page's runs of the unit that the source does not
 * write, each a placeholder's rendering or a label.
 */
function alignUnit(out, unit, rects, deny) {
  const uc = out.uc
  out.matchedKeys = new Set()
  let gaps = []
  if (uc.some(c => !c.sep)) {
    gaps = gapsOf2(uc, unit.src, deny).filter(g => g.text && !g.chars.every(c => c.sep))
    const { O, matched } = gapsOf2.last
    O.forEach((o, q) => { if (matched[q]) for (const c of uc.slice(o.start, o.end + 1)) if (!c.sep) out.matchedKeys.add(charKey(c)) })
    out.orig = originalStyle(uc, O, matched) ?? rectStyle(uc)
    // where the unit's first word starts on the page: its line is erased from there (the anchors share an item's
    // width evenly between its characters, so a line's rectangle may start inside its first glyph: "1. Introduction")
    const q0 = matched.findIndex(m => m)
    if (q0 >= 0) {
      const c0 = uc[O[q0].start]
      if (c0 && `${c0.page}|${c0.rect.join()}` === rectKey(rects[0])) out.firstX0 = c0.x0
    }
    if (rects.length > 1) {
      const minX = Math.min(...rects.map(r => r[1])), first = rectKey(rects[0])
      // (iteration 3: or of three words or more, where it starts: a line none of whose words are the source's is not
      // the unit's text, a rectangle the anchors gave it over another's line; kept, it is shown and no text is laid
      // over it)
      // (its words in text fonts only: a line of inline math is the unit's, its formulas placeholders' renderings; and a
      // word the source has anywhere counts as the source's: rectangles out of reading order defeat an alignment in
      // order, 2610.02069 page 11, and that line is still the unit's own)
      const srcWords = new Set(wordsOf([...unit.src].map(ch => ({ ch }))).map(w => w.w))
      const words = new Map(), hits = new Map()
      O.forEach((o, q) => {
        if (uc.slice(o.start, o.end + 1).some(c => c.st?.fam === 'math')) return
        const k = `${uc[o.start].page}|${uc[o.start].rect.join()}`
        words.set(k, (words.get(k) ?? 0) + 1)
        if (matched[q] || (o.w.length >= 3 && srcWords.has(o.w))) hits.set(k, (hits.get(k) ?? 0) + 1)
      })
      out.keep = gapsOf2.unsourced.filter(k => k !== first && (Number(k.split('|')[1].split(',')[0]) > minX + 8 || ((words.get(k) ?? 0) >= 3 && (hits.get(k) ?? 0) < 0.2 * words.get(k))))
      // and a text line of four words or more under a fifth of which are the source's (a word or two the alignment took
      // from it: "and", "for"), not a formula's (those are aligned without them, gapsOf2)
      for (const [k, n] of words) if (k !== first && n >= 4 && (hits.get(k) ?? 0) < 0.2 * n && !out.keep.includes(k) && !gapsOf2.denied?.has(k)) out.keep.push(k)
    }
  } else out.orig = null
  return gaps
}

/**
 * Part 3, labels, v0's: a label the unit's first line starts with that no placeholder draws (the unit begins with text):
 * a footnote's mark, a bullet, an item's number, set by the class before the unit's own start. Kept as the original's:
 * the first line starts after it (out.label). Returns the gaps without it.
 */
export function labelOf(out, unit, rects, charsByPage, gapsIn) {
  let gaps = gapsIn
  const uc = out.uc
  // Iteration 3: the label is the first gap's first atom, so that one written beside a placeholder's rendering is found
  // ("¹ http://image-net.org/…": the footnote's mark and its URL were one gap, the mark erased), and a unit may start
  // with a placeholder that cannot render as it (a URL, not a reference)
  const firstText = unit.pieces.find(p => p.t !== 'ph' || !['zero', 'space'].includes(phClass(p.src)))
  const g0 = gaps[0]
  if (g0) {
    const isReal = c => !c.sep && !c.space && /\S/.test(c.ch)
    // the gap's first atoms (to three: "Figure 3:"), the label the longest of them that reads as one
    const ends = []
    for (let a = g0.chars.findIndex(isReal), n = 0; a >= 0 && n < 3; n++) {
      let e = a
      while (e + 1 < g0.chars.length && isReal(g0.chars[e + 1])) e++
      ends.push([g0.chars.findIndex(isReal), e])
      a = g0.chars.findIndex((c, i) => i > e && isReal(c))
      if (a >= 0 && g0.chars.slice(e + 1, a).some(c => c.sep)) break
    }
    const pick = ends.map(([a, e]) => [a, e, g0.chars.slice(a, e + 1).filter(isReal).map(c => c.ch).join('').replace(/^(Figure|Fig\.|FIGURE|FIG\.|Table|TABLE|Algorithm|ALGORITHM|Listing|Theorem|Lemma|Definition|Proposition|Corollary|Remark|Example|Assumption)/, '$1 ')]).filter(([, , t]) => LABEL.test(t)).at(-1)
    const atom = pick ? g0.chars.slice(pick[0], pick[1] + 1).filter(c => !c.sep && !c.space) : []
    const e = pick?.[1] ?? -1
    const text = pick?.[2] ?? ''
    const okFirst = (firstText?.t === 'text' && /\S/.test(firstText.s)) || (firstText?.t === 'ph' && !['num', 'cite', 'symbol'].includes(phClass(firstText.src)) && !norm(texToText2(firstText.src)).startsWith(norm(text)))
    const firstKey = rectKey(rects[0])
    if (atom.length && okFirst && atom.every(c => `${c.page}|${c.rect.join()}` === firstKey) && uc.findIndex(isReal) === uc.indexOf(atom[0])) {
      // with the punctuation it ends with ("Figure 2:"), which is no word and so not in the gap
      let u = uc.indexOf(atom.at(-1))
      while (uc[u + 1] && !uc[u + 1].sep && !uc[u + 1].space && /^[.:;,)\]]$/.test(uc[u + 1].ch)) atom.push(uc[++u])
      out.label = { x1: Math.max(...atom.map(c => c.x1)), text, chars: atom }
      const rest = g0.chars.slice(e + 1)
      if (rest.some(isReal)) gaps = [{ text: rest.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: rest.slice(rest.findIndex(isReal)) }, ...gaps.slice(1)]
      else gaps = gaps.slice(1)
    }
    // (v0's change, step 2) or, where the unit begins with text and its first line opens with what its source does not
    // write, before its first word: another unit's ink on that line (a run-in heading the anchors did not place, which
    // extendFirstLines took in: 1810.04805's "Input/Output Representations"), kept as the original's like a label, the
    // first line starting after it; it was kept and laid over
    const real = g0.chars.filter(isReal)
    const drawsFirst = unit.pieces.find(p => (p.t === 'text' ? /\S/.test(p.s) : p.t === 'ph' ? !['zero', 'space'].includes(phClass(p.src)) : p.t === 'nested'))
    if (!out.label && real.length && drawsFirst?.t === 'text' && out.firstX0 !== undefined && real.every(c => `${c.page}|${c.rect.join()}` === firstKey && c.x1 <= out.firstX0 + 0.1) && uc.findIndex(isReal) === uc.indexOf(real[0]) && !nearIn(norm(real.map(c => c.ch).join('')), norm(unit.src), unit.src)) {
      out.label = { x1: Math.max(...real.map(c => c.x1)), text: g0.text, chars: real }
      gaps = gaps.slice(1)
    }
  }
  return gaps
}
/**
 * A float's label as the final sets it in the target (the table-groups brief, Problem 2): `label` the label v0 or the
 * layout file found on the unit's first line (labelOf: "Table 2:", the file's "Table2:"), `names` the target's names of a
 * figure and a table (caption-names.mjs: babel's, which the final prints), `captions` which of the two the final names so
 * (live.mjs captionsOf: `target` or `source`), `to` the target. The name the final's babel gives the float, in capitals
 * where the original's is (a class's \MakeUppercase: TABLE I), a space, then the original's own number and punctuation;
 * null where the label is no figure's or table's, where the final keeps the paper's own name for it, or where the name is
 * the original's already (French's Figure and Table): the label is then kept as the original's ink
 */
export function labelInTarget(label, names, captions, to) {
  const m = label?.text && /^\s*(Figure|Fig\.|FIGURE|FIG\.|Table|TABLE)\s*([0-9]+(?:\.[0-9]+)?[a-z]?|[IVXL]+)\s*([.:]?)\s*$/.exec(label.text)
  if (!m || !names) return null
  const kind = /^t/i.test(m[1]) ? 'table' : 'figure'
  if (captions?.[kind] !== 'target' || !names[kind]) return null
  const caps = m[1] === m[1].toUpperCase()
  const name = caps ? names[kind].toLocaleUpperCase(to) : names[kind]
  if (name === m[1]) return null
  // the punctuation as the original's line has it after the number: a label's own characters, which labelOf took with it
  const punct = m[3] || ((label.chars ?? []).map(c => c.ch).join('').match(/[.:]$/)?.[0] ?? '')
  return `${name} ${m[2]}${punct}`
}
/** what a label reads as: a number, a mark, an item's, or a float's or a theorem's name and number */
const LABEL = /^(?:[\d*†‡§¶•◦▪–·]{1,3}|\(?[a-z0-9ivx]{1,4}[.)]|(?:Figure|Fig\.|FIGURE|FIG\.|Table|TABLE|Algorithm|ALGORITHM|Listing|Theorem|Lemma|Definition|Proposition|Corollary|Remark|Example|Assumption)\s*[\dIVXL]+(?:\.\d+)?[a-z]?[.:]?)$/

/** the longest common subsequence of two strings, over the longer's length */
const lcs = (a, b) => {
  if (!a || !b) return 0
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1])
  return L[n][m] / Math.max(n, m)
}
/** a placeholder's class as the renderings are kept: a citation, a reference's or a mark's number, anything else */
const renderingClass = c => (c === 'macro' || c === 'umacro' || c === 'display' ? 'other' : c)
/** a citation's keys, from its source */
export const citeKeys = src => src.replace(CITE, '').replace(/\}$/, '').split(',').map(k => k.trim()).filter(Boolean)
const numsOf = g => {
  const r = []
  for (const m of g.text.matchAll(/(\d+)(?:\]?\s*[–-]\s*\[?(\d+))?/g)) {
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    for (let n = a; n <= b && n - a < 50; n++) r.push(String(n))
  }
  return r
}
/**
 * A citation's rendering found: in the source's own brackets ("([10, 25, 24, 35])") its brackets are the source's text,
 * and the rendering is what is inside them; and what it says learnt for the paper (citeMap: a key's number, an
 * author-year key's text), by which the units laid after it draw a citation not found. Returns the rendering.
 */
export function learnCite(p, g0, citeMap) {
  let g = g0
  if (/^\(\s*\[/.test(g.text) && /\]\s*\)$/.test(g.text)) {
    const real = g.chars.filter(c => !c.sep && !c.space && /\S/.test(c.ch))
    const inner = g.chars.slice(g.chars.indexOf(real[0]) + 1, g.chars.indexOf(real.at(-1)))
    g = { text: inner.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: inner, of: g }
  }
  if (citeMap && p.keys.length === 1) citeMap.set(p.keys[0], numsOf(g)[0])
  if (citeMap && p.keys.length === 1 && YEAR.test(g.text)) {
    if (!citeMap.text) citeMap.text = new Map()
    citeMap.text.set(p.keys[0], g.text)
  }
  return g
}

/**
 * Part 4, placeholder renderings, v0's: which of the unit's gaps (the page's runs its source does not write) each
 * placeholder's rendering is, by what they say. The gaps are grown over the math glyphs beside them and their citations
 * cut out; the references, marks and formulas are aligned in order with runs of the gaps' atoms; the citations matched by
 * their numbers, surnames and years. Returns the gaps as grown (out.gaps) and each placeholder's rendering
 * (gapFor(p, cls), called once a placeholder in the unit's order).
 */
export function v0Renderings({ phs, gaps: gapsIn, uc, citeMap, plain }) {
  let gaps = gapsIn
  const looked = phs.filter(p => p.cls === 'cite' || p.cls === 'num' || p.cls === 'other' || p.cls === 'macro' || p.cls === 'umacro' || p.cls === 'display')
  // a math glyph next to a gap (no word, so no gap's: "√" before "dk", "−" between two) is that rendering's
  const ucIndex = new Map(uc.map((c, i) => [c, i]))
  const mathGlyph = c => c && !c.sep && !c.space && /\S/.test(c.ch) && !/[\p{L}\p{N}]/u.test(c.ch) && (c.st?.fam === 'math' || /^[√∑∏∫±∓×÷=<>≤≥≈∼≠∈∉⊂⊆∪∩→←⇒⇔∞∂∇′|‖·∗⋆]$/.test(c.ch))
  gaps = gaps.map(g => {
    const real = g.chars.filter(c => !c.sep)
    let a = ucIndex.get(real[0]), b = ucIndex.get(real.at(-1))
    if (a === undefined || b === undefined) return g
    const a0 = a, b0 = b
    // over the space between two of a rectangle's lines too, for a glyph beside the rendering: a radical hangs from its
    // baseline at its top (1706.03762's √ at 400.6 pt over "d" at 392.8), a line of its own
    const gx0 = Math.min(...real.map(c => c.x0)) - 3, gx1 = Math.max(...real.map(c => c.x1)) + 3
    const near = c => c.x1 >= gx0 && c.x0 <= gx1
    for (;;) {
      if (mathGlyph(uc[a - 1])) { a--; continue }
      if (uc[a - 1]?.space && !uc[a - 1].sep && mathGlyph(uc[a - 2]) && near(uc[a - 2])) { a -= 2; continue }
      break
    }
    for (;;) {
      if (mathGlyph(uc[b + 1])) { b++; continue }
      if (uc[b + 1]?.space && !uc[b + 1].sep && mathGlyph(uc[b + 2]) && near(uc[b + 2])) { b += 2; continue }
      break
    }
    if (a === a0 && b === b0) return g
    const chars = uc.slice(a, b + 1)
    return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars }
  })
  gaps = gaps.flatMap(splitCites)
  const byClass = { cite: [], num: [], other: [] }
  for (const g of gaps) byClass[gapClass2(g.text)].push(g)
  // iteration 3: references and footnote marks too, so that one sharing a gap with another rendering is found ("5)²")
  const others = phs.filter(p => (renderingClass(p.cls) === 'other' || p.cls === 'num') && looked.concat(phs.filter(q => q.nested)).includes(p)), og = [...byClass.num, ...byClass.other].sort((a, b) => gaps.indexOf(a) - gaps.indexOf(b))
  // a placeholder against a rendering: their plain texts alike; a paper's own macro by its name ("\imagenet",
  // "ImageNet"), or else any rendering that is no number, weakly (taken in order by what no better placeholder took)
  const WEAK = 0.55
  const NUMLIKE = /^\(?(?:\d+|[IVXLC]+|[A-Z])(?:[.-](?:\d+|[A-Z]))*[a-z]?\)?$/
  const sim = (p, g) => {
    if (p.cls === 'num') {
      if (!NUMLIKE.test(g.text)) return 0
      // a footnote's mark is set small and raised
      const real = g.chars.filter(c => !c.sep && !c.space)
      const small = real.length && real.every(c => c.size < 0.85 * Math.max(...uc.filter(d => !d.sep && !d.space).map(d => d.size)))
      return p.nested || /^\\footnotemark/.test(p.src) ? (small ? 0.8 : 0.55) : small ? 0.55 : 0.7
    }
    const b = g.norm ?? norm(g.text)
    const { t, name } = plain.get(p)
    // a ratio of lengths under a half cannot reach a half (the alignment's cost bounded)
    const near = a => a && b && Math.min(a.length, b.length) >= 0.5 * Math.max(a.length, b.length)
    if (t) return near(t) ? lcs(t, b) : 0
    if (!p.unknown) return 0
    const byName = near(name) ? lcs(name, b) : 0
    // weakly: a whole gap a little more than a part of one ("Vision Transformer (ViT)" is "\oursfull{} (\oursabbrv)")
    return byName >= 0.5 ? byName : b && gapClass(g.text) === 'other' ? WEAK : 0
  }
  // iteration 3: a gap may hold two placeholders' renderings with nothing of the source between them ("i.e., H(x) − x"
  // for \ie and $\mathcal{H}(\ve{x})-\ve{x}$; "(i.e., σ(y)" for \ie and $\sigma(\ve{y})$): one took it all, the other was
  // drawn from its source beside it. The gaps are cut at their spaces into atoms, and a placeholder takes a run of
  // atoms of one gap (an alignment of the placeholders, in order, with runs of atoms, the most alike in total)
  const atoms = []
  og.forEach((g, gi) => {
    let cur = null
    g.chars.forEach((c, ci) => {
      if (c.sep || c.space || !/\S/.test(c.ch)) { cur = null; return }
      if (!cur) { cur = { gi, from: ci, to: ci }; atoms.push(cur) }
      cur.to = ci
    })
  })
  // a run of atoms as a rendering: the source's own punctuation and an unpaired bracket at its ends left out (the "(" of
  // "addition (i.e.", the "," after "i.e.")
  const runOf = (s, e, stop = Infinity) => {
    const g = og[atoms[s].gi]
    let a = atoms[s].from, b = atoms[e - 1].to
    const real = i => !g.chars[i].sep && !g.chars[i].space
    for (;;) {
      while (b > a && (!real(b) || /[,;:]/.test(g.chars[b].ch))) b--
      let d = 0
      for (let i = a; i <= b; i++) d += /[([{]/.test(g.chars[i].ch) ? 1 : /[)\]}]/.test(g.chars[i].ch) ? -1 : 0
      if (d > 0 && /[([{]/.test(g.chars[a].ch) && b > a) { a++; continue }
      if (d < 0 && /[)\]}]/.test(g.chars[b].ch) && b > a) { b--; continue }
      break
    }
    // and the brackets it opened closed, as gapsOf closes them ("F(x, {W i" takes its "})")
    const realAt = (i, step) => { for (let q = i + step; q >= 0 && q < g.chars.length; q += step) if (real(q) && /\S/.test(g.chars[q].ch)) return q; return -1 }
    for (;;) {
      let d = 0
      for (let i = a; i <= b; i++) d += /[([{]/.test(g.chars[i].ch) ? 1 : /[)\]}]/.test(g.chars[i].ch) ? -1 : 0
      const nb = realAt(b, 1), na = realAt(a, -1)
      if (d > 0 && nb >= 0 && nb < stop && /[)\]}]/.test(g.chars[nb].ch)) b = nb
      else if (d < 0 && na >= 0 && /[([{]/.test(g.chars[na].ch)) a = na
      else break
    }
    const chars = g.chars.slice(a, b + 1)
    return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars, of: g }
  }
  const A = others.length, Bn = atoms.length
  const best = Array.from({ length: A + 1 }, () => new Float64Array(Bn + 1))
  const how = Array.from({ length: A + 1 }, () => new Int32Array(Bn + 1))
  const atomsText = (s, e) => { const g = og[atoms[s].gi]; return g.chars.slice(atoms[s].from, atoms[Math.max(s, e - 1)].to + 1).map(c => c.ch).join('') }
  const runs = new Map()
  const runAt = (s, e) => {
    const key = `${s}|${e}`
    if (!runs.has(key)) { const r = runOf(s, e); r.norm = norm(r.text); runs.set(key, r) }
    return runs.get(key)
  }
  // a weak match (a macro by nothing but its place) only of a whole gap: a part of one says no more than the whole
  const whole = (s, e) => (s === 0 || atoms[s - 1].gi !== atoms[s].gi) && (e === atoms.length || atoms[e].gi !== atoms[e - 1].gi)
  const S = (i, s, e) => { const v = sim(others[i], runAt(s, e)); return v === WEAK && !whole(s, e) ? 0.5 : v }
  for (let i = 1; i <= A; i++) for (let j = 1; j <= Bn; j++) {
    let v = best[i - 1][j], h = -1
    if (best[i][j - 1] > v) { v = best[i][j - 1]; h = -2 }
    for (let s = j - 1; s >= 0 && j - s <= 16 && atoms[s].gi === atoms[j - 1].gi; s--) {
      const sc = S(i - 1, s, j)
      if (sc < 0.5) continue
      // on a tie, the longer run where what it adds is no letter or digit (a radical, a bracket: "√ d k" over "d k")
      const tie = h >= 0 && Math.abs(best[i - 1][s] + sc - v) < 1e-9 && !atomsText(s, h).match(/[\p{L}\p{N}]/u)
      if (best[i - 1][s] + sc > v + 1e-9 || tie) { v = best[i - 1][s] + sc; h = s }
    }
    best[i][j] = v
    how[i][j] = h
  }
  const otherGap = new Map()
  const chosen = []
  for (let i = A, j = Bn; i > 0 && j > 0;) {
    const h = how[i][j]
    if (h >= 0) { chosen.push([others[i - 1], h, j]); i--; j = h }
    else if (h === -2) j--
    else i--
  }
  // each run as rendered, its brackets closed but never into the next run of its gap
  chosen.reverse()
  chosen.forEach(([p, h, j], n) => {
    const next = chosen[n + 1]
    const stop = next && atoms[next[1]].gi === atoms[h].gi ? atoms[next[1]].from : Infinity
    const r = stop === Infinity ? runAt(h, j) : runOf(h, j, stop)
    otherGap.set(p, r)
  })
  const citeGap = new Map(), usedCite = new Set()
  for (const p of phs.filter(p => p.cls === 'cite')) {
    const keys = p.keys
    const known = keys.map(k => citeMap?.get(k))
    const fits = g => !usedCite.has(g) && numsOf(g).length === keys.length && known.every(n => n === undefined || numsOf(g).includes(n))
    // an author-year citation by what its keys say (a surname, a year) where a rendering says it: the first that fits by
    // its count alone handed one citation's rendering to another, and the rest on down the unit
    // (a rendering that names someone else is not this citation's)
    const hasName = keys.some(k => keyInfo(k).name.length >= 3)
    const scored = byClass.cite.filter(fits).map(g => [g, keyScore(keys, g.text)]).filter(([g, v]) => v > 0 || !hasName || !anyName(g.text))
    const named = scored.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    const g = named.length ? named[0][0] : scored[0]?.[0]
    if (g) {
      usedCite.add(g)
      const r = learnCite(p, g, citeMap)
      usedCite.add(r)
      citeGap.set(p, r)
    }
  }
  const taken = new Set([...otherGap.values()].map(r => r.of))
  byClass.num = byClass.num.filter(g => !taken.has(g))
  const next = { cite: 0, num: 0, other: 0 }
  const gapFor = (p, cls) => (cls === 'other' ? otherGap.get(p) : cls === 'cite' ? citeGap.get(p) : otherGap.get(p) ?? byClass[cls][next[cls]++])
  return { gaps, gapFor }
}

/**
 * The resolution's rules, either source's renderings (`renderingsOf`, v0Renderings or a layout file's): each
 * placeholder by piece index drawn as nothing, a space, a symbol from its source, a kept rendering, its rendering's page
 * text or crop (drawnAs), a citation as the paper wrote it before (cite-map), or its source's plain text; a rendering in
 * brackets the translation sets itself without its own; a second chance for a placeholder drawn from its source; the
 * paper's own macros learnt by their renderings. Sets the resolutions, out.gaps and the kept lines of displays.
 */
function resolvePlaceholders(out, ctx, renderingsOf) {
  const { unit, phs, rects, charsByPage, citeMap } = ctx
  const uc = out.uc
  for (const p of phs) if (p.cls === 'cite') p.keys = citeKeys(p.src)
  // a paper's own macro is known by its rendering once it has been found (citeMap.macros, the paper's)
  if (citeMap && !citeMap.macros) citeMap.macros = new Map()
  const macros = citeMap ? citeMap.macros : new Map()
  const plain = new Map(phs.map(p => [p, { t: norm(texToText2(p.src) || (p.unknown ? macros.get(p.src) ?? '' : '')), name: norm(nameOf(p.src)) }]))
  const { gaps, gapFor, fixed } = renderingsOf({ ...ctx, uc, plain, out })
  out.gaps = gaps
  const gapOf = new Map()
  for (const p of phs) {
    // (a source that knows how a placeholder is drawn: a layout file's macro that sets no ink, or its text symbol)
    const f = fixed?.(p)
    if (f) out.set(p.k, f)
    else if (p.cls === 'zero') out.set(p.k, { mode: 'none', text: '' })
    else if (p.cls === 'space') out.set(p.k, { mode: 'none', text: ' ' })
    else if (p.cls === 'symbol') {
      const text = texToText2(p.src)
      // a mark the unit starts with that the original shows just before the unit's first line (not erased): not drawn
      // twice (2610.02069's "* These authors…", drawn "**")
      if (p === phs[0] && unit.pieces.slice(0, p.k).every(q => q.t === 'ph' || !/\S/.test(q.s ?? '')) && leadMark(rects, charsByPage, text.replace(/^\^/, ''))) out.set(p.k, { mode: 'kept', text: '' })
      else out.set(p.k, { mode: 'symbol', text: text.replace(/^\^\(?|\)$/g, ''), math: true, sup: /^\$?\^/.test(p.src.replace(/^\$/, '')) || /^\^/.test(text) })
    }
    else {
      const cls = renderingClass(p.cls)
      let g = gapFor(p, cls)
      // (a citation's own round brackets as well: "\uFF08(Zhai et al., 2019a)\uFF09")
      if (g && (cls === 'num' || cls === 'other' || (cls === 'cite' && /^\(/.test(g.text))) && /^[([]/.test(g.text) && /[)\]]$/.test(g.text) && bracketed(unit.pieces, p.k)) {
        // the translation sets the brackets round it itself ("Eqn.\uFF08\ref{…}\uFF09"): the rendering without its own, which
        // the gap took from the source's text ("Eqn.(1)"), or the reader sees "\uFF08(1)\uFF09"
        const real = g.chars.filter(c => !c.sep && !c.space && /\S/.test(c.ch))
        const inner = g.chars.slice(g.chars.indexOf(real[0]) + 1, g.chars.indexOf(real.at(-1)))
        if (inner.some(c => /[\p{L}\p{N}]/u.test(c.ch))) g = { text: inner.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: inner, of: g.of ?? g, unbracketed: true }
      }
      if (g) gapOf.set(p.k, g)
      if (!g && cls === 'cite' && citeMap && p.keys.length && p.keys.every(k => citeMap.has(k))) {
        // an author-year paper's citation as the page wrote it before (iteration 2 gave "[2017]")
        const years = p.keys.every(k => citeMap.text?.has(k))
        out.set(p.k, { mode: 'cite-map', text: years ? p.keys.map(k => citeMap.text.get(k)).join('; ') : `[${p.keys.map(k => citeMap.get(k)).join(', ')}]` })
        continue
      }
      const sup = p.nested || /^\\footnotemark/.test(p.src)
      if (p.cls === 'display') {
        if (g) out.keep = [...(out.keep ?? []), ...displayLines(g, uc)]
        out.set(p.k, { mode: g ? 'kept' : 'none', text: '' })
        continue
      }
      if (g && out.keep?.length && g.chars.filter(c => !c.sep && !c.space).every(c => out.keep.includes(`${c.page}|${c.rect.join()}`))) {
        out.set(p.k, { mode: 'kept', text: '' })
        continue
      }
      if (!g) out.set(p.k, { mode: 'source', text: p.nested ? '*' : texToText2(p.src), math: p.cls === 'other', sup })
      else out.set(p.k, drawnAs(p, g, cls, sup, out.lineInfo))
    }
  }
  // each resolution with its placeholder and the gap it took (the checker's)
  for (const p of phs) {
    const r = out.get(p.k)
    if (r) Object.assign(r, { k: p.k, src: p.src, cls: p.cls, gap: gapOf.get(p.k) ?? null })
  }
  secondChance(out, phs, gaps, plain, lcs, unit, citeMap, uc)
  // a rendering in the source's own brackets inside the translation's ("\uFF08(RMSE)\uFF09"), wherever it was found
  for (const p of phs) {
    const r = out.get(p.k)
    const g = r?.gap
    if (!g || g.unbracketed || (r.mode !== 'crop' && r.mode !== 'orig-text') || !/^[([]/.test(g.text) || !/[)\]]$/.test(g.text) || !bracketed(unit.pieces, p.k)) continue
    const real = g.chars.filter(c => !c.sep && !c.space && /\S/.test(c.ch))
    const inner = g.chars.slice(g.chars.indexOf(real[0]) + 1, g.chars.indexOf(real.at(-1)))
    if (!inner.some(c => /[\p{L}\p{N}]/u.test(c.ch))) continue
    const ng = { text: inner.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: inner, of: g.of ?? g, unbracketed: true }
    const cls = p.cls === 'cite' ? 'cite' : p.cls === 'num' ? 'num' : 'other'
    out.set(p.k, { ...drawnAs(p, ng, cls, r.sup, out.lineInfo), k: p.k, src: p.src, cls: p.cls, gap: ng, second: r.second })
  }
  for (const p of phs) {
    const r = out.get(p.k)
    if (!p.unknown || !r) continue
    if ((r.mode === 'orig-text' || r.mode === 'crop') && r.gap?.text && !macros.has(p.src)) macros.set(p.src, r.gap.text)
    // not found: drawn as it was found before, if it was
    if (r.mode === 'source' && !r.text && macros.has(p.src)) r.text = macros.get(p.src)
  }
}

/**
 * The finish, either source's: a located display's lines all kept, the kept lines in runs (regions) in the unit's order
 * with the kept placeholders' regions (the text after one starts below it), and what became of each of the unit's
 * characters (categoriesOf: what the restore puts back and the checker reads).
 */
function finishUnit(out, unit, rects, charsByPage) {
  const uc = out.uc
  // a located display's lines all kept: those it holds a third of, and their pieces on the same band (a fraction's
  // numerator line it holds less of was laid over and erased)
  out.keep = [...new Set([...(out.keep ?? []), ...displayTouched(out, uc)])]
  // the kept lines in runs (regions), in the unit's order: the text after a kept placeholder starts below its region
  const keepSet = new Set(out.keep ?? [])
  out.regionOf = new Map()
  let region = -1, inRun = false
  for (const r of rects) {
    const k = rectKey(r)
    if (keepSet.has(k)) { if (!inRun) region++; inRun = true; out.regionOf.set(k, region) }
    else inRun = false
  }
  out.referenced = new Set()
  for (const r of out.values()) {
    if (r.mode !== 'kept' || !r.gap) continue
    const regs = r.gap.chars.filter(c => !c.sep && !c.space).map(c => out.regionOf.get(`${c.page}|${c.rect.join()}`)).filter(g => g !== undefined)
    if (regs.length) { r.region = Math.max(...regs); out.referenced.add(r.region) }
  }
  // the translation's own text, letters only: a name it keeps as the page writes it ("Niño", whose ñ the source wrote
  // as a command) is drawn, not shown twice
  const trLetters = norm(unit.pieces.filter(p => p.t === 'text').map(p => p.s).join(' ') + ' ' + [...out.values()].map(r => r?.text ?? '').join(' '))
  out.cat = categoriesOf(out, uc, unit.src, keepSet, drawnTextOf(out, charsByPage), trLetters)
}

/** the lines a located displayed formula holds a third of the characters of, or more */
export function displayTouched(res, uc) {
  const all = new Map()
  const key = c => `${c.page}|${c.rect.join()}`
  for (const c of uc) if (!c.sep && !c.space && /\S/.test(c.ch)) all.set(key(c), (all.get(key(c)) ?? 0) + 1)
  const out = new Set()
  for (const r of res.values()) {
    if (r?.cls !== 'display' || !r.gap) continue
    const mine = new Map()
    for (const c of r.gap.chars) if (!c.sep && !c.space && /\S/.test(c.ch)) mine.set(key(c), (mine.get(key(c)) ?? 0) + 1)
    for (const [k, n] of mine) if (n >= (all.get(k) ?? 0) / 3) out.add(k)
  }
  // with the line's other rectangles (a formula's line comes in pieces: "RMSE(t) = …" and "RMSE_i(t) (6)")
  const box = k => { const [pg, r] = k.split('|'); const [, y0, , y1] = r.split(',').map(Number); return { pg, y0, y1 } }
  const held = [...out].map(box)
  for (const k of all.keys()) {
    if (out.has(k)) continue
    const b = box(k)
    if (held.some(h => h.pg === b.pg && Math.min(h.y1, b.y1) - Math.max(h.y0, b.y0) > 0.5 * Math.min(h.y1 - h.y0, b.y1 - b.y0))) out.add(k)
  }
  return out
}

const normU = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
/** what the unit's placeholders draw, as one string of letters and digits a placeholder apart: their text, a crop's
 *  page characters */
function drawnTextOf(res, charsByPage) {
  const parts = []
  for (const r of res.values()) {
    if (!r) continue
    if (r.mode === 'crop') {
      const [x0, y0, x1, y1] = r.crop
      parts.push(normU((charsByPage[r.page - 1] ?? []).filter(c => (c.x0 + c.x1) / 2 >= x0 && (c.x0 + c.x1) / 2 <= x1 && c.yb >= y0 && c.yb <= y1).sort((a, b) => a.x0 - b.x0).map(c => c.ch).join('')))
      parts.push(normU(r.text))
    } else if (r.text) parts.push(normU(r.text))
  }
  return `|${parts.join('|')}|`
}

/**
 * A crop's baseline without a source that knows its ink (step 3): the baseline its glyphs of its line's text size stand
 * on, the line's own (its rendering's line: the unit's line that holds most of its characters, `lineInfo`); where it has
 * none (a fraction, a formula all scripts), that line's baseline where it was measured from its characters (exact) and
 * stands within 0.6 em; else its largest glyphs' (`main`). By its characters' median size, a crop most of whose glyphs
 * were a script ("i^{th}": 'i' and two of the script) was set on the script's baseline, 3.96 pt low, and a fraction on
 * its radical's origin (1706.03762's "1/√dk", 1.2 pt low).
 */
export function cropBaselineOf(real, lineInfo, main) {
  const big = Math.max(...real.map(c => c.size))
  const n = new Map()
  for (const c of real) { const k = `${c.page}|${c.rect?.join()}`; n.set(k, (n.get(k) ?? 0) + 1) }
  const info = lineInfo && real.length ? lineInfo.get([...n].sort((a, b) => b[1] - a[1])[0][0]) : null
  const atText = real.filter(c => c.size >= 0.85 * (info?.size || big))
  if (atText.length) return median(atText.map(c => c.yb))
  const own = median(main.map(c => c.yb))
  return info?.exact && Math.abs(info.baseline - own) <= 0.6 * big ? info.baseline : own
}

/** a placeholder drawn from its rendering on the page: as the page's text (a citation, a reference, a macro, a formula
 *  over lines) or as a crop of the page (a formula); `lineInfo`, the unit's lines' (Prepared's) */
function drawnAs(p, g, cls, sup, lineInfo = null) {
  const real = g.chars.filter(c => !c.sep && !c.space)
  const lines = new Set(real.map(c => c.rect.join()))
  const lineSize = median(real.map(c => c.size))
  const tally = new Map()
  for (const c of real) if (c.st && /\S/.test(c.ch)) tally.set(c.st, (tally.get(c.st) ?? 0) + 1)
  const gst = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0]
  // one visual line (its baselines within 0.75 em: a fraction's numerator another rectangle holds is on it) is cropped;
  // a rendering broken over lines is drawn as the page's text
  const big = Math.max(...real.map(c => c.size))
  const mainY = median(real.filter(c => c.size >= 0.85 * big).map(c => c.ybEff ?? c.yb))
  const oneLine = real.every(c => Math.abs((c.ybEff ?? c.yb) - mainY) < 0.75 * big)
  // (a rendering whose source knows where its ink is, a layout file's segments, g.box: its lines are its segments)
  const box = g.box
  const broken = box ? box.lines > 1 : lines.size > 1 && !oneLine
  if (cls !== 'other' || broken || p.cls === 'macro' || p.cls === 'umacro') return { mode: 'orig-text', text: g.text, sup: sup || (cls === 'num' && real.length && real.every(c => c.size < lineSize * 0.85)), st: gst }
  const main = real.filter(c => c.size >= lineSize * 0.85)
  const own = cropBaselineOf(real, lineInfo, main.length ? main : real)
  // (with a box: the baseline of the line its ink sits on, where its characters stand on that line, so that a raised or
  // lowered formula keeps its raise, which its characters' own baseline set on the line; and its ink's own extent
  // across, which its characters' places in their items only estimate)
  const baseline = box && Math.abs(box.baseline - own) <= 0.6 * big ? box.baseline : own
  // (a hanging glyph, a radical, from an em below its baseline to just above it: by its baseline, its box reached into
  // the line above, "√dk" taking "nd v." from "…dimension d_v.")
  let y0 = Math.min(...real.map(c => (c.ybEff !== undefined ? c.yb - c.size : c.yb - c.size * 0.26))), y1 = Math.max(...real.map(c => (c.ybEff !== undefined ? c.yb + c.size * 0.15 : c.yb + c.size * 0.8)))
  // (with a box, within its glyphs' boxes too: a big operator's origin, which the text layer gives, stands above its
  // glyph, and the band by it reached into the line above, 1706.03762's footnote's sum)
  if (box?.top !== undefined) { y0 = Math.max(y0, box.bottom - 0.3); y1 = Math.min(y1, box.top + 0.3) }
  const x0 = box ? box.x0 : Math.min(...real.map(c => c.x0)), x1 = box ? box.x1 : Math.max(...real.map(c => c.x1))
  return { mode: 'crop', page: real[0].page, crop: [x0 - 0.4, y0, x1 + 0.4, y1], baseline, text: texToText2(p.src) }
}

const YEAR = /\b(?:19|20)\d\d[a-z]?\b/
/** gapClass, with a textual author-year citation a citation ("Vaswani et al. (2017)", "Parmar et al. (2018)": iteration
 *  2 took it for math, drew the citation from its map as "[2017]", and erased the page's) */
function gapClass2(text) {
  // a parenthesis closed before the end is two renderings, not one ("(Tjong …, 2003). Melamud et al. (2016)")
  if (/^\(/.test(text)) {
    let d = 0
    for (let i = 0; i < text.length - 1; i++) { d += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0; if (d === 0 && i > 0) return 'other' }
  }
  const c = gapClass(text)
  if (c !== 'other') return c
  if (/^\(\s*\[[\d,\s–\-;[\]]+\]\s*\)$/.test(text)) return 'cite'
  const one = "\\p{Lu}[\\p{L}'’\\-]+(?:,? (?:and|&) \\p{Lu}[\\p{L}'’\\-]+| et al\\.?)? \\((?:19|20)\\d\\d[a-z]?(?:[,;] ?(?:19|20)\\d\\d[a-z]?)*\\)"
  return new RegExp(`^${one}(?:[;,] ?${one})*$`, 'u').test(text) ? 'cite' : c
}

/**
 * A placeholder drawn from its source (its rendering not found in order: an alignment reorders nothing) given, second,
 * a piece of the unit's gaps that no placeholder took, by what they say, in any order. Without it the piece was
 * erased and the source's plain text drawn (iteration 2), or, kept by iteration 3's rule that a rendering no
 * placeholder took stays, shown twice. Mutates the resolutions.
 */
function secondChance(out, phs, gaps, plain, lcs, unit, citeMap, uc) {
  const used = new Set()
  for (const r of out.values()) if (r?.gap) for (const c of r.gap.chars) used.add(c)
  const want = phs.filter(p => { const r = out.get(p.k); return r && (r.mode === 'source' || r.mode === 'cite-map' || (r.mode === 'none' && p.cls === 'display')) })
  if (!want.length) return
  // the gaps' pieces no placeholder took, cut at what was taken
  const pieces = []
  for (const g of gaps) {
    let cur = null
    for (const c of g.chars) {
      if (used.has(c)) { cur = null; continue }
      if (!cur) { cur = []; pieces.push(cur) }
      cur.push(c)
    }
  }
  const asGap = cs => {
    const a = cs.findIndex(c => !c.space && !c.sep && /\S/.test(c.ch)), b = cs.length - 1 - [...cs].reverse().findIndex(c => !c.space && !c.sep && /\S/.test(c.ch))
    let chars = a >= 0 ? cs.slice(a, b + 1) : []
    while (chars.length > 1 && /[.,;:]/.test(chars.at(-1).ch) && !/[.,;:]/.test(chars.at(-2).ch)) chars = chars.slice(0, -1)
    return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars }
  }
  const free = pieces.map(asGap).filter(g => /[\p{L}\p{N}]/u.test(g.text))
  for (const p of want) {
    let best = null, bestS = 0
    for (const g of free) {
      if (g.taken) continue
      let sc
      if (p.cls === 'cite') {
        // a citation by its numbers (or years) and its keys' count, as in order
        const nums = [...g.text.matchAll(/\d+/g)].map(m => m[0])
        const known = (p.keys ?? []).map(k => citeMap?.get(k))
        sc = gapClass2(g.text) === 'cite' && (known.every(n => n === undefined || nums.includes(n))) ? 0.9 : 0
      } else {
        const t = plain.get(p)?.t
        sc = t ? lcs(t, norm(g.text)) : 0
      }
      if (sc > bestS) { best = g; bestS = sc }
    }
    if (!best || bestS < 0.5) continue
    give(p, best)
  }
  // what is left, a placeholder for a piece in the order of both, where as many are left of each and each pair is of a
  // kind (a citation for a citation's rendering): the rendering then drawn in its placeholder's place, not shown twice
  const restP = want.filter(p => !out.get(p.k).second && (out.get(p.k).mode === 'source' || out.get(p.k).mode === 'cite-map'))
  const restG = free.filter(g => !g.taken)
  const kindOf = g => gapClass2(g.text)
  if (restP.length && restP.length === restG.length && restP.every((p, i) => (p.cls === 'cite') === (kindOf(restG[i]) === 'cite') && (p.cls !== 'num' || kindOf(restG[i]) === 'num'))) for (const [i, p] of restP.entries()) give(p, restG[i])
  function give(p, g) {
    g.taken = true
    const r = out.get(p.k)
    const cls = p.cls === 'cite' ? 'cite' : p.cls === 'num' ? 'num' : 'other'
    const nr = p.cls === 'display' ? { mode: 'kept', text: '' } : drawnAs(p, g, cls, r.sup, out.lineInfo)
    if (p.cls === 'display') out.keep = [...(out.keep ?? []), ...displayLines(g, uc)]
    out.set(p.k, { ...nr, k: p.k, src: p.src, cls: p.cls, gap: g, second: true })
  }
  void unit
}

/** a citation key's surname and year: "fedus2018maskgan" (fedus, 2018), "DBLP:journals/corr/ZhouCWLX16" (zhou, 2016),
 *  "Hochreiter1997" (hochreiter, 1997) */
function keyInfo(key) {
  // the first word of three letters or more in any of its parts but a database's ("tjong-de:2003", "peters-etal:…")
  const parts = key.split(/[/:]/).filter(s => !/^(?:dblp|journals?|corr|conf|abs|arxiv|doi)$/i.test(s))
  let name = ''
  for (const s of parts) { const m = /[A-Z][a-z]{2,}|[a-z]{3,}/.exec(s); if (m) { name = m[0].toLowerCase(); break } }
  const y4 = /(?:19|20)\d\d/.exec(parts.join(' '))?.[0]
  const y2 = !y4 && /(\d\d)$/.exec(parts.at(-1) ?? '')?.[1]
  return { name, year: y4 ?? (y2 ? `20${y2}` : null) }
}
/** how well a rendering says its keys: a point for each key's surname in it, a point for its year */
function keyScore(keys, text) {
  const letters = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  let v = 0
  for (const k of keys) {
    const { name, year } = keyInfo(k)
    if (name.length >= 3 && letters.includes(name)) v++
    if (year && text.includes(year)) v += 0.5
  }
  return v
}
/** whether a rendering names any author at all (an author-year one); a numeric one names none */
function anyName(text) { return /\p{Lu}\p{Ll}{2,}/u.test(text ?? '') }

/** a gap with a citation's rendering inside it, written beside other renderings with nothing of the source between
 *  ("ImageNet (Zhai et al., 2019a). ViT"): the citation cut out, its atoms from those the gap is cut into at its spaces */
function splitCites(g) {
  if (gapClass2(g.text) === 'cite') return [g]
  const atoms = []
  let cur = null
  g.chars.forEach((c, i) => {
    if (c.sep || c.space || !/\S/.test(c.ch)) { cur = null; return }
    if (!cur) { cur = { from: i, to: i }; atoms.push(cur) }
    cur.to = i
  })
  const text = (a, b) => g.chars.slice(atoms[a].from, atoms[b - 1].to + 1).map(c => c.ch).join('').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < atoms.length; i++) for (let j = Math.min(atoms.length, i + 8); j > i; j--) {
    if (i === 0 && j === atoms.length) continue
    const t = text(i, j)
    const bare = t.replace(/[.,;:]+$/, '')
    if (gapClass2(bare) !== 'cite' || !/\d/.test(bare)) continue
    let to = atoms[j - 1].to
    while (to > atoms[i].from && /[.,;:]/.test(g.chars[to].ch) && bare.length < t.length) to--
    const piece = (a, b) => { const chars = g.chars.slice(a, b + 1); return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars } }
    const out = []
    if (i > 0) out.push(piece(0, atoms[i - 1].to))
    out.push(piece(atoms[i].from, to))
    if (to + 1 < g.chars.length && g.chars.slice(to + 1).some(c => !c.sep && !c.space && /\S/.test(c.ch))) out.push(...splitCites(piece(to + 1, g.chars.length - 1)))
    return out.filter(x => x.text)
  }
  return [g]
}

/**
 * A crop's box grown over the ink it touches on the original page: a radical's tail, a fraction's bar, a big operator's
 * limits reach past its glyphs' boxes (0.26 em below their baseline to 0.8 above), and a radical often has no character
 * in the text layer at all (1706.03762's "√dk": nothing between "by" and "d"), so the crop began at "d" and the radical
 * was erased. Cell by cell of the page's ink map: two cells (3 pt) up, two down or an em down for a radical or a big
 * operator, and to either side over ink no character outside the rendering stands on (a bracket, the next word stop
 * it), six cells at most. `pageChars`: the crop's page's characters. Mutates it.
 */
export function growCrop(r, ink, toDev, k, pageChars = []) {
  if (!ink || !r?.crop) return
  const f = ink.factor
  const cellPt = f / k
  const own = new Set((r.gap?.chars ?? []).map(c => `${c.item}|${c.k}`))
  // (Computer Modern's extension font's glyphs all hang so: big brackets, radicals, operators)
  const deep = (r.gap?.chars ?? []).filter(c => !c.sep && !c.space && c.st?.fam === 'math' && (/[√∑∏∫∮⋃⋂⨁⨂]/.test(c.ch) || /cmex|lmmath|stixsize|txex|pxex/i.test(c.st?.name ?? '')))
  const maxDown = deep.length ? Math.ceil((1.1 * Math.max(...deep.map(c => c.size))) / cellPt) : 2
  const [ax, ay] = toDev(r.crop[0], r.crop[3]), [bx, by] = toDev(r.crop[2], r.crop[1])
  let c0 = Math.floor(Math.min(ax, bx) / f), c1 = Math.floor(Math.max(ax, bx) / f), r0 = Math.floor(Math.min(ay, by) / f), r1 = Math.floor(Math.max(ay, by) / f)
  const at = (row, c) => row >= 0 && c >= 0 && row < ink.h && c < ink.w && ink.ink[row * ink.w + c]
  const rowInk = (row, a, b) => { for (let c = a; c <= b; c++) if (at(row, c)) return true; return false }
  const colInk = (c, a, b) => { for (let row = a; row <= b; row++) if (at(row, c)) return true; return false }
  // the characters beside it on its line that are not its own: a column on one of them is theirs
  const y0 = r.crop[1], y1 = r.crop[3]
  // (a math glyph touching it is the formula's own: a fraction's subscript the text layer put outside its gap; but not
  // where the rendering's source knows its ink, a layout file's segments, g.box: every other glyph is another's)
  const foreignMath = !!r.gap?.box
  const beside = pageChars.filter(c => /\S/.test(c.ch) && !own.has(`${c.item}|${c.k}`) && (foreignMath || c.st?.fam !== 'math') && c.yb + 0.7 * c.size > y0 && c.yb - 0.2 * c.size < y1)
  const x0 = r.crop[0], x1 = r.crop[2]
  const blocked = (from, to) => beside.some(c => c.x1 > from + 0.2 && c.x0 < to - 0.2)
  // and up or down never into another line's text (a tight footnote's line above: its glyphs touch)
  const above = pageChars.filter(c => /\S/.test(c.ch) && !own.has(`${c.item}|${c.k}`) && (foreignMath || c.st?.fam !== 'math') && c.x1 > x0 && c.x0 < x1 && Math.abs(c.yb - (y0 + y1) / 2) < 2.5 * c.size)
  const blockedRow = (from, to) => above.some(c => c.yb - 0.22 * c.size < to && c.yb + 0.72 * c.size > from)
  const grown = { top: 0, bottom: 0, left: 0, right: 0 }
  for (let n = 0; n < Math.max(6, maxDown); n++) {
    if (n < 2 && rowInk(r0 - 1, c0, c1) && rowInk(r0, c0, c1) && !blockedRow(y1 + grown.top * cellPt, y1 + (grown.top + 1) * cellPt)) { r0--; grown.top++ }
    if (n < maxDown && rowInk(r1 + 1, c0, c1) && rowInk(r1, c0, c1) && !blockedRow(y0 - (grown.bottom + 1) * cellPt, y0 - grown.bottom * cellPt)) { r1++; grown.bottom++ }
    if (n < 6 && colInk(c0 - 1, r0, r1) && !blocked(x0 - (grown.left + 1) * cellPt, x0 - grown.left * cellPt)) { c0--; grown.left++ }
    if (n < 6 && colInk(c1 + 1, r0, r1) && !blocked(x1 + grown.right * cellPt, x1 + (grown.right + 1) * cellPt)) { c1++; grown.right++ }
  }
  r.crop = [r.crop[0] - grown.left * cellPt, r.crop[1] - grown.bottom * cellPt, r.crop[2] + grown.right * cellPt, r.crop[3] + grown.top * cellPt]
}

/** the lines a displayed formula's rendering stands on, kept: those it holds most of (three fifths of their characters
 *  or more), not a text line it shares a word with */
function displayLines(g, uc) {
  const mine = new Map(), all = new Map()
  const key = c => `${c.page}|${c.rect.join()}`
  for (const c of g.chars) if (!c.sep && !c.space && /\S/.test(c.ch)) mine.set(key(c), (mine.get(key(c)) ?? 0) + 1)
  for (const c of uc) if (!c.sep && !c.space && /\S/.test(c.ch)) all.set(key(c), (all.get(key(c)) ?? 0) + 1)
  return [...mine].filter(([k, n]) => !all.get(k) || n >= 0.6 * all.get(k)).map(([k]) => k)
}

/** whether the translation sets brackets round piece k itself: the text before it ends with an opening one and the text
 *  after starts with a closing one (spaces and zero-width placeholders between) */
function bracketed(pieces, k) {
  const textAt = (from, step) => {
    for (let q = from; q >= 0 && q < pieces.length; q += step) {
      const p = pieces[q]
      if (p.t === 'text') { if (/\S/.test(p.s)) return p.s; continue }
      // a group's own braces and what renders as nothing ("\uFF08{\small \url{…}}\uFF09") stand between nothing
      if (p.t === 'open' || p.t === 'close') continue
      if (p.t === 'ph' && ['zero', 'space'].includes(phClass2(p.src).cls)) continue
      return null
    }
    return null
  }
  return /[\uFF08(\uFF3B[]\s*$/.test(textAt(k - 1, -1) ?? '') && /^\s*[\uFF09)\uFF3D\]]/.test(textAt(k + 1, 1) ?? '')
}

/**
 * What became of each of the unit's characters on the page (by charKey): 'acc' (its text, translated; or a placeholder's
 * rendering drawn elsewhere, as a crop or as text: erased), 'keep' (a kept line, a label, a kept placeholder's rendering:
 * shown where it is, never erased), 'orphan' (a rendering no placeholder took: shown where it is). A gap's piece that is
 * the source's own text (four letters or more of it, the alignment having missed it: small capitals measured in two
 * sizes) and a gap's punctuation alone are the unit's text.
 */
/** whether `letters` is in `hay` but for up to two letters dropped from it (an accent the source wrote as a placeholder
 *  inside its word: "Z rich" for "Zürich", "Lu i " for "Lučić") */
export function nearIn(letters, hay, src = '') {
  if (hay.includes(letters)) return true
  if (letters.length < 4) return false
  if (letters.length < 5) {
    // a short word only as the source's words either side of the placeholder, joined ("Ni o" for "Niño")
    const words = src.split(/\s+/).map(w => norm(w)).filter(Boolean)
    const joined = new Set()
    for (let i = 0; i + 1 < words.length; i++) { joined.add(words[i] + words[i + 1]); if (words[i + 2]) joined.add(words[i] + words[i + 1] + words[i + 2]) }
    for (let i = 0; i < letters.length; i++) if (joined.has(letters.slice(0, i) + letters.slice(i + 1))) return true
    return false
  }
  for (let i = 0; i < letters.length; i++) {
    const one = letters.slice(0, i) + letters.slice(i + 1)
    if (hay.includes(one)) return true
    if (letters.length >= 6) for (let j = i; j < one.length; j++) if (hay.includes(one.slice(0, j) + one.slice(j + 1))) return true
  }
  return false
}

function categoriesOf(res, uc, src, keepSet, drawn = '', trLetters = '') {
  const cat = new Map()
  const srcLetters = norm(src)
  const used = new Map()
  for (const r of res.values()) if (r?.gap) for (const c of r.gap.chars) if (!c.sep && !c.space) used.set(charKey(c), r)
  const label = new Set((res.label?.chars ?? []).map(charKey))
  const inGap = new Set()
  for (const g of res.gaps ?? []) for (const c of g.chars) if (!c.sep && !c.space) inGap.add(charKey(c))
  // the pieces of gaps no placeholder took, run by run
  const left = []
  let run = null
  for (const c of uc) {
    const k = c.sep || c.space ? null : charKey(c)
    if (k && inGap.has(k) && !used.has(k) && /\S/.test(c.ch)) { if (!run) { run = []; left.push(run) } run.push(c) }
    else if (k || c.sep) run = null
  }
  const missed = new Set()
  for (const piece of left) {
    const letters = norm(piece.map(c => c.ch).join(''))
    // what a placeholder of the unit draws already (from its source, as a citation's map gives it, or another's crop):
    // erased, not shown twice
    const shown = normU(piece.map(c => c.ch).join(''))
    const long = letters.replace(/\d/g, '').length >= 4
    if (!/[\p{L}\p{N}]/u.test(piece.map(c => c.ch).join('')) || (long && (nearIn(letters, srcLetters, src) || trLetters.includes(letters))) || (shown && drawn.includes(shown))) for (const c of piece) missed.add(charKey(c))
  }
  for (const c of uc) {
    if (c.sep || c.space || !/\S/.test(c.ch)) continue
    const k = charKey(c)
    if (keepSet.has(`${c.page}|${c.rect.join()}`) || label.has(k)) cat.set(k, 'keep')
    else if (used.has(k)) cat.set(k, used.get(k).mode === 'kept' ? 'keep' : used.get(k).mode === 'crop' || used.get(k).mode === 'orig-text' ? 'acc' : 'orphan')
    else if (inGap.has(k)) cat.set(k, missed.has(k) ? 'acc' : 'orphan')
    else cat.set(k, 'acc')
  }
  return cat
}

/** a page character's identity across the copies the unit's lines make of it */
export const charKey = c => `${c.page}|${c.item}|${c.k}`

/** whether the page shows `text` just before a unit's first line, on its baseline (a mark set outside the unit) */
function leadMark(rects, charsByPage, text) {
  const r = rects[0]
  if (!r || !text) return false
  const h = r[4] - r[2]
  const before = (charsByPage[r[0] - 1] ?? []).filter(c => c.x1 <= r[1] + 0.5 && c.x0 >= r[1] - 1.5 * h && c.yb >= r[2] - 0.2 * h && c.yb <= r[4]).sort((a, b) => a.x0 - b.x0)
  const mk = t => t.normalize('NFKC').replace(/[∗⋆✱]/g, '*').replace(/\s/g, '')
  return mk(before.map(c => c.ch).join('')).endsWith(mk(text))
}

/**
 * The unit's first line's left edge, moved back to the start of the word it falls inside. The anchors share an item's
 * width evenly between its characters (anchors.mjs tokenizeDocument), so where one item holds a label and the unit's
 * first word ("1. Introduction"), the line starts inside the word's first glyph, which was then neither the unit's nor
 * erased. Mutates rects[0].
 */
export function snapFirstRect(rects, charsByPage) {
  const r = rects[0]
  if (!r) return
  const cs = (charsByPage[r[0] - 1] ?? []).filter(c => c.yb >= r[2] - 0.5 && c.yb <= r[4] && c.x0 < r[1] - 0.05 && c.x1 > r[1] + 0.05)
  const c = cs.find(c => /[\p{L}\p{N}]/u.test(c.ch))
  if (c) {
    const line = (charsByPage[r[0] - 1] ?? []).filter(d => d.item === c.item).sort((a, b) => a.k - b.k)
    let k = line.indexOf(c)
    while (k > 0 && /[\p{L}\p{N}]/u.test(line[k - 1].ch)) k--
    r[1] = Math.round(line[k].x0 * 100) / 100
  }
  // the ink before the line on its baseline (a label's last glyph): the line's erasing may start right after it, since
  // a character's place inside its item is itself an estimate
  const h = r[4] - r[2]
  const before = (charsByPage[r[0] - 1] ?? []).filter(d => /\S/.test(d.ch) && d.yb >= r[2] - 0.2 * h && d.yb <= r[4] && d.x1 <= r[1] + 0.05 && d.x1 > r[1] - 2 * h)
  return before.length ? Math.max(...before.map(d => d.x1)) : undefined
}

/**
 * snapFirstRect, by its item: the unit's first line's left edge moved back to the start of its first word where the
 * letters before the edge are of the same item as the first one within it, with no space between (the anchors' even
 * share of an item's width puts the edge inside a word; with each character's design width, the word's first letter
 * may end just before it, which the overlap test missed: 1512.03385's heading "3.2. Identity…", its "I" put back).
 * Returns snapFirstRect's own.
 */
export function snapFirstRect2(rects, charsByPage) {
  const r = rects[0]
  if (!r) return
  const page = charsByPage[r[0] - 1] ?? []
  const first = page.filter(c => (c.x0 + c.x1) / 2 >= r[1] && (c.x0 + c.x1) / 2 <= r[3] && c.yb >= r[2] - 0.5 && c.yb <= r[4] && /[\p{L}\p{N}]/u.test(c.ch)).sort((a, b) => a.x0 - b.x0)[0]
  if (first) {
    const item = page.filter(d => d.item === first.item).sort((a, b) => a.k - b.k)
    let k = item.indexOf(first)
    while (k > 0 && /[\p{L}\p{N}]/u.test(item[k - 1].ch)) k--
    if (k < item.indexOf(first)) r[1] = Math.round(item[k].x0 * 100) / 100
  }
  return snapFirstRect(rects, charsByPage)
}

/**
 * A unit's line rectangles grown along their baselines over the characters next to them that are no other unit's
 * (`others`: the page's other units' rectangles) where those hold the unit's own source words: the anchors may leave a
 * line's words out (1706.03762's "‡Work performed while at Google Research." anchored as "Research."), and what they
 * leave out is neither erased nor laid over. Mutates the rectangles; returns how many grew.
 */
export function extendRects(rects, charsByPage, others, src, wordsOfFn, normFn, wordChars = charsByPage) {
  const srcWords = wordsOfFn([...src].map(ch => ({ ch }))).map(w => w.w)
  const want = new Set(srcWords)
  const srcStart = ` ${srcWords.join(' ')} `
  let grown = 0
  for (const r of rects) {
    const page = charsByPage[r[0] - 1] ?? []
    const inside = page.filter(c => c.x0 >= r[1] - 0.5 && c.x1 <= r[3] + 0.5 && c.yb >= r[2] - 0.2 && c.yb <= r[4] && /\S/.test(c.ch))
    if (!inside.length) continue
    const yb = median(inside.map(c => c.yb)), size = median(inside.map(c => c.size))
    const lineIn = chars => chars.filter(c => Math.abs(c.yb - yb) < 0.3 * size && /\S/.test(c.ch)).sort((a, b) => a.x0 - b.x0)
    const line = lineIn(page)
    const foreign = c => (others[r[0]] ?? []).some(o => c.x0 >= o[1] - 0.5 && c.x1 <= o[3] + 0.5 && c.yb >= o[2] - 0.2 && c.yb <= o[4])
    const grow = (dir, chars = line) => {
      const got = []
      let edge = dir < 0 ? Math.min(...inside.map(c => c.x0)) : Math.max(...inside.map(c => c.x1))
      const cands = dir < 0 ? chars.filter(c => c.x1 <= edge + 0.1).reverse() : chars.filter(c => c.x0 >= edge - 0.1)
      for (const c of cands) {
        if (dir < 0 ? edge - c.x1 > 1.2 * size : c.x0 - edge > 1.2 * size) break
        if (foreign(c) || inside.some(d => d.item === c.item && d.k === c.k)) break
        got.push(c)
        edge = dir < 0 ? c.x0 : c.x1
      }
      return got
    }
    for (const dir of [-1, 1]) {
      let got = grow(dir)
      const words = got.length ? (dir < 0 ? [...got].reverse() : got).map(c => c.ch).join('').split(/[^\p{L}\p{N}]+/u).map(w => normFn(w)).filter(w => w.length > 1) : []
      if (!words.some(w => want.has(w))) {
        // (step 3: before the unit's first line, the words its source begins with, over the page's whole width on the
        // line, each word apart: the line's characters are its non-space ones, and joined they read one word that is
        // none of the source's ("whileatGoogle"), so that 1706.03762's "‡Work performed while at Google Research.",
        // anchored and located as "Research.", kept its English head unerased, and the translation, "Google Research…",
        // was laid after it: "Google Google Research")
        if (dir > 0 || r !== rects[0]) continue
        got = grow(dir, lineIn(wordChars[r[0] - 1] ?? []))
        const run = [...got].reverse()
        const text = run.map((c, n) => (n && (c.x0 - run[n - 1].x1 > 0.12 * c.size || (c.item !== run[n - 1].item && c.x0 - run[n - 1].x1 > 0.05 * c.size)) ? ` ${c.ch}` : c.ch)).join('')
        const apart = text.split(/[^\p{L}\p{N}]+/u).map(w => normFn(w)).filter(w => w.length > 1)
        if (apart.length < 2 || !srcStart.startsWith(` ${apart.join(' ')} `)) continue
      }
      if (dir < 0) r[1] = Math.round(Math.min(...got.map(c => c.x0)) * 100) / 100
      else r[3] = Math.round(Math.max(...got.map(c => c.x1)) * 100) / 100
      grown++
    }
  }
  return grown
}

// ---- tokens

const PUNCT_CLOSE = /^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF09\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017”’]$/
const PUNCT_OPEN = /^[\uFF08\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016“‘]$/
/** the characters a CJK run takes: CJK, full-width forms, and in Chinese and Japanese the curly quotes and dashes, which
 *  xeCJK sets full width there (Korean sets them as its Western punctuation) */
const cjkClassRe = to => (to === 'ko' ? /[\u2E80-\u9FFF\u8C48-\uFAFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/ : /[\u2E80-\u9FFF\u8C48-\uFAFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F“”‘’—…·]/)
const STYLE_CMDS = [
  [/^\\(?:textbf|bf|bfseries|mathbf|boldsymbol)\b/, (s) => ({ ...s, bold: true })],
  [/^\\(?:textmd|mdseries)\b/, s => ({ ...s, bold: false })],
  [/^\\(?:emph|em)\b/, s => ({ ...s, italic: !s.italic })],
  [/^\\(?:textit|it|itshape|textsl|sl|slshape|mathit)\b/, s => ({ ...s, italic: true })],
  [/^\\(?:textup|upshape)\b/, s => ({ ...s, italic: false })],
  [/^\\(?:textsc|sc|scshape)\b/, s => ({ ...s, caps: true })],
  [/^\\(?:texttt|tt|ttfamily|url|path|code|lstinline)\b/, (s, d) => ({ ...s, fam: 'mono', design: d.mono })],
  [/^\\(?:textsf|sf|sffamily)\b/, (s, d) => ({ ...s, fam: 'sans', design: d.sans })],
  [/^\\(?:textrm|rm|rmfamily)\b/, (s, d) => ({ ...s, fam: 'serif', design: d.serif })],
  [/^\\(?:textnormal|normalfont)\b/, (s, d) => ({ ...s, fam: 'serif', bold: false, italic: false, caps: false, design: d.serif })],
]
const applyCmd = (src, s, d) => {
  for (const [re, f] of STYLE_CMDS) if (re.test(src)) return f(s, d)
  return null
}

/**
 * The unit's base style without what its own groups set: where explicit groups (\textit, \textbf…) hold most of its
 * text and the original's majority has that style, the majority came from the groups, and the text outside them is
 * not so set (2608.04322's "\textbf{RQ1:} \textit{…}": the label was drawn bold italic)
 */
function baseOf(unit, base) {
  let total = 0
  const inGroup = { italic: 0, bold: 0 }
  const open = []
  for (const p of unit.pieces) {
    if (p.t === 'open') open.push({ italic: /^\\(?:textit|emph|itshape|textsl)\b/.test(p.src), bold: /^\\(?:textbf|bfseries)\b/.test(p.src) })
    else if (p.t === 'close') open.pop()
    else if (p.t === 'text') {
      const n = p.s.replace(/\s+/g, '').length
      total += n
      if (open.some(o => o.italic)) inGroup.italic += n
      if (open.some(o => o.bold)) inGroup.bold += n
    }
  }
  const out = { ...base }
  if (total && base.italic && inGroup.italic >= 0.5 * total) out.italic = false
  if (total && base.bold && inGroup.bold >= 0.5 * total) out.bold = false
  return out
}

const mcache = new Map()
/** a run's width at 100 px in its face (canvas measureText, cached) */
function w100(s, face) {
  const font = fontString(face, 100)
  const key = `${font}|${s}`
  let w = mcache.get(key)
  if (w === undefined) {
    mctx.font = font
    w = mctx.measureText(s).width
    mcache.set(key, w)
  }
  return w
}

/**
 * A unit's pieces as tokens: { s, st, face, cls ('cjk'|'latin'), w100, glue (no break before), punct ('open'|'close'),
 * asp (CJK–Latin autospace before it), hyph (a language to hyphenate it in) }, { space }, { crop }, { sup }. `base`: the
 * unit's style ({ fam, bold, italic, caps, design }); `designs`: the paper's serif, sans and mono designs. `lead`: text
 * set before the unit's own, in its own style ({ text, st }: a float's label in the target's name, labelInTarget), a
 * space after it
 */
export function tokensOf2(unit, resolved, to, baseIn, designs, P, lead = null) {
  const tokens = []
  const base = baseOf(unit, baseIn)
  const stack = [{ ...base }]
  const style = () => stack.at(-1)
  const cjkT = CJK_TARGETS.has(to)
  const keepAll = to === 'ko' || !cjkT
  const cjkRe = cjkClassRe(to)
  const centred = to === 'zh-TW'
  const latinLang = to === 'de' ? 'de' : 'en'
  const prevNonSpace = () => { for (let q = tokens.length - 1; q >= 0; q--) if (!tokens[q].space) return tokens[q]; return null }
  const lastIsSpace = () => tokens.length > 0 && tokens.at(-1).space
  const push = t => {
    const prev = tokens.at(-1)
    if (prev && !prev.space && !t.space) {
      if (NO_START.test(t.s ?? '') || (prev.s && NO_END.test(prev.s))) t.glue = true
      // Latin after Latin with nothing between them (a number and its ×, a word and its placeholder's text) stands
      // together, but not after a word's own hyphen
      if (!t.brk && t.cls === 'latin' && prev.cls === 'latin' && !prev.crop) t.glue = true
      // CJK–Latin autospace: where a CJK character meets a letter or digit with no space between
      // (not beside a CJK mark: "\uFF08LLMs\uFF09" takes no space inside its brackets, nor "\uFF0CLLM")
      const cjkSide = t.cls === 'cjk' ? t.s : prev.s ?? ''
      if (P.autospace && t.cls && prev.cls && t.cls !== prev.cls && /[A-Za-z0-9]/.test(t.cls === 'latin' ? t.s[0] : (prev.s ?? '').at(-1) ?? '') && !/^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF08\uFF09\u300C\u300D\u300E\u300F\u3010\u3011\u3014\u3015\u3008\u3009\u300A\u300B“”‘’]$/.test(cjkSide)) t.asp = true
    }
    tokens.push(t)
  }
  const pushText = (s, st, extra = {}) => {
    for (const m of s.matchAll(/\s+|\S+/g)) {
      const chunk = m[0]
      if (/^\s+$/.test(chunk)) {
        if (tokens.length && !lastIsSpace()) tokens.push({ space: true, st, face: faceOf(st, 'latin', to), w100: w100(' ', faceOf(st, 'latin', to)) })
        continue
      }
      // the chunk by class: CJK characters, and the runs between them
      const parts = []
      let cur = null
      for (const ch of chunk) {
        const cls = cjkRe.test(ch) ? 'cjk' : 'latin'
        // Chinese and Japanese break between any two CJK characters: each its own part
        if (cls === 'cjk' && !keepAll) { cur = null; parts.push({ cls, s: ch }); continue }
        if (cur && cur.cls === cls) cur.s += ch
        else { cur = { cls, s: ch }; parts.push(cur) }
      }
      parts.forEach((p, n) => {
        // a Latin word cut at its own hyphens and slashes: a line may break after them
        // a URL or a path (mono) after its separators, as TeX's url package breaks it
        const pieces = p.cls !== 'latin' ? [p.s] : st.fam === 'mono' || /^(?:https?:|www\.)/.test(p.s) ? p.s.split(/(?<=[/.\-_#?&=])(?=[^/.\-_#?&=])/) : !extra.ph ? p.s.split(/(?<=[A-Za-zÀ-ɏЀ-ӿ][-/])(?=[A-Za-zÀ-ɏЀ-ӿ])/) : [p.s]
        pieces.forEach((s, q) => {
          const face = faceOf(st, p.cls, to)
          const t = { s, st, face, cls: p.cls, w100: w100(s, face), ...extra, ...(q > 0 ? { brk: true } : {}) }
          // within a chunk, parts stand together (no break), but Chinese and Japanese break before and after a CJK
          // character, and a word may break after its own hyphen
          if (q === 0 && n > 0 && !(!keepAll && (p.cls === 'cjk' || parts[n - 1].cls === 'cjk'))) t.glue = true
          if (p.cls === 'cjk' && s.length === 1 && !centred && P.compressMax >= 0) t.punct = PUNCT_CLOSE.test(s) ? 'close' : PUNCT_OPEN.test(s) ? 'open' : null
          if (p.cls === 'latin' && P.hyphen && !extra.ph && st.fam !== 'mono' && s.length >= 5 && unit.kind !== 'heading' && !unit.title) {
            const word = s.replace(/[^A-Za-zÀ-ɏЀ-ӿ]+$/, '').replace(/^[^A-Za-zÀ-ɏЀ-ӿ]+/, '')
            const cyr = /[Ѐ-ӿ]/.test(word)
            if (word.length >= 5 && (cyr ? /^[Ѐ-ӿ]+$/.test(word) : /^[A-Za-zÀ-ɏ][a-zà-ɏß]+$/.test(word))) t.hyph = cyr ? 'ru' : latinLang
          }
          push(t)
        })
      })
    }
  }
  if (lead?.text) { pushText(lead.text, { ...base, ...lead.st }, { label: true }); pushText(' ', { ...base, ...lead.st }) }
  unit.pieces.forEach((p, k) => {
    if (p.t === 'text') {
      pushText(p.s.replace(/\n/g, ' ').replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”'), style())
      return
    }
    if (p.t === 'open') {
      const next = applyCmd(p.src, style(), designs)
      const colour = /^\\textcolor\{([a-zA-Z]+)\}/.exec(p.src)
      stack.push({ ...(next ?? style()), ...(colour ? { color: colour[1] } : {}) })
      return
    }
    if (p.t === 'close') {
      if (stack.length > 1) stack.pop()
      return
    }
    if (p.t === 'ph') {
      // a switch: the rest of its group
      const sw = applyCmd(p.src, style(), designs)
      if (sw && /^\\[A-Za-z]+$/.test(p.src)) { stack[stack.length - 1] = sw; return }
      const colour = /^\\color\{([a-zA-Z]+)\}$/.exec(p.src)
      if (colour) stack[stack.length - 1] = { ...style(), color: colour[1] }
    }
    const r = resolved.get(k)
    if (!r) return
    // iteration 3: a kept rendering (a displayed formula) stands where it is; the text after it starts below it
    if (r.mode === 'kept' && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
      tokens.push({ blockTo: r.region, w100: 0 })
      return
    }
    if (r.mode === 'crop') {
      const glue = tokens.length > 0 && !lastIsSpace()
      tokens.push({ crop: r, cw: r.crop[2] - r.crop[0], glue, w100: 0 })
      return
    }
    if (!r.text) return
    if (r.text === ' ') { pushText(' ', style()); return }
    const st = r.math ? { ...style(), italic: /[A-Za-z]/.test(r.text) && r.text.length <= 3 } : r.mode === 'orig-text' && r.st && r.st.fam !== 'math' ? { ...style(), fam: r.st.fam === 'mono' ? 'mono' : style().fam, design: r.st.fam === 'mono' ? designs.mono : style().design } : style()
    if (r.sup) {
      const face = faceOf(st, 'latin', to)
      tokens.push({ s: r.text, st, face, cls: 'latin', w100: w100(r.text, face) * 0.62, sup: true, glue: true, ph: r.mode, k })
    } else pushText(r.text, st, { ph: r.mode, k, ...(r.math ? { math: true } : {}) })
  })
  while (tokens.at(-1)?.space) tokens.pop()
  void prevNonSpace
  tokens.base = base
  return tokens
}

/** the faces a target will most likely need, each measured once in a task of its own (a system CJK face loads on
 *  its first use, 10–40 ms, which would otherwise fall in the first unit's layout) */
export async function warmFaces(to, designs, yieldNow) {
  const cjkT = CJK_TARGETS.has(to)
  const sts = [{ bold: false, italic: false }, { bold: true, italic: false }, { bold: false, italic: true }].map(x => ({ fam: 'serif', caps: false, design: designs.serif, ...x }))
  for (const st of sts) for (const cls of cjkT ? ['cjk', 'latin'] : ['latin']) {
    w100(cls === 'cjk' ? '\u6C38' : 'a', faceOf(st, cls, to))
    await yieldNow()
  }
}

// ---- the unit's blocks, with the original's baselines

/** blocksOf's blocks, each with its lines' measured baselines (B), sizes, pitch and the free space below it */
export function blocks2(rects, pageViews, keep, lineInfo, regionOf = null, referenced = null) {
  const blocks = blocksOf2(rects, pageViews, keep, regionOf, referenced)
  const info = r => lineInfo.get(rectKey(r)) ?? lineInfo.get(`${r[0]}|${r[2]}|${r[3]}|${r[4]}`)
  for (const b of blocks) {
    b.B = b.rects.map(r => info(r)?.baseline ?? r[2] + 0.24 * (r[4] - r[2]))
    b.exact = b.rects.map(r => !!info(r)?.exact)
    b.sizes = b.rects.map(r => info(r)?.size ?? (r[4] - r[2]) / 0.894)
    const d = b.B.slice(1).map((y, i) => b.B[i] - y).filter(v => v > 0)
    b.pitch0 = d.length ? median(d) : null
    // (a layout file's baselines, `file`, are written to a hundredth: an evenly set block's pitch is its gaps' mean, which
    // the rounding does not move, where their median may be off by a few thousandths and its lines' slots so a line off
    // the last baseline at 1.3 times it: 1512.03385's unit 59)
    if (d.length > 1 && b.rects.every(r => info(r)?.file) && d.every(v => Math.abs(v - b.pitch0) <= 0.02)) b.pitch0 = d.reduce((a, v) => a + v, 0) / d.length
    b.free = 0
  }
  return blocks
}

/** a solid-set original's pitch, × its size: TeX's \baselineskip is 1.2 × the size at 10 and 12 pt, 1.24 at 11 pt */
export const SOLID = 1.25
/**
 * The unit's leading (step 3), relative to the original's own pitch: the script's leading (leadBase, 1.3 in Chinese) is
 * of a solid-set original's line, so the translation's pitch is leadBase × SOLID × its size, but never closer than the
 * original's own pitch. Where the original is set solid that is leadBase, as before; where it is looser already, the
 * leading is not stacked on it (2307.16209, set one and a half: Chinese at 1.3 × its 1.5-spaced lines stood 1.95 em
 * apart and between them, a quarter of its text area blank that its own lines would have covered). The original's
 * pitch: its blocks' own (pitch0), the median of those that have one; none, leadBase. 1 where leadBase is. `pitchLead`
 * false (a parameter): leadBase stacked on the original's pitch, as before step 3.
 */
export function leadOf(blocks, s, P) {
  // (the rule is named, pitchLead, so that it can be switched off: the thesis's fill falls with it, its coverage rises,
  // a visual choice the maintainer is asked)
  if (P.pitchLead === false || !(P.leadBase > 1) || !(s > 0)) return P.leadBase
  const pitches = blocks.map(b => b.pitch0).filter(v => v > 0).sort((a, b) => a - b)
  if (!pitches.length) return P.leadBase
  const p0 = pitches[pitches.length >> 1]
  return Math.min(P.leadBase, Math.max(1, Math.round((1000 * P.leadBase * SOLID * s) / p0) / 1000))
}

// ---- the white space below: an ink map of the original page

/** the original page's ink at a quarter of its canvas's resolution: one readback of a small canvas */
export function inkMapOf(canvas, factor = 4) {
  const w = Math.ceil(canvas.width / factor), h = Math.ceil(canvas.height / factor)
  const c = new OffscreenCanvas(w, h)
  const x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(canvas, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h).data
  const ink = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) ink[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] < 690 ? 1 : 0
  return { w, h, ink, factor }
}
/** the distance (PDF units) from yStart down to the first ink in [x0, x1], or to yLimit; `toDev` maps PDF to the
 *  canvas's device pixels, `k` device pixels per PDF unit */
export function freeBelow(map, toDev, k, x0, x1, yStart, yLimit) {
  if (!map || yLimit >= yStart) return 0
  const [ax, ay] = toDev(x0, yStart), [bx, by] = toDev(x1, yLimit)
  const f = map.factor
  const c0 = Math.max(0, Math.floor(Math.min(ax, bx) / f)), c1 = Math.min(map.w - 1, Math.ceil(Math.max(ax, bx) / f))
  const r0 = Math.max(0, Math.ceil(Math.min(ay, by) / f)), r1 = Math.min(map.h - 1, Math.floor(Math.max(ay, by) / f))
  for (let r = r0; r <= r1; r++) {
    let lit = 0
    for (let c = c0; c <= c1; c++) lit += map.ink[r * map.w + c]
    if (lit > 0) return Math.max(0, (r * f - Math.min(ay, by)) / k)
  }
  return yStart - yLimit
}

// ---- line breaking

const hyphenData = new Map()
export const setHyphenData = (lang, data) => hyphenData.set(lang, data)

/** the slots (lines) a unit's blocks hold at a state: each { block, page, x0, x1, baseline, target, centred } */
function slotsAt(blocks, st, P, s) {
  const out = []
  for (const [bi, b] of blocks.entries()) {
    const p0 = b.pitch0 ?? 1.2 * s
    const pitch = p0 * st.lead * (P.grid ? 1 : st.scale)
    const onGrid = Math.abs(st.lead - 1) < 1e-6 && (P.grid || Math.abs(st.scale - 1) < 1e-6)
    const borrowPt = Math.min(b.free, st.borrow * p0)
    const low = b.B.at(-1) - borrowPt
    for (let k = 0; k < 400; k++) {
      let y = onGrid ? (k < b.B.length ? b.B[k] : b.B.at(-1) - (k - b.B.length + 1) * pitch) : b.B[0] - k * pitch
      // never two lines closer than 0.7 of the pitch (a baseline the text layer could not tell)
      if (out.length && out.at(-1).block === bi && y > out.at(-1).baseline - 0.7 * pitch) y = out.at(-1).baseline - pitch
      if (y < low - 0.05) break
      const target = k === 0 || (onGrid && k < b.B.length) ? k : null
      const x0 = b.x0 + (bi === 0 && k === 0 && !b.centred ? b.indent : 0)
      // a sliver beside a formula (narrower than 1.5 em) holds no text: its words were the formula's
      if (b.x1 - x0 < 1.5 * s * st.scale) continue
      out.push({ block: bi, page: b.page, x0, x1: b.x1, baseline: y, target, centred: b.centred, pitch, after: b.after ?? 0 })
    }
  }
  return out
}

const tokW = (t, f, st, scale) => {
  if (t.crop) return t.cw * scale
  if (t.space) return (t.w100 * f) / 100
  let w = (t.w100 * f) / 100
  if (t.cls === 'cjk') w += st.track * f * [...t.s].length
  else if (st.trackLatin) w += st.trackLatin * f * [...t.s].length
  return w
}

/**
 * Tokens into slots, greedily, at font size f: each line { ...slot, items: [{ t, w, shift }] } with the items' natural
 * widths (punctuation compressed as the state allows), the space a line may shrink, and `rest`, the first token left.
 */
function breakLines(tokensIn, slots, f, st, P, scale, strict = true) {
  // (step 3, 'flow': a kept region breaks the line and skips no slot: the text after a display may stand above it, where
  // the slots below it are too few for it and those above it too many; the last resort before the unit is not drawn)
  const flow = strict === 'flow'
  let tokens = tokensIn
  const lines = []
  let li = 0, i = 0
  const half = 0.5 * f
  let line = null
  const open = () => {
    line = { ...slots[li], items: [], x: 0, spaces: 0 }
    lines.push(line)
  }
  // iteration 3: the kept regions the text has passed (a break token each); the text may not run on into a block below
  // a region before its break (strict), or it reads before the formula it follows in the translation
  let consumed = 0, stop = false, spilled = false
  const advance = () => {
    li++
    if (li >= slots.length) return
    if ((slots[li].after ?? 0) > consumed) {
      if (strict === true) { stop = true; return }
      spilled = true
    }
    open()
  }
  if (slots.length) open()
  while (i < tokens.length && li < slots.length && !stop) {
    if (tokens[i].blockTo !== undefined) {
      const fresh = tokens[i].blockTo + 1 > consumed
      consumed = Math.max(consumed, tokens[i].blockTo + 1)
      if (flow) {
        // (a region passed once breaks the line once: its kept placeholders after it are no breaks)
        if (fresh && line.items.length) { while (line.items.at(-1)?.t.space) { const sp = line.items.pop(); line.x -= sp.w; line.spaces -= sp.w } advance() }
        if ((slots[li]?.after ?? 0) < consumed) spilled = true
        i++
        continue
      }
      if ((slots[li].after ?? 0) < consumed) {
        let q = li + 1
        while (q < slots.length && (slots[q].after ?? 0) < consumed) q++
        if (q < slots.length) {
          while (line.items.at(-1)?.t.space) { const sp = line.items.pop(); line.x -= sp.w; line.spaces -= sp.w }
          li = q
          open()
        }
      }
      i++
      continue
    }
    const cap = line.x1 - line.x0
    // a token and those glued to it; a space is a group of its own (what is glued after it is the next group's: the
    // footnote marks iteration 1 lost were skipped here with the space before them)
    let j = i + 1
    if (!tokens[i].space) while (j < tokens.length && tokens[j].glue && !tokens[j].space) j++
    const t0 = tokens[i]
    if (t0.space) {
      if (line.items.length) {
        const w = tokW(t0, f, st, scale)
        line.items.push({ t: t0, w })
        line.x += w
        line.spaces += w
      }
      i = j
      continue
    }
    // the group's widths, with its punctuation compressed: at the line's start an opening mark loses its blank half,
    // two marks together lose the blank between them, and with compressMax 2 every mark loses its blank half
    const items = []
    let w = 0
    let prev = line.items.at(-1)?.t ?? null
    for (let q = i; q < j; q++) {
      const t = tokens[q]
      let tw = tokW(t, f, st, scale), shift = 0
      if (t.punct && st.compress >= 2) {
        tw -= half
        if (t.punct === 'open') shift = -half
      } else if (t.punct && st.compress === 1) {
        if (prev?.punct === 'close') {
          // two marks together: the first loses its trailing blank half (the second keeps its own)
          const last = items.length ? items.at(-1) : line.items.at(-1)
          if (last && !last.cut) {
            last.w -= half
            last.cut = true
            if (items.length) w -= half
            else line.x -= half
          }
        } else if (t.punct === 'open' && (!prev || prev.punct)) {
          // an opening mark at the line's start, or after another mark: its leading blank half
          tw -= half
          shift = -half
        }
      }
      const asp = t.asp && (line.items.length || items.length) ? P.autospace * f : 0
      items.push({ t, w: tw, shift, asp })
      w += tw + asp
      prev = t
    }
    // a closing mark at the line's end hangs its blank half
    const hang = items.at(-1).t.punct === 'close' && st.compress < 2 ? half : 0
    const shrink = line.spaces * (1 - P.spaceMin)
    if (line.x - shrink + w - hang <= cap + 0.01) {
      for (const it of items) line.items.push(it)
      line.x += w
      i = j
      continue
    }
    if (!line.items.length) {
      // nothing on the line yet, and the group is longer than it: cut by characters (a URL, a long formula word)
      if (t0.s && [...t0.s].length > 1 && tokW(t0, f, st, scale) > cap) {
        const chars = [...t0.s]
        let k = 0, used = 0
        const per = chars.map(c => (w100(c, t0.face) * f) / 100)
        while (k < chars.length && used + per[k] <= cap) used += per[k++]
        k = Math.max(1, k)
        line.items.push({ t: { ...t0, s: chars.slice(0, k).join('') }, w: per.slice(0, k).reduce((a, b) => a + b, 0), shift: 0, asp: 0 })
        const tail = chars.slice(k).join('')
        tokens = [...tokens.slice(0, i), { ...t0, s: tail, w100: w100(tail, t0.face), glue: false, asp: false }, ...tokens.slice(i + 1)]
      } else {
        // the group's first token alone (the rest goes on): a glued group never runs past the line
        line.items.push(items[0])
        line.x += items[0].w + (items[0].asp ?? 0)
        if (tokens[i + 1]) tokens = [...tokens.slice(0, i + 1), { ...tokens[i + 1], glue: false }, ...tokens.slice(i + 2)]
        i++
      }
      advance()
      continue
    }
    // a word hyphenated: the most of it that fits, with its hyphen
    if (P.hyphen && t0.hyph && t0.s) {
      const word = t0.s
      const pts = breakPoints(word.replace(/[^A-Za-zÀ-ɏЀ-ӿ]+$/, ''), t0.hyph, hyphenData.get(t0.hyph))
      const asp = items[0].asp
      const room = cap + shrink - line.x - asp
      let cut = null
      for (let q = pts.length - 1; q >= 0; q--) {
        const head = `${word.slice(0, pts[q])}-`
        const hw = (w100(head, t0.face) * f) / 100 + (st.trackLatin ? st.trackLatin * f * head.length : 0)
        if (hw <= room + 0.01) { cut = { head, hw, at: pts[q] }; break }
      }
      if (cut) {
        line.items.push({ t: { ...t0, s: cut.head, hyphenated: true }, w: cut.hw, shift: 0, asp })
        line.x += cut.hw + asp
        const tail = word.slice(cut.at)
        tokens = [...tokens.slice(0, i), { ...t0, s: tail, w100: w100(tail, t0.face), glue: false, asp: false }, ...tokens.slice(i + 1)]
      }
    }
    // the line is closed: its trailing spaces dropped
    while (line.items.at(-1)?.t.space) { const sp = line.items.pop(); line.x -= sp.w; line.spaces -= sp.w }
    advance()
  }
  for (const l of lines) while (l.items.at(-1)?.t.space) { const sp = l.items.pop(); l.x -= sp.w; l.spaces -= sp.w }
  // break tokens left at the end place nothing
  while (i < tokens.length && tokens[i].blockTo !== undefined) i++
  return { lines: lines.filter(l => l.items.length), rest: i, total: tokens.length, tokens, spilled }
}

/** each line's items placed: justified where the slack is within the caps (CJK per gap, spaces per space), else left
 *  aligned; the unit's last line left aligned; a centred block centred */
function placeItems(lines, f, P, to) {
  const last = lines.at(-1)
  for (const line of lines) {
    const cap = line.x1 - line.x0
    const natural = line.items.reduce((s, it) => s + it.w + (it.asp ?? 0), 0)
    // a closing mark at the line's end may stand in the margin by its blank half
    const end = line.items.at(-1)
    const hang = end?.t.punct === 'close' && !end.cut && P._compress < 2 ? 0.5 * f : 0
    let slack = cap - natural + hang
    const spaces = line.items.filter(it => it.t.space)
    const spW = spaces.reduce((s, it) => s + it.w, 0)
    const cjkItems = line.items.filter(it => it.t.cls === 'cjk').length
    const latinish = spaces.length > 0 && (to === 'ko' || !CJK_TARGETS.has(to) || cjkItems < line.items.length / 2)
    let perSpace = 0, perGap = 0
    line.mode = line.centred ? 'centred' : line === last ? 'last' : 'just'
    if (slack < 0 && spaces.length) perSpace = slack / spaces.length // shrunk spaces (never past spaceMin by the breaking)
    else if (line.mode === 'just' && slack > 0) {
      if (latinish) {
        const per = slack / spaces.length
        if (per <= P.spaceMax * (spW / spaces.length)) perSpace = per
        else line.mode = 'ragged'
      } else {
        const gaps = line.items.length - 1
        if (gaps > 0 && slack / gaps <= P.cjkJust * f) perGap = slack / gaps
        else if (gaps > 0) line.mode = 'ragged'
      }
    }
    if (line.mode === 'last' && slack < 0 && !spaces.length) slack = 0
    let x = line.x0 + (line.centred ? Math.max(0, slack) / 2 : 0)
    line.items.forEach((it, n) => {
      x += it.asp ?? 0
      it.x = x + (it.shift ?? 0)
      x += it.w + (it.t.space ? perSpace : 0) + (n < line.items.length - 1 ? perGap : 0)
    })
    line.used = x - line.x0
    line.cap = cap
  }
}

/** the fit's states, from the most natural, each knob in the order given taken to its bound before the next */
function* statesOf(P, blocks, s) {
  // maxScale: a size set from outside (the page's even pass), from which the fit starts
  // (step 3: the CJK runs' tracking from P.trackStart, a face's size correction given back, run.mjs; down from it)
  const t0 = P.cjk ? P.trackStart ?? 0 : 0
  const st = { lead: P.leadBase, track: t0, trackLatin: 0, compress: P.compressMax > 0 ? 1 : 0, borrow: 0, scale: P.maxScale ?? 1, knob: P.maxScale ? 'even' : 'none' }
  yield { ...st }
  for (const knob of P.order) {
    if (knob === 'track') {
      if (P.compressMax >= 2 && st.compress < 2) { st.compress = 2; yield { ...st, knob } }
      for (let t = t0 - 0.01; t >= P.trackMin - 1e-9; t -= 0.01) {
        if (P.cjk) st.track = t
        else st.trackLatin = t
        yield { ...st, knob }
      }
    } else if (knob === 'borrow') {
      if (!P.borrow) continue
      // the free space is measured here, the first time a unit needs it (an ink map of its page, made once)
      for (const b of blocks) if (b.freeOf) { b.free = b.freeOf(); b.freeOf = null }
      const most = Math.max(0, ...blocks.map(b => Math.floor(b.free / (b.pitch0 ?? 1.2 * s) + 1e-6)))
      for (let n = 1; n <= Math.min(most, 6); n++) { st.borrow = n; yield { ...st, knob } }
      if (most > 0) { st.borrow = 99; yield { ...st, knob } }
    } else if (knob === 'lead') {
      for (let L = st.lead - 0.05; L >= P.leadFloor - 1e-9; L -= 0.05) { st.lead = Math.round(L * 1000) / 1000; yield { ...st, knob } }
      if (st.lead > P.leadFloor + 1e-9) { st.lead = P.leadFloor; yield { ...st, knob } }
    } else if (knob === 'shrink') {
      for (let k = 1; ; k++) {
        const sc = Math.round(((P.maxScale ?? 1) - k * P.step) * 1000) / 1000
        if (sc < P.floor - 1e-9) break
        st.scale = sc
        yield { ...st, knob }
      }
    }
  }
}

/**
 * A unit laid out: the first state of the fit at which every token is placed; at the last, what fits, clipped (which the
 * host never draws: run.mjs fitFurther). P.flowPast (step 3): where a kept region still stops it, every state again with
 * the text run past the region (breakLines 'flow').
 * `s`: the original's size (PDF units). Returns { lines, f, s, scale, state, knob, clipped, lostChars, chars, tried }.
 */
export function layoutUnit2(tokens, blocks, s, P, to) {
  let last = null, tried = 0
  for (const st of statesOf(P, blocks, s)) {
    tried++
    const f = s * st.scale
    const r = breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale)
    last = { r, st, f }
    if (r.rest >= r.total) break
  }
  // nothing fits in order at the last state: the text may run on past a kept region (all of it shown, out of order)
  if (last.r.rest < last.r.total && tokens.some(t => t.blockTo !== undefined)) {
    const r = breakLines(tokens, slotsAt(blocks, last.st, P, s), last.f, last.st, P, last.st.scale, false)
    if (r.rest > last.r.rest) last = { ...last, r }
  }
  // (step 3, P.flowPast: and else through every slot, a kept region only breaking the line, from the most natural state)
  if (P.flowPast && last.r.rest < last.r.total && tokens.some(t => t.blockTo !== undefined)) {
    for (const st of statesOf(P, blocks, s)) {
      tried++
      const f = s * st.scale
      const r = breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, 'flow')
      if (r.rest >= r.total) { last = { r, st, f }; break }
    }
  }
  const { r, st, f } = last
  const clipped = r.rest < r.total
  P._compress = st.compress
  placeItems(r.lines, f, P, to)
  const count = t => (t.s ? [...t.s].length : t.crop ? 1 : 0)
  const allChars = r.tokens.reduce((a, t) => a + count(t), 0)
  const drawn = r.lines.reduce((a, l) => a + l.items.reduce((b, it) => b + count(it.t), 0), 0)
  return { lines: r.lines, f, s, scale: st.scale, state: st, knob: clipped ? 'clip' : st.knob, clipped, lostChars: Math.max(0, allChars - drawn), chars: allChars, tried, spilled: !!r.spilled }
}

// ---- drawing: the layer as data (erasing, restoring, crops), drawn on a copy of the page at any resolution; the SVG text

/**
 * The unit's lines erased on the page, what the erasing covered that no painted unit accounts for put back, and its crops
 * (layer.js paintPart without its text), as data: the operations drawOps draws, in v0's device pixels on the page (`px`,
 * `k` of them a PDF unit). Drawn at v0's own resolution they are v0's own drawing, call for call; drawn at any other
 * they are scaled to it, from the page as PDF.js draws it there, so that nothing is drawn from a page image of a fixed
 * resolution. `hasSource(page)`: whether a crop's page is drawn (v0 leaves out a crop whose page is not). Each operation:
 * - { op: 'erase', box: [x, y, w, h] }: the paper's white;
 * - { op: 'restore', page, clip: [[x, y, w, h], …], boxes: [[x, y, w, h], …] }: the page's own pixels in each box,
 *   within the erased boxes (clip);
 * - { op: 'crop', page, src: [x, y, w, h], dst: [x, y, w, h] }: that page's pixels in src laid on dst, darkened in.
 */
export function unitOps(L, blocks, page, { px, k, hasSource, pxOf, extents, audit = null, id = null, restore = null }) {
  const ops = []
  const erased = []
  for (const [bi, b] of blocks.entries()) {
    if (b.page !== page) continue
    for (const [ri, r] of b.rects.entries()) {
      const ext = extents?.get(r.join()) ?? r.slice(1)
      // (an extent of several boxes, a layout file's: each erased so, the line's last to the column's edge)
      const boxes = Array.isArray(ext[0]) ? ext : [ext]
      for (const [ei, e] of boxes.entries()) {
        const [x0, y0, , y1] = e
        // a line that is not its block's last is justified to the column's edge: erased to it (a closing symbol the
        // anchors' line rectangle left out stayed, 1512.03385 page 2's "&")
        const x1 = ri < b.rects.length - 1 && ei === boxes.length - 1 ? Math.max(e[2], b.x1) : e[2]
        const [ax, ay] = px(x0 - (bi === 0 && ri === 0 && ei === 0 ? 0.3 : 1.8), y1 + 1.2), [bx, by] = px(x1 + 1.8, y0 - 1.2)
        ops.push({ op: 'erase', box: [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)] })
        erased.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)])
        audit?.push({ what: 'erase', unit: id, page, box: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)] })
      }
    }
  }
  if (restore && erased.length) {
    const op = restoreUnaccounted(erased, px, restore, audit, id, page)
    if (op) ops.push(op)
  }
  for (const line of L.lines) {
    if (line.page !== page) continue
    for (const it of line.items) {
      if (!it.t.crop) continue
      const c = it.t.crop.crop
      if (!hasSource(it.t.crop.page)) continue
      const sc = L.scale
      const [sx0, sy0] = pxOf(it.t.crop.page)(c[0], c[3]), [sx1, sy1] = pxOf(it.t.crop.page)(c[2], c[1])
      const [dx, dy] = px(it.x, line.baseline + (c[3] - it.t.crop.baseline) * sc)
      ops.push({ op: 'crop', page: it.t.crop.page, src: [sx0, sy0, sx1 - sx0, sy1 - sy0], dst: [dx, dy, it.w * k, (c[3] - c[1]) * sc * k] })
      audit?.push({ what: 'crop', unit: id, page, k: it.t.crop.k, srcPage: it.t.crop.page, src: c, dst: [dx, dy, dx + it.w * k, dy + (c[3] - c[1]) * sc * k] })
    }
  }
  return ops
}

/**
 * The unit's drawing on a page whose text the removed PDF has taken out (removal.mjs, layout/remove.mjs), as data: the
 * removed page's pixels swapped in over the unit's own glyphs (`rects`, device pixels, where kept ink lies under them),
 * then its other rectangles filled with paper (`erase`, one path: the fill takes no kept ink), then
 * its crops, each cut from the original through its own glyphs' and rules' outline boxes (`clips`, by the piece's
 * index: `rects` drawn through, `own` its boxes unpadded, for a check). Nothing is put back. The
 * audit has the unit's swapped boxes (as its 'erase', what the gate's residue and bites read) and its crops, as unitOps'.
 * `lines`: the unit's removed glyphs' boxes on the page grouped by line, in PDF units, for the audit.
 */
export function removalOps(L, page, { px, k, hasSource, pxOf, rects, erase = [], lines = [], removed, audit = null, id = null, clips = null }) {
  const ops = []
  if (rects.length) ops.push({ op: 'swap', page, rects })
  // (the rest filled with paper, all of it one path: two rectangles' shared edge, a fraction of a pixel, would show a
  // seam of the original's ink where each covered it in part)
  if (erase.length) ops.push({ op: 'paper', rects: erase })
  for (const b of lines) {
    const [ax, ay] = px(b[0], b[3]), [bx, by] = px(b[2], b[1])
    audit?.push({ what: 'erase', unit: id, page, box: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)], swap: true })
  }
  for (const line of L.lines) {
    if (line.page !== page) continue
    for (const it of line.items) {
      if (!it.t.crop) continue
      const c = it.t.crop.crop
      if (!hasSource(it.t.crop.page)) continue
      const sc = L.scale
      const [sx0, sy0] = pxOf(it.t.crop.page)(c[0], c[3]), [sx1, sy1] = pxOf(it.t.crop.page)(c[2], c[1])
      const [dx, dy] = px(it.x, line.baseline + (c[3] - it.t.crop.baseline) * sc)
      // (cut from the original through its own glyphs' and rules' outline boxes, where it has them: a crop's box may
      // reach another line's ink, its glyphs' boxes do not)
      const cut = clips?.get(it.t.crop.k) ?? null, clip = cut?.rects ?? null
      const plane = 'O'
      ops.push({ op: 'crop', page: it.t.crop.page, plane, src: [sx0, sy0, sx1 - sx0, sy1 - sy0], dst: [dx, dy, it.w * k, (c[3] - c[1]) * sc * k], ...(clip?.length ? { clip } : {}) })
      audit?.push({ what: 'crop', unit: id, page, k: it.t.crop.k, srcPage: it.t.crop.page, plane, src: c, dst: [dx, dy, dx + it.w * k, dy + (c[3] - c[1]) * sc * k], ...(clip?.length ? { clip, own: cut.own } : {}) })
    }
  }
  return ops
}

/**
 * unitOps' and removalOps' operations drawn on `ctx`, a copy of the page, in their order, `z` times v0's resolution (1:
 * v0's own canvas calls, with the same numbers). `sourceOf(page, plane)`: that page as PDF.js drew it at the same
 * resolution as `ctx`, untouched, which the restores, swaps and crops are cut from (null: the operation is left out):
 * plane 'O' (or none) the original, 'R' its text-removed page, 'P' its placeholders alone. A crop is darkened in, never
 * pasted: its paper is white, and pasted it erased what it was laid over (a kept label). A swap puts the removed page's
 * pixels in its rectangles.
 */
export function drawOps(ctx, ops, z, sourceOf) {
  const at = b => [b[0] * z, b[1] * z, b[2] * z, b[3] * z]
  ctx.save()
  ctx.fillStyle = '#fff'
  for (const o of ops) {
    if (o.op === 'erase') ctx.fillRect(...at(o.box))
    else if (o.op === 'paper') {
      ctx.beginPath()
      for (const e of o.rects) ctx.rect(...at(e))
      ctx.fill()
    }
    else if (o.op === 'restore') {
      const src = sourceOf(o.page, 'O')
      if (!src) continue
      ctx.save()
      ctx.beginPath()
      for (const e of o.clip) ctx.rect(...at(e))
      ctx.clip()
      for (const b of o.boxes) { const d = at(b); ctx.drawImage(src, ...d, ...d) }
      ctx.restore()
    } else if (o.op === 'swap') {
      const src = sourceOf(o.page, 'R')
      if (!src || !o.rects.length) continue
      ctx.save()
      ctx.beginPath()
      for (const e of o.rects) ctx.rect(...at(e))
      ctx.clip()
      ctx.drawImage(src, 0, 0)
      ctx.restore()
    } else if (o.op === 'crop') {
      const src = sourceOf(o.page, o.plane ?? 'O')
      if (!src) continue
      const s = at(o.src), d = at(o.dst)
      if (o.clip) {
        // its own ink's boxes (source pixels) where they land: the crop's map from its source to its place
        const sx = d[2] / (s[2] || 1), sy = d[3] / (s[3] || 1)
        ctx.save()
        ctx.beginPath()
        for (const e of o.clip) { const b = at(e); ctx.rect(d[0] + (b[0] - s[0]) * sx, d[1] + (b[1] - s[1]) * sy, b[2] * sx, b[3] * sy) }
        ctx.clip()
      }
      ctx.globalCompositeOperation = 'darken'
      ctx.drawImage(src, ...s, ...d)
      ctx.globalCompositeOperation = 'source-over'
      if (o.clip) ctx.restore()
    }
  }
  ctx.restore()
}

/**
 * Iteration 3: what a unit's erasing covered that no painted unit accounts for, put back from the original: a page's
 * characters whose keys `accounted` lacks (a kept formula, a label, a rendering no placeholder took, another unit's
 * line the rectangles overlap), each item whole where all of its characters are (an item's width is exact, its
 * characters' places estimates), and the ink no character covers (a rule, a figure's part: the page's ink map, a
 * quarter of the canvas's resolution, against `cover`, the cells the page's text covers). Only inside the erased boxes.
 * `restore`: { items ([{ chars, keys }] of the page), accounted (Set), kept, ink, cover }. Returns the restore operation
 * (unitOps'), its boxes in whole device pixels as v0 drew them, or null.
 */
function restoreUnaccounted(erased, px, { items, accounted, kept, ink, cover }, audit, id, page) {
  const boxes = []
  // the erased boxes' own extent first: most of the page's items are nowhere near them
  const ex0 = Math.min(...erased.map(e => e[0])), ex1 = Math.max(...erased.map(e => e[2])), ey0 = Math.min(...erased.map(e => e[1])), ey1 = Math.max(...erased.map(e => e[3]))
  const hit = b => b[0] < ex1 && b[2] > ex0 && b[1] < ey1 && b[3] > ey0 && erased.some(e => b[0] < e[2] && b[2] > e[0] && b[1] < e[3] && b[3] > e[1])
  const dev = (x0, y0, x1, y1) => { const [ax, ay] = px(x0, y1), [bx, by] = px(x1, y0); return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)] }
  // a kept line (a formula) whole, its hull: its rules and radicals are ink no character covers
  for (const h of kept?.hulls ?? []) if (hit(h)) boxes.push(h)
  const isKept = key => kept?.keys.has(key)
  for (const it of items) {
    if (!hit(it.box)) continue
    const out = it.chars.filter((c, n) => /\S/.test(c.ch) && (!accounted.has(it.keys[n]) || isKept(it.keys[n])))
    if (!out.length) continue
    if (out.length === it.chars.filter(c => /\S/.test(c.ch)).length) boxes.push(it.box)
    else for (const c of out) boxes.push(dev(c.x0 - 0.3, c.yb - 0.3 * c.size, c.x1 + 0.3, c.yb + 0.9 * c.size))
  }
  if (ink && cover) {
    const f = ink.factor
    // the ink no accounted character stands on is put back: covered only by an item whose characters are all accounted
    // (its box, exact) or by an accounted character's box a cell around (a hanging bracket below its own glyph's box,
    // a rule, a figure's part are not)
    cover = new Uint8Array(ink.w * ink.h)
    const mark = b => {
      const c0 = Math.max(0, Math.floor(b[0] / f) - 1), c1 = Math.min(ink.w - 1, Math.floor(b[2] / f) + 1), r0 = Math.max(0, Math.floor(b[1] / f) - 1), r1 = Math.min(ink.h - 1, Math.floor(b[3] / f) + 1)
      for (let r = r0; r <= r1; r++) cover.fill(1, r * ink.w + c0, r * ink.w + c1 + 1)
    }
    for (const it of items) {
      if (!hit(it.box)) continue
      const ok = it.chars.map((c, n) => !/\S/.test(c.ch) || (accounted.has(it.keys[n]) && !isKept(it.keys[n])))
      if (ok.every(Boolean)) { mark(it.box); continue }
      it.chars.forEach((c, n) => { if (/\S/.test(c.ch) && ok[n]) mark(dev(c.x0 - 0.3, c.yb - 0.3 * c.size, c.x1 + 0.3, c.yb + 0.9 * c.size)) })
    }
    for (const e of erased) {
      const c0 = Math.max(0, Math.floor(e[0] / f)), c1 = Math.min(ink.w - 1, Math.floor(e[2] / f)), r0 = Math.max(0, Math.floor(e[1] / f)), r1 = Math.min(ink.h - 1, Math.floor(e[3] / f))
      for (let r = r0; r <= r1; r++) {
        let from = -1
        for (let c = c0; c <= c1 + 1; c++) {
          const on = c <= c1 && ink.ink[r * ink.w + c] && !cover[r * ink.w + c]
          if (on && from < 0) from = c
          if (!on && from >= 0) { boxes.push([from * f, r * f, c * f, (r + 1) * f]); from = -1 }
        }
      }
    }
  }
  if (!boxes.length) return null
  const whole = []
  for (const b of boxes) {
    const x = Math.floor(b[0]), y = Math.floor(b[1]), w = Math.ceil(b[2]) - x, h = Math.ceil(b[3]) - y
    if (w > 0 && h > 0) whole.push([x, y, w, h])
  }
  audit?.push({ what: 'restore', unit: id, page, boxes: boxes.length })
  return { op: 'restore', page, clip: erased.map(e => [e[0], e[1], e[2] - e[0], e[3] - e[1]]), boxes: whole }
}

/** a page's text items, each with its characters, their keys and its box in device pixels (restoreUnaccounted's), and
 *  the ink map's cells their boxes cover, a cell around */
export function pageItemsOf(chars, page, px, ink) {
  const by = new Map()
  for (const c of chars) { if (!by.has(c.item)) by.set(c.item, []); by.get(c.item).push(c) }
  const items = []
  for (const cs of by.values()) {
    const size = Math.max(...cs.map(c => c.size))
    const [ax, ay] = px(cs[0].x0 - 0.3, cs[0].yb + 0.9 * size), [bx, by2] = px(cs.at(-1).x1 + 0.3, cs[0].yb - 0.3 * size)
    items.push({ chars: cs, keys: cs.map(c => `${page}|${c.item}|${c.k}`), box: [Math.min(ax, bx), Math.min(ay, by2), Math.max(ax, bx), Math.max(ay, by2)] })
  }
  let cover = null
  if (ink) {
    cover = new Uint8Array(ink.w * ink.h)
    const f = ink.factor
    for (const it of items) {
      const c0 = Math.max(0, Math.floor(it.box[0] / f) - 1), c1 = Math.min(ink.w - 1, Math.floor(it.box[2] / f) + 1), r0 = Math.max(0, Math.floor(it.box[1] / f) - 1), r1 = Math.min(ink.h - 1, Math.floor(it.box[3] / f) + 1)
      for (let r = r0; r <= r1; r++) cover.fill(1, r * ink.w + c0, r * ink.w + c1 + 1)
    }
  }
  return { items, cover }
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const faceClasses = new Map()
let faceSheet = null
/** a face's CSS class, its rule added to the page's sheet once */
function faceClass(face) {
  const key = `${face.family}|${face.weight}|${face.style}|${face.caps ? 1 : 0}`
  let c = faceClasses.get(key)
  if (!c) {
    c = `axf${faceClasses.size}`
    faceClasses.set(key, c)
    faceSheet ??= document.head.appendChild(document.createElement('style'))
    faceSheet.sheet.insertRule(`.${c}{font-family:${face.family};font-weight:${face.weight};font-style:${face.style}${face.caps ? ';font-variant:small-caps' : ''}}`)
  }
  return c
}
const n2 = v => Math.round(v * 100) / 100
const COLOURS = { red: '#d00', blue: '#00c', green: '#080', gray: '#777', grey: '#777', orange: '#e60', purple: '#80a', magenta: '#c0c', cyan: '#0aa', violet: '#80f', brown: '#850', black: '#141414' }

/**
 * The unit's lines on one page as SVG: a <text> per line at its baseline, a <tspan> per run with its own x (a CJK run
 * a position per character), an oblique run a <text> of its own skewed about its baseline, a crop's formula as
 * transparent text over it (so that it is copied and found). `toPx(x, y)`: PDF to the SVG's CSS pixels; `scale`: CSS
 * pixels per PDF unit.
 */
export function svgOfUnit(L, page, toPx, scale, id) {
  let out = `<g data-u="${id}">`
  const fs = L.f * scale
  for (const line of L.lines) {
    if (line.page !== page) continue
    const [, by] = toPx(line.x0, line.baseline)
    let body = '', oblique = ''
    let run = null
    const flush = () => {
      if (!run) return
      const cls = faceClass(run.face)
      const fill = run.color ? ` fill="${COLOURS[run.color] ?? '#141414'}"` : ''
      // (v0: a role table face's size correction, 1 for the prototype's faces)
      const size = n2((run.sup ? fs * 0.62 : fs) * (run.face.size ?? 1))
      const y = run.sup ? n2(by - L.f * 0.36 * scale) : n2(by)
      const xs = run.chars ? run.xs.map(n2).join(' ') : n2(run.xs[0])
      // a word laid out with tracking is drawn with it (single CJK characters carry it in their places)
      const ls = !run.chars && run.track ? ` letter-spacing="${n2(run.track * L.f * scale)}"` : ''
      const span = `<tspan class="${cls}" x="${xs}" y="${y}" font-size="${size}"${ls}${fill}>${esc(run.text)}</tspan>`
      if (run.face.oblique) {
        const ox = n2(run.xs[0])
        oblique += `<text transform="translate(${ox} ${n2(by)}) skewX(${-OBLIQUE_DEG}) translate(${-ox} ${-n2(by)})">${span}</text>`
      } else body += span
      run = null
    }
    line.items.forEach((it, n) => {
      const t = it.t
      const [x] = toPx(it.x, line.baseline)
      if (t.crop) {
        flush()
        // the formula's plain text, invisible, over its crop: copied and found with the rest
        if (t.crop.text) body += `<tspan class="${faceClass(faceOf({ fam: 'serif', design: 'times' }, 'latin', 'en'))}" x="${n2(x)}" y="${n2(by)}" font-size="${n2(fs * 0.9)}" fill-opacity="0">${esc(t.crop.text)}</tspan>`
        return
      }
      if (t.space) {
        // the space is copied with the text before it (a run of single CJK characters takes it too: Korean and the
        // spaces around Latin words), though justification places what follows
        if (run) {
          run.text += ' '
          // a per-character run gives the space its own place, so that the characters after it keep theirs
          if (run.chars) run.xs.push(x)
        }
        return
      }
      const single = t.cls === 'cjk' && [...t.s].length === 1 && !t.sup
      // faces alike by their class (each token has a face object of its own): single CJK characters of one face share
      // a run, which keeps the DOM small (one tspan for a line's run, not one a character)
      const sameFace = run && faceClass(run.face) === faceClass(t.face) && run.face.oblique === t.face.oblique && run.sup === !!t.sup && run.color === t.st?.color
      if (single) {
        // single CJK characters share a run, each at its own place (justification between them included)
        if (!sameFace || !run.chars) {
          flush()
          run = { face: t.face, chars: true, sup: false, color: t.st?.color, text: '', xs: [] }
        }
        run.text += t.s
        run.xs.push(x)
      } else {
        // a word (Latin, or a Hangul word) flows in its face from its own place; words glued to it with no space
        // between flow on in the same run
        const glued = run && !run.chars && sameFace && !line.items[n - 1]?.t.space && line.items[n - 1]?.t.cls === t.cls && !t.brk
        if (!glued) {
          flush()
          run = { face: t.face, chars: false, sup: !!t.sup, color: t.st?.color, text: '', xs: [x], track: t.sup ? 0 : t.cls === 'cjk' ? L.state.track : L.state.trackLatin }
        }
        run.text += t.s
      }
      // the line's last word: a space after it for the copy, where it is not hyphenated
      if (n === line.items.length - 1 && t.cls === 'latin' && !t.hyphenated) run.text += ' '
    })
    flush()
    out += `<text y="${n2(by)}">${body}</text>${oblique}`
  }
  return `${out}</g>`
}

// ---- the scorer's view of a laid-out unit

/** the translated text's runs as drawn, by style key (class, weight, slant or its stand-in), placeholders' text left out */
export function drawnRuns(tokens) {
  const runs = []
  for (const t of tokens) {
    if (!t.s || t.sup || t.math || t.ph || !/\S/.test(t.s)) continue
    const key = styleKey(t.st)
    const n = [...t.s].length
    if (runs.at(-1)?.key === key) runs.at(-1).n += n
    else runs.push({ key, n })
  }
  return runs
}
/** runs whose style matches: the base (most characters) against the base, then the other runs as a multiset of
 *  their keys (a translation reorders its phrases: Japanese sets the verb last), each original run against a drawn
 *  run of the same class, weight and slant */
export function styleMatch(orig, drawn, drawnBase) {
  if (!orig?.runs?.length || !drawn.length) return { match: 0, total: 0 }
  const baseOf = runs => { const m = new Map(); for (const r of runs) m.set(r.key, (m.get(r.key) ?? 0) + r.n); return [...m].sort((a, b) => b[1] - a[1])[0][0] }
  // the original's base: its majority; the layer's: the style it gives the unit's text outside any group (a count of
  // characters would flip with the language: 14 Chinese characters say what 39 English letters did)
  const ob = orig.key ?? baseOf(orig.runs), db = drawnBase ?? baseOf(drawn)
  const count = (runs, base) => { const m = new Map(); for (const r of runs) if (r.key !== base) m.set(r.key, (m.get(r.key) ?? 0) + 1); return m }
  const oc = count(orig.runs, ob), dc = count(drawn, db)
  let both = 0
  for (const [k, n] of oc) both += Math.min(n, dc.get(k) ?? 0)
  const on = [...oc.values()].reduce((a, b) => a + b, 0), dn = [...dc.values()].reduce((a, b) => a + b, 0)
  return { match: (ob === db ? 1 : 0) + both, total: 1 + Math.max(on, dn), base: ob === db, ob, db }
}
