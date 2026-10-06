// The instant layer's fit (Plan 8b, Task 10; the instant layer's spec §4.5): a unit's translation set into the original's
// own frames, on the original's lines, giving up as little as it must to fit, in the maintainer's order: tracking, then
// the space below, then leading, then size. A unit that does not fit at the floor stays the original's, whole: nothing is
// clipped, dropped or drawn in part.
//
// - Slots from the layout file: each frame's lines in order, on the layout's own baselines at leading 1 (CJK at any
//   size, alphabets at full size), else from the frame's first baseline at the scaled pitch. A display's lines are no
//   slots: the text before it fills the lines above it, the text after it starts below it.
// - A split unit (more than one frame) is cut at the translation's sentence start nearest each frame's share of the
//   source, each part laid in its own frame, the unit at one size and leading; a part that does not fit gives a sentence
//   to the roomier frame before the fit moves on.
//
// Pure, as the layer is: no DOM, no clock, no randomness; text is measured only through the function it is given, and
// sizes and positions are PDF units, which no zoom changes. An original module (no port statement), importing only
// relative modules, so that the reader's bundle holds it.
import { FACES } from '../font-roles.mjs'
import { scriptOf } from '../layer-rules.mjs'
import { breakLines, placeLines } from './breaks.mjs'
import { trText } from './pieces.mjs'
import { tokensOf } from './tokens.mjs'

/** a split part's sentence start is taken within this share of the translation's length from its frame's share */
export const SPLIT_NEAR = 0.2

// a width or a baseline within this of a bound is on it: a hundredth of a PDF unit, as the files hold them
const EPS = 0.01
const TRACK_STEP = 0.01, LEAD_STEP = 0.05, BORROW_LINES = 6
/** em at the current size: a line narrower holds no text */
const NARROW = 1.5
/** of the pitch: no two lines stand closer */
const CLOSEST = 0.7
/** × the size: the pitch of a unit with no two lines in a frame */
const PITCH_OF_SIZE = 1.2
/** of a line's width: a display segment over as much of it holds the line */
const HOLDS = 1 / 3
/** em at the unit's size: the gap kept beside a display's segment that does not hold its line, and after a label */
const GAP = 0.25
// the scripts whose lines keep the layout's baselines at any size (their leading is × the pitch alone), and those that
// are cut by characters where a split has no sentence start near its share
const GRID = new Set(['Hans', 'Hant', 'Jpan', 'Kore'])
const BY_CHARACTER = new Set(['Hans', 'Hant', 'Jpan'])

const r2 = v => Math.round(v * 100) / 100
const r3 = v => Math.round(v * 1000) / 1000
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 }
const cpLength = s => { let n = 0; for (let i = 0; i < s.length; i++) if ((s.charCodeAt(i) & 0xfc00) !== 0xdc00) n++; return n }
const content = t => t.kind === 'text' || t.kind === 'ph'

/**
 * A face's size correction (the role table's Face.size: Source Han Serif K's Hangul set at its family's ideographs'
 * visual size), 1 for every other face. A run is drawn at the line's size × its face's correction, so the fit measures it
 * so: its width at 100 px times the correction.
 */
function faceSize(face) {
  const v = Object.hasOwn(FACES, face) ? FACES[face].size : undefined
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1
}

/**
 * The fit's states in order, from the most natural, each knob taken to its bound before the next (spec §4.5's order):
 * 1. tracking: full-width punctuation compressed to 2 where the rules give 2, then tracking (CJK) or letter spacing
 *    (alphabets) in steps of 0.01 em to its bound;
 * 2. the space below the last frame: 1 to 6 lines of `pitch`, then all of `below` × borrowMax (PDF units);
 * 3. leading: in steps of 0.05 down to leadFloor, then leadFloor itself;
 * 4. size: in steps of sizeStep down to sizeFloor.
 * The first state is leadBase (or `lead`), no tracking, compression 1 where the rules compress, no borrowing, and scale 1
 * (or `maxScale`): 'even' where page-even set it.
 */
export function* statesOf(rules, o) {
  const st = {
    scale: o.maxScale ?? 1, lead: o.lead ?? rules.leadBase, track: 0, letter: 0, compress: rules.compress > 0 ? 1 : 0, borrow: 0,
    knob: o.maxScale !== undefined || o.lead !== undefined ? 'even' : 'none',
  }
  yield { ...st }
  st.knob = 'track'
  if (rules.compress >= 2) { st.compress = 2; yield { ...st } }
  for (let k = 1; -k * TRACK_STEP >= rules.trackMin - 1e-9; k++) { st.track = r2(-k * TRACK_STEP); yield { ...st } }
  for (let k = 1; -k * TRACK_STEP >= rules.letterMin - 1e-9; k++) { st.letter = r2(-k * TRACK_STEP); yield { ...st } }
  st.knob = 'borrow'
  const pitch = Number.isFinite(o.pitch) && o.pitch > 0 ? o.pitch : 0
  const room = Number.isFinite(o.below) && o.below > 0 ? o.below * rules.borrowMax : 0
  for (let j = 1; pitch > 0 && j <= BORROW_LINES && j * pitch <= room + 1e-9; j++) { st.borrow = j * pitch; yield { ...st } }
  if (room > st.borrow + 1e-9) { st.borrow = room; yield { ...st } }
  st.knob = 'lead'
  const lead = st.lead
  for (let k = 1; r3(lead - k * LEAD_STEP) >= rules.leadFloor - 1e-9; k++) { st.lead = r3(lead - k * LEAD_STEP); yield { ...st } }
  if (st.lead > rules.leadFloor + 1e-9) { st.lead = rules.leadFloor; yield { ...st } }
  st.knob = 'shrink'
  const scale = st.scale
  for (let k = 1; r3(scale - k * rules.sizeStep) >= rules.sizeFloor - 1e-9; k++) { st.scale = r3(scale - k * rules.sizeStep); yield { ...st } }
}

// ---------------------------------------------------------------- the unit's geometry, the same at every state

/** the unit's lines, frames and displays as the fit reads them; null where they do not make a located unit */
function geometryOf(unit, tokens, size) {
  const L = unit.lines, n = L.length / 8
  const lines = new Array(n)
  for (let i = 0; i < n; i++) {
    const o = 8 * i
    lines[i] = { i, page: L[o], x0: L[o + 1], x1: L[o + 2], baseline: L[o + 3], top: L[o + 4], bottom: L[o + 5], frame: -1, held: false, sx0: L[o + 1], sx1: L[o + 2], beside: [] }
  }
  const F = unit.frames, frames = []
  for (let o = 0; o + 5 < F.length; o += 6) {
    const fr = { page: F[o], first: F[o + 2], count: F[o + 3], share: F[o + 4], below: F[o + 5], pitch: 0, runs: [], endsHeld: false, tailBottom: 0, bx0: 0, bx1: 0, gaps: [] }
    if (fr.first < 0 || fr.count < 1 || fr.first + fr.count > n) return null
    for (let i = fr.first; i < fr.first + fr.count; i++) lines[i].frame = frames.length
    frames.push(fr)
  }
  if (!frames.length || lines.some(l => l.frame < 0)) return null

  // displays: the lines a segment holds by a third of their width or more are no slots; a segment beside a line keeps
  // the line clear of it. Each display is placed in reading order by the first line it holds, else the first line of its
  // frame below it, else its frame's end
  const blocks = new Set()
  for (const t of tokens) if (t.kind === 'block') blocks.add(t.ph)
  const displays = []
  for (const [k, row] of unit.ph) {
    if (row.kind !== 'display' || row.segs.length < 6) continue
    const segs = []
    for (let s = 0; s + 5 < row.segs.length; s += 6) segs.push({ page: row.segs[s], x0: row.segs[s + 1], baseline: row.segs[s + 2], x1: row.segs[s + 3], top: row.segs[s + 4], bottom: row.segs[s + 5] })
    displays.push({ k, segs, at: -1, frame: -1, counted: blocks.has(k) })
  }
  for (const d of displays) {
    for (const s of d.segs) {
      for (const line of lines) {
        if (line.page !== s.page) continue
        const on = (line.baseline >= s.bottom - EPS && line.baseline <= s.top + EPS) || (s.baseline >= line.bottom - EPS && s.baseline <= line.top + EPS)
        const over = Math.min(line.x1, s.x1) - Math.max(line.x0, s.x0)
        if (!on || over <= 0) continue
        if (over >= HOLDS * (line.x1 - line.x0) - EPS) {
          line.held = true
          if (d.at < 0 || line.i < d.at) d.at = line.i
        } else line.beside.push(s)
      }
    }
    if (d.at >= 0) { d.frame = lines[d.at].frame; continue }
    // a display that holds no line: in the frame on its page its segments overlap the most, after that frame's lines above it
    const s0 = d.segs[0]
    let best = -1, most = 0
    frames.forEach((fr, j) => {
      if (fr.page !== s0.page) return
      let over = 0
      for (let i = fr.first; i < fr.first + fr.count; i++) over = Math.max(over, Math.min(lines[i].x1, s0.x1) - Math.max(lines[i].x0, s0.x0))
      if (over > most) { most = over; best = j }
    })
    if (best < 0) { d.frame = frames.length - 1; d.at = n; continue }
    const fr = frames[best], low = Math.min(...d.segs.filter(s => s.page === fr.page).map(s => s.bottom))
    d.frame = best
    d.at = fr.first + fr.count
    for (let i = fr.first; i < fr.first + fr.count; i++) if (lines[i].baseline < low) { d.at = i; break }
  }
  const counted = displays.filter(d => d.counted)
  /** the displays of the translation above a line of frame j, in reading order */
  const afterOf = (i, j) => { let a = 0; for (const d of counted) if (d.frame < j || (d.frame === j && d.at <= i)) a++; return a }

  // each frame's runs of lines between displays (a display that holds no line still ends the run above it), its pitch,
  // and its lines' extents
  const starts = new Set(counted.map(d => d.at))
  for (const [j, fr] of frames.entries()) {
    let run = null
    for (let i = fr.first; i < fr.first + fr.count; i++) {
      if (lines[i].held) { run = null; continue }
      if (!run || starts.has(i)) fr.runs.push(run = { lines: [], after: afterOf(i, j) })
      run.lines.push(i)
    }
    const end = fr.first + fr.count - 1
    fr.endsHeld = lines[end].held
    if (fr.endsHeld) {
      let bottom = Infinity
      for (let i = end; i >= fr.first && lines[i].held; i--) bottom = Math.min(bottom, lines[i].bottom)
      for (const d of displays) for (const s of d.segs) if (d.frame === j && s.page === fr.page) bottom = Math.min(bottom, s.bottom)
      fr.tailBottom = bottom
    }
    for (let i = fr.first; i < end; i++) {
      if (lines[i].held || lines[i + 1].held) continue
      const gap = lines[i].baseline - lines[i + 1].baseline
      if (gap > EPS) fr.gaps.push(gap)
    }
    // a line that ends a run ends where the text did, not at the frame's edge: it is set to the frame's widest
    let lo = Infinity, hi = -Infinity, body = Infinity
    for (const r of fr.runs) for (const i of r.lines) { lo = Math.min(lo, lines[i].x0); hi = Math.max(hi, lines[i].x1); if (i > 0) body = Math.min(body, lines[i].x0) }
    if (!Number.isFinite(lo)) for (let i = fr.first; i <= end; i++) { lo = Math.min(lo, lines[i].x0); hi = Math.max(hi, lines[i].x1) }
    for (const r of fr.runs) {
      const last = lines[r.lines[r.lines.length - 1]]
      last.sx1 = Math.max(last.sx1, hi)
      if (unit.centred) last.sx0 = Math.min(last.sx0, lo)
    }
    fr.bx0 = Number.isFinite(body) ? body : lo
    fr.bx1 = hi
  }
  const all = frames.flatMap(fr => fr.gaps)
  const unitPitch = all.length ? median(all) : PITCH_OF_SIZE * size
  for (const fr of frames) fr.pitch = fr.gaps.length ? median(fr.gaps) : unitPitch

  // a display's segment beside a line: the line keeps to the side of it with the more room
  for (const line of lines) {
    for (const s of line.beside) {
      if ((s.x0 + s.x1) / 2 > (line.sx0 + line.sx1) / 2) line.sx1 = Math.min(line.sx1, s.x0 - GAP * size)
      else line.sx0 = Math.max(line.sx0, s.x1 + GAP * size)
    }
  }
  // the first line starts at its layout line's x0, right of its label
  const first = lines[0], lb = unit.labels
  for (let o = 0; o + 6 < lb.length; o += 7) {
    const page = lb[o + 1], x0 = lb[o + 2], baseline = lb[o + 3], x1 = lb[o + 4]
    if (page !== first.page || Math.abs(baseline - first.baseline) > 0.5 * size || x0 >= first.sx0) continue
    if (x1 + GAP * size > first.sx0) first.sx0 = x1 + GAP * size
  }
  return { lines, frames, displays: counted, centred: unit.centred, upto: j => counted.filter(d => d.frame <= j).length, before: j => counted.filter(d => d.frame < j).length }
}

/**
 * Frame j's slots at a state: the leading's multiple of the pitch is `m` (lead, × scale for alphabets), the size `f`;
 * `borrow` the space below the frame its last lines may take (the last frame's alone); `base` the displays in the frames
 * before it, which a part laid alone has not met.
 */
function slotsOf(geo, j, m, f, borrow, base) {
  const { lines, frames } = geo
  const fr = frames[j], pitch = fr.pitch, step = pitch * m
  const onGrid = Math.abs(m - 1) < 1e-9
  const narrow = NARROW * f
  const out = []
  let prev = Infinity
  /** a line at baseline b, unless it falls below `low`: never closer than CLOSEST of the pitch to the line above it */
  const place = (b, x0, x1, after, low) => {
    const y = Math.min(b, prev - CLOSEST * pitch)
    if (y < low) return false
    prev = y
    if (x1 - x0 >= narrow - EPS) out.push({ frame: j, page: fr.page, x0, x1, baseline: y, centred: geo.centred, after: after - base })
    return true
  }
  for (let ri = 0; ri < fr.runs.length; ri++) {
    const run = fr.runs[ri]
    const first = lines[run.lines[0]], last = lines[run.lines[run.lines.length - 1]]
    const tail = borrow > 0 && ri === fr.runs.length - 1 && !fr.endsHeld
    const own = last.baseline - EPS, low = tail ? last.baseline - borrow - EPS : own
    if (onGrid) {
      for (const i of run.lines) if (!place(lines[i].baseline, lines[i].sx0, lines[i].sx1, run.after, own)) break
      if (tail) for (let q = 1; place(last.baseline - q * step, fr.bx0, fr.bx1, run.after, low); q++);
    } else {
      for (let q = 0; ; q++) {
        const b = first.baseline - q * step
        let src = null
        if (b >= own) {
          // its layout line: the run's line nearest it
          let d = Infinity
          for (const i of run.lines) { const e = Math.abs(lines[i].baseline - b); if (e < d) { d = e; src = lines[i] } }
        }
        if (!place(b, src ? src.sx0 : fr.bx0, src ? src.sx1 : fr.bx1, run.after, low)) break
      }
    }
  }
  if (borrow > 0 && fr.endsHeld) {
    // below a display that ends the frame: the text after it starts below its ink
    const last = lines[fr.first + fr.count - 1], low = last.baseline - borrow - EPS
    for (let b = Math.min(last.baseline - step, fr.tailBottom - CLOSEST * pitch); place(b, fr.bx0, fr.bx1, geo.upto(j), low); b -= step);
  }
  return out
}

// ---------------------------------------------------------------- the cuts of a split unit

/** where a split may cut the tokens without a sentence: before a character (CJK) or a word (alphabets) that may begin a
 *  line, as offsets in trText */
function boundariesOf(tokens, byCharacter) {
  const out = []
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (!content(t) || t.glue) continue
    if (byCharacter || tokens[i - 1].kind === 'space') out.push(t.at)
  }
  return out
}

/** the nearest of `xs` to x, the earlier on a tie; undefined where xs is empty */
function nearest(xs, x) {
  let best, d = Infinity
  for (const v of xs) { const e = Math.abs(v - x); if (e < d - 1e-9) { d = e; best = v } }
  return best
}

// ---------------------------------------------------------------- laying

/** each part's tokens: those starting at or after its cut and before the next */
function partsOf(tokens, cuts) {
  const parts = cuts.map(() => [])
  parts.push([])
  let p = 0
  for (const t of tokens) {
    while (p < cuts.length && t.at >= cuts[p]) p++
    parts[p].push(t)
  }
  return parts
}

/** a part laid in frame j at a state: its lines, whether it fits whole, and its frame's free lines */
function layPart(geo, part, j, state, f, m, ctx) {
  const last = j === geo.frames.length - 1
  const slots = slotsOf(geo, j, m, f, last ? state.borrow : 0, geo.before(j))
  const b = breakLines(part, slots, f, state, ctx)
  // every token placed and no line past its slot (the breaker's overflow): a clipped character is never a fit
  const fits = b.rest === 0 && !(b.overflow > 0)
  return { b, fits, free: fits ? slots.length - b.lines.length : -1 }
}

/**
 * The unit laid at a state, or null where it does not fit. A split unit is laid at its first cuts, and where a part does
 * not fit, the cut beside it gives one sentence to the roomier frame (the one with more free lines) before the state moves
 * on; a cut moves one way only at a state, and never empties a frame.
 */
function layAt(geo, tokens, cut0, sentences, limits, state, size, ctx) {
  const f = size * state.scale
  const m = state.lead * (ctx.grid ? 1 : state.scale)
  const n = geo.frames.length
  if (n === 1) {
    const r = layPart(geo, tokens, 0, state, f, m, ctx)
    return r.fits ? { parts: [r], cuts: [], f } : null
  }
  const cuts = cut0.slice(), moved = new Int8Array(cuts.length)
  // each cut moves one way at a state, a sentence a time: at most every cut past every sentence
  for (let guard = 0; guard <= cuts.length * sentences.length; guard++) {
    const parts = partsOf(tokens, cuts)
    const laid = parts.map((part, j) => layPart(geo, part, j, state, f, m, ctx))
    if (laid.every(r => r.fits)) return { parts: laid, cuts, f }
    let done = false
    for (let j = 0; j < n && !done; j++) {
      if (laid[j].fits) continue
      const sides = []
      if (j + 1 < n && laid[j + 1].free > 0) sides.push({ c: j, dir: -1, free: laid[j + 1].free })
      if (j > 0 && laid[j - 1].free > 0) sides.push({ c: j - 1, dir: 1, free: laid[j - 1].free })
      sides.sort((a, b) => b.free - a.free)
      for (const { c, dir } of sides) {
        if (moved[c] === -dir) continue
        const lo = Math.max(c > 0 ? cuts[c - 1] : 0, limits[c][0]), hi = Math.min(c + 1 < cuts.length ? cuts[c + 1] : Infinity, limits[c][1])
        let to
        if (dir < 0) { for (const s of sentences) if (s < cuts[c] && s > lo) to = s }
        else for (const s of sentences) if (s > cuts[c] && s < hi) { to = s; break }
        if (to === undefined) continue
        cuts[c] = to
        moved[c] = dir
        done = true
        break
      }
    }
    if (!done) return null
  }
  return null
}

/** the line's items as drawn: runs of one face where the line's letter and word spacing give each its place exactly */
function itemsOf(line, f, state, measure, grid) {
  const its = line.items, n = its.length
  // the gaps placeLines put after each item: perGap after every item, perSpace more after a space
  let perGap = null, perSpace = 0
  const extra = q => its[q + 1].x - its[q + 1].shift - its[q + 1].asp - (its[q].x - its[q].shift + its[q].w)
  for (let q = 0; q + 1 < n && perGap === null; q++) if (its[q].t.kind !== 'space') perGap = extra(q)
  perGap ??= 0
  for (let q = 0; q + 1 < n; q++) if (its[q].t.kind === 'space') { perSpace = extra(q) - perGap; break }
  const letterSpacing = state.letter * f
  // a run of Latin words (or Hangul words where the tracking is the letter spacing) shares one item; a CJK character
  // where the target breaks between characters is one
  const spaced = t => t.kind === 'text' && (t.script === 'latin' || (!grid.byCharacter && state.track === state.letter))
  const out = []
  let run = null
  const textItem = (t, x, w, s, at, to) => ({ kind: 'text', x, w, text: s, face: t.face, caps: !!t.caps, colour: t.colour, raised: 0, from: at, to })
  for (let q = 0; q < n; q++) {
    const it = its[q], t = it.t
    if (t.kind === 'space') {
      // a space joins the run before it where the word after it follows on in the same face, at the run's spacing
      const next = its[q + 1]
      if (run && next && spaced(next.t) && next.t.face === run.face && !!next.t.caps === run.caps && next.t.colour === run.colour && t.face === run.face && !!t.caps === run.caps && next.asp === 0 && next.shift === 0 && Math.abs(perGap) < 1e-9) {
        run.text += ' '
        continue
      }
      run = null
      continue
    }
    if (t.kind === 'ph') {
      run = null
      out.push(t.mode === 'page-text'
        ? { kind: 'page-text', x: it.x, w: it.w, text: t.s, face: t.face, caps: !!t.caps, ph: t.ph, colour: t.colour, raised: 0, from: t.at, to: t.at + t.len }
        : { kind: 'crop', x: it.x, w: it.w, ph: t.ph, colour: t.colour, raised: t.raised ? 1 : 0, from: t.at, to: t.at + t.len })
      continue
    }
    if (t.kind !== 'text') continue
    const prev = q > 0 ? its[q - 1] : null
    if (run && spaced(t) && t.face === run.face && !!t.caps === run.caps && t.colour === run.colour && it.asp === 0 && it.shift === 0 && Math.abs(perGap) < 1e-9 && (run.text.endsWith(' ') || (prev && prev.t === run.lastToken))) {
      run.text += t.s
      run.w = it.x + it.w - run.x
      run.to = t.at + t.len
      run.lastToken = t
      continue
    }
    run = null
    if (t.script === 'cjk' && cpLength(t.s) > 1 && state.track !== state.letter) {
      // tracked CJK text the line's letter spacing does not carry: a character an item, each at its own place
      let off = 0, chars = 0
      for (const ch of t.s) {
        const x = it.x + (measure(t.s.slice(0, off), t.face, !!t.caps) / 100) * f + state.track * f * chars
        const w = (measure(ch, t.face, !!t.caps) / 100) * f + state.track * f
        const exact = t.s.length === t.len
        out.push(textItem(t, x, w, ch, exact ? t.at + off : t.at, exact ? t.at + off + ch.length : t.at + t.len))
        off += ch.length
        chars++
      }
      continue
    }
    const item = textItem(t, it.x, it.w, t.s, t.at, t.at + t.len)
    out.push(item)
    if (spaced(t)) run = Object.defineProperty(item, 'lastToken', { value: t, enumerable: false, writable: true })
  }
  return { items: out, wordSpacing: perSpace - letterSpacing, letterSpacing }
}

/** a laid part's lines as the unit's */
function linesOf(b, f, state, measure, grid) {
  const out = []
  for (const line of b.lines) {
    const { items, wordSpacing, letterSpacing } = itemsOf(line, f, state, measure, grid)
    const { slot } = line
    let from = Infinity, to = -Infinity
    for (const it of items) { from = Math.min(from, it.from); to = Math.max(to, it.to) }
    if (!items.length) from = to = 0
    out.push({ page: slot.page, frame: slot.frame, x0: slot.x0, x1: slot.x1, baseline: slot.baseline, size: f, mode: line.mode, items, wordSpacing, letterSpacing, from, to })
  }
  return out
}

const unfit = (id, why) => ({ id, fit: false, why })

/**
 * A unit laid into its frames at the first state of the fit at which every token is placed and no line runs past its
 * slot, or why it stays the original's: 'located' (no lines or frames), 'tokens' (tokensOf gave none, or the translation
 * has nothing to draw), 'floor' (no state fits). Task 11 adds the net's reasons.
 */
export function layUnit(input, id, tr, o = {}) {
  const unit = input.file.unit(id)
  if (!unit || unit.lines.length < 8 || unit.frames.length < 6) return unfit(id, 'located')
  const { measure: raw, rules, target, hyphen } = input
  const measure = (text, face, caps) => raw(text, face, caps) * faceSize(face)
  const tokens = tr && Array.isArray(tr.pieces)
    ? tokensOf(tr.pieces, { unit, file: input.file, target, rules, roles: input.roles, measure, hyphen, textIn: input.textIn })
    : null
  if (!tokens) return unfit(id, 'tokens')
  // nothing to draw: the unit's text would be erased and nothing set in its place
  if (!tokens.some(t => content(t) || t.kind === 'block')) return unfit(id, 'tokens')

  const sizes = []
  for (let i = 6; i < unit.lines.length; i += 8) sizes.push(unit.lines[i])
  const size = median(sizes)
  const geo = geometryOf(unit, tokens, size)
  if (!geo) return unfit(id, 'located')
  const script = scriptOf(target)
  const grid = { grid: GRID.has(script), byCharacter: BY_CHARACTER.has(script) }
  const ctx = { rules, target, measure, hyphen, grid: grid.grid }

  // a split unit's first cuts: at the sentence start nearest each frame's share, else at the nearest character or word
  const text = trText(tr.pieces), len = text.length
  const sentences = []
  if (Array.isArray(tr.sentences)) for (const s of tr.sentences) if (Number.isInteger(s) && s > 0 && s < len && s > (sentences.at(-1) ?? 0)) sentences.push(s)
  const frames = geo.frames, cuts = [], limits = []
  if (frames.length > 1) {
    const bounds = boundariesOf(tokens, grid.byCharacter)
    const blockAt = tokens.filter(t => t.kind === 'block').map(t => t.at)
    for (let j = 1; j < frames.length; j++) {
      // the part of frame j holds the displays of frame j: its cut after those before it, at or before its own first
      const d = geo.before(j)
      const lo = d > 0 ? (blockAt[d - 1] ?? -1) + 1 : 0, hi = blockAt[d] ?? len
      limits.push([lo, hi])
      const at = (Math.max(0, frames[j].share) / 1000) * len
      const near = sentences.filter(s => Math.abs(s - at) <= SPLIT_NEAR * len + 1e-9)
      let c = nearest(near, at) ?? nearest(bounds, at) ?? Math.round(at)
      const prev = cuts.length ? cuts[cuts.length - 1] : 0
      c = Math.min(Math.max(c, lo), hi)
      if (c <= prev) c = bounds.find(b => b > prev && b <= hi) ?? c
      cuts.push(c)
    }
  }

  const last = frames[frames.length - 1]
  for (const state of statesOf(rules, { below: last.below, pitch: last.pitch, maxScale: o.maxScale, lead: o.lead })) {
    const got = layAt(geo, tokens, cuts, sentences, limits, state, size, ctx)
    if (!got) continue
    const lines = [], drawn = new Map()
    for (const r of got.parts) {
      placeLines(r.b, got.f, { rules, target })
      lines.push(...linesOf(r.b, got.f, state, measure, grid))
      for (const t of r.b.tokens) if (t.kind === 'ph' || t.kind === 'block') drawn.set(t.ph, t.mode)
    }
    return { id, fit: true, state, size: got.f, lines, cuts: got.cuts.slice(), drawn }
  }
  return unfit(id, 'floor')
}
