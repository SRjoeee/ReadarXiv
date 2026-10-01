// How much room a translation takes, from its text alone (records/typesetting.md in experiments/pdf-bilingual). Widths
// in em of the running text's size: the paper's Latin face and the Cyrillic face the T2A design gives it, as TeX sets
// them (faces.mjs, measured under pdfLaTeX T1/T2A at 10 pt); CJK characters an em each, with xeCJK's ways with
// punctuation, spaces and the glue beside Latin (measured under XeLaTeX with the reader's Fandol, IPAex and UnBatang).
// Atoms — inline math, citations, references, a paper's name macros — are the same in the original and the
// translation, so only roughly. No compile, no font file: tables and arithmetic.
import { lastTexLog } from '../latex-front.mjs'
import { utf8 } from '../mt.mjs'
import { FACES } from './faces.mjs'

const TIMES = /^(ptm|qtm|ntx|txr|tempora|nimbus|times)/i
const LIBERTINE = /libertine/i

/** A stretch of academic English that the font probe sets in the paper's body face at its body size (WIDTH_PROBE): its
 *  width against the table's gives the face's own scale — Computer Modern's optical sizes (cmr12 is narrower for its
 *  size than cmr10), a face the tables do not have, a sans-serif body. The probe compiles anyway: nothing is added */
export const WIDTH_SAMPLE = 'The results show that the proposed method improves the accuracy of the model on all benchmarks, while the training cost remains comparable to that of the baseline. We further analyze the effect of each component, and find that attention contributes most of the gain (see Section 4 and Table 2).'
/** The sizes of the size probe: an alphabet's range, below the body size (type.mjs DESIGN) */
export const SIZE_GRID = [0.9, 0.91, 0.92, 0.93, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99]
/**
 * TeX for how wide the body face sets below its own size. A face with fixed sizes replaces a size between them by its
 * nearest: Computer Modern has 9, 10, 10.95 and 12 pt and nothing between, so 0.96 of an 11 pt body came out at 10.95 pt,
 * its full width, and a translation predicted at the height of the original's ran 7 % long (2608.02785). Its smaller
 * sizes, and Latin Modern's, are drawn wider for their size. So the sample at each size of the grid, its width against
 * the body's: the lines a size takes. Their height is the size asked, whatever face comes (\\fontsize sets the leading
 * from it); a face's em is no measure of its size (Latin Modern's 9 pt design has an em of 9.25 pt). The font probe
 * compiles anyway; a compile of the translation carries it too, in the faces the translation is set in (Russian's T2A)
 */
export const SIZE_PROBE = `\\begingroup\\normalfont\\normalsize\\edef\\axtsb{\\csname f@size\\endcsname}\\setbox0\\hbox{${WIDTH_SAMPLE}}\\edef\\axtsw{\\the\\wd0}${SIZE_GRID.map(f => `\\fontsize{\\fpeval{${f}*\\axtsb}}{12pt}\\selectfont\\setbox0\\hbox{${WIDTH_SAMPLE}}\\typeout{AXT-SIZE ${f} \\the\\wd0 \\space\\axtsw}`).join('')}\\endgroup\n`
/** TeX for the font probe's body: the sample's width, the body size and the column's width, then the sizes (SIZE_PROBE) */
export const WIDTH_PROBE = `\\setbox0\\hbox{\\normalfont\\normalsize ${WIDTH_SAMPLE}}\\typeout{AXT-WIDTH \\the\\wd0 \\space\\csname f@size\\endcsname\\space\\the\\columnwidth}\n${SIZE_PROBE}`
/** what WIDTH_PROBE wrote: the sample's width in pt, the body size in pt, the column's width in pt; or null */
export function readWidthProbe(log) {
  // a box's width then a number: TeX takes the space after the width's last digit as the end of the number
  const m = /^AXT-WIDTH ([\d.]+)pt\s*([\d.]+)\s+([\d.]+)pt/m.exec(lastTexLog(log))
  return m ? { wd: Number(m[1]), size: Number(m[2]), columnwidth: Number(m[3]) } : null
}
/** what SIZE_PROBE wrote: each size asked, as { size, h } — the size against the body's and the sample's width against
 *  the body's — smallest first, the body's own last; or null */
export function readSizeProbe(log) {
  const out = []
  for (const m of lastTexLog(log).matchAll(/^AXT-SIZE ([\d.]+) ([\d.]+)pt\s*([\d.]+)pt/gm)) {
    const size = Number(m[1]), h = Number(m[2]) / Number(m[3])
    if (size > 0 && size < 1 && h > 0) out.push({ size, h })
  }
  return out.length ? [...out.sort((a, b) => a.size - b.size), { size: 1, h: 1 }] : null
}

// a face scaled by k, made once per face and k
const scaled = new WeakMap()
const scaleFace = (face, k) => {
  const byK = scaled.get(face) ?? scaled.set(face, new Map()).get(face)
  if (!byK.has(k)) byK.set(k, { space: face.space * k, w: Object.fromEntries(Object.entries(face.w).map(([c, v]) => [c, v * k])) })
  return byK.get(k)
}

/** the paper's Latin face, from the font probe's roman family (Times-like, Libertine, else Computer Modern, the face most
 *  arXiv papers use), and the Cyrillic face scripts.mjs's T2A design gives that family (Tempora for Times, cmr else);
 *  with the width probe's reading, both scaled to the face the paper sets at its size */
export function facesOf(fonts, probe = null) {
  const rm = String(fonts?.rm ?? fonts?.body ?? '')
  const latin = LIBERTINE.test(rm) ? FACES['T1/LinuxLibertineT-TLF'] : TIMES.test(rm) ? FACES['T1/ptm'] : FACES['T1/cmr']
  const cyrillic = TIMES.test(rm) ? FACES['T2A/Tempora-TLF'] : FACES['T2A/cmr']
  if (!probe?.wd || !probe?.size) return { latin, cyrillic }
  const k = probe.wd / (probe.size * textWidth(WIDTH_SAMPLE, { latin, cyrillic }, { script: 'Latn' }))
  return { latin: scaleFace(latin, k), cyrillic: scaleFace(cyrillic, k), k }
}

const CJK_SCRIPTS = new Set(['Hans', 'Hant', 'Jpan', 'Kore'])
// ideographs, kana, Hangul, fullwidth letters and digits: an em each
const WIDE = /[\u1100-\u11ff\u2e80-\u2fdf\u3040-\u30ff\u3130-\u318f\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7af\uf900-\ufaff\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/
// fullwidth punctuation: an em alone, closed up to half beside another (a full stop then a closing bracket take 1.5 em
// together, measured); curly quotes are xeCJK's
// in Chinese and Japanese, the Latin face's in Korean
const PUNCT = /[\u3000-\u303f\u30fb\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]/
const QUOTES = /[‘’“”]/
// TeX's input ligatures, as the glyphs they give
const LIGATURES = [[/---/g, '—'], [/--/g, '–'], [/``|''/g, '"']]

/**
 * A text's width in em. `script` the text's (the ISO 15924 code scripts.mjs uses); `cjk` the scale of the CJK face
 * and the tracking between CJK characters (xeCJK's CJKglue), as a fit sets them. Between CJK characters a space is
 * dropped (Korean keeps it: CJKspace); beside Latin text or a digit it gives way to xeCJK's glue, a quarter em, which
 * is there without a space too.
 */
export function textWidth(s, faces, { script = 'Latn', cjk = {} } = {}) {
  const { scale = 1, track = 0 } = cjk
  const east = CJK_SCRIPTS.has(script), spaced = script === 'Kore'
  const letters = script === 'Cyrl' ? faces.cyrillic : faces.latin
  const other = c => faces.latin.w[c] ?? faces.cyrillic.w[c] ?? 0.5
  let text = s
  for (const [re, to] of LIGATURES) text = text.replace(re, to)
  const chars = [...text]
  const kind = c => (!c ? null : /\s/.test(c) ? 'space' : east && WIDE.test(c) ? 'wide' : east && (PUNCT.test(c) || (!spaced && QUOTES.test(c))) ? 'punct' : 'latin')
  // xeCJK's glue stands between a CJK character and a Latin letter or digit, not a Latin mark (한국어, 텍스트. = 67.5 pt)
  const alnum = c => /[\p{L}\p{N}]/u.test(c)
  let w = 0, prev = null, last = null, space = false
  for (let k = 0; k < chars.length; k++) {
    const c = chars[k], now = kind(c)
    if (now === 'space') { space = true; continue }
    if (now === 'wide') {
      if (prev === 'latin') w += alnum(last) ? 0.25 : space ? letters.space : 0
      else if (prev === 'wide') w += space && spaced ? letters.space : track
      w += scale
    } else if (now === 'punct') {
      const next = chars.slice(k + 1).find(x => kind(x) !== 'space')
      w += (prev === 'punct' || kind(next) === 'punct' ? 0.75 : 1) * scale
    } else {
      if (prev === 'wide') w += alnum(c) ? 0.25 : space && spaced ? letters.space : 0
      else if ((prev === 'latin' || prev === null) && space && k > 0) w += letters.space
      w += (script === 'Cyrl' ? letters.w[c] : undefined) ?? other(c)
    }
    prev = now; last = c; space = false
  }
  if (space && prev === 'latin') w += letters.space
  return w
}

const INVISIBLE = new Set(['label', 'noindent', 'indent', 'vspace', 'hspace', 'midrule', 'toprule', 'bottomrule', 'cmidrule', 'hline', 'cline', 'rowcolor', 'cellcolor', 'allowbreak', 'linebreak', 'nolinebreak', 'newline', 'par', 'smallskip', 'medskip', 'bigskip', 'centering', 'raggedright', 'raggedleft', 'phantomsection', 'index', 'nopagebreak', 'pagebreak', 'protect', 'relax', 'leavevmode', 'color', 'selectfont', 'normalfont', 'small', 'footnotesize', 'scriptsize', 'tiny', 'large', 'Large', 'normalsize', 'xspace', 'unskip', 'ignorespaces', 'hfill', 'vfill', 'strut', 'null', 'bf', 'it', 'em', 'rm', 'sf', 'tt', 'sc'])
const SPACES = { quad: 1, qquad: 2, enspace: 0.5, thinspace: 0.17, enskip: 0.5 }
const SYMBOLS = { S: 0.44, P: 0.54, dag: 0.44, ddag: 0.44, ldots: 1, dots: 1, cdots: 1, textendash: 0.5, textemdash: 1, textbullet: 0.35, copyright: 0.75, textregistered: 0.75, texttrademark: 0.98, textdegree: 0.4, textbackslash: 0.5, LaTeX: 2.2, TeX: 1.5, footnotemark: 0.3 }
const CITES = /^(cite|citep|citet|citealp|citealt|citeauthor|citeyear|citeyearpar|parencite|textcite|autocite|citenum|Citep|Citet)$/
const arg = s => s.match(/\{([^{}]*)\}\s*$/)?.[1] ?? ''

/** inline math's width, roughly: a letter half an em, a command a symbol, an operator with its spaces, scripts smaller */
function mathWidth(src) {
  let m = src.replace(/^\$\$?|\$\$?$|^\\\(|\\\)$|^\\ensuremath\s*/g, '').replace(/\\(label|tag)\{[^}]*\}/g, '')
  m = m.replace(/\\(mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|mathscr|boldsymbol|bm|text|textrm|textbf|textit|textsf|operatorname|mbox|hat|bar|tilde|vec|dot|ddot|widehat|widetilde|overline|underline|mathring|check|breve)\s*\{/g, '{')
  let w = 0, script = 0, depth = 0
  const scriptAt = []
  for (let k = 0; k < m.length; k++) {
    const c = m[k], f = script ? 0.7 : 1
    if (c === '\\') {
      const name = m.slice(k + 1).match(/^[a-zA-Z]+|^./)?.[0] ?? ''
      k += name.length
      const sp = { ',': 0.17, ';': 0.28, ':': 0.22, '!': -0.17, ' ': 0.33, quad: 1, qquad: 2 }[name]
      if (sp != null) w += sp
      else if (/^(left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr|displaystyle|textstyle|scriptstyle|limits|nolimits|frac|dfrac|tfrac|sqrt|mathop|mathrel|mathbin|mathord|nonumber|notag)$/.test(name)) { /* structure */ }
      else if (/^(sum|int|prod|oint|bigcup|bigcap)$/.test(name)) w += 1 * f
      else if (/^(le|leq|ge|geq|neq|ne|approx|sim|simeq|equiv|in|notin|subset|subseteq|supset|to|rightarrow|leftarrow|mapsto|times|cdot|pm|mp|cup|cap|wedge|vee|otimes|oplus|circ|ll|gg|propto|coloneqq|mid)$/.test(name)) w += script ? 0.6 : 1.2
      else w += 0.6 * f
      if (script && depth === scriptAt.at(-1) - 1) { script--; scriptAt.pop() }
      continue
    }
    if (c === '_' || c === '^') { script++; scriptAt.push(depth + 1); continue }
    if (c === '{') { depth++; continue }
    if (c === '}') { depth--; if (script && depth === scriptAt.at(-1) - 1) { script--; scriptAt.pop() } continue }
    if (/\s/.test(c)) continue
    if (/[+\-=<>]/.test(c)) w += script ? 0.55 : 1.2
    else if (/[,;]/.test(c)) w += 0.45 * f
    else if (/[()[\]|/]/.test(c)) w += 0.39 * f
    else w += 0.5 * f
    // a single character after _ or ^, with no brace, is the whole script
    if (script && depth === scriptAt.at(-1) - 1) { script--; scriptAt.pop() }
  }
  return Math.max(w, 0.3)
}

/**
 * An atom's width in em — what the translation keeps as it is. `citeStyle` numeric ([3, 4]), super (raised numbers) or
 * author-year ((Smith et al., 2020)), from citeStyleOf. An unknown command with no argument is taken for a paper's name macro.
 */
export function atomWidth(src, faces, { citeStyle = 'numeric' } = {}) {
  const s = String(src ?? '').trim()
  if (!s) return 0
  if (/^(\$|\\\(|\\ensuremath)/.test(s)) return mathWidth(s)
  if (s === '~') return faces.latin.space
  const cmd = s.match(/^\\([a-zA-Z@]+)\*?/)?.[1]
  if (!cmd) {
    if (/^\\["'`^~=.uvHckrbd]/.test(s)) return 0.5
    if (/^\\[%&#_$]/.test(s)) return { '%': 0.83, '&': 0.78, '#': 0.5, _: 0.5, $: 0.5 }[s[1]]
    if (/^\\[,;: ]/.test(s)) return faces.latin.space / 2
    return /^\\\\/.test(s) ? 0 : 0.5
  }
  if (INVISIBLE.has(cmd)) return 0
  if (SPACES[cmd] != null) return SPACES[cmd]
  if (SYMBOLS[cmd] != null) return SYMBOLS[cmd]
  if (CITES.test(cmd)) {
    const keys = (s.match(/\{([^}]*)\}\s*$/)?.[1] ?? '').split(',').filter(k => k.trim()).length || 1
    if (citeStyle === 'super') return /citeauthor/.test(cmd) ? 5 * keys : 0.1 + 0.45 * keys
    if (citeStyle === 'numeric') return /citeauthor/.test(cmd) ? 5 * keys : 0.6 + 1.2 * keys
    return { citet: 8.5, textcite: 8.5, Citet: 8.5, citeauthor: 6, citeyear: 2.5, citeyearpar: 3, citealp: 7.5, citealt: 7.5 }[cmd] * keys || 1 + 8 * keys
  }
  if (/^(ref|pageref)$/.test(cmd)) return 0.75
  if (cmd === 'eqref') return 1.5
  if (/^(cref|Cref|autoref|Autoref|fref|Fref|vref|nameref)$/.test(cmd)) return 4.5
  if (/^(texttt|verb|url|path|nolinkurl)$/.test(cmd)) return 0.525 * [...arg(s).replace(/\\/g, '')].length
  if (cmd === 'href') return textWidth(arg(s), faces)
  if (/^(textsuperscript|textsubscript)$/.test(cmd)) return 0.35 * [...arg(s)].length
  if (/\{/.test(s)) return textWidth(arg(s).replace(/\\[a-zA-Z]+/g, ''), faces)
  return 3.5
}

/**
 * The paper's citation style: natbib's super or numbers, biblatex's style, a class that cites by superscript (Nature's
 * templates), a \bibliographystyle known to be one or the other; natbib with none of these, what its bibliography's
 * items carry — natbib's author and year in brackets (\bibitem[Smith et~al.(2020)]{…}), or only a key. `text` the
 * preamble and style files; `bbl` the paper's .bbl, when it has one. Numeric when nothing says otherwise.
 */
const NUMERIC_STYLES = /^(plain|unsrt|abbrv|alpha|ieeetr|IEEEtran\w*|acm|ACM-Reference-Format|splncs\w*|siam\w*|amsplain|amsalpha|elsarticle-num\w*|spmpsci|spphys|apsrev\w*|unsrtnat|abbrvnat|vancouver|naturemag|nature|sn-mathphys\w*|sn-standardnature|model\d-num-names)$/i
const AUTHOR_YEAR_STYLES = /^(plainnat|apalike|apa\w*|chicago\w*|agsm|named|harvard|iclr\w*|icml\w*|neurips\w*|aaai-named|acl_natbib|acl|elsarticle-harv|spbasic|sn-basic|sn-apa|model\d-names|jmlr|tmlr)$/i
export function citeStyleOf(text, bbl = '') {
  const natbib = [...text.matchAll(/\\(?:usepackage|RequirePackage)\s*\[([^\]]*)\]\s*\{natbib\}|\\PassOptionsToPackage\{([^}]*)\}\{natbib\}|\\setcitestyle\{([^}]*)\}/g)].map(m => m[1] ?? m[2] ?? m[3]).join(',')
  if (/\bsuper\b/.test(natbib) || /\\documentclass\s*(\[[^\]]*\])?\s*\{(wlscirep|nature|naturemag|sn-nature)\}/.test(text)) return 'super'
  if (/\bnumbers\b/.test(natbib)) return 'numeric'
  const biblatex = /\\usepackage\s*\[([^\]]*)\]\s*\{biblatex\}/.exec(text)?.[1]
  if (biblatex) return /style=(authoryear|apa|chicago|mla)/.test(biblatex) ? 'author-year' : 'numeric'
  const style = /\\bibliographystyle\{([^}]*)\}/.exec(text)?.[1]?.trim()
  if (style && NUMERIC_STYLES.test(style)) return 'numeric'
  if (style && AUTHOR_YEAR_STYLES.test(style)) return 'author-year'
  if (/\\(usepackage|RequirePackage)(\[[^\]]*\])?\s*\{natbib\}/.test(text)) {
    if (/\\bibitem\s*\[[^\]]*\(\s*\d{4}/.test(bbl)) return 'author-year'
    if (/\\bibitem\s*\{/.test(bbl)) return 'numeric'
    return style ? 'numeric' : 'author-year'
  }
  return 'numeric'
}

/** a unit's width in em, as the original or a translation has its pieces: text (a translated piece in the target's
 *  script, a kept one in the paper's), atoms, and for a nested note only its mark. Beside CJK text an atom also gets
 *  xeCJK's glue, a quarter em each side */
export function piecesWidth(pieces, faces, ctx = {}) {
  const east = CJK_SCRIPTS.has(ctx.script ?? 'Latn')
  let w = 0
  for (const p of pieces) {
    if (p.t === 'text') w += textWidth(p.tr ? p.s : utf8(p.s), faces, p.tr ? ctx : { script: 'Latn' })
    else if (p.t === 'ph') { const a = atomWidth(p.src, faces, ctx); w += a + (east && a > 0 ? 0.4 : 0) }
    else if (p.t === 'nested') w += 0.3
  }
  return w
}

/** the lines a text of width `w` takes in a measure of `cap` em: at least one, and on average half a last line */
export const linesAt = (w, cap) => Math.max(1, w / cap + 0.5)

const DISPLAY = /^(\$\$|\\\[|\\begin\s*\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat|dmath))/
const median = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null }

/**
 * A translation's units as the solver takes them (type.mjs): each translated unit whose original the line
 * probes counted, with no display inside it, with its original's lines and leading, the capacity of the original's
 * lines in em — the ruler: the unit's own when it has three lines or more, else the median of its paper's units of
 * its kind, else of all — and its translation's width at a type. A CJK width is linear in the face's scale and the
 * tracking (wide characters and marks scale, gaps between wide characters track, the rest stays), so three widths
 * give it for every type: a solver's step costs nothing.
 * `units` the paper's; `translated` Map index → pieces; `lines` readLines of the original's log; `fonts` the probe's;
 * `probe` the width probe's reading (readWidthProbe), when there is one.
 */
export function measureUnits({ units, translated, lines, fonts, probe = null, citeStyle = 'numeric', script }) {
  const faces = facesOf(fonts, probe), ctx = { script, citeStyle }
  const out = []
  units.forEach((u, i) => {
    const pieces = translated.get(i), o = lines.get(i)
    if (!pieces || !o || !pieces.some(p => p.tr) || u.pieces.some(p => p.t === 'ph' && DISPLAY.test(p.src ?? ''))) return
    const at = cjk => piecesWidth(pieces, faces, { ...ctx, cjk })
    const w10 = at({ scale: 1, track: 0 }), a = at({ scale: 2, track: 0 }) - w10, g = at({ scale: 1, track: 1 }) - w10
    out.push({ i, kind: u.kind, lo: o.lines, bs: o.bs, wo: piecesWidth(u.pieces, faces, { script: 'Latn', citeStyle }), wt: w10, a, g, c: w10 - a })
  })
  const own = out.map(x => (x.lo >= 3 && x.wo > 0 ? x.wo / (x.lo - 0.5) : null))
  const all = median(own), byKind = new Map()
  for (const kind of new Set(out.map(x => x.kind))) byKind.set(kind, median(out.map((x, k) => (x.kind === kind ? own[k] : null))))
  return out.map((x, k) => ({ ...x, cap: own[k] ?? byKind.get(x.kind) ?? all, width: ({ scale = 1, track = 0 } = {}) => x.a * scale + x.g * track + x.c })).filter(x => x.cap)
}
