// U.label replayed on the tap's sample: the run's labels option, the label group's verdict, the unit's kind, the head's
// glyphs (read into the parts the prepare states for them) and the paper's name units as today's run handed them
// (U.label:in), the label prepareUnit read (U.elements:out),
// translator's head names from today's tex-names.json; against the relabel, the head and the label today laid the unit with.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Glyph, type HeadParts, label, type UnitLabel } from '../../src/unit/label.ts'
import { firstDifference, hasTap, hasToday, roundsOf, sample, todayFile } from './tap.ts'

type In = {
  labels: boolean
  to: string
  names: Record<string, string> | null
  captions: Record<string, string> | null
  relabels: boolean
  kind: string
  headChars: Glyph[] | null
  ownNames: Map<string, string> | null
}
type Out = {
  relabel: string | null
  head: { text: string; parts: unknown; open: boolean; chars: Glyph[] } | null
  label?: UnitLabel
}

/** today's head characters (U.label:in) in the parts the prepare states for them (packages/engine locate/facts.ts labelParts):
 *  its marks at its end the punctuation, its last word the number where a counter's (a digit in it, a roman numeral, a letter
 *  alone), the words before it the name; each part one glyph of its characters, in its first character's style */
function partsOf(cs: readonly Glyph[] | null): HeadParts | null {
  const t = (cs ?? []).filter((c) => /\S/.test(c.ch))
  let e = t.length
  while (e > 0 && /^\p{P}$/u.test(t[e - 1]!.ch)) e--
  let s = e
  while (s > 1 && t[s - 1]!.x0 - t[s - 2]!.x1 < 0.1 * Math.max(t[s - 1]!.size ?? 0, t[s - 2]!.size ?? 0)) s--
  const word = t
    .slice(s - 1, e)
    .map((c) => c.ch)
    .join('')
  const n = s > 1 && /\p{N}|^(?:[IVXLCDM]+|[ivxlcdm]+|\p{L})$/u.test(word) ? s - 1 : e
  const one = (xs: readonly Glyph[]): Glyph | undefined =>
    xs.length ? { ...xs[0]!, ch: xs.map((c) => c.ch).join(''), x1: xs.at(-1)!.x1 } : undefined
  const name = one(t.slice(0, n)),
    num = one(t.slice(n, e)),
    punct = one(t.slice(e))
  return name ? { name, ...(num ? { num } : {}), ...(punct ? { punct } : {}) } : null
}

/** a label as compared: its glyphs by their characters */
const shown = (l: UnitLabel | undefined) => (l ? { ...l, chars: l.chars.map((c) => c.ch).join('') } : l)

describe.skipIf(!hasTap || !hasToday)('U.label: replayed on the tap', () => {
  it('names the label and the head as today did, on every sampled round', { timeout: 120_000 }, () => {
    const NAMES = JSON.parse(readFileSync(todayFile('rules/tex-names.json'), 'utf8')) as {
      targets: Record<string, { heads: Record<string, string> }>
    }
    const differ: string[] = []
    const count = { rounds: 0, relabel: 0, head: 0, open: 0 }
    for (const e of sample('U.label').entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['U.label:in'] as In | undefined,
          want = c['U.label:out'] as Out | undefined,
          prep = c['U.elements:out'] as { label?: UnitLabel } | undefined
        if (!a || !want || !prep) continue
        count.rounds++
        const got = label({
          label: prep.label,
          head: partsOf(a.headChars),
          kind: a.kind,
          labels: !!a.labels,
          relabels: !!a.relabels,
          to: a.to,
          words: a.names,
          captions: a.captions,
          heads: NAMES.targets[a.to]?.heads ?? null,
          names: a.ownNames,
        })
        if (got.relabel) count.relabel++
        if (got.head) count.head++
        if (got.head?.open) count.open++
        const d =
          firstDifference(got.relabel, want.relabel, 'relabel') ??
          firstDifference(
            got.head && { ...got.head, chars: got.head.chars.map((c) => c.ch).join('') },
            want.head && { ...want.head, chars: want.head.chars.map((c) => c.ch).join('') },
            'head',
          ) ??
          firstDifference(shown(got.label), shown(want.label), 'label')
        if (d) differ.push(`${e.pair} ord ${e.ord} round ${round}: ${d}`)
      }
    expect(differ).toEqual([])
    expect(count).toEqual({ rounds: 15, relabel: 3, head: 6, open: 3 })
  })
})
