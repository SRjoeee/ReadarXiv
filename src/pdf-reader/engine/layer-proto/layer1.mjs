// src/pdf-reader/engine/layer-proto/layer1.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/layer.js), 2026-10-06, as the instant layer's v0: iteration 1's helpers. Our own code,
// so no licence applies; the provenance is kept so that every number the prototype was approved on traces back to it.
// Unchanged in behaviour: the changes are the module paths, CJK characters written as \u escapes (the English gate),
// imports nothing uses left out, and what is named below. The prototype's own description follows.
//
// Iteration 1's helpers the layer v0 still calls: the median, the units' blocks, the placeholders' classes and plain text,
// the words and their alignment, the CJK line-break marks. Iteration 1's own measuring, fit and paint (pageChars,
// resolvePlaceholders, tokensOf, layoutUnit, paintPart) are left out: v0 is iteration 2 and 3 (layer2.mjs), which
// replaced them.
import { textArgsOf, textless } from '../arg-roles.mjs'

// ---- the units' blocks

export const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
/** a unit's line rectangles as blocks: one per run of lines on one page, in one column, each below the last */
export function blocksOf(rects, pageViews, keep = null) {
  const blocks = []
  let cur = null
  for (const [page, x0, y0, x1, y1] of rects) {
    const prev = cur?.rects.at(-1)
    const pitchSoFar = cur && cur.rects.length > 1 ? cur.rects.at(-2)[4] - prev[4] : prev ? (prev[4] - prev[2]) * 1.4 : 0
    const follows = cur && cur.page === page && x0 < prev[3] && x1 > prev[1] && y1 < prev[4] && prev[2] - y1 < Math.max(pitchSoFar, (prev[4] - prev[2]) * 1.4) * 0.9
    if (!follows) {
      cur = { page, rects: [] }
      blocks.push(cur)
    }
    cur.rects.push([page, x0, y0, x1, y1])
  }
  for (const b of blocks) {
    const rs = b.rects
    b.x0 = Math.min(...rs.map(r => r[1]))
    b.x1 = Math.max(...rs.map(r => r[3]))
    b.top = Math.max(...rs.map(r => r[4]))
    b.bottom = Math.min(...rs.map(r => r[2]))
    b.h = median(rs.map(r => r[4] - r[2]))
    b.pitch = rs.length > 1 ? median(rs.slice(1).map((r, i) => rs[i][4] - r[4])) : b.h * 1.38
    // a first line that starts far in is a line whose start the anchors did not take (a URL, a formula): the whole line
    b.indent = Math.max(0, rs[0][1] - b.x0)
    if (b.indent > 0.25 * (b.x1 - b.x0)) {
      b.indent = 0
      rs[0] = [rs[0][0], b.x0, rs[0][2], rs[0][3], rs[0][4]]
    }
    const centres = rs.map(r => (r[1] + r[3]) / 2)
    const view = pageViews[b.page - 1]
    const pageCentre = view ? (view[0] + view[2]) / 2 : 306
    const widthsVary = Math.max(...rs.map(r => r[3] - r[1])) - Math.min(...rs.map(r => r[3] - r[1])) > 6
    b.centred = rs.length > 1 ? Math.max(...centres) - Math.min(...centres) < 3 && widthsVary : Math.abs(centres[0] - pageCentre) < 3 && b.x1 - b.x0 < 0.8 * (view ? view[2] - view[0] : 612)
  }
  if (!keep?.size) return blocks
  // lines kept as the original's (a formula set apart): each block split around them, its column's width kept
  return blocks.flatMap(b => {
    const runs = []
    let run = null
    b.rects.forEach((r, i) => {
      if (keep.has(`${r[0]}|${r.slice(1).join()}`)) run = null
      else {
        if (!run) {
          run = { ...b, rects: [], indent: i === 0 ? b.indent : 0 }
          runs.push(run)
        }
        run.rects.push(r)
      }
    })
    for (const r of runs) {
      r.top = Math.max(...r.rects.map(x => x[4]))
      r.bottom = Math.min(...r.rects.map(x => x[2]))
    }
    return runs
  })
}

// ---- placeholders

const ZERO = /^(?:\\(?:footnotesize|scriptsize|tiny|small|normalsize|large|Large|LARGE|huge|Huge|selectfont|noindent|hline|centering|raggedright|par|newline|linebreak|bf|it|rm|em|sf|tt|sc|bfseries|itshape|rmfamily|mdseries|upshape|protect|toprule|midrule|bottomrule|smallskip|medskip|bigskip|vfill|hfill|null|relax|arraystretch|clearpage|newpage|thanks|ignorespaces|unskip|xspace|noalign|cr|nobreak|allowbreak|strut)\b\*?|\\(?:v|h)space\*?\{[^}]*\}|\\fontsize\{[^}]*\}\{[^}]*\}|\\label\{[^}]*\}|\\c?line\{[^}]*\}|\\(?:v|h)skip\s*[-\d.]+\s*[a-z]*|\\setlength\{[^}]*\}\{[^}]*\}|\\arraystretch\{[^}]*\}|\\renewcommand.*|\\addlinespace(?:\[[^\]]*\])?|\\includegraphics\*?(?:\[[^\]]*\])?\{[^}]*\})$/
const SPACE = /^(?:~|\\,|\\;|\\:|\\ |\\quad|\\qquad|\\\\(?:\[[^\]]*\])?|\\And|\\and|\\AND|\\enspace|\\thinspace)$/
export const CITE = /^\\(?:cite|citep|citet|citealp|citealt|citeauthor|citeyear|parencite|textcite|autocite)\*?(?:\[[^\]]*\])*\{/
export const NUM = /^\\(?:ref|eqref|autoref|cref|Cref|pageref|footnotemark)\*?(?:\[[^\]]*\])?\{?/
export const DISPLAY = /^(?:\\\[|\$\$|\\begin\{(?:equation|align|gather|multline|eqnarray|displaymath)\*?\})/
export const MACROS = { '\\ie': 'i.e.', '\\eg': 'e.g.', '\\etal': 'et al.', '\\vs': 'vs.', '\\wrt': 'w.r.t.', '\\etc': 'etc.', '\\cf': 'cf.', '\\Eg': 'E.g.', '\\Ie': 'I.e.', '\\aka': 'a.k.a.' }
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' }
const SYMBOLS = { times: '×', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', sim: '∼', simeq: '≃', pm: '±', mp: '∓', infty: '∞', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', mapsto: '↦', sum: 'Σ', prod: 'Π', int: '∫', partial: '∂', nabla: '∇', ldots: '…', cdots: '⋯', dots: '…', mid: '|', langle: '⟨', rangle: '⟩', forall: '∀', exists: '∃', propto: '∝', circ: '∘', star: '⋆', ast: '∗', odot: '⊙', oplus: '⊕', otimes: '⊗', top: '⊤', log: 'log', exp: 'exp', max: 'max', min: 'min', arg: 'arg', softmax: 'softmax', lvert: '|', rvert: '|', lVert: '‖', rVert: '‖', '%': '%', '&': '&', '#': '#', _: '_', $: '$', '{': '{', '}': '}', textless: '<', textgreater: '>', textasciitilde: '~', S: '§', dag: '†', ddag: '‡', copyright: '©', textregistered: '®', degree: '°' }
export const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', T: 'ᵀ', '*': '*', '′': '′' }
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' }
const script = (s, map, mark) => ([...s].every(c => map[c]) ? [...s].map(c => map[c]).join('') : `${mark}${s.length > 1 ? `(${s})` : s}`)

/** a placeholder's source as plain text: the source text the layer falls back to */
export function texToText(src) {
  if (MACROS[src]) return MACROS[src]
  if (SPACE.test(src)) return ' '
  if (ZERO.test(src)) return ''
  if (CITE.test(src)) return '[·]'
  if (/^\\footnotemark\[(\d+)\]/.test(src)) return script(src.match(/\[(\d+)\]/)[1], SUP, '^')
  if (NUM.test(src)) return '?'
  // what is never text goes before the source is drawn: a rule's sizes, a length, keys, a file (arg-roles.mjs)
  if (textless(src)) return ''
  let s = textArgsOf(src).replace(/^\$\$?|\$\$?$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '')
  s = s.replace(/\\(?:url|texttt|textsf|textrm|textbf|textit|emph|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|boldsymbol|bm|ve|vec|operatorname|text|mbox|hbox)\s*\{([^{}]*)\}/g, '\u200b$1\u200b')
  s = s.replace(/\\(?:hat|widehat)\s*\{?(\w)\}?/g, '$1̂').replace(/\\(?:tilde|widetilde)\s*\{?(\w)\}?/g, '$1̃').replace(/\\(?:bar|overline)\s*\{?(\w)\}?/g, '$1̄')
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2').replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
  s = s.replace(/\\([A-Za-z]+|[%&#_${}])/g, (_, name) => GREEK[name] ?? SYMBOLS[name] ?? '')
  s = s.replace(/\^\{([^{}]*)\}|\^(\S)/g, (_, a, b) => script(a ?? b, SUP, '^')).replace(/_\{([^{}]*)\}|_(\S)/g, (_, a, b) => script(a ?? b, SUB, '_'))
  return s.replace(/[{}\u200b]/g, '').replace(/\s+/g, ' ').trim()
}
/** what a placeholder draws as on the original page: nothing, a space, symbols only, or something a reader reads there */
export function phClass(src) {
  if (MACROS[src]) return 'macro'
  if (/^\\color\{[^}]*\}$/.test(src)) return 'zero'
  if (SPACE.test(src)) return 'space'
  if (ZERO.test(src) || textless(src)) return 'zero'
  if (CITE.test(src)) return 'cite'
  if (NUM.test(src)) return 'num'
  if (DISPLAY.test(src)) return 'display'
  // math or a command whose rendering has no letter or digit: drawn from its source, never looked for on the page
  const bare = src.replace(/\\(?:mathcal|mathbf|mathrm|mathbb|ve|vec|boldsymbol|bm|hat|tilde|bar)\b/g, 'x').replace(/\\[A-Za-z]+/g, '').replace(/[^A-Za-z0-9]/g, '')
  return bare ? 'other' : 'symbol'
}
/** a gap's kind by its text: a bracketed list of numbers (one bracket may be on another line) or an author-year, a
 *  number alone, or anything else */
export const gapClass = text => (/^\[?[\d,\s–\-;[\]]+\]?$/.test(text) && /\d/.test(text) && /[[\]]/.test(text) || /^\(.*\d{4}[a-z]?\)$/.test(text) ? 'cite' : /^\(?(?:\d+|[IVXLC]+|[A-Z])(?:[.-](?:\d+|[A-Z]))*[a-z]?\)?$/.test(text) ? 'num' : 'other')

export const norm = ch => ch.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
/** the words of a run of characters, letters and digits only, each with the characters it spans; a word broken by a
 *  hyphen at a line's end is one word */
export function wordsOf(chars, joined = null) {
  const out = []
  let cur = null
  chars.forEach((c, i) => {
    const n = c.sep ? '' : norm(c.ch)
    if (n) {
      if (!cur) {
        cur = { w: '', start: i, end: i }
        out.push(cur)
      }
      cur.w += n
      cur.end = i
    } else if (cur && /[-‐]/.test(c.ch) && chars[i + 1]?.sep && chars[i + 2] && norm(chars[i + 2].ch) && joins(chars, i, cur, joined)) {
      // "con-" at a line's end, where the source has "converging": the word goes on after the line break
      cur.hyphen = true
    } else if (cur?.hyphen && c.sep) {
      // the line break inside such a word
    } else cur = null
  })
  return out
}
/** whether a word hyphenated at a line's end is one word: the source has it whole ("converging"), not as two
 *  ("rewriting-based") */
function joins(chars, i, cur, joined) {
  if (!joined) return true
  let next = ''
  for (let q = i + 2; q < chars.length && norm(chars[q].ch); q++) next += norm(chars[q].ch)
  return joined.has(cur.w + next)
}
/** which of O's words a longest common subsequence with S's takes */
export function lcsMatched(S, O) {
  const n = S.length, m = O.length, W = m + 1
  const L = new Uint16Array((n + 1) * W)
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) L[i * W + j] = S[i - 1] === O[j - 1] ? L[(i - 1) * W + j - 1] + 1 : Math.max(L[(i - 1) * W + j], L[i * W + j - 1])
  const matched = new Uint8Array(m)
  let i = n, j = m
  while (i > 0 && j > 0) {
    if (S[i - 1] === O[j - 1] && L[i * W + j] === L[(i - 1) * W + j - 1] + 1) { matched[j - 1] = 1; i--; j-- }
    else if (L[i * W + j - 1] >= L[(i - 1) * W + j]) j--
    else i--
  }
  return matched
}

// ---- the line-break marks

export const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/
export const NO_START = /^[\u3001\u3002\uFF0C\uFF0E,.\uFF01\uFF1F!?\uFF09)\]\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017”’\uFF1A:\uFF1B;\u30FB\u30FC\u301C…\u3005\u309D\u309E\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6%\uFF05]/
export const NO_END = /[\uFF08([\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016“‘]$/
