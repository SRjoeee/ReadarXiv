import { describe, expect, it } from 'vitest'
import { rehydrate, serialize } from '@/pdf-reader/engine/mt.mjs'

// The markers wire the PDF reader sends a machine translator (mt.mjs): what an engine reads as part of a word

const unit = (...pieces: { t: string; s?: string; src?: string; id?: number }[]) => ({ kind: 'para', pieces })
const bold = (text: string, rest: string) => unit({ t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', s: text }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: rest })

describe('serialize: a marker is set apart from what an engine would read with it', () => {
  it('after a period: the run-in label ending in one keeps its last word translated (RT-1\'s "Action tokenization.")', () => {
    expect(serialize(bold('Action tokenization.', ' To tokenize actions.')).wire).toBe('@a# Action tokenization. @b# To tokenize actions.')
  })

  it('after a letter or a digit, and before one', () => {
    expect(serialize(bold('Service Auto-Scaling', 'To accommodate loads.')).wire).toBe('@a# Service Auto-Scaling @b# To accommodate loads.')
    expect(serialize(bold('Stage 2', ' next.')).wire).toBe('@a# Stage 2 @b# next.')
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
    const u = unit({ t: 'text', s: 'It matters on seasonal timescales' }, { t: 'ph', src: '\\citep{a}' }, { t: 'text', s: ', alters the jet stream' }, { t: 'ph', src: '\\citep{b}' }, { t: 'text', s: ' and the surface' }, { t: 'ph', src: '\\citep{c}' }, { t: 'text', s: ', as the quasi-biennial oscillation and El Ni' }, { t: 'open', id: 1, src: '{' }, { t: 'ph', src: '\\~n' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: 'o southern oscillations do.' })
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

  it('only a marker\'s: an entity\'s `#` stays, and so does a `#` of the reply\'s own where every marker kept its `#`', () => {
    const u = unit({ t: 'text', s: 'The rule holds for' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ' items, item 3 first.' })
    // tolerant, `@a` read without its `#`: the first lone `#` after it is its own, the entities' kept
    expect(back(u, 'La r&#232;gle vaut pour @a items, l&#39;item #3 d&#39;abord.', true)).toBe("La règle vaut pour $n$ items, l'item 3 d'abord.")
    expect(back(u, 'Die Regel gilt für @a# Elemente, Element #3 zuerst.')).toBe('Die Regel gilt für $n$ Elemente, Element \\#3 zuerst.')
  })
})
