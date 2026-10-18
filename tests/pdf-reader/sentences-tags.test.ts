import { describe, expect, it } from 'vitest'
import { cutsOf, plainTranslated, translateUnits } from '@/pdf-reader/engine/translate/mt.mjs'
import { verifyAlignment } from '@/providers/alignment'
import { markSentences, stripMarkers, unmarkSentences } from '@/providers/sentence-markers'

// The tags path's sentences end to end (B3b): the reader's units and cuts (mt.mjs), the service's markers at the cuts and
// its reading of where they landed (sentence-markers.ts, alignment.ts, as translate-service.ts does it), and a fake LLM
// between them that keeps the markers, or merges, splits or reorders the sentences they stand between

/** the background as the reader's engine meets it: each text marked at its cuts, the engine's reply unmarked and verified */
const background = (engine: (marked: string) => string) => async (texts: string[], cuts?: number[][]) =>
  texts.map((text, i) => {
    const c = cuts?.[i]
    if (!c) return { text: engine(text), by: 'llm' }
    if (!c.length) return { text: engine(text), by: 'llm', alignment: verifyAlignment({ source: [text.length], target: [engine(text).length] }, text, engine(text)) }
    const mark = markSentences(text, c)!, reply = engine(mark.text), back = unmarkSentences(reply, mark.ids)
    if (!back) return { text: stripMarkers(reply, mark.ids), by: 'llm' }
    return { text: back.text, by: 'llm', alignment: verifyAlignment({ source: mark.source, target: back.target }, text, back.text) }
  })
/** a fake LLM: each sentence, between the markers, "translated" (upper case), the markers where `place` puts them */
const llm = (place: (parts: string[], markers: string[]) => string) => (marked: string) => {
  const markers = [...marked.matchAll(/<x id="\d+"\/>/g)].map(m => m[0]).filter(m => Number(/\d+/.exec(m)) > 2)
  const parts = marked.split(new RegExp(markers.map(m => m.replace(/[/]/g, '\\/')).join('|') || '$^')).map(p => p.toUpperCase().replace(/<X ID="(\d+)"\/>/g, '<x id="$1"/>'))
  return place(parts, markers)
}

describe('the tags path with an LLM: sentences where its reply keeps the markers in order, else the paragraph (B3b)', () => {
  const u = { pieces: [{ t: 'text', s: 'We study flows ' }, { t: 'ph', src: '$f$' }, { t: 'text', s: '. They converge when ' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ' grows. Hence the bound.' }] }
  const one = { pieces: [{ t: 'text', s: 'A unit of one sentence.' }] }

  it('kept: each sentence after the first read on both sides; a unit of one sentence aligned whole', async () => {
    expect(cutsOf(u)).toHaveLength(2)
    const { results } = await translateUnits([u, one], background(llm((parts, markers) => parts.map((p, k) => p + (markers[k] ?? '')).join(''))), 'tags')
    const r = results.get(u)!
    expect(r.state).toBe('whole')
    expect(r.sentences?.src.length).toBe(2)
    expect(r.sentences!.tr.map(o => plainTranslated(r.pieces as never).slice(o).split(' ')[0])).toEqual(['THEY', 'HENCE'])
    expect(results.get(one)).toMatchObject({ state: 'whole', sentences: { src: [], tr: [] } })
  })

  it('two sentences merged (a marker lost), split (one twice) or reordered: the unit whole, its paragraph lit', async () => {
    const merged = llm(([a, b, c], [, n]) => `${a}${b}${n}${c}`)
    const split = llm(([a, b, c], [m, n]) => `${a}${m}${b}${m}${n}${c}`)
    const reordered = llm(([a, b, c], [m, n]) => `${a}${n}${b}${m}${c}`)
    for (const engine of [merged, split, reordered]) {
      const { results } = await translateUnits([u], background(engine), 'tags')
      expect(results.get(u)?.state).toBe('whole')
      expect(results.get(u)).not.toHaveProperty('sentences')
    }
  })
})
