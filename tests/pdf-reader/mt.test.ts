import { describe, expect, it } from 'vitest'
import { cutsOf, plainSource, plainTranslated, rehydrate, rehydrateTags, sentencesKept, sentencesOf, serialize, serializeTags, textsShown, translateUnits, unitText } from '@/pdf-reader/engine/mt.mjs'

// A unit's plain text as the PDF shows it, which the reader locates it by (anchors.mjs)

describe('unitText: the plain text, and where its placeholders stood', () => {
  it('the text is plainSource\'s, the offsets where a formula or a citation was', () => {
    const u = { pieces: [{ t: 'text', s: 'Round ' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ': Results of ' }, { t: 'ph', src: '\\cite{x}' }, { t: 'ph', src: '$m$' }] }
    expect(unitText(u.pieces)).toEqual({ text: plainSource(u), gaps: [6, 18] })
    expect(plainSource(u)).toBe('Round : Results of')
  })

  it('a translation\'s pieces: plainTranslated\'s text, and a formatting pair is no placeholder', () => {
    const pieces = [{ t: 'text', tr: true, s: '第 ' }, { t: 'ph', src: '$n$' }, { t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', tr: true, s: '轮' }, { t: 'close', id: 1, src: '}' }]
    expect(unitText(pieces)).toEqual({ text: plainTranslated(pieces), gaps: [2] })
  })

  it('no placeholder, no offsets', () => {
    expect(unitText([{ t: 'text', s: '  Plain  words ' }])).toEqual({ text: 'Plain words' })
  })
})

describe('serialize: a marker that touches a word is set apart from it on the wire', () => {
  const wire = (pieces: { t: string; s?: string; src?: string }[]) => serialize({ pieces }).wire

  it('after a word, and after a full stop: `models.@a#` is one token to the engine, which left the word in English (09c25622, the HTML page\'s same fix)', () => {
    expect(wire([{ t: 'text', s: 'useful tools for calibrating theoretical models.' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' However, this' }])).toBe('useful tools for calibrating theoretical models. @a# However, this')
    expect(wire([{ t: 'text', s: 'as reported for BERT' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' on larger corpora.' }])).toBe('as reported for BERT @a# on larger corpora.')
  })

  it('not after other punctuation, nor between two markers', () => {
    expect(wire([{ t: 'text', s: 'follows (' }, { t: 'ph', src: '\\ref{a}' }, { t: 'ph', src: '\\ref{b}' }, { t: 'text', s: '), so' }])).toBe('follows (@a#@b#), so')
  })
})

describe('rehydrate: the space the wire set after a full stop is taken off again', () => {
  it('Fig.~\\ref and et al.~\\cite come back tied as the source has them, not with a space before the tie (the review of A1, M3)', () => {
    const u = { pieces: [{ t: 'text', s: 'as shown in Fig.' }, { t: 'ph', src: '~' }, { t: 'ph', src: '\\ref{f}' }, { t: 'text', s: ' and by Smith et al.' }, { t: 'ph', src: '~' }, { t: 'ph', src: '\\cite{s}' }, { t: 'text', s: ', the loss' }] }
    const ser = serialize(u)
    expect(ser.wire).toBe('as shown in Fig. @a#@b# and by Smith et al. @c#@d#, the loss')
    const back = rehydrate('wie in Abb. @a#@b# und von Smith et al. @c#@d#, der Verlust', ser)
    expect('pieces' in back && back.pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('')).toBe('wie in Abb.~\\ref{f} und von Smith et al.~\\cite{s}, der Verlust')
  })

  it('only while the text before the marker still ends in a full stop: an engine that set the marker before the stop chose its space (the re-review of A1, m5)', () => {
    const ser = serialize({ pieces: [{ t: 'text', s: 'theoretical models.' }, { t: 'ph', src: '\\cite{x}' }, { t: 'text', s: ' However, this' }] })
    expect(ser.wire).toBe('theoretical models. @a# However, this')
    const back = (reply: string, tolerant = false) => {
      const r = rehydrate(reply, ser, tolerant)
      return 'pieces' in r && r.pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('')
    }
    expect(back('theoretischen Modelle @a#. Jedoch')).toBe('theoretischen Modelle \\cite{x}. Jedoch')
    expect(back('theoretischen Modelle. @a# Jedoch')).toBe('theoretischen Modelle.\\cite{x} Jedoch')
    expect(back('theoretischen Modelle.\n@a# Jedoch', true)).toBe('theoretischen Modelle.\\cite{x} Jedoch')
    // the full stops of CJK text, which the engine may set with a space before the marker too
    expect(back('理论模型。 @a# 然而')).toBe('理论模型。\\cite{x} 然而')
    expect(back('理論モデル． @a# しかし')).toBe('理論モデル．\\cite{x} しかし')
  })

  it('before a piece a space never goes before, whatever stands before it: a tie or a control space after an abbreviation the engine wrote out, a group\'s end', () => {
    const ser = serialize({ pieces: [{ t: 'text', s: 'as shown in Fig.' }, { t: 'ph', src: '~' }, { t: 'ph', src: '\\ref{f}' }, { t: 'text', s: ', the U.S.' }, { t: 'ph', src: '\\ ' }, { t: 'text', s: 'voting age' }] })
    expect(ser.wire).toBe('as shown in Fig. @a#@b#, the U.S. @c# voting age')
    const back = rehydrate('wie in Abbildung @a#@b# gezeigt, das US-Wahlalter @c# von', ser)
    // the space after the control space is TeX's to skip
    expect('pieces' in back && back.pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('')).toBe('wie in Abbildung~\\ref{f} gezeigt, das US-Wahlalter\\  von')
    const cell = serialize({ pieces: [{ t: 'ph', src: '\\textbf{' }, { t: 'text', s: 'Avg.' }, { t: 'ph', src: '}' }] })
    expect(cell.wire).toBe('@a# Avg. @b#')
    const avg = rehydrate('@a# Durchschnitt @b#', cell)
    expect('pieces' in avg && avg.pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('')).toBe('\\textbf{ Durchschnitt}')
  })
})

// Sentence level (plans/2026-10-01-pdf-highlight.md, B3): Microsoft's own sentence lengths for the wire the reader sent
// (sentLen, kept by the extension's service as `alignment`), cleaned into where each sentence after the first begins in
// the unit's plain source and in its translation's plain text — the texts each side is anchored by

/** an alignment from the sentences as the engine cut them: each side's pieces, joined, are the wire and the reply */
const cut = (source: string[], target: string[]) => ({ source: source.map(s => s.length), target: target.map(s => s.length) })
/** the words at the offsets */
const wordsAt = (text: string, offsets: number[]) => offsets.map(o => text.slice(o).split(/[\s，。,.]/)[0])

describe('sentencesOf: the engine\'s sentences, where each begins in the plain texts the two sides are anchored by', () => {
  const u = { pieces: [{ t: 'text', s: 'We study flows ' }, { t: 'ph', src: '\\cite{a}' }, { t: 'text', s: '. They converge when ' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ' grows.' }] }
  const ser = serialize(u)
  const reply = '我们研究流@a#。当@b#增长时，它们收敛。'

  it('each sentence after the first, as the offset of its first word on either side', () => {
    expect(ser.wire).toBe('We study flows @a#. They converge when @b# grows.')
    const back = rehydrate(reply, ser) as { pieces: unknown[] }
    const s = sentencesOf(u, ser, reply, cut(['We study flows @a#. ', 'They converge when @b# grows.'], ['我们研究流@a#。', '当@b#增长时，它们收敛。']), back.pieces as never)
    expect(s).toEqual({ src: [17], tr: [7] })
    expect(wordsAt(plainSource(u), s!.src)).toEqual(['They'])
    expect(wordsAt(plainTranslated(back.pieces as never), s!.tr)).toEqual(['当'])
  })

  it('one sentence: verified, and none begins after the first', () => {
    const back = rehydrate(reply, ser) as { pieces: unknown[] }
    expect(sentencesOf(u, ser, reply, cut([ser.wire], [reply]), back.pieces as never)).toEqual({ src: [], tr: [] })
  })

  it('a boundary inside the closing marker at a unit\'s end (`@g|#`, report-B §2(a)) goes to its end, where it begins nothing: dropped on both sides together', () => {
    const v = { pieces: [{ t: 'text', s: 'It reads ' }, { t: 'ph', src: '$x$' }, { t: 'text', s: '. Then it performs ' }, { t: 'ph', src: '$y$' }] }
    const w = serialize(v)
    expect(w.wire).toBe('It reads @a#. Then it performs @b#')
    const r = '它读取@a#。然后执行@b#'
    const back = rehydrate(r, w) as { pieces: unknown[] }
    const s = sentencesOf(v, w, r, cut(['It reads @a#. ', 'Then it performs @b', '#'], ['它读取@a#。', '然后执行@b', '#']), back.pieces as never)
    expect(wordsAt(plainSource(v), s!.src)).toEqual(['Then'])
    expect(wordsAt(plainTranslated(back.pieces as never), s!.tr)).toEqual(['然后执行'])
  })

  it('a boundary inside a marker in the middle goes to the marker\'s end: the next sentence begins after it', () => {
    const v = { pieces: [{ t: 'text', s: 'Agents fail to follow advice' }, { t: 'ph', src: '\\cite{r}' }, { t: 'text', s: '. Secondary tasks differ.' }] }
    const w = serialize(v)
    expect(w.wire).toBe('Agents fail to follow advice @a#. Secondary tasks differ.')
    const r = '代理未能遵循建议。@a# 次要任务不同。'
    const back = rehydrate(r, w) as { pieces: unknown[] }
    const s = sentencesOf(v, w, r, cut(['Agents fail to follow advice @a#. ', 'Secondary tasks differ.'], ['代理未能遵循建议。@', 'a# 次要任务不同。']), back.pieces as never)
    expect(wordsAt(plainTranslated(back.pieces as never), s!.tr)).toEqual(['次要任务不同'])
    expect(wordsAt(plainSource(v), s!.src)).toEqual(['Secondary'])
  })

  it('a sentence with no word on either side (a formula alone) is merged: its boundary dropped on both sides together', () => {
    const v = { pieces: [{ t: 'text', s: 'Let it be. ' }, { t: 'ph', src: '$x=1$' }, { t: 'text', s: '. So it is.' }] }
    const w = serialize(v)
    expect(w.wire).toBe('Let it be. @a#. So it is.')
    const r = '就这样吧。@a#。确实如此。'
    const back = rehydrate(r, w) as { pieces: unknown[] }
    const s = sentencesOf(v, w, r, cut(['Let it be. ', '@a#. ', 'So it is.'], ['就这样吧。', '@a#。', '确实如此。']), back.pieces as never)
    expect(s!.src).toHaveLength(1)
    expect(wordsAt(plainSource(v), s!.src)).toEqual(['So'])
    expect(wordsAt(plainTranslated(back.pieces as never), s!.tr)).toEqual(['确实如此'])
    // a first sentence with no word: its boundary goes, the formula lit with the sentence after it
    const f = { pieces: [{ t: 'ph', src: '$x$' }, { t: 'text', s: '. Then y.' }] }
    const fw = serialize(f)
    const fr = '@a#。那么 y。'
    const fb = rehydrate(fr, fw) as { pieces: unknown[] }
    expect(sentencesOf(f, fw, fr, cut(['@a#. ', 'Then y.'], ['@a#。', '那么 y。']), fb.pieces as never)).toEqual({ src: [], tr: [] })
  })

  it('the escapes of the wire count as the characters they stand for, and a reply read tolerantly maps too', () => {
    const v = { pieces: [{ t: 'text', s: 'A&B use @ signs. Then ' }, { t: 'ph', src: '$x$' }, { t: 'text', s: ' holds.' }] }
    const w = serialize(v)
    expect(w.wire).toBe('A&amp;B use @@ signs. Then @a# holds.')
    const r = 'A&amp;B 使用 @@ 符号。然后@a成立。'
    const back = rehydrate(r, w, true) as { pieces: unknown[] }
    const s = sentencesOf(v, w, r, cut(['A&amp;B use @@ signs. ', 'Then @a# holds.'], ['A&amp;B 使用 @@ 符号。', '然后@a成立。']), back.pieces as never, true)
    expect(wordsAt(plainSource(v), s!.src)).toEqual(['Then'])
    expect(wordsAt(plainTranslated(back.pieces as never), s!.tr)).toEqual(['然后'])
  })

  it('no alignment, or one that does not partition both texts, or a count that differs: null', () => {
    const back = rehydrate(reply, ser) as { pieces: unknown[] }
    expect(sentencesOf(u, ser, reply, undefined, back.pieces as never)).toBeNull()
    expect(sentencesOf(u, ser, reply, { source: [20, 28], target: [9, 13] }, back.pieces as never)).toBeNull()
    expect(sentencesOf(u, ser, reply, { source: [20, 29], target: [22] }, back.pieces as never)).toBeNull()
    // pieces that are not the reply's
    expect(sentencesOf(u, ser, reply, cut(['We study flows @a#. ', 'They converge when @b# grows.'], ['我们研究流@a#。', '当@b#增长时，它们收敛。']), [{ t: 'text', tr: true, s: '别的' }] as never)).toBeNull()
  })
})

describe('the tags path (Google, an LLM): the sentence cuts sent, and the sentences read back as on the markers path (B3b)', () => {
  const u = { pieces: [{ t: 'text', s: 'We study flows ' }, { t: 'ph', src: '\\cite{a}' }, { t: 'text', s: '. They converge when ' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ' grows.' }] }
  const ser = serializeTags(u)
  const reply = 'Wir untersuchen Flüsse <x id="1"/>. Sie konvergieren, wenn <x id="2"/> wächst.'

  it('the cuts on the wire: a citation annotates the sentence before it, a formula is a word of its own', () => {
    expect(ser.wire).toBe('We study flows <x id="1"/>. They converge when <x id="2"/> grows.')
    expect(cutsOf(u, ser)).toEqual([ser.wire.indexOf('They')])
    // one sentence: none; a sentence opening on a citation of its subject (\citet) keeps its start; the period of an
    // abbreviation ends none
    expect(cutsOf({ pieces: [{ t: 'text', s: 'One sentence alone.' }] })).toEqual([])
    const v = { pieces: [{ t: 'text', s: 'It holds, e.g. for flows. ' }, { t: 'ph', src: '\\citet{b}' }, { t: 'text', s: ' show more.' }] }
    expect(cutsOf(v)).toEqual([serializeTags(v).wire.indexOf('<x id="1"/>')])
  })

  it('each sentence after the first, as the offset of its first word on either side; a boundary inside a tag goes to its end', () => {
    const back = rehydrateTags(reply, ser) as { pieces: unknown[] }
    const s = sentencesOf(u, ser, reply, cut(['We study flows <x id="1"/>. ', 'They converge when <x id="2"/> grows.'], ['Wir untersuchen Flüsse <x id="1"/>. ', 'Sie konvergieren, wenn <x id="2"/> wächst.']), back.pieces as never, false, 'tags')
    expect(wordsAt(plainSource(u), s!.src)).toEqual(['They'])
    expect(wordsAt(plainTranslated(back.pieces as never), s!.tr)).toEqual(['Sie'])
    // the engine cutting inside the citation's tag on the reply: to its end, the same sentences
    expect(sentencesOf(u, ser, reply, cut(['We study flows <x id="1"/>. ', 'They converge when <x id="2"/> grows.'], ['Wir untersuchen Flüsse <x id="', '1"/>. Sie konvergieren, wenn <x id="2"/> wächst.']), back.pieces as never, false, 'tags')).toEqual(s)
    const w = { pieces: [{ t: 'text', s: 'A & B hold. Then ' }, { t: 'ph', src: '$x$' }, { t: 'text', s: ' too.' }] }, sw = serializeTags(w), rw = 'A &amp; B gelten. Dann <x id="1"/> auch.'
    const bw = rehydrateTags(rw, sw) as { pieces: unknown[] }
    expect(sw.wire).toBe('A &amp; B hold. Then <x id="1"/> too.')
    const sx = sentencesOf(w, sw, rw, cut(['A &amp; B hold. ', 'Then <x id="1"/> too.'], ['A &amp; B gelten. ', 'Dann <x id="1"/> auch.']), bw.pieces as never, false, 'tags')
    expect([wordsAt(plainSource(w), sx!.src), wordsAt(plainTranslated(bw.pieces as never), sx!.tr)]).toEqual([['Then'], ['Dann']])
  })

  it('translateUnits sends each unit\'s cuts on the tags path, none on the markers path, and keeps the sentences the alignment gives', async () => {
    const v = { pieces: [{ t: 'text', s: 'A second unit, one sentence.' }] }
    const calls: (number[] | undefined)[][] = []
    const send = async (texts: string[], cuts?: (number[] | undefined)[]) => {
      calls.push(cuts ?? [])
      return texts.map(t => (t.startsWith('We') ? { text: reply, by: 'g', alignment: cut(['We study flows <x id="1"/>. ', 'They converge when <x id="2"/> grows.'], ['Wir untersuchen Flüsse <x id="1"/>. ', 'Sie konvergieren, wenn <x id="2"/> wächst.']) } : { text: 'Eine zweite Einheit, ein Satz.', by: 'g', alignment: { source: [t.length], target: [30] } }))
    }
    // a heading, lit whole whatever its sentences: none sent, so the engine translates it as it would without markers
    const h = { kind: 'heading', pieces: [{ t: 'text', s: 'Results. More results.' }] }
    const { results } = await translateUnits([u, v, h], send, 'tags')
    expect(calls).toEqual([[[ser.wire.indexOf('They')], [], undefined]])
    expect(results.get(u)).toMatchObject({ state: 'whole', sentences: { src: [17] } })
    expect(results.get(v)).toMatchObject({ state: 'whole', sentences: { src: [], tr: [] } })
    // the markers path (Microsoft, which reports its own sentences): no cuts sent
    const told: unknown[] = []
    await translateUnits([u], async (texts: string[], cuts?: unknown) => { told.push(cuts); return texts.map(() => ({ text: 'Wir untersuchen Flüsse @a#. Sie konvergieren, wenn @b# wächst.', by: 'ms' })) })
    expect(told).toEqual([undefined])
  })
})

describe('sentencesKept: a record\'s sentences used only when they are of their shape (the review of B3, minor 5)', () => {
  const src = 'One two. Three four. Five.', tr = 'Eins zwei. Drei vier. Fünf.'
  it('as many starts on each side, rising inside each side\'s text', () => {
    const s = { src: [9, 21], tr: [11, 22] }
    expect(sentencesKept(s, src, tr)).toBe(s)
    expect(sentencesKept({ src: [], tr: [] }, src, tr)).toEqual({ src: [], tr: [] })
  })
  it('anything else none: the unit lit whole, nothing thrown', () => {
    for (const s of [null, 5, 'x', {}, { src: [9] }, { src: [9, 21], tr: [11] }, { src: [21, 9], tr: [11, 22] }, { src: [0], tr: [11] }, { src: [9.5], tr: [11] }, { src: [9], tr: [tr.length] }, { src: ['9'], tr: [11] }, { src: [9, 9], tr: [11, 22] }])
      expect(sentencesKept(s, src, tr), JSON.stringify(s)).toBeNull()
  })
})

describe('translateUnits keeps a whole unit\'s sentences; the runs path and a unit without an alignment have none', () => {
  const u = { pieces: [{ t: 'text', s: 'We study flows ' }, { t: 'ph', src: '\\cite{a}' }, { t: 'text', s: '. They converge when ' }, { t: 'ph', src: '$n$' }, { t: 'text', s: ' grows.' }] }
  const v = { pieces: [{ t: 'text', s: 'A second unit, one sentence.' }] }

  it('markers read back: the sentences with the pieces', async () => {
    const send = async (texts: string[]) => texts.map(t => (t.startsWith('We') ? { text: '我们研究流@a#。当@b#增长时，它们收敛。', by: 'ms', alignment: cut(['We study flows @a#. ', 'They converge when @b# grows.'], ['我们研究流@a#。', '当@b#增长时，它们收敛。']) } : { text: '第二个单元，一句话。', by: 'ms' }))
    const { results } = await translateUnits([u, v], send)
    expect(results.get(u)).toMatchObject({ state: 'whole', sentences: { src: [17], tr: [7] } })
    expect(results.get(v)).not.toHaveProperty('sentences')
  })

  it('runs: none, whatever the engine reports', async () => {
    const send = async (texts: string[]) => texts.map(t => ({ text: `译${t}`, by: 'g', alignment: { source: [t.length], target: [t.length + 1] } }))
    const { results } = await translateUnits([u], send, 'runs')
    expect(results.get(u)).not.toHaveProperty('sentences')
  })
})

describe('textsShown: each unit\'s text as a compile has it, with the sentences of the translation it typeset', () => {
  it('a translated unit its translation\'s text and sentences; one shown in the source its source, and no sentences', () => {
    const a = { pieces: [{ t: 'text', s: 'One. Two.' }] }, b = { pieces: [{ t: 'text', s: 'Three.' }] }
    const pa = [{ t: 'text', tr: true, s: 'Eins. Zwei.' }]
    const sentences = new WeakMap<object, { src: number[]; tr: number[] }>([[pa, { src: [5], tr: [6] }]])
    expect(textsShown([a, b], new Map([[a, pa]]), p => sentences.get(p))).toEqual([{ id: 0, text: 'Eins. Zwei.', sentences: { src: [5], tr: [6] } }, { id: 1, text: 'Three.' }])
  })
})
