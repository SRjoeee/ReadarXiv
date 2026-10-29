import { describe, expect, it } from 'vitest'
import { PIPELINE_CARRIES } from '@/pdf-reader/engine/pipeline/live.mjs'
import { boundaryChanges, plainTranslated, rehydrate, rehydrateTags, serialize, serializeTags, translateUnits } from '@/pdf-reader/engine/translate/mt.mjs'

// The markers wire the PDF reader sends a machine translator (mt.mjs): what an engine reads as part of a word

const unit = (...pieces: { t: string; s?: string; src?: string; id?: number }[]) => ({ kind: 'para', pieces })
const bold = (text: string, rest: string) => unit({ t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', s: text }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: rest })

describe('serialize: a marker is set apart from what an engine would read with it', () => {
  it('after a period: the run-in label ending in one keeps its last word translated (RT-1\'s "Action tokenization.")', () => {
    expect(serialize(bold('Action tokenization.', ' To tokenize actions.')).wire).toBe('@a# Action tokenization. @b# To tokenize actions.')
  })

  it('after a letter or a digit, and before one', () => {
    // (placeholders: a bold word inside its sentence takes no marker, planOf)
    const around = (text: string, rest: string) => unit({ t: 'ph', src: '$x$' }, { t: 'text', s: text }, { t: 'ph', src: '\\cite{a}' }, { t: 'text', s: rest })
    expect(serialize(around('Service Auto-Scaling', 'To accommodate loads.')).wire).toBe('@a# Service Auto-Scaling @b# To accommodate loads.')
    expect(serialize(around('Stage 2', ' next.')).wire).toBe('@a# Stage 2 @b# next.')
    // a run-in label with no stop of its own, before a sentence that begins (\textbf{Service Auto-Scaling}To accommodate)
    expect(serialize(bold('Service Auto-Scaling', 'To accommodate loads.')).wire).toBe('@a# Service Auto-Scaling @b# To accommodate loads.')
    expect(serialize(bold('High-fidelity isolated sandbox runtime', ' As agents run.')).wire).toBe('@a# High-fidelity isolated sandbox runtime @b# As agents run.')
  })

  it('not after other punctuation, which the engine reads apart', () => {
    expect(serialize(bold('Setup:', ' we train.')).wire).toBe('@a# Setup:@b# we train.')
  })
})

// The space the wire sets beside a digit is the wire's, not the source's: rehydrate takes it off again as it
// takes off the one after a full stop (the evaluation of the rule, 2026-10-01: 95\% came back "95 %" in Chinese, 20 of 53
// units with a percent after a number)
const back = (u: ReturnType<typeof unit>, reply: string, tolerant = false) => {
  const r = rehydrate(reply, serialize(u), tolerant)
  return 'pieces' in r ? r.pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('') : r.error
}

describe('rehydrate: the space the wire set beside a digit is taken off again', () => {
  const percent = unit({ t: 'text', s: 'We reach 95' }, { t: 'ph', src: '\\%' }, { t: 'text', s: ' accuracy.' })
  it('before the marker, while the text there still ends in the digit', () => {
    expect(serialize(percent).wire).toBe('We reach 95 @a# accuracy.')
    expect(back(percent, '我们达到了 95 @a# 的准确率。')).toBe('我们达到了 95\\% 的准确率。')
    expect(back(percent, 'Wir erreichen 95 @a# Genauigkeit.')).toBe('Wir erreichen 95\\% Genauigkeit.')
  })
  it('not where the engine set something else before the marker: its space is its own', () => {
    expect(back(percent, 'Wir erreichen eine Genauigkeit von 95 Prozent @a#.')).toBe('Wir erreichen eine Genauigkeit von 95 Prozent \\%.')
  })
  it('after the marker, while the text there still begins with the digit', () => {
    const times = unit({ t: 'text', s: 'a 3' }, { t: 'ph', src: '$\\times$' }, { t: 'text', s: '10 speed-up' })
    expect(serialize(times).wire).toBe('a 3 @a# 10 speed-up')
    expect(back(times, '3 @a# 10 倍的加速')).toBe('3$\\times$10 倍的加速')
    expect(back(times, 'eine 3 @a# 10-fache Beschleunigung')).toBe('eine 3$\\times$10-fache Beschleunigung')
  })
  it('before a piece a space never goes before, whatever the engine left before it', () => {
    const tied = unit({ t: 'text', s: 'Stage 2' }, { t: 'ph', src: '~' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' trains it.' })
    expect(serialize(tied).wire).toBe('Stage 2 @a#@b# trains it.')
    expect(back(tied, 'Stufe 2 @a#@b# trainiert es.')).toBe('Stufe 2~\\cite{x} trainiert es.')
  })
  it('a word\'s space stays as it was (#254): a letter before a marker keeps the space the engine left', () => {
    const word = unit({ t: 'text', s: 'as reported for BERT' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' on larger corpora.' })
    expect(back(word, 'wie für BERT @a# auf größeren Korpora berichtet.')).toBe('wie für BERT \\cite{x} auf größeren Korpora berichtet.')
  })
})

// A marker's `#` the engine set twice, or set apart from its marker, is the marker's: the source's text holds no `#` of
// its own (TeX's `\#` and a bare `#` are placeholders), so a `#` left over on the wire is a marker's, and was set as text.
// Microsoft's replies for 2610.02069 into Chinese, as they came (the comparison of 2026-10-05): "El Ni ñ#" on p. 2 of
// both the extension's PDF and the web's, "如图 10#" on p. 15, "预测技能：#" on p. 8 of the extension's; and into
// Japanese, `@d# #`
const text = (r: ReturnType<typeof rehydrate>) => ('pieces' in r ? r.pieces.filter(p => p.t === 'text').map(p => (p as { s: string }).s).join('') : r.error)

describe('rehydrate: a marker\'s `#` doubled or displaced is read with its marker (2610.02069)', () => {
  it('doubled, `@e##` (unit 13: El Ni{\\~n}o, a group around an accent inside the word): read strictly, no `#` left', () => {
    // (the group's two ends as placeholders, as the wire sent them then: a group of placeholders alone is one marker now)
    const u = unit({ t: 'text', s: 'It matters on seasonal timescales' }, { t: 'ph', src: '\\citep{a}' }, { t: 'text', s: ', alters the jet stream' }, { t: 'ph', src: '\\citep{b}' }, { t: 'text', s: ' and the surface' }, { t: 'ph', src: '\\citep{c}' }, { t: 'text', s: ', as the quasi-biennial oscillation and El Ni' }, { t: 'ph', src: '{' }, { t: 'ph', src: '\\~n' }, { t: 'ph', src: '}' }, { t: 'text', s: 'o southern oscillations do.' })
    expect(serialize(u).wire).toBe('It matters on seasonal timescales @a#, alters the jet stream @b# and the surface @c#, as the quasi-biennial oscillation and El Ni @d#@e#@f# o southern oscillations do.')
    const reply = '尤其是在亚季节到季节性的时间尺度@a#中，改变对流层喷射气流@b#，并可能引发地表@c#持续的极端寒爆发（如准两年振荡和El Ni @d#@e##@f#）等。'
    expect(back(u, reply)).toBe('尤其是在亚季节到季节性的时间尺度\\citep{a}中，改变对流层喷射气流\\citep{b}，并可能引发地表\\citep{c}持续的极端寒爆发（如准两年振荡和El Ni {\\~n}）等。')
    expect(text(rehydrate(reply, serialize(u), true))).not.toContain('#')
  })

  it('doubled after the second of two markers, `@c#@d##` (unit 85: Fig.~\\ref, "Figure 10#")', () => {
    const u = unit({ t: 'text', s: 'From the' }, { t: 'ph', src: '$10^5$' }, { t: 'text', s: '-day timeseries we encode each input state' }, { t: 'ph', src: '$x$' }, { t: 'text', s: ' (the PC1/PC2 coordinates shown in Fig.' }, { t: 'ph', src: '~' }, { t: 'ph', src: '\\ref{fig:pca}' }, { t: 'text', s: ') per model.' })
    expect(serialize(u).wire).toBe('From the @a#-day timeseries we encode each input state @b# (the PC1/PC2 coordinates shown in Fig. @c#@d#) per model.')
    expect(back(u, '从@a#天时间序列中，我们将输入状态@b#编码（因此如图@c#@d##所示的PC1/PC2坐标）。')).toBe('从$10^5$天时间序列中，我们将输入状态$x$编码（因此如图~\\ref{fig:pca}所示的PC1/PC2坐标）。')
  })

  it('doubled with a space between, `@d# #` (its Japanese, unit 26)', () => {
    const u = unit({ t: 'text', s: 'We use the 30 km zonal wind threshold:' }, { t: 'ph', src: '$$u \\geq 0$$' }, { t: 'text', s: ' thresholds' }, { t: 'ph', src: '$u_0$' }, { t: 'text', s: ' hold.' })
    expect(serialize(u).wire).toBe('We use the 30 km zonal wind threshold:@a# thresholds @b# hold.')
    expect(back(u, '30kmのゾーン風の閾値を用います:@a# # 閾値@b#は成り立ちます。')).toBe('30kmのゾーン風の閾値を用います:$$u \\geq 0$$ 閾値$u_0$は成り立ちます。')
  })

  it('displaced, its marker read without it (unit 47: `@a` mid-reply, a lone `#` at the end): read tolerantly, the `#` dropped', () => {
    const u = unit({ t: 'text', s: 'We can quantify the forecast skill of the emulator using the RMSE: ' }, { t: 'ph', src: '$$\\mathrm{RMSE}(t)$$' })
    const ser = serialize(u), reply = '我们可以用RMSE（@a）量化模拟器的预测技能：#'
    expect(ser.wire).toBe('We can quantify the forecast skill of the emulator using the RMSE: @a#')
    expect(rehydrate(reply, ser)).toEqual({ error: 'lost marker' })
    expect(back(u, reply, true)).toBe('我们可以用RMSE（$$\\mathrm{RMSE}(t)$$）量化模拟器的预测技能：')
  })

  it('an entity\'s `#` stays; any other is a marker\'s, the source\'s text holding none, and goes wherever the reply set it', () => {
    const u = unit({ t: 'text', s: 'The rule holds for' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ' items, item 3 first.' })
    // tolerant, `@a` read without its `#`: the lone `#` after it goes, the entities' are kept
    expect(back(u, 'La r&#232;gle vaut pour @a items, l&#39;item #3 d&#39;abord.', true)).toBe("La règle vaut pour $n$ items, l'item 3 d'abord.")
    // strict, every marker with its `#`: a `#` the reply set elsewhere is a marker's too (the source wrote "item 3")
    expect(back(u, 'Die Regel gilt für @a# Elemente, Element #3 zuerst.')).toBe('Die Regel gilt für $n$ Elemente, Element 3 zuerst.')
  })

  it('a marker\'s `#` echoed in brackets after it, `@f#(#)`, goes with its brackets (1706.03762 into Japanese, unit 21)', () => {
    const u = unit({ t: 'text', s: 'At each step the model is auto-regressive' }, { t: 'ph', src: '\\citep{graves2013generating}' }, { t: 'text', s: ', consuming the previously generated symbols.' })
    expect(serialize(u).wire).toBe('At each step the model is auto-regressive @a#, consuming the previously generated symbols.')
    // Microsoft's reply as it came (2026-10-07): the marker read, `(#)` set as text, "[10](#)" on the page
    expect(back(u, '\u5404\u30b9\u30c6\u30c3\u30d7\u3067\u30e2\u30c7\u30eb\u306f\u81ea\u5df1\u56de\u5e30\u7684 @a#(#)\u3068\u306a\u308a\u3001\u4ee5\u524d\u306b\u751f\u6210\u3055\u308c\u305f\u30b7\u30f3\u30dc\u30eb\u3092\u6d88\u8cbb\u3057\u307e\u3059\u3002')).toBe('\u5404\u30b9\u30c6\u30c3\u30d7\u3067\u30e2\u30c7\u30eb\u306f\u81ea\u5df1\u56de\u5e30\u7684 \\citep{graves2013generating}\u3068\u306a\u308a\u3001\u4ee5\u524d\u306b\u751f\u6210\u3055\u308c\u305f\u30b7\u30f3\u30dc\u30eb\u3092\u6d88\u8cbb\u3057\u307e\u3059\u3002')
    // and a full-width pair, or a square one, alike; a pair that holds anything else is the text's
    expect(back(u, '\u81ea\u5df1\u56de\u5e30\u7684 @a#\uff08#\uff09\u3068\u306a\u308a\u3002')).toBe('\u81ea\u5df1\u56de\u5e30\u7684 \\citep{graves2013generating}\u3068\u306a\u308a\u3002')
    expect(back(u, '\u81ea\u5df1\u56de\u5e30\u7684 @a# [#] (x)\u3002')).toBe('\u81ea\u5df1\u56de\u5e30\u7684 \\citep{graves2013generating} (x)\u3002')
  })
})

// A sentence whose words change style (2610.19159, the owner's test of 2026-10-19): every pair went out as two markers and
// every switch as one, Microsoft cut the sentence at each and gave each piece back alone — word salad, a word dropped, a
// word set outside its run. Now (planOf) a pair inside a sentence goes on no wire, same-style neighbours are one span, a
// pair that holds whole sentences keeps its two markers, one that holds the unit's whole content is put round the whole
// translation, and what sets no ink rides with its group. The units as 2610.19159's front end cut them; the replies are
// Microsoft's (zh), as they came: to the old wires (2026-10-19, the pipeline lane's places) and to the new (2026-10-19)
type P = { t: string; s?: string; src?: string; id?: number; tr?: boolean }
const pairs = (id: number, src: string, s: string): P[] => [{ t: 'open', id, src }, { t: 'text', s }, { t: 'close', id, src: '}' }]
/** unit 23, a bullet's lead terms: \textbf{compute resources} and \textbf{operating constraints} under which ... */
const LEAD_TERMS = unit(...pairs(74, '\\textbf{', 'compute resources'), { t: 'text', s: ' and ' }, ...pairs(75, '\\textbf{', 'operating constraints'), { t: 'text', s: ' under which the work from ' }, { t: 'ph', src: '$\\mathcal{A}$' }, { t: 'text', s: ' is carried out.\n' })
/** units 372 and 374, a box's label: \noindent\colorbox{blue!5}{\strut\textcolor{blue!60!black}{\textbf{Before}}} */
const label = (word: string, at: number) => unit({ t: 'ph', src: '\\noindent' }, { t: 'open', id: at, src: '\\colorbox{blue!5}{' }, { t: 'ph', src: '\\strut' }, { t: 'open', id: at + 1, src: '\\textcolor{blue!60!black}{' }, ...pairs(at + 2, '\\textbf{', word), { t: 'close', id: at + 1, src: '}' }, { t: 'close', id: at, src: '}' }, { t: 'text', s: '\n' })
const BEFORE = label('Before', 516), AFTER = label('After', 519)
/** unit 375, a box's body: a sentence, then one whose every word is its own \textcolor{blue!65!black}{\bfseries word} */
const WORDS = ['Learned', 'descriptor', 'model', 'and', 'comparisons', 'to', 'quadratic', '-', 'SNAP', 'must', 'use', 'the', 'exact', 'same', 'training', 'set', '.']
const COLOURED = unit({ t: 'ph', src: '\\smallskip' }, { t: 'text', s: '\n' }, { t: 'ph', src: '\\noindent' }, { t: 'ph', src: '\\textbullet' }, { t: 'ph', src: '\\ ' }, { t: 'text', s: 'Fit the learned-descriptor model (same architecture, possibly retrained weights) and a reimplemented quadratic-SNAP model on the new material. ' },
  ...WORDS.flatMap((w, i): P[] => [{ t: 'open', id: 522 + i, src: '\\textcolor{blue!65!black}{' }, { t: 'ph', src: '\\bfseries' }, { t: 'text', s: ` ${w}` }, { t: 'close', id: 522 + i, src: '}' }, ...(['quadratic', '-', 'set', '.'].includes(w) ? [] : [{ t: 'text', s: ' ' }])]))
const shape = (pieces: P[]) => pieces.map(p => (p.t === 'text' ? p.s : p.t === 'open' ? `<${p.id}` : p.t === 'close' ? `${p.id}>` : p.src)).join('|')
const read = (r: ReturnType<typeof rehydrate>) => ('pieces' in r ? (r.pieces as P[]) : [])
/** Microsoft's replies to the new wires, as they came */
const REPLY = {
  leadTerms: '\u8ba1\u7b97\u8d44\u6e90\u548c\u64cd\u4f5c\u7ea6\u675f\uff0c\u7528\u4e8e\u6267\u884c@a#\u5de5\u4f5c\u3002',
  before: '\u4e4b\u524d',
  after: '\u4e4b\u540e',
  coloured: '@a#@b#\u62df\u5408\u5b66\u4e60\u63cf\u8ff0\u7b26\u6a21\u578b\uff08\u76f8\u540c\u67b6\u6784\uff0c\u53ef\u80fd\u91cd\u8bad\u7ec3\u6743\u91cd\uff09\u548c\u91cd\u65b0\u5b9e\u73b0\u7684\u4e8c\u6b21SNAP\u6a21\u578b\u3002@c# \u5b66\u4e60\u63cf\u8ff0\u7b26\u6a21\u578b\u4e0e\u4e8c\u6b21\u578b\u7684\u6bd4\u8f83\u2014\u2014SNAP\u5fc5\u987b\u4f7f\u7528\u5b8c\u5168\u76f8\u540c\u7684\u8bad\u7ec3\u96c6\u3002@d#',
}
/** a translation's text, its pieces joined: Chinese words never set apart by a space, as each piece's own reply joined was */
const salad = (pieces: P[]) => /\p{Script=Han}\s+\p{Script=Han}/u.test(pieces.filter(p => p.t === 'text').map(p => p.s).join(''))

describe('styled runs on the markers wire (2610.19159)', () => {
  it('lead terms in bold: one sentence on the wire, the bold pairs back empty after it (unit 23)', () => {
    const ser = serialize(LEAD_TERMS)
    // it went out as `@a# compute resources @b# and @c# operating constraints @d# under which ...`, and came back as
    // its pieces translated apart and joined with spaces, "and" alone between the two terms
    expect(ser.wire).toBe('compute resources and operating constraints under which the work from @a# is carried out.')
    const r = read(rehydrate(REPLY.leadTerms, ser))
    expect(shape(r)).toBe('\u8ba1\u7b97\u8d44\u6e90\u548c\u64cd\u4f5c\u7ea6\u675f\uff0c\u7528\u4e8e\u6267\u884c|$\\mathcal{A}$|\u5de5\u4f5c\u3002|<74|74>|<75|75>|\n')
    expect(salad(r)).toBe(false)
  })

  it('a word-by-word colour run: one span, its sentence between two markers and none between its words (unit 375)', () => {
    const ser = serialize(COLOURED)
    expect(ser.wire).toBe('@a# Fit the learned-descriptor model (same architecture, possibly retrained weights) and a reimplemented quadratic-SNAP model on the new material. @b# Learned descriptor model and comparisons to quadratic - SNAP must use the exact same training set . @c#')
    // the skip, the switch and the bullet before the sentence one marker, in their order: none goes on the wire alone
    expect(ser.front).toBeUndefined()
    // (the reply to the wire as it went, its first two markers then this wire's one)
    const r = read(rehydrate(REPLY.coloured.replace('@a#@b#', '@a#').replace('@c#', '@b#').replace('@d#', '@c#'), ser))
    // the second sentence inside the first pair, after its switch; the other sixteen pairs back empty after it, in order
    const s = shape(r)
    expect(s).toMatch(/^\\smallskip\|\n\|\\noindent\|\\textbullet\|\\ \|[^|]+\|<522\|\\bfseries\| [^|<>]+\u8bad\u7ec3\u96c6\u3002\|522>\|<523\|\\bfseries\|523>\|/)
    expect(s.endsWith('<538|\\bfseries|538>')).toBe(true)
    expect(salad(r)).toBe(false)
    // tags: the span one pair, the switches off the wire
    expect(serializeTags(COLOURED).wire).toBe('<x id="1"/>Fit the learned-descriptor model (same architecture, possibly retrained weights) and a reimplemented quadratic-SNAP model on the new material. <t id="2"> Learned descriptor model and comparisons to quadratic - SNAP must use the exact same training set .</t>')
  })

  it('a lone styled word: alone on the wire, back inside its box, its colour and its bold (units 372, 374)', () => {
    for (const [u, reply] of [[BEFORE, REPLY.before], [AFTER, REPLY.after]] as const) {
      const ser = serialize(u)
      expect(ser.wire).toBe(u === BEFORE ? 'Before' : 'After')
      expect(shape(read(rehydrate(reply, ser)))).toBe(`\\noindent|<${u.pieces[1]?.id}|\\strut|<${(u.pieces[1]?.id ?? 0) + 1}|<${(u.pieces[1]?.id ?? 0) + 2}|${reply}|${(u.pieces[1]?.id ?? 0) + 2}>|${(u.pieces[1]?.id ?? 0) + 1}>|${u.pieces[1]?.id}>|\n`)
    }
  })

  it('a reply that lost every letter is no translation: never whole, sent again as runs (unit 372\'s reply to the old wire)', async () => {
    // the old wire's shape, its eight markers placeholders: Microsoft gave the markers back and dropped the word, and the
    // reply read as whole, its text one space: the label drawn as an empty box
    const eight = unit(...Array.from({ length: 5 }, (_, i) => ({ t: 'ph', src: `\\mark{${i}}` })), { t: 'text', s: 'Before' }, ...Array.from({ length: 3 }, (_, i) => ({ t: 'ph', src: `\\mark{${5 + i}}` })))
    const ser = serialize(eight)
    expect(ser.wire).toBe('@a#@b#@c#@d#@e# Before @f#@g#@h#')
    expect(rehydrate('@a#@b#@c#@d#@e# @f#@g#@h#', ser)).toEqual({ error: 'lost text' })
    expect(rehydrate('@a#@b#@c#@d#@e# @f#@g#@h#', ser, true)).toEqual({ error: 'lost text' })
    expect(rehydrate('', serialize(BEFORE))).toEqual({ error: 'lost text' })
    const asked: string[][] = []
    const send = async (texts: string[]) => { asked.push(texts); return texts.map(t => ({ text: t === 'Before' ? REPLY.before : '@a#@b#@c#@d#@e# @f#@g#@h#', by: 'microsoft' })) }
    const { results, how } = await translateUnits([eight], send, 'markers')
    expect(asked).toEqual([['@a#@b#@c#@d#@e# Before @f#@g#@h#'], ['Before']])
    expect(how).toMatchObject({ whole: 0, tolerant: 0, runs: 1 })
    expect(plainTranslated(results.get(eight)?.pieces as never)).toBe(REPLY.before)
    // a run's reply with no letter is none either: the run stays the source's
    const { results: none } = await translateUnits([eight], async texts => texts.map(() => ({ text: ' ', by: 'microsoft' })), 'markers')
    expect(none.get(eight)?.state).toBe('none')
  })

  it('a kept pair come back empty takes back the text set just outside it (unit 374\'s reply: the word after `@f#@g#`)', () => {
    // tags: each pair of the label kept; the reply's shape of the old markers one, the word after two closes
    const tags = serializeTags(AFTER)
    expect(tags.wire).toBe('<t id="1"><t id="2"><t id="3">After</t></t></t>')
    expect(shape(read(rehydrateTags(`<t id="1"><t id="2"><t id="3"></t></t>${REPLY.after}</t>`, tags)))).toBe(`\\noindent|<519|\\strut|<520|<521|${REPLY.after}|521>|520>|519>|\n`)
    // markers: a link is kept as its two markers, and the words the reply set after it go back inside it
    const link = unit({ t: 'text', s: 'See ' }, ...pairs(1, '\\href{https://example.org}{', 'the site'), { t: 'text', s: ' for details.' })
    const ser = serialize(link)
    expect(ser.wire).toBe('See @a# the site @b# for details.')
    // (the words up to the sentence's end alone: the next sentence stays outside the link)
    expect(shape(read(rehydrate('\u8be6\u60c5\u8bf7\u53c2\u9605 @a#@b# \u8be5\u7f51\u7ad9\u3002\u5176\u4ed6\u3002', ser)))).toBe('\u8be6\u60c5\u8bf7\u53c2\u9605 |<1| \u8be5\u7f51\u7ad9|1>|\u3002\u5176\u4ed6\u3002')
  })

  it('a run-in label that ends its sentence keeps its markers; one inside a sentence does not', () => {
    expect(serialize(bold('Setup:', ' we train.')).wire).toBe('@a# Setup:@b# we train.')
    expect(serialize(unit(...pairs(1, '\\emph{', 'Note'), { t: 'text', s: '. It holds.' })).wire).toBe('@a# Note @b#. It holds.')
    // after an abbreviation no sentence begins
    expect(serialize(unit({ t: 'text', s: 'Many, e.g. ' }, ...pairs(1, '\\emph{', 'this one.'), { t: 'text', s: ' Then more.' })).wire).toBe('Many, e.g. this one. Then more.')
    // a colon or a semicolon inside a sentence is a clause's end, not a sentence's
    expect(serialize(unit({ t: 'text', s: 'Options: ' }, ...pairs(1, '\\emph{', 'fast'), { t: 'text', s: '; and safe.' })).wire).toBe('Options: fast; and safe.')
  })

  it('the boundary rule (E1): a styled pair whose two ends stand where the wire has a marker anyway is kept; one end alone, not', () => {
    // (2610.19159's u325: after a kept run-in label, to the unit's end)
    expect(serialize(unit(...pairs(1, '\\textit{', 'Floor (must clear):'), { t: 'text', s: ' ' }, ...pairs(2, '\\textcolor{red}{', 'all of the rest to the end'))).wire).toBe('@a# Floor (must clear):@b# @c# all of the rest to the end @d#')
    // (2610.21547's u25: a label at the unit's head before a forced break's marker)
    expect(serialize(unit(...pairs(1, '\\textbf{', 'Pretrained backbone'), { t: 'ph', src: '\\\\' }, { t: 'text', s: 'We use a model here.' })).wire).toBe('@a# Pretrained backbone @b#@c# We use a model here.')
    // (after a marker, but ending inside its sentence: flat, as a colour inside a sentence)
    expect(serialize(unit({ t: 'text', s: 'We use ' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' ' }, ...pairs(1, '\\textbf{', 'bold'), { t: 'text', s: ' words in it.' })).wire).toBe('We use @a# bold words in it.')
    expect(serialize(unit({ t: 'text', s: 'We see ' }, ...pairs(1, '\\textcolor{red}{', 'red words'), { t: 'text', s: ' in it.' })).wire).toBe('We see red words in it.')
    // (an inline formula beside a pair is no cut: the translator moves it as a word, so the pair goes flat (the review of #415))
    expect(serialize(unit({ t: 'text', s: 'We fix the ' }, { t: 'ph', src: '$\\theta$' }, { t: 'text', s: ' ' }, ...pairs(1, '\\textcolor{red}{', 'matrix described below'), { t: 'text', s: '.' })).wire).toBe('We fix the @a# matrix described below.')
    expect(serialize(unit(...pairs(1, '\\textcolor{red}{', 'We define the loss'), { t: 'text', s: ' ' }, { t: 'ph', src: '$L$' }, { t: 'text', s: ' as the sum of the terms.' })).wire).toBe('We define the loss @a# as the sum of the terms.')
    // (a kept link inside a pair that goes flat still has its markers on the wire: a colour pair between two such links keeps
    // its own, its two ends at theirs (Codex on #415))
    const linked = unit({ t: 'text', s: 'We see ' }, { t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', s: 'the ' }, ...pairs(2, '\\href{u}{', 'first'), { t: 'text', s: ' ' }, ...pairs(3, '\\textcolor{red}{', 'middle words'), { t: 'text', s: ' ' }, ...pairs(4, '\\href{v}{', 'last'), { t: 'text', s: ' ones' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: ' in it.' })
    expect(serialize(linked).wire).toBe('We see the @a# first @b# @c# middle words @d# @e# last @f# ones in it.')
    expect(boundaryChanges(linked)).toBe(true)
    // (a forced break joined with a switch that sets no ink in one marker still cuts the text (Devin on #415))
    expect(serialize(unit(...pairs(1, '\\textbf{', 'Pretrained backbone'), { t: 'ph', src: '\\\\' }, { t: 'ph', src: '\\small' }, { t: 'text', s: ' We use a model here.' })).wire).toBe('@a# Pretrained backbone @b#@c# We use a model here.')
    // (a display cuts the text, as a forced break does)
    expect(serialize(unit(...pairs(1, '\\textbf{', 'Pretrained backbone'), { t: 'ph', src: '\\[ x = y \\]' }, { t: 'text', s: 'We use a model here.' })).wire).toBe('@a# Pretrained backbone @b#@c# We use a model here.')
  })

  it('boundaryChanges tells the units whose wire the boundary rule changes, and no other (a copy made before it is asked again for those)', () => {
    // (the rule keeps a pair: the two above)
    expect(boundaryChanges(unit(...pairs(1, '\\textit{', 'Floor (must clear):'), { t: 'text', s: ' ' }, ...pairs(2, '\\textcolor{red}{', 'all of the rest to the end')))).toBe(true)
    expect(boundaryChanges(unit(...pairs(1, '\\textbf{', 'Pretrained backbone'), { t: 'ph', src: '\\\\' }, { t: 'text', s: 'We use a model here.' }))).toBe(true)
    // (a pair the sentence rule keeps or flattens alike, one that encloses the unit, a link, and no pair at all)
    expect(boundaryChanges(unit(...pairs(1, '\\emph{', 'Note'), { t: 'text', s: '. It holds.' }))).toBe(false)
    expect(boundaryChanges(unit({ t: 'text', s: 'We see ' }, ...pairs(1, '\\textcolor{red}{', 'red words'), { t: 'text', s: ' in it.' }))).toBe(false)
    expect(boundaryChanges(unit(...pairs(1, '\\textbf{', 'All of it.')))).toBe(false)
    expect(boundaryChanges(unit({ t: 'text', s: 'See ' }, ...pairs(1, '\\href{u}{', 'this'), { t: 'text', s: ' page.' }))).toBe(false)
    expect(boundaryChanges(unit({ t: 'text', s: 'Plain words ' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' here.' }))).toBe(false)
  })

  it('only a pair that sets a style goes flat: any other keeps its two markers, as before (the review of #404, M1)', () => {
    // a cell's wrapper after its rule (2607.24653's tables: `\midrule \multicolumn{7}{@{}l}{\textbf{}}`, Misplaced \omit)
    const cell = { kind: 'cell', pieces: [{ t: 'ph', src: '\\midrule' }, { t: 'open', id: 1, src: '\\multicolumn{7}{@{}l}{' }, ...pairs(2, '\\textbf{', 'Text'), { t: 'close', id: 1, src: '}' }] }
    const ser = serialize(cell)
    expect(ser.wire).toBe('@a#@b#@c# Text @d#@e#')
    expect(shape(read(rehydrate('@a#@b#@c#\u6587\u672c@d#@e#', ser)))).toBe('\\midrule|<1|<2|\u6587\u672c|2>|1>')
    // a macro with a prose argument (2607.24653's \kimi{3}, `Kimi K#1`, printed thrice when it came back empty)
    expect(serialize(unit({ t: 'text', s: 'We compare ' }, ...pairs(1, '\\kimi{', '3'), { t: 'text', s: ' with the others.' })).wire).toBe('We compare @a# 3 @b# with the others.')
    // a box that draws (2608.12333's \colorbox swatches, drawn empty)
    expect(serialize(unit({ t: 'text', s: 'a ' }, ...pairs(1, '\\colorbox{yellow}{', 'marked phrase'), { t: 'text', s: ' in the text.' })).wire).toBe('a @a# marked phrase @b# in the text.')
    // two links side by side, to the same address, stay two
    expect(serialize(unit({ t: 'text', s: 'See ' }, ...pairs(1, '\\href{u}{', 'this'), { t: 'text', s: ' ' }, ...pairs(2, '\\href{u}{', 'that'), { t: 'text', s: ' page.' })).wire).toBe('See @a# this @b# @c# that @d# page.')
    // an empty macro's call may print (2608.12096's `\inv{}`): one marker where it stands; an empty style pair sets nothing
    expect(serialize(unit({ t: 'text', s: 'By ' }, { t: 'ph', src: '\\cref{p}' }, { t: 'text', s: ', ' }, { t: 'open', id: 1, src: '\\inv{' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: ' acts as negation.' })).wire).toBe('By @a#, @b# acts as negation.')
    expect(serialize(unit({ t: 'text', s: 'By ' }, { t: 'ph', src: '\\cref{p}' }, { t: 'text', s: ', ' }, { t: 'open', id: 1, src: '{' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: ' acts as negation.' })).wire).toBe('By @a#, acts as negation.')
    // a style pair inside its sentence still goes flat
    expect(serialize(LEAD_TERMS).wire).toBe('compute resources and operating constraints under which the work from @a# is carried out.')
  })

  it('a fill or a skip stays a marker where it stands: it sets where the fields fall (2608.10322\'s flush-right \\hfill)', () => {
    const fields = unit({ t: 'text', s: 'Left' }, { t: 'ph', src: '\\hfill{}' }, { t: 'text', s: 'Right' })
    expect(serialize(fields).wire).toBe('Left @a# Right')
    expect(shape(read(rehydrate('\u5de6 @a# \u53f3', serialize(fields))))).toBe('\u5de6 |\\hfill{}| \u53f3')
    expect(serialize(unit({ t: 'text', s: 'One. ' }, { t: 'ph', src: '\\smallskip' }, { t: 'text', s: ' Two.' })).wire).toBe('One. @a# Two.')
    // a break's permission sets no space: the word stays one
    expect(serialize(unit({ t: 'text', s: 'long' }, { t: 'ph', src: '\\allowbreak' }, { t: 'text', s: 'word' })).wire).toBe('longword')
  })

  it('a reply of digits for a word is a translation: two is 2 (Devin on #404)', () => {
    const two = unit({ t: 'text', s: 'two' })
    expect(shape(read(rehydrate('2', serialize(two))))).toBe('2')
    expect(rehydrate(' ', serialize(two))).toEqual({ error: 'lost text' })
  })

  it('tags keep every pair that holds text, the switches off the wire', () => {
    expect(serializeTags(LEAD_TERMS).wire).toBe('<t id="1">compute resources</t> and <t id="2">operating constraints</t> under which the work from <x id="3"/> is carried out.')
    expect(serializeTags(BEFORE).wire).toBe('<t id="1"><t id="2"><t id="3">Before</t></t></t>')
    expect(shape(read(rehydrateTags('<t id="1"><t id="2"><t id="3">\u4e4b\u524d</t></t></t>', serializeTags(BEFORE))))).toBe(`\\noindent|<516|\\strut|<517|<518|\u4e4b\u524d|518>|517>|516>|\n`)
    expect(rehydrateTags('<t id="1"><t id="2"><t id="3"></t></t></t>', serializeTags(BEFORE))).toEqual({ error: 'lost text' })
  })

  it('runs go whole across a pair that went flat: never a word alone (unit 23)', async () => {
    const asked: string[][] = []
    const { results } = await translateUnits([LEAD_TERMS], async texts => { asked.push(texts); return texts.map(t => (t.includes('@') ? null : { text: `[${t}]`, by: 'microsoft' })) }, 'markers')
    expect(asked[1]).toEqual(['compute resources and operating constraints under which the work from', 'is carried out.'])
    expect(shape(results.get(LEAD_TERMS)?.pieces as P[])).toBe('[compute resources and operating constraints under which the work from] |$\\mathcal{A}$| [is carried out.]\n|<74|74>|<75|75>')
  })

  it('a copy of 14 carries a unit with no pair and no switch between its words, and no other', () => {
    const carry = PIPELINE_CARRIES[14] as (pieces: unknown[], unit?: { pieces: unknown[] } | null) => boolean
    const plain = unit({ t: 'ph', src: '\\noindent' }, { t: 'text', s: 'We train ' }, { t: 'ph', src: '$x$' }, { t: 'text', s: '.' })
    expect(carry([{ t: 'ph', src: '\\noindent' }, { t: 'text', tr: true, s: '\u4e4b\u524d' }], plain)).toBe(true)
    expect(carry([{ t: 'text', tr: true, s: '\u4e4b\u524d' }], LEAD_TERMS)).toBe(false)
    expect(carry([{ t: 'text', tr: true, s: '\u4e4b\u524d' }], unit({ t: 'text', s: 'long' }, { t: 'ph', src: '\\allowbreak' }, { t: 'text', s: 'word' }))).toBe(false)
    // a translation that lost every letter of its unit's is not carried
    expect(carry([{ t: 'ph', src: '\\noindent' }, { t: 'text', tr: true, s: ' ' }], plain)).toBe(false)
    // no unit given: by the translation's own pieces
    expect(carry([{ t: 'text', tr: true, s: '\u4e4b\u524d' }])).toBe(true)
    expect(carry([{ t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', tr: true, s: '\u4e4b\u524d' }, { t: 'close', id: 1, src: '}' }])).toBe(false)
  })
})

// backref's list after a bibliography entry (latex-front.mjs BACKREF_LIST): no word of the entry's sentence. On the wire Microsoft's
// Chinese read it as a page number and wrote 页 before it ("…2024.页26", 2610.37668v1); it goes on no wire, and comes back after the
// translation with an en space before it, the \enspace backref sets (a kern, no ink of the list's)
describe('backref\'s list: on no wire, after the translation, an en space before it', () => {
  const list = { t: 'ph', src: '\\axtbackref' }
  const entry = (...pieces: { t: string; s?: string; src?: string; id?: number }[]) => ({ kind: 'reference', pieces: [...pieces, list] })
  const plainEntry = entry({ t: 'text', s: 'A. Author. A title of the work, ' }, { t: 'ph', src: '2022.' })
  const styledEntry = entry({ t: 'text', s: 'A. Author. ' }, { t: 'open', id: 1, src: '\\emph{' }, { t: 'text', s: 'A title' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: ', ' }, { t: 'ph', src: '2022.' })
  it('is on neither wire, nor the runs\'', async () => {
    for (const u of [plainEntry, styledEntry]) {
      expect(serialize(u).slots.some(s => JSON.stringify(s).includes('axtbackref')), JSON.stringify(u)).toBe(false)
      expect(serializeTags(u).slots.some(s => JSON.stringify(s).includes('axtbackref'))).toBe(false)
      expect(serialize(u).wire).toBe(serialize({ ...u, pieces: u.pieces.slice(0, -1) }).wire)
    }
    // (a unit with no list is serialised as before)
    expect(serialize({ ...plainEntry, pieces: plainEntry.pieces.slice(0, -1) }).back).toBeUndefined()
  })
  it('comes back last, the en space before it, on both wires and as runs', async () => {
    for (const u of [plainEntry, styledEntry]) {
      const m = serialize(u), back = rehydrate(m.wire.replace('A title of the work', '作品标题').replace('A title', '标题'), m)
      expect('pieces' in back && back.pieces.slice(-2), JSON.stringify(u)).toEqual([{ t: 'text', tr: true, s: ' ' }, list])
      const t = serializeTags(u), backT = rehydrateTags(t.wire, t)
      expect('pieces' in backT && backT.pieces.slice(-2)).toEqual([{ t: 'text', tr: true, s: ' ' }, list])
    }
    // (as runs, where the markers cannot come back: the list after the runs too)
    const { results } = await translateUnits([plainEntry], async texts => texts.map((t: string) => ({ text: t.includes('@') ? '' : '作品', by: 'x' })), 'markers')
    const r = results.get(plainEntry) as { pieces?: unknown[] }
    expect(r.pieces?.slice(-2)).toEqual([{ t: 'text', tr: true, s: ' ' }, list])
  })
  it('is the front end\'s own source, written once in each module', async () => {
    const [{ BACKREF_LIST: front }, { BACKREF_LIST: wire }] = await Promise.all([import('@/pdf-reader/engine/source/latex-front.mjs'), import('@/pdf-reader/engine/translate/mt.mjs')])
    expect(wire).toBe(front)
  })
})
