// A member a character of which no served face holds (B.cover's `served`, breaker/cover.ts), over hand-made parts and metrics
// that serve no face holding U+2717 (a ballot X). Where the character is in what the lay would draw anew of the original's
// own glyphs, that piece is the original's own ink, as TeX set it, and the member is laid: an element the reading draws as the
// page's text (a paper's macro TeX set as a symbol in a face we serve none of: pifont's `\ding`, a check mark) drawn as its
// ink's crop; a label drawn anew, in the line or on a line of its own, kept where TeX set it. Where the character is in the
// translation's own text, or in an element of no ink, nothing of the original draws it: the member stays the original's
// (`served`), as today's reader leaves it (fonts.mjs canDraw).
import type { El, Ink, OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Laid, Metrics, Rows } from '../../src/types.ts'

const X = '✗'
/** metrics whose catalogue holds no face declaring U+2717 (`holds` false for it: no served face holds it) */
const metrics: Metrics = {
  ready: (_f, t) => (t.includes(X) ? 'never' : true),
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
  holds: (_f, t) => !t.includes(X),
}
const rules = rulesFor('de')
const id = 'a'.repeat(64)
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
    [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
  ],
  room: { below: 20, next: 24 },
  ...o,
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowOf = (content: OutPiece[]): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
/** a paper's macro TeX set as a symbol in a font of its own (its glyph read as U+2717), its ink a box on line 1 */
const symbol = (o: Partial<El> = {}): El => ({
  kind: 'umacro',
  cmd: 'xmark',
  bare: 1,
  unknown: 1,
  text: X,
  style: { role: 'serif', size: 10, design: 'Dingbats' },
  ink: [[1, 150, 698, 158, 707, 700]],
  ...o,
})
const withSymbol = rowOf([
  { t: 'text', s: 'Ein Satz mit ' },
  { t: 'el', id: '1' },
  { t: 'text', s: ' darin, der weiter läuft.' },
])
const laidOf = (m: Placed, rows: Rows): Laid => layPage(part(m), rows, rules, metrics).members[0]!
const items = (l: Laid) => l.lines.flatMap((line) => line[3])
const texts = (l: Laid) =>
  items(l)
    .filter((it): it is Extract<Item, { face: string }> => 'face' in it)
    .map((it) => it.s)
    .join('')

describe('a character no served face holds, in what the lay draws anew of the original’s own glyphs', () => {
  it('draws an element whose text no served face holds as its ink’s crop, and lays the member', () => {
    const laid = laidOf(member({ els: [['1', symbol()]] }), withSymbol)
    expect(laid.state).toBe('laid')
    const crops = items(laid).filter((it): it is Extract<Item, { src: unknown }> => 'src' in it && it.piece !== 'label')
    // (its crop is cut from its own ink on A: page 1, its box with the crop's margin, its baseline)
    expect(crops).toHaveLength(1)
    expect(crops[0]!.src[0]).toBe(1)
    expect(crops[0]!.src[1]).toBeLessThan(150)
    expect(crops[0]!.src[3]).toBeGreaterThan(158)
    expect(crops[0]!.src[5]).toBe(700)
    expect(texts(laid)).not.toContain(X)
    expect(texts(laid)).toContain('darin')
    // (its ink on A goes with the text: the elements' group off where its crop is cut)
    expect(laid.off & 2).toBe(2)
  })
  it('keeps the label drawn anew where TeX set it when no served face holds a character of it, and lays the member', () => {
    // (a theorem's head whose number TeX set as a symbol: drawn anew in the target's word, "Satz ✗.", no face would draw it)
    const at = (s: string, x0: number, w: number): [string, Ink] => [s, [1, x0, 698, x0 + w, 707, 700]]
    const head = member({
      kind: 'theorem',
      label: {
        kind: 'head',
        ink: [1, 72, 698, 122, 707, 700],
        style: { role: 'serif', size: 10, bold: 1 },
        name: at('Theorem', 72, 40),
        num: at(X, 114, 6),
        punct: at('.', 120, 2),
      },
    })
    const plain = rowOf([{ t: 'text', s: 'Eine Aussage, die weiter läuft.' }])
    const laid = laidOf(head, plain)
    expect(laid.state).toBe('laid')
    expect(texts(laid)).not.toContain(X)
    expect(texts(laid)).not.toMatch(/Satz/)
    // (its label's ink stays on A: its group on)
    expect(laid.off & 4).toBe(0)
    // (and a head whose every character is served is drawn anew in the target's word, as before)
    const served = laidOf({ ...head, label: { ...head.label!, num: at('1', 114, 6) } }, plain)
    expect(texts(served)).toMatch(/^Satz 1\./)
    expect(served.off & 4).toBe(4)
  })
  it('keeps a label on a line of its own where TeX set it when no served face holds a character of its relabel', () => {
    // (IEEEtran's "TABLE ✗" centred above its caption's text: its relabel's row could not be drawn, and its ink was turned off
    // with nothing in its place: the label was lost)
    const own = (num: string): Placed => ({
      ...member({ kind: 'caption', lines: [[1, 0, 72, 400, 700, 707, 698, 72, 400, 0, 10]], align: 'c' }),
      label: {
        kind: 'float',
        ink: [1, 697, 710, 731, 719, 712],
        style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
        name: ['TABLE', [1, 697, 710, 722, 719, 712]],
        num: [num, [1, 725, 710, 731, 719, 712]],
        float: 'table',
        align: 'c',
      },
    })
    const plain = rowOf([{ t: 'text', s: 'Die Ergebnisse der Modelle.' }])
    const laid = laidOf(own(X), plain)
    expect(laid.state).toBe('laid')
    expect(laid.lines.some(([y]) => y === 712)).toBe(false)
    expect(laid.off & 4).toBe(0)
    // (and one whose every character is served is laid as its row, its ink off, as before)
    const served = laidOf(own('I'), plain)
    expect(served.lines.some(([y]) => y === 712)).toBe(true)
    expect(served.off & 4).toBe(4)
  })
  it('finds in one reading every piece no served face holds: an element in the line and the label on a line of its own', () => {
    // (a caption whose inline element and whose label's row of its own each hold one: read once and both found, the element
    // drawn as its crop and the label kept; found one after the other, the second read met the row and the caption stayed the
    // original's)
    const both: Placed = {
      ...member({
        kind: 'caption',
        lines: [[1, 0, 72, 400, 700, 707, 698, 72, 400, 0, 10]],
        align: 'c',
        els: [['1', symbol()]],
      }),
      label: {
        kind: 'float',
        ink: [1, 697, 710, 731, 719, 712],
        style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
        name: ['TABLE', [1, 697, 710, 722, 719, 712]],
        num: [X, [1, 725, 710, 731, 719, 712]],
        float: 'table',
        align: 'c',
      },
    }
    const laid = laidOf(both, withSymbol)
    expect(laid.state).toBe('laid')
    expect(items(laid).filter((it) => 'src' in it && it.piece !== 'label')).toHaveLength(1)
    expect(laid.lines.some(([y]) => y === 712)).toBe(false)
    expect(laid.off & 4).toBe(0)
  })
  it('crops an element the translation brackets itself at the ink between its own brackets, as its reading draws it', () => {
    // (U.brackets: "(A✗)" inside the translation's own parentheses is read without its brackets, "A✗"; drawn as its ink, the
    // crop is that inner ink, the brackets left on the page as the translation's are drawn: cut at its whole ink it showed
    // "((A✗))", and its copy text "A✗" was not what it showed)
    const el = symbol({
      text: `(A${X})`,
      ink: [[1, 150, 698, 170, 707, 700]],
      brackets: [
        [1, 150, 698, 153, 707, 700],
        [1, 167, 698, 170, 707, 700],
      ],
    })
    const rows = rowOf([
      { t: 'text', s: 'Ein Satz mit (' },
      { t: 'el', id: '1' },
      { t: 'text', s: ') darin, der weiter läuft.' },
    ])
    const laid = laidOf(member({ els: [['1', el]] }), rows)
    expect(laid.state).toBe('laid')
    const crops = items(laid).filter((it): it is Extract<Item, { src: unknown }> => 'src' in it && it.piece !== 'label')
    expect(crops).toHaveLength(1)
    // (its ink between the brackets, 153..167, with the crop's own margin)
    expect(crops[0]!.src[1]).toBeGreaterThan(152)
    expect(crops[0]!.src[3]).toBeLessThan(168)
    expect(crops[0]!.s).toBe(`A${X}`)
  })
})

describe('a face lost for now is no character no served face holds (Metrics.holds): the lost faces’ path, as before', () => {
  // (`ready` answers 'never' for a character in a slice lost for now as for one no slice declares; `holds`, the catalogue's,
  // tells them apart: only a character no served face declares is drawn as the original's ink)
  const lostFor = (holds: Metrics['holds']): Metrics => {
    const { holds: _, ...rest } = metrics
    return holds ? { ...rest, holds } : rest
  }
  it('leaves the member the original’s while the face that declares its element’s character is lost, and lays it with its text once back', () => {
    const m = member({ els: [['1', symbol()]] })
    const lost = layPage(
      part(m),
      withSymbol,
      rules,
      lostFor(() => true),
    ).members[0]!
    expect(lost.state).toBe('served')
    expect(lost.off).toBe(0)
    // (the face back: the element drawn as its text, no crop)
    const back = layPage(part(m), withSymbol, rules, { ...lostFor(() => true), ready: () => true }).members[0]!
    expect(back.state).toBe('laid')
    expect(items(back).filter((it) => 'src' in it)).toHaveLength(0)
    expect(texts(back)).toContain(X)
  })
  it('draws no ink for a host that states no catalogue (no `holds`): the member the original’s, as before', () => {
    const laid = layPage(part(member({ els: [['1', symbol()]] })), withSymbol, rules, lostFor(undefined)).members[0]!
    expect(laid.state).toBe('served')
  })
})

describe('a character no served face holds, where nothing of the original draws it: the member the original’s', () => {
  it('leaves the member the original’s where the character is in the translation’s own text', () => {
    const laid = laidOf(member(), rowOf([{ t: 'text', s: `Ein Satz mit ${X} darin, der weiter läuft.` }]))
    expect(laid.state).toBe('served')
    expect(laid.off).toBe(0)
  })
  it('leaves the member the original’s where the character is an element’s of no ink (its text drawn, none to crop)', () => {
    const laid = laidOf(member({ els: [['1', symbol({ ink: [] })]] }), withSymbol)
    expect(laid.state).toBe('served')
    expect(laid.off).toBe(0)
  })
})
