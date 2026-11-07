import { describe, expect, it } from 'vitest'
import { markSource } from '../../src/marks/mark.ts'
import { NO_DEFINITIONS } from '../../src/source/definitions.ts'
import { readSource } from '../../src/source/read.ts'
import {
  CAT,
  Catcodes,
  fileName,
  Lexer,
  type LexRules,
  type Token,
  texText,
  tokenize,
} from '../../src/source/tokens.ts'

const RULES: LexRules = {
  inline: (n) => (n === 'verb' ? 'verb' : n === 'lstinline' ? 'listing' : n === 'mintinline' ? 'minted' : null),
  lineEnv: (n) => n === 'verbatim' || n === 'lstlisting' || n === 'comment',
}
/** each token as `kind:source` */
const show = (text: string, rules = RULES) => {
  // (letters are one token each; a run of them is shown as one)
  const out: string[] = []
  for (const t of tokenize(text, rules)) {
    const one = `${t.k}${t.k === 'space' && t.skipped ? '~' : ''}:${text.slice(t.s, t.e)}`
    if (t.k === 'letter' && out.at(-1)?.startsWith('letter:')) out[out.length - 1] += text.slice(t.s, t.e)
    else out.push(one)
  }
  return out
}
const kinds = (text: string) => tokenize(text, RULES).map((t) => t.k)

describe('the tokenizer: lines, blanks and comments', () => {
  it('ends a line at CR, LF and CR LF alike', () => {
    expect(texText('a\r\nb\rc\nd')).toBe('a\nb\nc\nd')
  })
  it('reads a blank line as \\par, and a single line end as a space with the next line indent', () => {
    expect(show('ab\n  cd\n\n  ef')).toEqual([
      'letter:ab',
      'space:\n  ',
      'letter:cd',
      'par:\n\n',
      'space~:  ',
      'letter:ef',
    ])
  })
  it('makes blanks after a control word and at a line start no token (skipped)', () => {
    expect(show('\\foo  x')).toEqual(['cs:\\foo', 'space~:  ', 'letter:x'])
    expect(show('\\foo\n  x')).toEqual(['cs:\\foo', 'space~:\n  ', 'letter:x'])
  })
  it('takes the line end with a comment; a blank line after it is still \\par, an indent after it is skipped', () => {
    expect(show('a % note\n\nb')).toEqual(['letter:a', 'space: ', 'comment:% note\n', 'par:\n', 'letter:b'])
    expect(show('a% note\n   b')).toEqual(['letter:a', 'comment:% note\n', 'space~:   ', 'letter:b'])
  })
  it('reads \\\\% as a backslash pair and then a comment, \\% as a control symbol', () => {
    expect(show('x\\\\% gone\ny')).toEqual(['letter:x', 'cs:\\\\', 'comment:% gone\n', 'letter:y'])
    expect(show('50\\% of')).toEqual(['char:5', 'char:0', 'cs:\\%', 'space: ', 'letter:of'])
  })
  it('reads a backslash at a line end as a control symbol that ends the line', () => {
    expect(show('a\\\n  b')).toEqual(['letter:a', 'cs:\\\n', 'space~:  ', 'letter:b'])
  })
  it('reads ^^ notation as the character it stands for', () => {
    const toks = tokenize('\\a^^J\\b^^41')
    expect(toks.map((t) => t.k)).toEqual(['cs', 'char', 'cs'])
    expect((toks[1] as Token & { k: 'char' }).ch).toBe('\n')
    // (^^41 is a letter, A: part of the control word, as TeX reads it)
    expect((toks[2] as Token & { k: 'cs' }).name).toBe('bA')
  })
})

describe('the tokenizer: category codes', () => {
  it('makes @ a letter between \\makeatletter and \\makeatother', () => {
    expect(show('\\a@b\\makeatletter\\a@b\\makeatother\\a@b').filter((t) => t.startsWith('cs'))).toEqual([
      'cs:\\a',
      'cs:\\makeatletter',
      'cs:\\a@b',
      'cs:\\makeatother',
      'cs:\\a',
    ])
  })
  it('makes the change a written-out \\catcode assignment states, and ends it with the group it is made in', () => {
    const t = '\\catcode`\\@=11 \\x@y\\catcode`\\@=12 \\x@y\\catcode`\\|=13 |'
    const cs = tokenize(t)
      .filter((x) => x.k === 'cs')
      .map((x) => (x as Token & { k: 'cs' }).name)
    expect(cs).toEqual(['catcode', 'x@y', 'catcode', 'x', 'catcode'])
    const last = tokenize(t).at(-1) as Token & { k: 'char' }
    expect(last.cat).toBe(CAT.active)
  })
  it('reads \\catcode in its decimal, hex, octal and named forms', () => {
    for (const form of ['64=11', '"40=11', "'100=11", '`@=\\letter', '`\\@ = 11']) {
      const cs = tokenize(`\\catcode${form}\\a@b`).filter((x) => x.k === 'cs')
      expect(
        cs.map((x) => (x as Token & { k: 'cs' }).name),
        form,
      ).toEqual(['catcode', 'a@b'])
    }
  })
  it('runs no assignment in a group, which may be a definition’s body (REVTeX’s \\@sanitize@url)', () => {
    const cs = tokenize('\\def\\s{\\catcode`\\\\12\\catcode`\\%12\\relax}%\n\\a').filter((x) => x.k === 'cs')
    expect(cs.map((x) => (x as Token & { k: 'cs' }).name)).toEqual([
      'def',
      's',
      'catcode',
      '\\',
      'catcode',
      '%',
      'relax',
      'a',
    ])
  })
  it('leaves the codes as they are where an assignment is not written out', () => {
    const cs = tokenize('\\def\\x#1{\\catcode`#1=11}\\a@b').filter((x) => x.k === 'cs')
    expect(cs.map((x) => (x as Token & { k: 'cs' }).name)).toEqual(['def', 'x', 'catcode', 'a'])
  })
  it("reads expl3's names between \\ExplSyntaxOn and \\ExplSyntaxOff", () => {
    const cs = tokenize('\\ExplSyntaxOn \\tl_new:N \\l_x_tl \\ExplSyntaxOff \\a_b').filter((x) => x.k === 'cs')
    expect(cs.map((x) => (x as Token & { k: 'cs' }).name)).toEqual([
      'ExplSyntaxOn',
      'tl_new:N',
      'l_x_tl',
      'ExplSyntaxOff',
      'a',
    ])
  })
  it('reads ~ as an active character', () => {
    const t = tokenize('a~b')[1] as Token & { k: 'char' }
    expect(t.cat).toBe(CAT.active)
  })
  it('carries the codes from one file into the next one read with the same table', () => {
    const codes = new Catcodes()
    tokenize('\\makeatletter', RULES, codes)
    expect(tokenize('\\a@b', RULES, codes).map((t) => t.k)).toEqual(['cs'])
  })
})

describe('the tokenizer: text read otherwise than as tokens', () => {
  it('ends \\verb at its delimiter, at the line end, or at the file end', () => {
    const at = (t: string) => tokenize(t, RULES).find((x) => x.k === 'verb') as Token & { k: 'verb' }
    expect(at('\\verb|a%{b|c')).toMatchObject({ ended: 'delimiter', s: 0, e: 11 })
    expect(at('\\verb+a\nb+')).toMatchObject({ ended: 'line', e: 7 })
    expect(at('\\verb*!a b')).toMatchObject({ ended: 'file', e: 10 })
    expect(show('\\verb{x{ y')).toEqual(['verb:\\verb{x{', 'space: ', 'letter:y'])
  })
  it('does not take a longer name for \\verb', () => {
    expect(kinds('\\verba{x}')).toEqual(['cs', 'char', 'letter', 'char'])
  })
  it("reads listings' and minted's inline code with its options, a brace group or a delimiter", () => {
    expect(show('\\lstinline[language=C]{a{b}c} x')[0]).toBe('verb:\\lstinline[language=C]{a{b}c}')
    expect(show('\\lstinline|x%y| z')[0]).toBe('verb:\\lstinline|x%y|')
    expect(show('\\mintinline{py}|a}b| z')[0]).toBe('verb:\\mintinline{py}|a}b|')
  })
  it('reads an environment read by lines up to its first \\end, whatever stands in it', () => {
    const t = 'a\\begin{verbatim}\n% \\end{x} } {\n\\end{verbatim}b'
    expect(show(t)).toEqual([
      'letter:a',
      'verb' + 'atim:\\begin{verbatim}\n% \\end{x} } {\n\\end{verbatim}',
      'letter:b',
    ])
    expect(kinds('\\begin{comment}never closed')).toEqual(['verbatim'])
  })
  it('reads any other environment as tokens', () => {
    expect(kinds('\\begin{center}x')).toEqual(['cs', 'char', ...Array(6).fill('letter'), 'char', 'letter'])
  })
  it("reads \\url's argument with % a character where the reader asks for it", () => {
    const text = '\\url{http://a.b/%20{c}}%x\nd'
    const lx = new Lexer(text, new Catcodes(), RULES)
    expect(lx.next()).toMatchObject({ k: 'cs', name: 'url' })
    const raw = lx.rawGroup() as Token
    expect(text.slice(raw.s, raw.e)).toBe('{http://a.b/%20{c}}')
    expect(lx.next()?.k).toBe('comment')
  })
  it("reads \\href's address raw on the next line too, as TeX reads an argument there", () => {
    const rules: LexRules = { ...RULES, raw: (n) => n === 'href' }
    const text = '\\href\n  {https://doi.org/x?a=%3Fb}{t}'
    const raw = tokenize(text, rules).find((t) => t.k === 'raw') as Token
    expect(text.slice(raw.s, raw.e)).toBe('{https://doi.org/x?a=%3Fb}')
  })
  it('reads an argument group as TeX does: a % in it a comment', () => {
    const lx = new Lexer('{a%}\n}b', new Catcodes(), RULES)
    const g = lx.group()
    expect(g?.e).toBe(6)
    expect(g?.tokens.map((t) => t.k)).toEqual(['letter', 'comment'])
  })
  it('reads groups nested past any recursion limit', () => {
    const n = 200_000
    const text = `${'{'.repeat(n)}x${'}'.repeat(n)}`
    const g = new Lexer(text).group()
    expect(g?.e).toBe(text.length)
    expect(g?.tokens.length).toBe(2 * n - 1)
  })
})

describe('the tokenizer: file names', () => {
  const nameOf = (t: string) => {
    const lx = new Lexer(t)
    lx.next()
    return fileName(lx)
  }
  it('reads a braced name and an unbraced one, as TeX and LaTeX read them', () => {
    expect(nameOf('\\input{sections/intro}')).toMatchObject({ name: 'sections/intro', braced: true })
    expect(nameOf('\\input sections/intro\nnext')).toMatchObject({ name: 'sections/intro', braced: false })
    expect(nameOf('\\input sections/intro.tex more')).toMatchObject({ name: 'sections/intro.tex', e: 26 })
    expect(nameOf('\\input\\foo')).toBeNull()
  })
})

describe('the tokenizer: \\endinput', () => {
  it('reads the rest of the line \\endinput stands on, then no more', () => {
    const lx = new Lexer('a\\endinput b\nc')
    const out: string[] = []
    for (let t = lx.next(); t; t = lx.next()) {
      out.push(lx.text.slice(t.s, t.e))
      if (t.k === 'cs' && t.name === 'endinput') lx.endInput()
    }
    expect(out).toEqual(['a', '\\endinput', ' ', 'b', '\n'])
  })
})

describe('a character written in ^^ notation is read at its full width (review of #608)', () => {
  it('reads ^^20 as one space, and blanks after it, its four characters taken', () => {
    const toks = tokenize('First^^20words here.')
    const sp = toks.find((t) => t.k === 'space')
    expect(sp).toMatchObject({ s: 5, e: 9 })
    expect(toks.filter((t) => t.k === 'char')).toEqual([expect.objectContaining({ ch: '.' })])
    expect(tokenize('a^^20^^20 ^^09b').filter((t) => t.k === 'space')).toEqual([
      expect.objectContaining({ s: 1, e: 14 }),
    ])
  })
  it('marks the paragraph whose space is ^^20', () => {
    const files = new Map([
      [
        'main.tex',
        new TextEncoder().encode('\\documentclass{article}\\begin{document}\nFirst^^20words here.\n\\end{document}\n'),
      ],
    ])
    const tree = { main: 'main.tex', files }
    const { plan } = markSource(tree, readSource(tree, NO_DEFINITIONS))
    expect(plan.units).toEqual([expect.objectContaining({ marked: true })])
    expect(plan.marks.map((m) => m.kind)).toEqual(expect.arrayContaining(['start', 'end']))
  })
})
