import { describe, expect, it } from 'vitest'
import { openPaper, translationFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { strategiesFor } from '@/pdf-reader/engine/pipeline/scripts.mjs'
import type { Marks } from '@/pdf-reader/engine/pipeline/typeset/places.mjs'
import { finalTypesetting, previewTypesetting } from '@/pdf-reader/engine/pipeline/typeset/plan.mjs'

// The rule's two steps on a small paper and the logs and marks its compiles would give: what goes in, what comes out.
// The numbers the rule reaches on real papers are the gate's (parked/lab/spikes/typeset-gate.mjs)

type Piece = { t: string; s?: string; src?: string; tr?: boolean }
type Unit = { kind: string; pieces: Piece[] }
const PARAS = 12
// the seventh paragraph with a display inside it, which the density model does not measure
const SOURCE = `\\documentclass{article}\\begin{document}\n${Array.from({ length: PARAS }, (_, k) => `Paragraph ${k} of the paper, ${'with words that run on for a line or two of prose '.repeat(4)}${k === 6 ? 'and a display\\[ x = y \\]after which it ' : ''}and an end.\n`).join('\n')}\\end{document}\n`
const paper = () => openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
/** every unit translated: Chinese at about two characters a word, or German a fifth longer than the English */
function translate(units: Unit[], lang: 'zh' | 'de') {
  const text = (s: string) => (lang === 'zh' ? '\u8bba\u6587\u7684\u4e00\u6bb5'.repeat(Math.round(s.length / 12)) : `${s} ${s.slice(0, Math.round(s.length / 5))}`)
  return new Map(units.map(u => [u, u.pieces.map(p => (p.t === 'text' ? { ...p, tr: true, s: text(p.s ?? '') } : p))]))
}
/** the original's log: each unit 4 lines at 12 pt on a 10 pt size, and the end of the document */
const originalLog = (n: number) => `${Array.from({ length: n }, (_, i) => `AXT-LINES ${i} 4 12.0pt 10`).join('\n')}\nAXT-END\n`
/** the font probe's log: Computer Modern at 10 pt in a 345 pt column, and its sizes below */
const FONT_LOG = `AXT-FONTS rm=cmr;sf=cmss;tt=cmtt;body=10;\nAXT-WIDTH 1300.0pt 10 345.0pt\n${[0.9, 0.95].map(f => `AXT-SIZE ${f} ${(1300 * f).toFixed(1)}pt 1300.0pt`).join('\n')}\n`
/** the original's marks: each unit a sixth of a page, in one column */
const originalMarks = (n: number): Marks => {
  const marks = new Map<string, { page: number; x: number; y: number }>()
  for (let i = 0; i < n; i++) { const page = Math.floor(i / 6), y = 700 - (i % 6) * 100; marks.set(`${i}s`, { page, x: 72, y }); marks.set(`${i}e`, { page, x: 300, y: y - 48 }) }
  return { pages: Math.ceil(n / 6), width: 612, height: 792, columns: Array(Math.ceil(n / 6)).fill(1), marks }
}
const inputs = (lang: 'zh' | 'de', strategy = strategiesFor({ compiler: 'pdflatex' }, lang)[0]) => {
  const p = paper()
  if (!strategy) throw new Error('no strategy')
  return { paper: p, translated: translate(p.units as Unit[], lang) as Map<(typeof p.units)[number], unknown[]>, lang, strategy, fonts: { rm: 'cmr' }, fontLog: FONT_LOG, original: { log: originalLog(p.units.length), marks: originalMarks(p.units.length) } }
}
const tex = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))

describe('a plan for the strategy that sets it', () => {
  it('has the paper\'s units found that the cases rely on', () => {
    expect((paper().units as Unit[]).filter(u => u.kind === 'para')).toHaveLength(PARAS)
  })
  it('solves CJK under xeCJK with its glue and face, and under CJKutf8 with a size and the leading', () => {
    const [xe, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
    if (!xe || !cjkutf8) throw new Error('no strategies')
    const zhXe = inputs('zh', xe), zhUtf8 = inputs('zh', cjkutf8)
    const viaXe = previewTypesetting(zhXe), viaUtf8 = previewTypesetting(zhUtf8)
    expect(viaXe.type?.track).toBeDefined()
    expect(viaXe.type?.size).toBeUndefined()
    expect(viaUtf8.type?.track).toBeUndefined()
    expect(viaUtf8.type?.size).toBeDefined()
    expect(viaXe.typeset?.strategy(xe).pre(null)).toContain('\\setCJKmainfont[Scale=')
    expect(viaUtf8.typeset?.strategy(cjkutf8).pre(null)).toBe(cjkutf8.pre(null))
    expect(tex(translationFiles(zhUtf8.paper, zhUtf8.translated, { strategy: cjkutf8, fonts: null, draft: false, typeset: viaUtf8.typeset }))).toContain('\\axtsize{')
    expect(tex(translationFiles(zhXe.paper, zhXe.translated, { strategy: xe, fonts: null, draft: false, typeset: viaXe.typeset }))).not.toContain('\\axtsize{')
    expect(viaXe.typeset?.strategy(cjkutf8)).toBe(cjkutf8)
  })
})

describe('the leading of a unit the flow cannot measure', () => {
  it('is the one the flow set where it stands, not the paper\'s type, which stood out among its neighbours', () => {
    const given = inputs('de'), plan = previewTypesetting(given), units = given.paper.units as Unit[]
    const display = units.findIndex(u => u.pieces.some(p => p.t === 'ph' && (p.src ?? '').startsWith('\\[')))
    const factor = (i: number) => Number(new RegExp(`axtlead@${i}\\\\endcsname\\{([\\d.]+)\\}`).exec(plan.typeset?.head ?? '')?.[1])
    expect(display).toBeGreaterThan(0)
    expect(factor(display - 1)).toBeGreaterThan(0)
    expect(factor(display)).toBe(factor(display - 1))
  })
})

describe('a plan of the whole translation', () => {
  it('is what the final corrects; a plan of part of it — a progressive preview\'s — the final refuses, and sets the translation as today', () => {
    const given = inputs('de'), n = given.paper.units.length, measured = { log: originalLog(n), marks: originalMarks(n) }
    const whole = previewTypesetting(given)
    expect(finalTypesetting(whole.state, measured, given.translated).typeset).not.toBeNull()
    const first = [...given.translated].slice(0, 6), part = previewTypesetting({ ...given, translated: new Map(first) })
    const refused = finalTypesetting(part.state, measured, given.translated)
    expect([refused.typeset, refused.missing]).toEqual([null, 'a plan of the whole translation'])
    expect(finalTypesetting(whole.state, measured, undefined as never).typeset).toBeNull()
  })
  it('is the same translation made again in new arrays — a batch answered whole, a seeded run sent again: the final sets it; a changed text it refuses', () => {
    const given = inputs('de'), n = given.paper.units.length, measured = { log: originalLog(n), marks: originalMarks(n) }, plan = previewTypesetting(given)
    const again = new Map([...given.translated].map(([u, pieces]) => [u, (pieces as Piece[]).map(p => ({ ...p }))]))
    expect(finalTypesetting(plan.state, measured, again as never).typeset).not.toBeNull()
    const [unit, pieces] = [...again].find(([, ps]) => (ps as Piece[]).some(p => p.t === 'text')) ?? []
    const changed = new Map(again).set(unit as never, (pieces as Piece[]).map(p => (p.t === 'text' ? { ...p, s: `${p.s} and more` } : p)))
    expect(finalTypesetting(plan.state, measured, changed as never).missing).toBe('a plan of the whole translation')
  })
  it('keeps its own copy of the translation it was made on: a unit dropped, or a text changed inside the same array, is another', () => {
    const given = inputs('de'), n = given.paper.units.length, plan = previewTypesetting(given), measured = { log: originalLog(n), marks: originalMarks(n) }
    const inPlace = inputs('de'), planned = previewTypesetting(inPlace)
    given.translated.delete([...given.translated.keys()][0] as never)
    expect(finalTypesetting(plan.state, measured, given.translated).missing).toBe('a plan of the whole translation')
    const text = [...inPlace.translated.values()].flatMap(ps => ps as Piece[]).find(p => p.t === 'text')
    if (text) text.s = `${text.s} and more`
    expect(finalTypesetting(planned.state, measured, inPlace.translated).missing).toBe('a plan of the whole translation')
  })
})

describe('the final from the measuring compile', () => {
  it('keeps the preview\'s type — its size, glue and face — and moves only the leading, which breaks no line again', () => {
    for (const lang of ['de', 'zh'] as const) {
      const given = inputs(lang), plan = previewTypesetting(given)
      // the preview measured every unit a line shorter than its original: the leading takes it, the type stays
      const measured = { log: originalLog(given.paper.units.length).replace(/AXT-LINES (\d+) 4 /g, 'AXT-LINES $1 3 '), marks: originalMarks(given.paper.units.length) }
      const fin = finalTypesetting(plan.state, measured, given.translated)
      expect(fin.type).toEqual(plan.type)
      expect(fin.missing).toBeNull()
      expect(fin.typeset).not.toBe(plan.typeset)
    }
  })
})

describe('the rule sets nothing where an input it needs is missing or partial: the translation is set as today', () => {
  const de = () => inputs('de')
  const none = (r: ReturnType<typeof previewTypesetting>) => [r.typeset, r.state]

  it('plans with every input whole', () => {
    const r = previewTypesetting(de())
    expect(r.typeset).not.toBeNull()
    expect(r.missing).toBeNull()
  })
  it('sets nothing when the original\'s log has no line readings, or stops before the document\'s end', () => {
    const empty = de(), cut = de()
    empty.original.log = ''
    cut.original.log = cut.original.log.replace('AXT-END\n', '')
    expect(none(previewTypesetting(empty))).toEqual([null, null])
    expect(previewTypesetting(cut).missing).toMatch(/original's log/)
    expect(none(previewTypesetting(cut))).toEqual([null, null])
  })
  it('sets nothing when the original\'s marks are missing, or a page has no reading of its columns', () => {
    const lost = de(), unread = de()
    lost.original.marks = { ...lost.original.marks, marks: new Map() }
    unread.original.marks = { ...unread.original.marks, columns: [1, 0] }
    expect(previewTypesetting(lost).missing).toMatch(/original's marks/)
    expect(previewTypesetting(unread).missing).toMatch(/original's marks/)
  })
  it('sets nothing without the width probe, or an alphabet without the size probe a face of fixed sizes needs', () => {
    const noWidth = de(), noSizes = de(), zhNoSizes = inputs('zh')
    noWidth.fontLog = noWidth.fontLog.replace(/^AXT-WIDTH.*$/m, '')
    noSizes.fontLog = noSizes.fontLog.replace(/^AXT-SIZE.*$/gm, '')
    zhNoSizes.fontLog = noSizes.fontLog
    expect(previewTypesetting(noWidth).missing).toMatch(/width probe/)
    expect(previewTypesetting(noSizes).missing).toMatch(/size probe/)
    expect(previewTypesetting(zhNoSizes).typeset).not.toBeNull()
  })
  it('sets nothing when no translated unit is one the original measured: never the smallest type of no units', () => {
    const untranslated = de(), unmeasured = de()
    untranslated.translated = new Map()
    unmeasured.original.log = 'AXT-END\n'
    expect(previewTypesetting(untranslated).missing).toMatch(/translated unit/)
    expect(previewTypesetting(unmeasured).missing).toMatch(/translated unit/)
  })
  it('sets nothing for a script it has no design for', () => {
    const ar = { ...de(), lang: 'ar' }
    expect(previewTypesetting(ar).missing).toMatch(/design/)
  })
  it('keeps the preview\'s own plan for the final where the preview\'s measurement is missing or partial', () => {
    const given = de(), plan = previewTypesetting(given)
    const units = given.paper.units.length
    const whole = { log: originalLog(units), marks: originalMarks(units) }
    expect(finalTypesetting(plan.state, whole, given.translated).typeset).not.toBe(plan.typeset)
    for (const preview of [{ ...whole, log: '' }, { ...whole, log: whole.log.replace('AXT-END\n', '') }, { ...whole, marks: { ...whole.marks, marks: new Map() } }]) {
      const fin = finalTypesetting(plan.state, preview, given.translated)
      expect(fin.typeset).toBe(plan.typeset)
      expect(fin.missing).toMatch(/preview/)
    }
    expect(finalTypesetting(null, whole, given.translated).typeset).toBeNull()
  })
})
