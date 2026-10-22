import { describe, expect, it } from 'vitest'
import { textPieceOf } from '@/pdf-reader/engine/rules/text-piece.mjs'

// rules/text-piece.mjs: which piece is plain text, whose characters the page holds as they were written. The layer reads it for
// a formula's class (layer2.mjs formulaOf: a text piece is no formula) and the maker for what a row's segments must spell
// (layout/make.mjs). Its one direct test sat with the layer's own proof of a LOST piece, which went (the layer draws only from
// the layout file); the rule stays.

describe('a text piece', () => {
  it('is a code or URL mark or a plain-text source, its argument literal', () => {
    const yes = ['\\texttt{gemini 3 flash}', '\\url{http://x.org/a_b#c}', '\\path{a/b}', '\\verb|x y|', '\\lstinline!a!', '\\lstinline{a}', 'qianli@nwpu.edu.cn', '\\texttt{a--b}']
    expect(yes.map(s => textPieceOf(s)?.text)).toEqual(['gemini 3 flash', 'http://x.org/a_b#c', 'a/b', 'x y', 'a', 'a', 'qianli@nwpu.edu.cn', 'a--b'])
  })

  it('is none of a citation, a reference, a mark, a formula or a macro', () => {
    // (TeX's own marks; an argument with a command, a group, math, a tie, a script outside verbatim; a ligature or OT1's
    // substitute outside the typewriter face; \verb*, which shows its spaces; options a listing may restyle by)
    const no = ['\\cite{x}', '\\ref{x}', '\\eqref{x}', '\\footnotemark[1]', '$x$', '\\begin{equation}x\\end{equation}', '\\ours{}', '\\textsuperscript{a}', '\\href{http://x}{y}',
      '\\texttt{a\\_b}', '\\texttt{{a}}', '\\texttt{a~b}', '\\texttt{$x$}', '\\texttt{a_b}', '\\texttt{ }', '\\url{a~b}', 'a--b', "``a''", 'a<b', 'a"b', '\\verb*|a b|', '\\lstinline[language=C]{a}']
    expect(no.filter(s => textPieceOf(s) !== null)).toEqual([])
  })

  it('is none where the source is none', () => {
    expect([textPieceOf(null), textPieceOf(undefined), textPieceOf('')]).toEqual([null, null, null])
  })
})
