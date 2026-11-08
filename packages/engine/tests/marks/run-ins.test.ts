// A unit's run-in labels stated `must` (packages/engine/src/marks/run-ins.ts): the styled groups whose two ends stand where
// their sentence is cut anyway, by today's wire's rule for the style pairs it kept (translate/mt.mjs classOf at 065c1d973), so
// that the markers wire, which keeps a `must` span alone, brings their style back.
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { runIns } from '../../src/marks/run-ins.ts'

const t = (s: string): Piece => ({ t: 'text', s })
let n = 0
const el = (src: string, kind = 'other'): Piece => ({ t: 'el', id: `e${n++}`, kind, src })
const span = (open: string, content: Piece[], style = 'bold'): Piece & { t: 'span' } => ({
  t: 'span',
  id: `s${n++}`,
  style,
  open,
  close: '}',
  content,
})
const bf = (s: string | Piece[]) => span('\\textbf{', typeof s === 'string' ? [t(s)] : s)
const em = (s: string) => span('\\emph{', [t(s)], 'italic')
/** the `must` spans' texts, in order */
const kept = (content: Piece[]): string[] => {
  const out: string[] = []
  const stack: Piece[] = [...runIns(content)].reverse()
  while (stack.length) {
    const p = stack.pop() as Piece
    if (p.t !== 'span') continue
    if (p.must) out.push(p.content.map((q) => (q.t === 'text' ? q.s : '¤')).join(''))
    stack.push(...[...p.content].reverse())
  }
  return out
}

describe('the run-in labels of a unit, stated must', () => {
  it('a label after a forced break, its colon after it (1810.04805v2 p8: \\\\ \\noindent \\textbf{No NSP}: …)', () => {
    const content = [
      t('We evaluate two objectives as before:\n'),
      el('\\vspace{0.3cm}'),
      t('\n'),
      el('\\\\'),
      t('\n'),
      el('\\noindent'),
      bf('No NSP'),
      t(': A bidirectional model trained without the NSP task.'),
      el('\\\\'),
      t('\n'),
      el('\\noindent'),
      bf([t('LTR '), el('\\&', 'macro'), t(' No NSP')]),
      t(': A left-context-only model.\n'),
    ]
    expect(kept(content)).toEqual(['No NSP', 'LTR ¤ No NSP'])
  })
  it('a label at the unit’s head that ends its sentence (2010.11929v2 p5: \\textbf{Training \\& Fine-tuning.} We …)', () => {
    expect(kept([bf([t('Training '), el('\\&', 'macro'), t(' Fine-tuning.')]), t(' We train all models.')])).toEqual([
      'Training ¤ Fine-tuning.',
    ])
    // (at the head, a colon or a semicolon ends it, in it or right after it, and a capital after it: a sentence begins)
    expect(kept([bf('Setup:'), t(' we use eight GPUs.')])).toEqual(['Setup:'])
    expect(kept([bf('Service Auto-Scaling'), t(' To accommodate the load, …')])).toEqual(['Service Auto-Scaling'])
  })
  it('labels where a sentence begins past the head, a colon ending each (2010.11929v2 Figure 7)', () => {
    const content = [
      bf('Left:'),
      t(' Filters of the initial linear embedding of ViT-L/32. '),
      bf('Center:'),
      t(' Similarity of position embeddings. '),
      bf('Right:'),
      t(' Size of attended area by head.'),
    ]
    expect(kept(content)).toEqual(['Left:', 'Center:', 'Right:'])
  })
  it('a styled sentence, its two ends a sentence’s', () => {
    expect(kept([t('It holds. '), em('All of it is new.'), t(' Then more.')])).toEqual(['All of it is new.'])
  })
  it('none for a styled word inside a sentence, nor after an abbreviation, nor a colon after a sentence’s first words', () => {
    expect(kept([t('We use '), em('all'), t(' the data.')])).toEqual([])
    expect(kept([t('As in Fig. '), bf('Left:'), t(' the filters.')])).toEqual([])
    expect(kept([t('The options are '), em('fast'), t(': and safe.')])).toEqual([])
  })
  it('none for a group that holds the whole unit (it comes back around the translation), a link’s own must kept', () => {
    expect(kept([bf('The whole unit.')])).toEqual([])
    const link = span('\\href{https://x.org}{', [t('our code')], 'link')
    link.must = 1
    expect(kept([t('See '), link, t(' for details.')])).toEqual(['our code'])
  })
  it('a bare group a label only where a switch opens it (\\textbf’s TeX), never BibTeX’s case protection inside a sentence', () => {
    const switched = span('{', [el('\\bf'), t('Remark:')], 'group')
    expect(kept([t('It holds. '), switched, t(' it also holds.')])).toEqual(['¤Remark:'])
    const bare = span('{', [t('GEPA')], 'group')
    expect(kept([t('Results of '), bare, t(': Reflective prompts.')])).toEqual([])
  })
  it('a group whose two ends stand at a forced break or a kept group’s edge (the boundary rule)', () => {
    // (2610.19159's "\textit{Floor (must clear):} \textcolor{red}{… to the end}": the colour after the label, to the unit's end)
    const colour = span('\\textcolor{red}{', [t('the rest goes on to the end')], 'other')
    expect(kept([span('\\textit{', [t('Floor (must clear):')], 'italic'), t(' '), colour])).toEqual([
      'Floor (must clear):',
      'the rest goes on to the end',
    ])
  })
  // (1810.04805v2 p8 on staging, 2026-11-09: the first label sat inside Microsoft's sentence, which ran on from "as BERT_BASE:"
  // across the forced break's marker, and came back without its term; the second, after "task.", began a sentence and
  // kept it. Microsoft cut its sentence at a line break written after the break's marker and gave the label back whole)
  it('the forced break a label follows, no sentence ending before it, states the line it ends (its stop a line end)', () => {
    const first = el('\\\\')
    const second = el('\\\\')
    const content = [
      t('We compare two settings as follows:\n'),
      el('\\vspace{0.3cm}'),
      t('\n'),
      first,
      t('\n'),
      el('\\noindent'),
      bf('No XYZ'),
      t(': A model trained without the XYZ task.'),
      second,
      t('\n'),
      el('\\noindent'),
      bf('Only XYZ'),
      t(': A model trained with it alone.\n'),
    ]
    expect(kept(content)).toEqual(['No XYZ', 'Only XYZ'])
    expect(first).toMatchObject({ stop: '\n' })
    // (after a full stop the endpoint's sentence ends already: the break states nothing)
    expect(second).not.toHaveProperty('stop')
  })
  it('no line end for a break no label follows: a title broken over lines, a group kept by the boundary rule', () => {
    const title = el('\\\\')
    kept([t('Deep Bidirectional Transformers for '), title, t(' Language Understanding')])
    expect(title).not.toHaveProperty('stop')
    // (an affiliation's lines, each group kept by the boundary rule: a phrase broken over lines, no sentence's end)
    const line = el('\\\\')
    const content = [t('College of Information Science'), line, em('and Electronic Engineering,')]
    expect(kept(content)).toEqual(['and Electronic Engineering,'])
    expect(line).not.toHaveProperty('stop')
  })
  it('reads groups nested past any recursion limit (its walks keep their own stacks)', () => {
    let inner: Piece[] = [t('Setup:')]
    for (let i = 0; i < 20_000; i++) inner = [bf(inner)]
    expect(kept([...inner, t(' we use eight GPUs.')])).toHaveLength(20_000)
  })
})
