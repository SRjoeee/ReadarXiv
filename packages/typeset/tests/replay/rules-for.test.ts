// rulesFor replayed: for each target of the tap's pairs, today's resolveRules(BUILTIN_RULES, target) as derive.mjs wrote it
// (lanes/L3/replay/rules.json.gz: the params, the patterns, the float labels) equals the port's over the data files.
import { describe, expect, it } from 'vitest'
import { resolveRules, rulesFor } from '../../src/rules-for.ts'
import { derived, firstDifference, hasDerived } from './tap.ts'

type Want = { targets: Record<string, { params: unknown; patterns: string[]; labels: Record<string, string> }> }

describe.skipIf(!hasDerived('rules'))('rulesFor: today’s resolveRules on every target of the tap', () => {
  it('resolves each target’s params, patterns and labels as today', () => {
    const want = derived<Want>('rules').targets
    const differ: string[] = []
    for (const [t, w] of Object.entries(want)) {
      const r = resolveRules(t)
      const d =
        firstDifference(r.params, w.params, `${t}.params`) ??
        firstDifference(r.patterns, w.patterns, `${t}.patterns`) ??
        firstDifference(r.labels, w.labels, `${t}.labels`)
      if (d) differ.push(d)
      expect(rulesFor(t).set).toEqual(r.params)
    }
    expect(differ).toEqual([])
    expect(Object.keys(want).sort()).toEqual(['de', 'es', 'fr', 'ja', 'ko', 'pl', 'ru', 'zh'])
  })
})
