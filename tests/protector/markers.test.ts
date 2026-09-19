// The plain-text marker format (#104, DESIGN §6.1): `@a#`, voids only, paired placeholders flattened.
// The measured basis is in the file header of tokens.ts: Microsoft's Edge endpoint 0% on the tag format, 98% on markers; Google ~99% on both.
import { describe, expect, it } from 'vitest'
import { escapeText, expectationsFromText, fromAlpha, rehydrate, serialize, splitRuns, toAlpha, tokenize, unescapeText, validate } from '@/core/protector'
import { rangesOf } from '@/core/protector/offsets'
import { el, htmlOf } from './helpers'

// 'Let @a# be bold per @b#.' (<em> flattened, <a class=ltx_ref> is a protected node)
const source = '<p class="ltx_p">Let <math class="ltx_Math"><mi>x</mi></math> be <em class="ltx_emph">bold</em> per <a class="ltx_ref" href="#S2">2</a>.</p>'
const block = () => serialize(el(source), 'markers')
const reason = (translated: string) => {
  const r = validate(translated, block())
  return r.ok ? 'ok' : r.reason
}

describe('id ↔ letters', () => {
  it('bijective base 26: 1→a, 26→z, 27→aa', () => {
    for (const [n, s] of [[1, 'a'], [2, 'b'], [26, 'z'], [27, 'aa'], [28, 'ab'], [52, 'az'], [53, 'ba'], [702, 'zz'], [703, 'aaa']] as const) {
      expect([n, toAlpha(n)]).toEqual([n, s])
      expect([s, fromAlpha(s)]).toEqual([s, n])
    }
  })

  it('round-trips far beyond the size of a real block without a collision', () => {
    const seen = new Set<string>()
    for (let i = 1; i <= 3000; i++) {
      const s = toAlpha(i)
      expect(seen.has(s)).toBe(false)
      seen.add(s)
      expect(fromAlpha(s)).toBe(i)
    }
  })
})

describe('serialize (markers)', () => {
  it('a void becomes a marker, paired elements are flattened, elements with a function are still kept whole', () => {
    const b = block()
    // <em> has no slot (flattened); <math> and <a> take one each
    expect(b.text).toBe('Let @a# be bold per @b#.')
    expect(b.paired.size).toBe(0)
    expect(b.slots.size).toBe(2)
    expect((b.slots.get(2) as Element).tagName).toBe('A')
  })

  it('the same block\'s wire text differs between the two formats', () => {
    expect(serialize(el(source), 'tags').text).toBe('Let <x id="1"/> be <t id="2">bold</t> per <x id="3"/>.')
  })
})

// `@a#Word` is one token to a machine translator — a hashtag after a mention — and `word@a#` an address: neither is
// translated. Every numbered heading went out that way, the number's own space being inside the protected tag (the
// maintainer's report, 2026-09-19; the outputs are quoted in DESIGN §6.2). Measured through
// the Edge endpoint over the 404 such blocks of the fixtures: the word left in English in 330 of 330 as it was sent,
// in 26 of 330 with a space at the join. The space is the wire's alone and comes off as the translation is filled back
describe('a marker that touches a word is set apart from it on the wire', () => {
  const HEADING = '<h3 class="ltx_title ltx_title_subsection"><span class="ltx_tag ltx_tag_subsection">2.3 </span>Backpropagation recursion</h3>'
  const NOTE = '<p class="ltx_p">an instance of this<span class="ltx_note ltx_role_footnote"><sup class="ltx_note_mark">1</sup></span>, with base type</p>'
  /** What an engine hands back, in pieces: a title, its two halves swapped, and the sentence around a footnote mark */
  const ZH = { title: '反向传播递归', swapped: ['递归', '反向传播'], note: ['这是该', '，基类型为'], plain: ['设', '为粗体，见', '。'] }
  const TAG = '<span class="ltx_tag ltx_tag_subsection">2.3 </span>'
  const MARK = '<span class="ltx_note ltx_role_footnote"><sup class="ltx_note_mark">1</sup></span>'
  // In the live document: a range over nodes of another document reads empty in happy-dom
  const wire = (html: string, format: 'markers' | 'tags' = 'markers') => {
    document.body.innerHTML = html
    return serialize(document.body.firstElementChild!, format)
  }

  it('a heading\'s number, whose space is inside the protected tag: a space after the marker, recorded as ours', () => {
    const b = wire(HEADING)
    expect(b.text).toBe('@a# Backpropagation recursion')
    expect(b.spaced.get(1)).toEqual({ before: false, after: true })
  })

  it('a footnote mark on its word: a space before the marker', () => {
    const b = wire(NOTE)
    expect(b.text).toBe('an instance of this @a#, with base type')
    expect(b.spaced.get(1)).toEqual({ before: true, after: false })
  })

  it('both sides, digits included; and a marker between two markers or against punctuation is left alone', () => {
    expect(wire('<p class="ltx_p">resized to 256<math class="ltx_Math"><mo>×</mo></math>256 pixels</p>').text).toBe('resized to 256 @a# 256 pixels')
    const b = wire('<p class="ltx_p">follows (<a class="ltx_ref" href="#E3">3</a>)–(<a class="ltx_ref" href="#E4">4</a>), so <math class="ltx_Math"><mi>u</mi></math><math class="ltx_Math"><mi>v</mi></math> holds</p>')
    expect(b.text).toBe('follows (@a#)–(@b#), so @c#@d# holds')
    expect(b.spaced.size).toBe(0)
  })

  it('a word is a word by its code points: one written with a combining mark, or in astral letters, is set apart too (Devin on #254)', () => {
    const math = '<math class="ltx_Math"><mi>x</mi></math>'
    // `resume` + U+0301: the word ends in a mark, not a letter — the Edge endpoint left it in English like any other
    expect(wire(`<p class="ltx_p">the resume\u0301${math} was reviewed</p>`).text).toBe('the resume\u0301 @a# was reviewed')
    // U+1D43E, two UTF-16 units: neither half is a letter
    expect(wire(`<p class="ltx_p">the order \u{1D43E}${math}\u{1D43E} is fixed</p>`).text).toBe('the order \u{1D43E} @a# \u{1D43E} is fixed')
  })

  it('where the paper has a space, or a no-break space, nothing is added', () => {
    expect(wire(source).spaced.size).toBe(0)
    const b = wire('<p class="ltx_p">see Section\u00a0<a class="ltx_ref" href="#S5">5.4</a>\u00a0there</p>')
    expect(b.text).toBe('see Section\u00a0@a#\u00a0there')
    expect(b.spaced.size).toBe(0)
  })

  it('the tags format is as it was: a tag is no part of a word to an engine that parses markup', () => {
    const b = wire(HEADING, 'tags')
    expect(b.text).toBe('<x id="1"/>Backpropagation recursion')
    expect(b.spaced.size).toBe(0)
  })

  it('an inline listing is one placeholder, code and all (the `lstinline` rule), and is set apart from a word like any other', () => {
    const code = '<span class="ltx_text ltx_lstlisting"><span class="ltx_text ltx_lst_identifier">y</span><span class="ltx_text ltx_lst_space"> </span>==<span class="ltx_text ltx_lst_space"> </span>40</span>'
    const b = wire(`<p class="ltx_p">the observation ${code} has probability zero, as does non${code}</p>`)
    expect(b.text).toBe('the observation @a# has probability zero, as does non @b#')
    expect(b.slots.size).toBe(2)
    // Filled back, the code is the paper's, space for space
    expect(htmlOf(rehydrate(`${ZH.plain[0]} @a# ${ZH.plain[1]} @b#`, b, document))).toContain(`<span class="ltx_text ltx_lst_identifier">y</span><span class="ltx_text ltx_lst_space"> </span>==`)
  })

  it('the wire\'s space stands for no character of the page: offsets on either side of it land on the text\'s own edge', () => {
    const b = wire(HEADING)
    // The whole title, from behind the space and from before it
    expect(rangesOf(b.offsets, 4, b.text.length).map(String).join('')).toBe('Backpropagation recursion')
    expect(rangesOf(b.offsets, 3, b.text.length).map(String).join('')).toBe('Backpropagation recursion')
    const n = wire(NOTE)
    expect(rangesOf(n.offsets, 0, n.text.indexOf(' @a#')).map(String).join('')).toBe('an instance of this')
    expect(rangesOf(n.offsets, 0, n.text.indexOf('@a#')).map(String).join('')).toBe('an instance of this')
  })

  it('serialising twice gives the same wire: the stale check compares against it', () => {
    const node = el(HEADING)
    expect(serialize(node, 'markers').text).toBe(serialize(node, 'markers').text)
    expect(serialize(node, 'markers').text).toBe('@a# Backpropagation recursion')
  })

  it('filled back, the space on that side of that marker comes off: the number keeps its own, the mark sits on its word', () => {
    expect(htmlOf(rehydrate(`@a# ${ZH.title}`, wire(HEADING), document))).toBe(`${TAG}${ZH.title}`)
    expect(htmlOf(rehydrate(`${ZH.note[0]} @a#${ZH.note[1]}`, wire(NOTE), document))).toBe(`${ZH.note[0]}${MARK}${ZH.note[1]}`)
  })

  it('an engine that hands back no space changes nothing, and a space that was the paper\'s stays', () => {
    expect(htmlOf(rehydrate(`@a#${ZH.title}`, wire(HEADING), document))).toBe(`${TAG}${ZH.title}`)
    // 'Let @a# be bold per @b#.': the spaces around @a# are the paper's
    expect(htmlOf(rehydrate(`${ZH.plain[0]} @a# ${ZH.plain[1]} @b#${ZH.plain[2]}`, block(), document))).toContain(`${ZH.plain[0]} <math`)
    // The other side of a marker set apart on one side keeps what the engine wrote
    expect(htmlOf(rehydrate(`${ZH.swapped[0]} @a# ${ZH.swapped[1]}`, wire(HEADING), document))).toBe(`${ZH.swapped[0]} ${TAG}${ZH.swapped[1]}`)
  })

  it('the translation\'s offsets follow the cut: the text behind a leading space, an entity included, maps to where it landed', () => {
    const t = '@a#  A &amp; B'
    const f = rehydrate(t, wire(HEADING), document)
    expect(f.textContent).toBe('2.3 A & B')
    expect(rangesOf(f.offsets, t.indexOf('A'), t.length).map(String).join('')).toBe('A & B')
    expect(rangesOf(f.offsets, t.indexOf('B'), t.length).map(String).join('')).toBe('B')
    // From inside the space that came off: the text's own start
    expect(rangesOf(f.offsets, 4, t.length).map(String).join('')).toBe('A & B')
  })

  it('a run goes out without the space: it is for an engine that sees the marker', () => {
    expect(splitRuns(wire(HEADING)).runs).toEqual(['Backpropagation recursion'])
    expect(splitRuns(wire(NOTE)).runs).toEqual(['an instance of this', ', with base type'])
  })
})

describe('the unforgeability of the escaping', () => {
  it('every @ is doubled unconditionally — escaping must not depend on context', () => {
    // Conditional escaping (“double only when [a-z]*[#@] follows”) looks fine on a single text node,
    // but serialisation escapes node by node and then concatenates, and the ambiguity arises at the seam. See the boundary test below
    expect(escapeText('a@b.com', 'markers')).toBe('a@@b.com')
    expect(escapeText('@app.route', 'markers')).toBe('@@app.route')
    expect(escapeText('ends with @', 'markers')).toBe('ends with @@')
    expect(escapeText('@abc#', 'markers')).toBe('@@abc#')
    expect(escapeText('@@', 'markers')).toBe('@@@@')
    expect(escapeText('no ats here', 'markers')).toBe('no ats here')
  })

  it('a text node ending in @ right before a protected node: the placeholder must not be swallowed (Codex on #107)', () => {
    // Under conditional escaping this would serialise as `@@a#`, the tokenizer would read a literal @, the <math> placeholder would vanish into thin air,
    // validation would fail forever, and the runs fallback would drop the formula as text too
    for (const html of [
      '<p class="ltx_p">@<math class="ltx_Math"><mi>x</mi></math></p>',
      '<p class="ltx_p">a@<math class="ltx_Math"><mi>x</mi></math>b</p>',
      '<p class="ltx_p">@@<math class="ltx_Math"><mi>x</mi></math></p>',
      '<p class="ltx_p">@a<math class="ltx_Math"><mi>x</mi></math>#</p>',
    ]) {
      const b = serialize(el(html), 'markers')
      const voids = tokenize(b.text, 'markers').filter(t => t.kind === 'void')
      expect([html, voids.length]).toEqual([html, b.slots.size])
      expect([html, validate(b.text, b).ok]).toEqual([html, true])
      const doc = el('<p></p>').ownerDocument
      expect([html, rehydrate(b.text, b, doc).querySelectorAll('math').length]).toEqual([html, 1])
      expect([html, rehydrate(b.text, b, doc).textContent]).toEqual([html, el(html).textContent])
    }
  })

  it('escape → tokenize is the identity: every literal comes back as itself and produces no placeholder', () => {
    for (const s of ['@abc#', '@@abc#', '@#', '@a@b#', '@@@', 'a@b.com', '@app.route @x# tail']) {
      const tokens = tokenize(escapeText(s, 'markers'), 'markers')
      expect([s, tokens.filter(t => t.kind !== 'text').length]).toEqual([s, 0])
      expect([s, tokens.map(t => (t.kind === 'text' ? t.text : '')).join('')]).toEqual([s, s])
    }
  })

  it('a literal @a# in the source is not taken for a placeholder — exactly where Immersive Translate stumbled', () => {
    const b = serialize(el('<p class="ltx_p">写作 @a# 时 <math class="ltx_Math"><mi>x</mi></math> 成立</p>'), 'markers')
    // The literal is escaped to @@a#, the real placeholder is @a#
    expect(b.text).toBe('写作 @@a# 时 @a# 成立')
    expect(b.slots.size).toBe(1)
    const doc = el('<p></p>').ownerDocument
    expect(htmlOf(rehydrate(b.text, b, doc))).toBe('写作 @a# 时 <math class="ltx_Math"><mi>x</mi></math> 成立')
  })

  it('markers escape & < > too: google-web\'s translateHtml parses the request body as HTML (Codex on #107)', () => {
    // Measured on the 12 fixtures' markers wire text: 102 &, 1 <, 3 >, spread over 80 of 5992 blocks,
    // all genuine content (`Springer science & business media`, `Very long (>1k words) … (<500 words)`)
    expect(escapeText('a < b & c > d', 'markers')).toBe('a &lt; b &amp; c &gt; d')
    expect(escapeText('a < b & c > d', 'tags')).toBe('a &lt; b &amp; c &gt; d')
    // The two escapings do not interfere: `@@` holds no & < >, and an entity holds no @
    expect(escapeText('@ & @', 'markers')).toBe('@@ &amp; @@')
  })
})

describe('validate (markers)', () => {
  it('identity and reordering both pass', () => {
    expect(reason('令 @a# 为粗体，见 @b#。')).toBe('ok')
    expect(reason('@b# 之后，粗体与 @a#')).toBe('ok')
  })

  it('the five kinds of damage are each recognised', () => {
    expect(reason('令 @a# 为粗体。')).toBe('missing')
    expect(reason('@a# @a# @b#')).toBe('duplicate')
    expect(reason('@a# @b# @z#')).toBe('unknown')
    // markers have no paired markers, so unbalanced / kind-mismatch cannot occur on this wire:
    // the tokenizer produces only void and text, so there is no open/close and no kind to get wrong
    expect(tokenize('@a# <t id="1">x</t> @b#', 'markers').filter(t => t.kind !== 'text' && t.kind !== 'void')).toEqual([])
  })

  it('a marker the engine wrote in another shape is stopped (exactly the failure mode to stop)', () => {
    expect(reason('令 @ a # 为粗体，见 @b#。')).toBe('missing')
    expect(reason('令 @A# 为粗体，见 @b#。')).toBe('missing')
    expect(reason('令 @1# 为粗体，见 @b#。')).toBe('missing')
  })
})

describe('expectationsFromText (markers)', () => {
  it('the expectations derived from the request text agree with serialize\'s', () => {
    const b = block()
    const e = expectationsFromText(b.text, 'markers')
    expect([...e.slots.keys()].sort()).toEqual([...b.slots.keys()].sort())
    expect(e.paired.size).toBe(0)
  })

  it('with the wrong format not one placeholder is recognised — validation becomes always-true and a bad translation enters the cache silently', () => {
    const b = block()
    // This assertion pins down what the hole looks like; translate-service must pass the format by renderPath
    expect(expectationsFromText(b.text, 'tags').slots.size).toBe(0)
    expect(validate('完全没有占位符的译文', expectationsFromText(b.text, 'tags')).ok).toBe(true)
    // Passed right, it is stopped
    expect(validate('完全没有占位符的译文', expectationsFromText(b.text, 'markers')).ok).toBe(false)
  })
})

describe('plain-text round trips (titles and OCR lines)', () => {
  // These two paths have no tokenizer: escapeText → translate → unescapeText. decodeText would return as it was,
  // and the title would gain an extra @ (Codex on #107)
  it('escape → unescape is the identity, consecutive @ included', () => {
    for (const s of ['@abc#', '@@abc#', '@#', '@a@b#', '@@@', '@@@@', 'a@b.com', 'plain title']) {
      expect([s, unescapeText(escapeText(s, 'markers'), 'markers')]).toEqual([s, s])
    }
  })

  it('a literal &amp; survives the round trip through escaping, not through “not decoding entities”', () => {
    // The source says `&amp;` (a paper about HTML, OCR'd code) → escaped to `&amp;amp;` → decoded back to `&amp;`
    for (const s of ['a &amp; b', 'a & b', '&lt;div&gt;', '@ &amp; @']) {
      expect([s, unescapeText(escapeText(s, 'markers'), 'markers')]).toEqual([s, s])
      expect([s, unescapeText(escapeText(s, 'tags'), 'tags')]).toEqual([s, s])
    }
  })

  it('the placeholder path must not use it: tokenize has decoded once already, and a second pass eats a literal @@ down to @', () => {
    const escaped = escapeText('@@', 'markers')
    expect(tokenize(escaped, 'markers').map(t => (t.kind === 'text' ? t.text : '')).join('')).toBe('@@')
    expect(unescapeText(unescapeText(escaped, 'markers'), 'markers')).toBe('@')
  })
})
