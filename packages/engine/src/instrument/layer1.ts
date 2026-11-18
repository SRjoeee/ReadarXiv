// src/pdf-reader/engine/layer-proto/layer1.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/layer.js), 2026-10-06, as the instant layer's v0: iteration 1's helpers. Our own code,
// so no licence applies; the provenance is kept so that every number the prototype was approved on traces back to it.
// Unchanged in behaviour: the changes are the module paths, CJK characters written as \u escapes (the English gate),
// imports nothing uses left out, and what is named below. The prototype's own description follows.
//
// Iteration 1's helpers the layer v0 still called: the median, the units' blocks, the placeholders' classes and plain text,
// the words and their alignment, the CJK line-break marks; of them the placeholders' alone are read since the cut-over
// (instrument.ts). Iteration 1's own measuring, fit and paint (pageChars,
// resolvePlaceholders, tokensOf, layoutUnit, paintPart) are left out: v0 is iteration 2 and 3 (layer2.mjs), which
// replaced them.
import { textArgsOf, textless } from '../source/arg-roles.ts'

// ---- placeholders

// (step 3: a table's rules, \specialrule and \cmidrule, and a strut, \rule of no width, are no text either: v0 found no
// rendering for them and drew their arguments as text, "1pt-1pt0pt 0pt2.2ex" in 1706.03762's table cells; an image's
// file may be braced twice, \includegraphics[width=5cm]{{berimbau.jpg}} in 2307.16209)
// (the control sequences TeX and the kernel define to set no ink — \relax, \noindent, \indent, \leavevmode, \nobreak, \newline, \@, \/ and
// the like — are not listed here: rules/tex-kernel.mjs is their one table, read through the role table's textless below)
/** \rule's call, which the role table's textless takes in but v0 reads itself (ZERO: a strut nothing, a bar looked
 *  for), as the layout maker leaves it to TeX (layout/marks.mjs RULE, the same) */
const RULE = /^\s*\\rule\b/
/** what draws as nothing: TeX's grouping (\\begingroup, \\endgroup, \\bgroup, \\egroup: a group opened or closed, never ink;
 *  read as a paper's macro of unknown ink, 2608.25210v2's VLDB block, its \\endgroup after the unit's end mark, was a piece
 *  whose ink was not found and its unit unproven), a size or a face switch, a rule of a table, space, a label… */
const ZERO =
  /^(?:\\(?:begingroup|endgroup|bgroup|egroup|footnotesize|scriptsize|tiny|small|normalsize|large|Large|LARGE|huge|Huge|selectfont|hline|centering|raggedright|par|bf|it|rm|em|sf|tt|sc|bfseries|itshape|rmfamily|mdseries|upshape|protect|toprule|midrule|bottomrule|smallskip|medskip|bigskip|vfill|hfill|null|arraystretch|clearpage|newpage|thanks|xspace|noalign|cr|strut)\b\*?|\\(?:v|h)space\*?\{[^}]*\}|\\fontsize\{[^}]*\}\{[^}]*\}|\\label\{[^}]*\}|\\c?line\{[^}]*\}|\\(?:v|h)skip\s*[-\d.]+\s*[a-z]*|\\setlength\{[^}]*\}\{[^}]*\}|\\arraystretch\{[^}]*\}|\\renewcommand.*|\\addlinespace(?:\[[^\]]*\])?|\\specialrule\{[^}]*\}\{[^}]*\}\{[^}]*\}|\\cmidrule(?:\[[^\]]*\])?(?:\([^)]*\))?\{[^}]*\}|\\rule(?:\[[^\]]*\])?\{0(?:\.0*)?[a-z]*\}\{[^}]*\}|\\arrayrulecolor\{[^}]*\}|\\includegraphics\*?(?:\[[^\]]*\])?\{(?:[^{}]|\{[^{}]*\})*\})$/
// (a control space is a backslash and any white space, a tab or a line's end as well as a space: rules/tex-kernel.mjs counts
// all three, and \<newline> read as 'zero' drew nothing where the original has a space: "vs.\<newline>answer")
const SPACE = /^(?:~|\\,|\\;|\\:|\\\s|\\quad|\\qquad|\\\\(?:\[[^\]]*\])?|\\And|\\and|\\AND|\\enspace|\\thinspace)$/
const CITE =
  /^\\(?:cite|citep|citet|citealp|citealt|citeauthor|citeyear|parencite|textcite|autocite)\*?(?:\[[^\]]*\])*\{/
const NUM = /^\\(?:ref|eqref|autoref|cref|Cref|pageref|footnotemark)\*?(?:\[[^\]]*\])?\{?/
// (step 3: the engine's displayed environments, layout/marks.mjs DISPLAY's: v0 knew six, and read a subequations, an
// alignat or a flalign display as an inline formula, drawn as its source's or its page's text in the line, too long for
// any of the unit's lines and clipped: 2307.16209's units 74 and 240)
const DISPLAY =
  /^(?:\\\[|\$\$|\\begin\s*\{(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations)\*?\})/
const MACROS: Readonly<Record<string, string>> = {
  '\\ie': 'i.e.',
  '\\eg': 'e.g.',
  '\\etal': 'et al.',
  '\\vs': 'vs.',
  '\\wrt': 'w.r.t.',
  '\\etc': 'etc.',
  '\\cf': 'cf.',
  '\\Eg': 'E.g.',
  '\\Ie': 'I.e.',
  '\\aka': 'a.k.a.',
}
const GREEK: Readonly<Record<string, string>> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
}
const SYMBOLS: Readonly<Record<string, string>> = {
  times: '×',
  cdot: '·',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  sim: '∼',
  simeq: '≃',
  pm: '±',
  mp: '∓',
  infty: '∞',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  cup: '∪',
  cap: '∩',
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftrightarrow: '⇔',
  mapsto: '↦',
  sum: 'Σ',
  prod: 'Π',
  int: '∫',
  partial: '∂',
  nabla: '∇',
  ldots: '…',
  cdots: '⋯',
  dots: '…',
  mid: '|',
  langle: '⟨',
  rangle: '⟩',
  forall: '∀',
  exists: '∃',
  propto: '∝',
  circ: '∘',
  star: '⋆',
  ast: '∗',
  odot: '⊙',
  oplus: '⊕',
  otimes: '⊗',
  top: '⊤',
  log: 'log',
  exp: 'exp',
  max: 'max',
  min: 'min',
  arg: 'arg',
  softmax: 'softmax',
  lvert: '|',
  rvert: '|',
  lVert: '‖',
  rVert: '‖',
  '%': '%',
  '&': '&',
  '#': '#',
  _: '_',
  $: '$',
  '{': '{',
  '}': '}',
  textless: '<',
  textgreater: '>',
  textasciitilde: '~',
  S: '§',
  dag: '†',
  ddag: '‡',
  copyright: '©',
  textregistered: '®',
  degree: '°',
}
const SUP: Readonly<Record<string, string>> = {
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
  T: 'ᵀ',
  '*': '*',
  '′': '′',
}
const SUB: Readonly<Record<string, string>> = {
  0: '₀',
  1: '₁',
  2: '₂',
  3: '₃',
  4: '₄',
  5: '₅',
  6: '₆',
  7: '₇',
  8: '₈',
  9: '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
}
const script = (s: string, map: Readonly<Record<string, string>>, mark: string) =>
  [...s].every((c) => map[c]) ? [...s].map((c) => map[c]).join('') : `${mark}${s.length > 1 ? `(${s})` : s}`

/** a placeholder's source as plain text: the source text the layer falls back to */
export function texToText(src: string): string {
  if (MACROS[src]) return MACROS[src]
  if (SPACE.test(src)) return ' '
  if (ZERO.test(src)) return ''
  if (CITE.test(src)) return '[·]'
  if (/^\\footnotemark\[(\d+)\]/.test(src)) return script(src.match(/\[(\d+)\]/)![1]!, SUP, '^')
  if (NUM.test(src)) return '?'
  // what is never text goes before the source is drawn (arg-roles.mjs): a command proven to set no letters draws nothing
  // (textless: a table's rule, space, a length, a definition), any other keeps only its arguments that may be text
  // (textArgsOf: a rule's sizes, keys, a file, a label go). A \rule is v0's own (ZERO): a strut nothing, a bar in a
  // line looked for on the page and cropped, as the layout maker asks TeX about it (layout/marks.mjs RULE)
  if (textless(src) && !RULE.test(src)) return ''
  // a math shift at either end goes, not an escaped dollar ending the source (\$ drew as "\": 2026-10-07)
  let s = textArgsOf(src)
    .replace(/^\$\$?|(?<!\\)\$\$?$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .replace(/^\\\[|\\\]$/g, '')
  // TeX's spacing inside a source, a space or nothing: a control space, a thin, medium or thick space, a tie, a line
  // break (a source's "D=l^μ∂_μ,\ Δ" drew its "\": 2307.16209)
  s = s.replace(/\\\\(?:\[[^\]]*\])?|\\[ ,;:]|(?<!\\)~/g, ' ').replace(/\\!/g, '')
  s = s.replace(
    /\\(?:url|texttt|textsf|textrm|textbf|textit|emph|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|boldsymbol|bm|ve|vec|operatorname|text|mbox|hbox)\s*\{([^{}]*)\}/g,
    '\u200b$1\u200b',
  )
  s = s
    .replace(/\\(?:hat|widehat)\s*\{?(\w)\}?/g, '$1̂')
    .replace(/\\(?:tilde|widetilde)\s*\{?(\w)\}?/g, '$1̃')
    .replace(/\\(?:bar|overline)\s*\{?(\w)\}?/g, '$1̄')
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2').replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
  // an escaped brace is the page's brace, kept from the grouping braces that go below (\{a\} drew as "a")
  s = s.replace(/\\([A-Za-z]+|[%&#_${}])/g, (_: string, name: string) =>
    name === '{' ? '\uE000' : name === '}' ? '\uE001' : (GREEK[name] ?? SYMBOLS[name] ?? ''),
  )
  s = s
    .replace(/\^\{([^{}]*)\}|\^(\S)/g, (_: string, a: string | undefined, b: string | undefined) =>
      script((a ?? b)!, SUP, '^'),
    )
    .replace(/_\{([^{}]*)\}|_(\S)/g, (_: string, a: string | undefined, b: string | undefined) =>
      script((a ?? b)!, SUB, '_'),
    )
  return s
    .replace(/[{}\u200b]/g, '')
    .replace(/\uE000/g, '{')
    .replace(/\uE001/g, '}')
    .replace(/\s+/g, ' ')
    .trim()
}
/** what a placeholder draws as on the original page: nothing, a space, symbols only, or something a reader reads there */
export function phClass(src: string) {
  if (MACROS[src]) return 'macro'
  if (/^\\color\{[^}]*\}$/.test(src)) return 'zero'
  if (SPACE.test(src)) return 'space'
  if (ZERO.test(src) || (textless(src) && !RULE.test(src))) return 'zero'
  if (CITE.test(src)) return 'cite'
  if (NUM.test(src)) return 'num'
  if (DISPLAY.test(src)) return 'display'
  // math or a command whose rendering has no letter or digit: drawn from its source, never looked for on the page
  const bare = src
    .replace(/\\(?:mathcal|mathbf|mathrm|mathbb|ve|vec|boldsymbol|bm|hat|tilde|bar)\b/g, 'x')
    .replace(/\\[A-Za-z]+/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
  return bare ? 'other' : 'symbol'
}
