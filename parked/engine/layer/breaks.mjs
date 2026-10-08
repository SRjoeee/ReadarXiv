// The layer's line breaking (Plan 8b, Task 9; the instant layer's spec §4.5): tokens into the original's slots, greedily, and
// each line's items placed. A function of its inputs alone: no DOM, no clock; text is measured only through the function it
// is given, and the tokens and slots it is handed are never changed.
//
// What the tokens carry settles the rest: `glue` (no break before a token) is where kinsoku and a word's own parts hold
// together, `punct` the full-width marks compression takes half of, `asp` a CJK-Latin gap, `hyph` a word that may be
// hyphenated. Here a line takes whole groups of glued tokens while they fit, its spaces shrinking to SPACE_MIN of their
// width; a closing mark hangs its blank half in the margin; a word longer than its line is hyphenated where a hyphenator
// allows, else cut by characters, with a hyphen drawn at the cut where it is a word of running text (a CJK or Korean word, a
// URL and a typewriter run are cut without one). An original module (no port statement), importing only relative modules.
import { scriptOf } from '../rules/layer-rules.mjs'
import { hyphenCore } from './tokens.mjs'

/** a space may shrink to this share of its width */
export const SPACE_MIN = 0.8
/** em a CJK gap may grow by when justifying */
export const CJK_JUST_MAX = 0.25

// a width within this of a line's room fits: a hundredth of a PDF unit, as the files hold them
const EPS = 0.01
const CJK_BREAKING = new Set(['Hans', 'Hant', 'Jpan'])

/** the characters of a text, by code point */
const cpLength = s => { let n = 0; for (let i = 0; i < s.length; i++) if ((s.charCodeAt(i) & 0xfc00) !== 0xdc00) n++; return n }
const inline = t => t.kind === 'text' || t.kind === 'ph'

/** a token's width at size f: its width in ems times f, its characters' tracking (CJK) or letter spacing (Latin) added */
function widthAt(t, f, state) {
  if (t.kind === 'text') return t.w * f + (t.script === 'cjk' ? state.track : state.letter) * f * cpLength(t.s)
  if (t.kind === 'space') return t.w * f
  if (t.kind === 'ph') return t.mode === 'crop' ? t.w * f : t.w * f + state.letter * f * cpLength(t.s)
  return 0
}

/**
 * Tokens into slots at size f (PDF units), greedily. `state`: tracking and letter spacing in em per character, and
 * compression (1: an opening mark at a line's start or after a mark loses its blank half, and the first of two marks
 * together its trailing half; 2: every mark its blank half; a closing mark at a line's end hangs its blank half in the
 * margin below 2). `rest`: the content tokens left over where the slots run out, or where the text would run on below a
 * display it has not reached.
 */
export function breakLines(tokens, slots, f, state, o) {
  const { rules, measure, hyphen } = o
  const out = tokens.slice()
  const lines = []
  const compress = state.compress
  const autospace = rules.autospace * f
  let i = 0, si = 0, consumed = 0, line = null, stopped = false, overflow = 0

  /** the next slot with width that the text may go to: not below a display it has not reached */
  const open = () => {
    while (si < slots.length) {
      const slot = slots[si]
      if (slot.after > consumed) return false
      if (slot.x1 - slot.x0 > 0) { line = { slot, items: [], meta: [], x: 0, spaces: 0 }; return true }
      si++
    }
    return false
  }
  const room = () => line.slot.x1 - line.slot.x0
  /** the line's width with its spaces at their shortest */
  const squeezed = () => line.x - line.spaces * (1 - SPACE_MIN)

  /** the line ended: trailing spaces off, a closing mark at its end hung, the items at their natural places */
  const close = mode => {
    while (line.items.length && line.items[line.items.length - 1].t.kind === 'space') {
      const space = line.items.pop()
      line.meta.pop()
      line.x -= space.w
      line.spaces -= space.w
    }
    if (!line.items.length) { line = null; return }
    const { slot } = line
    const last = line.items[line.items.length - 1], meta = line.meta[line.meta.length - 1]
    if (last.t.punct === 'close' && compress < 2 && !meta.cut && !slot.centred) { last.w -= meta.half; meta.cut = true }
    // what the line holds, spaces at their shortest, past its slot: the hung mark and the shifted one count by their advances
    let x = slot.x0, natural = 0, spaces = 0
    for (const it of line.items) {
      x += it.asp
      it.x = x + it.shift
      x += it.w
      natural += it.asp + it.w
      if (it.t.kind === 'space') spaces += it.w
    }
    const over = natural - spaces * (1 - SPACE_MIN) - (slot.x1 - slot.x0)
    if (over > EPS) overflow = Math.max(overflow, f > 0 ? over / f : over)
    lines.push({ slot, items: line.items, mode: slot.centred ? 'centred' : mode })
    line = null
    si++
  }

  /**
   * A group of glued tokens as the items they would be after what the line holds: their widths with compression, the gaps of
   * autospace, `delta` what the line's last item loses to a mark that comes after it, `hang` what the group's last mark may
   * hang past the margin.
   */
  const build = (group, prev, prevMeta) => {
    const items = [], metas = []
    let width = 0, delta = 0, spaces = 0
    let pv = prev, pm = prevMeta
    for (const t of group) {
      const it = { t, w: widthAt(t, f, state), x: 0, shift: 0, asp: 0 }
      if (t.kind === 'space') spaces += it.w
      const meta = { half: t.punct ? (t.w * f) / 2 : 0, cut: false }
      if (t.asp && pv && pv.t.kind !== 'space') it.asp = autospace
      if (t.punct && compress >= 2) {
        it.w -= meta.half
        if (t.punct === 'open') it.shift = -meta.half
      } else if (t.punct && compress === 1) {
        if (pv && pv.t.punct === 'close' && !pm.cut) {
          if (items.length) { pv.w -= pm.half; pm.cut = true; width -= pm.half } else delta = -pm.half
        } else if (t.punct === 'open' && (!pv || pv.t.punct)) {
          it.w -= meta.half
          it.shift = -meta.half
        }
      }
      items.push(it)
      metas.push(meta)
      width += it.w + it.asp
      pv = it
      pm = meta
    }
    const lastMeta = metas[metas.length - 1]
    const hang = items[items.length - 1].t.punct === 'close' && compress < 2 && !lastMeta.cut && !line.slot.centred ? lastMeta.half : 0
    return { items, metas, width, delta, spaces, hang }
  }
  const fits = b => squeezed() + b.delta + b.width - b.spaces * (1 - SPACE_MIN) - b.hang <= room() + EPS
  const commit = b => {
    if (b.delta) {
      line.items[line.items.length - 1].w += b.delta
      line.meta[line.meta.length - 1].cut = true
      line.x += b.delta
    }
    for (let q = 0; q < b.items.length; q++) { line.items.push(b.items[q]); line.meta.push(b.metas[q]) }
    line.x += b.width
    line.spaces += b.spaces
  }

  /** a token cut at `cut` units of its text: the head, with `suffix` drawn after it, and the tail */
  const split = (t, cut, suffix) => {
    const exact = t.s.length === t.len
    const head = { ...t, s: t.s.slice(0, cut) + suffix, len: exact ? cut : t.len }
    const tail = { ...t, s: t.s.slice(cut), at: exact ? t.at + cut : t.at + t.len, len: exact ? t.len - cut : 0 }
    head.w = measure(head.s, t.face, t.caps) / 100
    tail.w = measure(tail.s, t.face, t.caps) / 100
    delete head.hyph
    delete tail.glue
    delete tail.asp
    if (!t.hyph || !hyphenCore(tail.s)) delete tail.hyph
    return [head, tail]
  }
  const textWidth = (text, t) => (measure(text, t.face, t.caps) * f) / 100 + (t.script === 'cjk' ? state.track : state.letter) * f * cpLength(text)

  /** a word that does not fit hyphenated at the last point of the language that fits, its hyphen drawn: whether it was */
  const hyphenate = (t, b) => {
    if (!hyphen || !t.hyph || t.hyph !== hyphen.lang || t.kind !== 'text' || t.script !== 'latin') return false
    const word = hyphenCore(t.s)
    if (!word) return false
    const space = room() + EPS - squeezed() - b.items[0].asp
    let best = -1
    for (const p of hyphen.points(word.core)) {
      if (!Number.isInteger(p) || p < hyphen.left || word.core.length - p < hyphen.right || p <= best) continue
      if (textWidth(`${t.s.slice(0, word.lead + p)}-`, t) <= space) best = p
    }
    if (best < 0) return false
    const [head, tail] = split(t, word.lead + best, '-')
    out.splice(i, 1, head, tail)
    commit(build([head], line.items[line.items.length - 1] ?? null, line.meta[line.meta.length - 1] ?? null))
    i++
    close('just')
    return true
  }

  /** the most of a token's characters that fit `space` with `suffix` (a hyphen) after them, as units of its text; 0 where it
   *  has fewer than two characters or not the first */
  const prefixFitting = (t, space, suffix) => {
    if (t.s === undefined || cpLength(t.s) < 2) return 0
    let best = 0, n = 0
    for (const ch of t.s) {
      n += ch.length
      if (n >= t.s.length || textWidth(t.s.slice(0, n) + suffix, t) > space) break
      best = n
    }
    return best
  }

  /** a group longer than an empty line: a first word hyphenated where its language allows, else what fits of the group, the
   *  token that does not fit cut by characters (a word of running text with a hyphen drawn, the rest without), and the rest
   *  left for the next line. Only text is cut: a placeholder (a crop, or the page's own text) is drawn whole, and one alone
   *  wider than its line is placed and overflows, as a token that cannot be cut does */
  const cut = (group, b) => {
    const cap = room()
    let x = 0, q = 0
    while (q < b.items.length && x + b.items[q].w + b.items[q].asp <= cap + EPS) { x += b.items[q].w + b.items[q].asp; q++ }
    if (q === 0 && hyphenate(group[0], b)) return
    let piece = null, suffix = ''
    if (q < group.length) {
      const t = group[q], space = cap + EPS - x - b.items[q].asp
      let k = t.kind === 'text' && t.word ? prefixFitting(t, space, '-') : 0
      if (k > 0) suffix = '-'
      else if (t.kind === 'text') k = prefixFitting(t, space, '')
      if (k > 0) piece = k
      else if (q === 0) q = 1
    }
    for (let p = 0; p < q; p++) { line.items.push(b.items[p]); line.meta.push(b.metas[p]) }
    i += q
    if (piece !== null) {
      const [head, tail] = split(group[q], piece, suffix)
      out.splice(i, 1, head, tail)
      line.items.push({ t: head, w: widthAt(head, f, state), x: 0, shift: 0, asp: b.items[q].asp })
      line.meta.push({ half: 0, cut: false })
      i++
    }
    close('just')
  }

  /** whether a token that is text or a placeholder comes at or after `from` */
  const contentFrom = from => { for (let q = from; q < out.length; q++) if (inline(out[q])) return true; return false }

  while (i < out.length) {
    const t = out[i]
    if (t.kind === 'space') {
      // leading spaces and doubled ones are no space; the trailing ones go when the line closes
      if (line?.items.length && line.items[line.items.length - 1].t.kind !== 'space') {
        const w = widthAt(t, f, state)
        line.items.push({ t, w, x: 0, shift: 0, asp: 0 })
        line.meta.push({ half: 0, cut: false })
        line.x += w
        line.spaces += w
      }
      i++
      continue
    }
    if (t.kind === 'break') {
      if (line?.items.length && contentFrom(i + 1)) close('last')
      i++
      continue
    }
    if (t.kind === 'block') {
      // a display, kept where it is: the text after it begins in the first slot below it
      consumed++
      if (line?.items.length) close('last')
      line = null
      while (si < slots.length && slots[si].after < consumed) si++
      i++
      continue
    }
    if (!line && !open()) { stopped = true; break }
    let j = i + 1
    while (j < out.length && out[j].glue) j++
    const group = out.slice(i, j)
    const b = build(group, line.items[line.items.length - 1] ?? null, line.meta[line.meta.length - 1] ?? null)
    if (fits(b)) { commit(b); i = j; continue }
    if (!line.items.length) { cut(group, b); continue }
    if (hyphenate(group[0], b)) continue
    close('just')
  }
  if (line?.items.length) close('last')
  let rest = 0
  if (stopped) for (let q = i; q < out.length; q++) if (inline(out[q])) rest++
  return { lines, rest, overflow, tokens: out }
}

/**
 * Each line's items placed. Spaces shrink to fit a line, and a justified line's slack goes to the spaces where there are
 * some (alphabets, Korean, a CJK line that is mostly Latin) up to `spaceMax` of a space's width each, else to the gaps between
 * its items (CJK) up to CJK_JUST_MAX em each; past either the line is ragged, its items at their natural places. The unit's
 * last line and a line a break or a display ends are left at their natural places; a centred block's lines are centred.
 */
export function placeLines(b, f, o) {
  const perChar = CJK_BREAKING.has(scriptOf(o.target))
  const { spaceMax } = o.rules
  for (const line of b.lines) {
    const { slot, items } = line
    const cap = slot.x1 - slot.x0
    let natural = 0, spaces = 0, spaceWidth = 0, cjk = 0
    for (const it of items) {
      natural += it.asp + it.w
      if (it.t.kind === 'space') { spaces++; spaceWidth += it.w } else if (it.t.script === 'cjk') cjk++
    }
    const slack = cap - natural
    let perSpace = 0, perGap = 0, start = slot.x0
    if (slack < -EPS) {
      if (spaces) perSpace = Math.max(slack / spaces, (-(1 - SPACE_MIN) * spaceWidth) / spaces)
    } else if (slack > EPS) {
      if (line.mode === 'centred') start += slack / 2
      else if (line.mode === 'just') {
        if (!perChar || (spaces > 0 && cjk < items.length / 2)) {
          if (spaces > 0 && slack / spaces <= spaceMax * (spaceWidth / spaces) + EPS) perSpace = slack / spaces
          else line.mode = 'ragged'
        } else if (items.length > 1 && slack / (items.length - 1) <= CJK_JUST_MAX * f + EPS) perGap = slack / (items.length - 1)
        else line.mode = 'ragged'
      }
    }
    let x = start
    for (let n = 0; n < items.length; n++) {
      const it = items[n]
      x += it.asp
      it.x = x + it.shift
      x += it.w + (it.t.kind === 'space' ? perSpace : 0) + (n < items.length - 1 ? perGap : 0)
    }
  }
}
