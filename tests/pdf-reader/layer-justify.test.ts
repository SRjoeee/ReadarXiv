import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// One justification rule for every script (layer2.mjs placeItems, stretchesOf: T-M8 and T-M9 of the rules audit of 2026-11-04),
// in the order TeX's glue and the layout requirements give: the word spaces first (each up to spaceMax × its natural width, and to
// half an em at most in a CJK line, JLREQ 3.8.4 a), then
// each boundary between CJK and Western text (up to half an em, JLREQ 3.8.4 b, CLREQ 6.3.4), then the gaps between CJK characters
// equally (up to cjkJust), a Korean word's own among them (KLREQ 7.2.1); never a gap inside Western text, nor inside a pair UAX 14
// keeps together. Past those amounts the line is set ragged, as before.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  // a canvas whose text is 10 pt a CJK character and 5 pt any other at 10 pt (its ink 0.7 of the size over its baseline)
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: [...s].reduce((a, c) => a + (/[\u3000-\u9fff\uac00-\ud7af]/.test(c) ? 100 : 50), 0), actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const face = { id: 'serif', family: 'F', weight: 400, style: 'normal', size: 1 }
const han = (n: number) => Array.from({ length: n }, () => ({ s: '\u6c49', cls: 'cjk', w100: 100, st: {}, face }))
const hangul = (n: number) => ({ s: '\ud55c'.repeat(n), cls: 'cjk', w100: 100 * n, st: {}, face })
const word = (n: number, o = {}) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {}, face, ...o })
const space = { space: true, w100: 25, st: {}, face }
const crop = (w: number) => ({ crop: { crop: [0, 98, w, 107], baseline: 100 }, cw: w, w100: 0 })
/** a block of two lines `w` pt wide at size 10: the first line is justified, the second the paragraph's last */
const block = (w: number) => ({ page: 1, rects: [[1, 0, 98, w, 108], [1, 0, 86, w, 96]], x0: 0, x1: w, B: [100, 88], exact: [true, true], sizes: [10, 10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false })
const P = (to: string, o: object = {}) => ({ ...resolveRules(BUILTIN_RULES, to).params, leadBase: 1, borrow: 0, hyphen: 0, lineskip: null, order: [], autospace: 0, compressMax: 0, ...o })
/** the first line's items laid: each one's left edge and width, and the gaps after them */
const first = (tokens: unknown[], w: number, to: string, o: object = {}) => {
  // (a word too long for the first line's room after them: the line breaks before it, justified)
  const l = L2.layoutUnit2([...tokens, space, word(Math.floor(w / 5))] as never, [block(w)] as never, 10, P(to, o) as never)
  const line = l.lines[0]!
  const gaps = line.items.slice(1).map((it, q) => Math.round((it.x - (line.items[q]!.x + line.items[q]!.w)) * 1000) / 1000)
  return { line, gaps }
}

describe('a justified line: its slack in the glue\'s order', () => {
  it('opens a Latin line\'s word spaces alike, as before, and sets it ragged past spaceMax', () => {
    // two words of 10 letters and a space: 50 + 2.5 + 50 = 102.5 pt; at 110 the space takes 7.5 (3 × its 2.5, under 1.2 × 2.5 + …)
    const just = first([word(10), space, word(10)], 105.5, 'de')
    expect(just.line.mode).toBe('just')
    // (the space's stretch after it: 3 pt, its 2.5 at 1.2 × at most)
    expect(just.gaps).toEqual([0, 3])
    expect(just.line.used).toBeCloseTo(105.5, 6)
    // (3 pt over the space's 2.5: past spaceMax 1.2 × 2.5, the line ragged at its natural spacing)
    expect(first([word(10), space, word(10)], 106, 'de').line.mode).toBe('ragged')
  })
  it('opens a CJK line\'s boundaries with a formula first, to half an em, then its CJK gaps alike', () => {
    // six characters, a 20 pt formula, three characters: 110 pt in 120; the two boundaries take 5 pt each, the CJK gaps none
    const { line, gaps } = first([...han(6), crop(20), ...han(3)], 120, 'zh')
    expect(line.mode).toBe('just')
    expect(gaps).toEqual([0, 0, 0, 0, 0, 5, 5, 0, 0])
    // (in 125, the 5 pt the boundaries cannot take are the seven CJK gaps', 0.071 em each)
    const wider = first([...han(6), crop(20), ...han(3)], 125, 'zh')
    expect(wider.gaps.filter((_, q) => q !== 5 && q !== 6).every(g => Math.abs(g - 5 / 7) < 1e-3)).toBe(true)
    expect(wider.gaps[5]).toBe(5)
  })
  it('opens a mixed line\'s word spaces first, then its CJK gaps, and no gap inside its Latin words', () => {
    // four characters, a space, two Latin words glued (an English compound cut at its hyphen), a space, four characters: 125 pt
    // in 140. The spaces take 2.5 each (spaceMax 1 × their own), the 10 left go to the six CJK gaps, 1.667 each
    const { line, gaps } = first([...han(4), space, word(4), word(4, { glue: true }), space, ...han(4)], 140, 'zh')
    expect(line.mode).toBe('just')
    expect(gaps.map(g => Math.round(g * 1000) / 1000)).toEqual([1.667, 1.667, 1.667, 0, 2.5, 0, 0, 2.5, 1.667, 1.667, 1.667])
  })
  it('opens a word space of a CJK line to half an em at most, then the CJK gaps (JLREQ 3.8.4 a)', () => {
    // the Latin face's space 3.5 pt (0.35 em): spaceMax 1 would open it to 0.7 em; it takes 1.5 pt, to 0.5 em, and the CJK gaps
    // the rest: four characters, the space, four characters, 83.5 pt in 89: 4 pt over the six CJK gaps, 0.667 each
    const wide = { space: true, w100: 35, st: {}, face }
    const { line, gaps } = first([...han(4), wide, ...han(4)], 89, 'zh')
    expect(line.mode).toBe('just')
    expect(gaps.map(g => Math.round(g * 1000) / 1000)).toEqual([0.667, 0.667, 0.667, 0, 1.5, 0.667, 0.667, 0.667])
  })
  it('opens no gap around a Western mark of punctuation glued to CJK text (KLREQ 7.2.2)', () => {
    // six characters, a period glued to them, six characters: 125 pt in 131; the 6 pt go to the ten CJK gaps, none beside the
    // period
    const stop = { s: '.', cls: 'latin', w100: 50, st: {}, face, glue: true }
    const { line, gaps } = first([...han(6), stop, ...han(6)], 131, 'zh')
    expect(line.mode).toBe('just')
    expect([gaps[5], gaps[6]]).toEqual([0, 0])
    expect(gaps.filter((_, q) => q !== 5 && q !== 6).every(g => Math.abs(g - 0.6) < 1e-3)).toBe(true)
  })
  it('opens no boundary after a CJK closing mark, nor before an opening one', () => {
    // three characters, a full-width comma, a 20 pt formula, three characters: 90 pt in 96; the comma's boundary takes none,
    // the formula's other boundary up to its half an em (5 pt), the 1 pt left the five CJK gaps beside no boundary
    const comma = { s: '\uff0c', cls: 'cjk', punct: 'close', w100: 100, st: {}, face }
    const { line, gaps } = first([...han(3), comma, crop(20), ...han(3)], 96, 'zh')
    expect(line.mode).toBe('just')
    expect(gaps).toEqual([0.2, 0.2, 0.2, 0, 5, 0.2, 0.2])
  })
  it('keeps two em dashes together, as UAX 14 keeps them', () => {
    const dash = { s: '\u2014', cls: 'cjk', w100: 100, st: {}, face }
    const { gaps } = first([...han(3), dash, dash, ...han(3)], 81, 'zh')
    expect(gaps[3]).toBe(0)
    expect(gaps.filter((_, q) => q !== 3).every(g => Math.abs(g - 1 / 6) < 1e-3)).toBe(true)
  })
  it('justifies a Korean line in its word spaces first, then between the syllables of its words (KLREQ 7.2.1)', () => {
    // two words of four syllables and a space: 82.5 pt; in 85 the space takes its 2.5, the words keep their letters solid
    const solid = first([hangul(4), space, hangul(4)], 85, 'ko')
    expect(solid.line.mode).toBe('just')
    expect(solid.line.items[0]!.ls).toBeUndefined()
    // in 91: the space takes 2.5 (spaceMax 1 × its own), and the 6 left go to the six gaps inside the words, 1 pt each
    const spaced = first([hangul(4), space, hangul(4)], 91, 'ko')
    expect(spaced.line.mode).toBe('just')
    expect(spaced.line.items[0]!.ls).toBeCloseTo(1, 6)
    expect(spaced.line.items[0]!.w).toBeCloseTo(43, 6)
    expect(spaced.line.used).toBeCloseTo(91, 6)
    // (a digit inside a word, glued to its syllables on both sides: its two gaps are the word's, as wide as its syllables', no
    // boundary's half an em. Two syllables, the digit, two syllables, a space, four syllables: 87.5 pt; in 101 the space takes
    // 2.5, and the seven gaps of the words the 11 left, 1.571 each)
    const digit = first([hangul(2), word(1, { glue: true }), { ...hangul(2), glue: true }, space, hangul(4)], 101, 'ko')
    expect(digit.line.mode).toBe('just')
    expect(digit.line.items[0]!.ls).toBeCloseTo(11 / 7, 6)
    expect(digit.gaps[0]).toBeCloseTo(11 / 7, 2)
    expect(digit.gaps[1]).toBeCloseTo(11 / 7, 2)
    // (at cjkJust, 0.25 em a gap, still justified; past it ragged)
    expect(first([hangul(4), space, hangul(4)], 100, 'ko').line.mode).toBe('just')
    expect(first([hangul(4), space, hangul(4)], 101, 'ko').line.mode).toBe('ragged')
  })
})

describe('a word hyphenated where its line cannot be set within its word spaces\' own stretch (T-M7)', () => {
  // (the line's words of four letters, 20 pt each, and spaces of 2.5 pt (half an em, the canvas's); then "typesetting", whose
  // patterns cut it as type-set-ting)
  const words = (n: number) => Array.from({ length: n }, (_, q) => [...(q ? [space] : []), word(4)]).flat()
  const typesetting = { s: 'typesetting', cls: 'latin', w100: 550, st: {}, face, hyph: 'de' }
  const lay = (w: number) => {
    L2.setHyphenData('de', { pats: new Map(), exceptions: new Map([['typesetting', 'type-set-ting']]), maxLen: 2 } as never)
    const l = L2.layoutUnit2([...words(31), space, typesetting, space, word(4)] as never, [block(w)] as never, 10, P('de', { hyphen: 1 }) as never)
    return l.lines[0]!.items.at(-1)!.t.s
  }
  it('closes the line before the word where its 30 spaces stretch within half their width (TeX\'s \\pretolerance pass)', () => {
    // 695 pt of words and spaces in 715: 20 pt of stretch, under the spaces' 37.5; "type-" (25 pt) would have fit
    expect(lay(715)).toBe('xxxx')
  })
  it('hyphenates it where they would stretch past it', () => {
    // in 735: 40 pt, past the 37.5 (the whole word, 55 pt, does not fit even with the spaces shrunk: 52.5)
    expect(lay(735)).toBe('typeset-')
  })
})

describe('the slack shared within each glue\'s own amount (the review of #586)', () => {
  // (a Latin word with autospace (0.2 em, 2 pt) on both its sides: its two boundaries can take 3 pt more each; a formula's crop
  // has none: its two can take 5)
  const latin = (n: number) => word(n, { asp: true })
  const hanAsp = { s: '\u6c49', cls: 'cjk', w100: 100, st: {}, face, asp: true }
  it('shares a slack the boundaries can take among them alone, each up to its own room (Codex: 13 pt over 3, 3, 5, 5)', () => {
    // two characters, a Latin word, a character after it with its autospace, a character, a formula, two characters: 104 pt in
    // 117. The two Latin boundaries take their 3 each, the formula's the 7 left, 3.5 each; no CJK gap opens, none closes
    const { line, gaps } = first([...han(2), latin(4), hanAsp, ...han(1), crop(20), ...han(2)], 117, 'zh', { autospace: 0.2 })
    expect(line.mode).toBe('just')
    expect(gaps).toEqual([0, 5, 5, 0, 3.5, 3.5, 0])
  })
  it('gives a boundary no more than the slack when one of them is capped (Devin: 7 pt over 5 and 3)', () => {
    // two characters, a formula, a character with its autospace, a character: 62 pt in 69. The capped boundary takes its 3, the
    // other the 4 left
    const { line, gaps } = first([...han(2), crop(20), hanAsp, ...han(1)], 69, 'zh', { autospace: 0.2 })
    expect(line.mode).toBe('just')
    expect(gaps).toEqual([0, 4, 5, 0])
  })
  it('caps each word space by its own width in a CJK line: a wide one stops at half an em (Devin)', () => {
    // spaces of 2 and 4 pt (two faces) between characters: 3 pt of slack. Half an em (5 pt) caps the wide one at 1 pt more, the
    // narrow one takes its spaceMax 1 × 2 = 2; the mean (3 pt) gave each 1.5, the wide one 5.5 pt
    const narrow = { space: true, w100: 20, st: {}, face }, wide = { space: true, w100: 40, st: {}, face }
    const { line } = first([...han(2), narrow, ...han(2), wide, ...han(2)], 69, 'zh')
    expect(line.mode).toBe('just')
    const sp = line.items.map((it, q) => [it, q] as const).filter(([it]) => (it.t as { space?: boolean }).space).map(([it, q]) => Math.round((line.items[q + 1]!.x - it.x) * 1000) / 1000)
    expect(sp).toEqual([4, 5])
  })
  it('stretches each word space of a Latin line in proportion to its width, never past its own spaceMax', () => {
    // spaces of 2 and 4 pt in a German line, 6 pt of slack: each doubles (TeX's glue: the stretch in proportion to each space's
    // own); the equal share (3 each) took the narrow one past 1.2 × 2
    const narrow = { space: true, w100: 20, st: {}, face }, wide = { space: true, w100: 40, st: {}, face }
    const { line } = first([word(6), narrow, word(6), wide, word(6)], 102, 'de')
    expect(line.mode).toBe('just')
    const sp = line.items.map((it, q) => [it, q] as const).filter(([it]) => (it.t as { space?: boolean }).space).map(([it, q]) => Math.round((line.items[q + 1]!.x - it.x) * 1000) / 1000)
    expect(sp).toEqual([4, 8])
  })
  it('never closes a gap nor takes a space past its cap or its shrink, whatever the line (property, 400 random lines)', () => {
    let seed = 20261105
    const r = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
    const checked = { lines: 0, spaces: 0, open: 0 }
    for (let n = 0; n < 400; n++) {
      const to = pick(['zh', 'ja', 'ko', 'de'])
      const tokens: unknown[] = []
      for (let k = 3 + Math.floor(r() * 10); k > 0; k--) {
        const y = r()
        if (y < 0.35 && to !== 'de') tokens.push(to === 'ko' ? { ...hangul(1 + Math.floor(r() * 3)), ...(r() < 0.3 ? { glue: true } : {}) } : { s: '\u6c49', cls: 'cjk', w100: 100, st: {}, face, ...(r() < 0.3 ? { asp: true } : {}) })
        else if (y < 0.55) tokens.push(word(1 + Math.floor(r() * 6), r() < 0.4 ? { asp: true } : {}))
        else if (y < 0.65 && to !== 'de') tokens.push(crop(5 + Math.floor(r() * 25)))
        else if (y < 0.72) tokens.push({ s: '.', cls: 'latin', w100: 30, st: {}, face, glue: true })
        else tokens.push({ space: true, w100: pick([0, 15, 25, 33, 40]), st: {}, face })
      }
      if (!tokens.length) continue
      const natural = 10 * tokens.length * 0.8
      const w = Math.round(natural * (0.9 + r() * 0.5))
      const p = P(to, { autospace: pick([0, 0.15, 0.25]) }) as { spaceMax: number; spaceMin: number; cjk: boolean }
      const l = L2.layoutUnit2([...tokens, space, word(Math.floor(w / 5) + 1)] as never, [block(w)] as never, 10, p as never)
      const line = l.lines[0]
      // (a squeezed line closes its gaps by SQUEEZE on purpose, breakLines' squeezeTakes: not this rule's)
      if (!line || line.mode !== 'just' || (line as { squeezed?: boolean }).squeezed) continue
      const f = 10
      checked.lines++
      line.items.forEach((it, q) => {
        const nx = line.items[q + 1]
        if (!nx) return
        const g = nx.x - (it.x + it.w + ((it as { kern?: number }).kern ?? 0)) - ((nx as { asp?: number }).asp ?? 0) - ((nx as { shift?: number }).shift ?? 0) + ((it as { shift?: number }).shift ?? 0)
        if ((it.t as { space?: boolean }).space) {
          const stretch = g, nat = it.w
          checked.spaces++
          expect(stretch, `${n} ${to}: a space shrunk past spaceMin`).toBeGreaterThanOrEqual(-(1 - p.spaceMin) * nat - 1e-6)
          expect(stretch, `${n} ${to}: past spaceMax`).toBeLessThanOrEqual(p.spaceMax * nat + 1e-6)
          if (p.cjk) expect(nat + stretch, `${n} ${to}: past half an em`).toBeLessThanOrEqual(0.5 * f + 1e-6)
        } else {
          if (g > 1e-6) checked.open++
          expect(g, `${n} ${to}: gap ${q} closed`).toBeGreaterThanOrEqual(-1e-6)
        }
      })
    }
    // (the random lines reach the rule: justified lines, their spaces and their gaps opened)
    expect(checked.lines).toBeGreaterThan(100)
    expect(checked.spaces).toBeGreaterThan(100)
    expect(checked.open).toBeGreaterThan(100)
  })
})
