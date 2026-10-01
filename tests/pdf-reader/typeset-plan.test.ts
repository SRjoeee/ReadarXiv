import { describe, expect, it } from 'vitest'
import { openPaper, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { strategiesFor } from '@/pdf-reader/engine/scripts.mjs'
import type { Marks } from '@/pdf-reader/engine/typeset/places.mjs'
import { previewTypesetting } from '@/pdf-reader/engine/typeset/plan.mjs'

// The rule's two steps on a small paper and the logs and marks its compiles would give: what goes in, what comes out.
// The numbers the rule reaches on real papers are the gate's (experiments/pdf-bilingual/spikes/typeset-gate.mjs)

type Piece = { t: string; s?: string; tr?: boolean }
type Unit = { kind: string; pieces: Piece[] }
const PARAS = 12
const SOURCE = `\\documentclass{article}\\begin{document}\n${Array.from({ length: PARAS }, (_, k) => `Paragraph ${k} of the paper, ${'with words that run on for a line or two of prose '.repeat(4)}and an end.\n`).join('\n')}\\end{document}\n`
const paper = () => openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
/** every unit translated: Chinese at about two characters a word, or German a fifth longer than the English */
function translate(units: Unit[], lang: 'zh' | 'de') {
  const text = (s: string) => (lang === 'zh' ? '论文的一段'.repeat(Math.round(s.length / 12)) : `${s} ${s.slice(0, Math.round(s.length / 5))}`)
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
    expect(() => viaXe.typeset?.strategy(cjkutf8)).toThrow()
  })
})
