// Cases for density.mjs: widths as TeX sets them (measured 2026-09-30 with the faces and xeCJK settings the reader uses:
// scratch probes under pdfLaTeX T1/T2A and XeLaTeX + xeCJK, 10 pt), atoms, lines. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/density-cases.mjs
import { atomWidth, citeStyleOf, facesOf, linesAt, piecesWidth, readSizeProbe, readWidthProbe, SIZE_PROBE, textWidth, WIDTH_PROBE, WIDTH_SAMPLE } from './density.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps

const times = facesOf({ rm: 'ptm' }), cm = facesOf({ rm: 'cmr' }), libertine = facesOf({ rm: 'LinuxLibertineT-TLF' })
check('faces by family: Times-like, CM-like, Libertine', times.latin.space === 0.25 && cm.latin.space === 0.3333 && libertine.latin.w.M === 0.839 && facesOf({ rm: 'ntxtlf' }).latin === times.latin && facesOf({ rm: 'lmr' }).latin === cm.latin && facesOf(null).latin === cm.latin)
check('Cyrillic faces as the T2A design gives them', times.cyrillic.space === 0.25 && cm.cyrillic.space === 0.3333 && facesOf({ rm: 'txr' }).cyrillic === times.cyrillic)

// the paper's own face at its own size, measured by the font probe: its widths scaled to it (Computer Modern's optical
// sizes, a face not in the tables)
const sample = textWidth(WIDTH_SAMPLE, cm, { script: 'Latn' })
const probe = readWidthProbe('x\nAXT-WIDTH 1071.0pt 12 241.0pt\ny')
check('the width probe read', probe.wd === 1071 && probe.size === 12 && probe.columnwidth === 241)
check('the width probe typesets the sample in the body face at the body size', /\\normalfont\\normalsize/.test(WIDTH_PROBE) && WIDTH_PROBE.includes(WIDTH_SAMPLE.slice(0, 20)))
const narrow = facesOf({ rm: 'cmr' }, { wd: 0.9 * 12 * sample, size: 12 })
check('a face 10 % narrower than the table: its widths and spaces scaled', near(narrow.latin.w.a, 0.9 * cm.latin.w.a, 1e-6) && near(narrow.latin.space, 0.9 * cm.latin.space, 1e-6) && near(narrow.cyrillic.w['м'], 0.9 * cm.cyrillic.w['м'], 1e-6))
check('no probe, the table as it is', facesOf({ rm: 'cmr' }, null).latin === cm.latin)

// how wide the body face sets below its own size (SIZE_PROBE): Computer Modern at 10.95 pt has 10 pt below it and nothing
// between, so 0.9 and 0.93 of the body both come out at 10 pt and 0.96 at the full 10.95; a scalable face as asked
const fixed = readSizeProbe('AXT-SIZE 0.9 1307.64119pt 1431.86595pt\nAXT-SIZE 0.93 1307.64119pt 1431.86595pt\nAXT-SIZE 0.96 1431.86595pt 1431.86595pt')
check('size probe: every size asked, with how wide the face set it, and the body\'s own last', fixed?.length === 4 && fixed[0].size === 0.9 && near(fixed[0].h, 10 / 10.95, 1e-4) && near(fixed[1].h, 10 / 10.95, 1e-4) && fixed[2].h === 1 && fixed[3].size === 1 && fixed[3].h === 1, JSON.stringify(fixed))
const scalable = readSizeProbe('AXT-SIZE 0.95 1118.9558pt 1177.84836pt\nAXT-SIZE 0.9 1060.06334pt 1177.84836pt')
check('size probe: a scalable face as wide as its size, smallest first', scalable?.length === 3 && scalable[0].size === 0.9 && near(scalable[0].h, 0.9, 1e-4) && near(scalable[1].h, 0.95, 1e-4), JSON.stringify(scalable))
check('size probe: absent, none', readSizeProbe('x\nAXT-WIDTH 1071.0pt 12 241.0pt') === null)
check('the size probe sets the sample in the body face at each size it asks', /\\normalfont\\normalsize/.test(SIZE_PROBE) && /\\fontsize\{\\fpeval\{0\.9\*/.test(SIZE_PROBE) && SIZE_PROBE.includes(WIDTH_SAMPLE.slice(0, 20)) && /AXT-SIZE 0\.9 /.test(SIZE_PROBE))

// Latin and Cyrillic: the face's advances and its interword space
check('Latin text in Times', near(textWidth('abc', times, { script: 'Latn' }), times.latin.w.a + times.latin.w.b + times.latin.w.c))
check('Latin space is the face\'s', near(textWidth('a b', cm, { script: 'Latn' }), cm.latin.w.a + 0.3333 + cm.latin.w.b))
check('Cyrillic letters in the Cyrillic face', near(textWidth('мир', cm, { script: 'Cyrl' }), cm.cyrillic.w['м'] + cm.cyrillic.w['и'] + cm.cyrillic.w['р']))
check('Cyrillic spaces in the Cyrillic face', near(textWidth('м р', times, { script: 'Cyrl' }), times.cyrillic.w['м'] + 0.25 + times.cyrillic.w['р']))

// CJK under xeCJK (Fandol, IPAex, UnBatang measured alike)
check('Han, Latin and the glue between them (中文ABC中文 = 65.56 pt)', near(textWidth('中文ABC中文', times, { script: 'Hans' }), 6.556))
check('a space between Han characters is dropped (中文 中文 = 40 pt)', near(textWidth('中文 中文', times, { script: 'Hans' }), 4))
check('an isolated fullwidth mark takes an em (中，中 = 30 pt)', near(textWidth('中，中', times, { script: 'Hans' }), 3))
check('adjacent marks close up (中。）中 = 35 pt)', near(textWidth('中。）中', times, { script: 'Hans' }), 3.5))
check('brackets (中（中）中 = 50 pt)', near(textWidth('中（中）中', times, { script: 'Hans' }), 5))
check('digits beside Han (中123中 = 40 pt)', near(textWidth('中123中', times, { script: 'Hans' }), 4))
check('Hangul keeps its word spaces (한국어 텍스트 = 62.5 pt)', near(textWidth('한국어 텍스트', times, { script: 'Kore' }), 6.25))
check('Korean with ASCII marks (한국어, 텍스트. = 67.5 pt)', near(textWidth('한국어, 텍스트.', times, { script: 'Kore' }), 6.75))
check('CJK scale and tracking', near(textWidth('中文中文', times, { script: 'Hans', cjk: { scale: 0.95, track: 0.05 } }), 4 * 0.95 + 3 * 0.05))

// atoms: the same in the original and the translation, so only roughly
check('inline math: a symbol', atomWidth('$x$', times) > 0.4 && atomWidth('$x$', times) < 0.8)
check('inline math grows with its content', atomWidth('$a + b = c$', times) > atomWidth('$x$', times) + 3)
check('invisible commands take nothing', atomWidth('\\label{eq:1}', times) === 0 && atomWidth('\\noindent', times) === 0 && atomWidth('\\midrule', times) === 0)
check('a tie is a space', near(atomWidth('~', cm), 0.3333))
check('numeric citations', near(atomWidth('\\cite{a,b}', times, { citeStyle: 'numeric' }), 0.6 + 2 * 1.2))
check('author-year citations are wider', atomWidth('\\citep{a,b}', times, { citeStyle: 'author-year' }) > 12)
check('a reference is a number', atomWidth('\\ref{sec:x}', times) > 0.4 && atomWidth('\\ref{sec:x}', times) < 1.5)
check('typewriter text at its fixed width', near(atomWidth('\\texttt{abcd}', times), 4 * 0.525))
check('a citation style read from the preamble', citeStyleOf('\\usepackage[numbers]{natbib}') === 'numeric' && citeStyleOf('\\usepackage{natbib}\\bibliographystyle{plainnat}') === 'author-year' && citeStyleOf('\\bibliographystyle{IEEEtran}') === 'numeric')
check('superscript citations: natbib\'s super, a Nature-style class', citeStyleOf('\\RequirePackage[super,comma]{natbib}') === 'super' && citeStyleOf('\\documentclass[fleqn,10pt]{wlscirep}') === 'super')
check('natbib with no style: the bibliography\'s items tell', citeStyleOf('\\usepackage{natbib}', '\\bibitem[{Smith et~al.(2020)}]{smith}') === 'author-year' && citeStyleOf('\\usepackage{natbib}', '\\bibitem{smith}') === 'numeric')
check('biblatex styles', citeStyleOf('\\usepackage[style=authoryear]{biblatex}') === 'author-year' && citeStyleOf('\\usepackage[style=numeric-comp]{biblatex}') === 'numeric')
check('a superscript citation is narrow', atomWidth('\\cite{a,b,c}', times, { citeStyle: 'super' }) < 2)

// pieces: text and atoms together; nested notes only their mark
const pieces = [{ t: 'text', s: 'ab ' }, { t: 'ph', src: '$x$' }, { t: 'open', src: '\\textbf{' }, { t: 'text', s: 'c' }, { t: 'close', src: '}' }, { t: 'nested', pre: '\\footnote{', post: '}' }]
check('a unit\'s pieces', near(piecesWidth(pieces, times, { script: 'Latn' }), textWidth('ab ', times, { script: 'Latn' }) + atomWidth('$x$', times) + textWidth('c', times, { script: 'Latn' }) + 0.3, 0.02))

// lines: at least one, half a last line on average
check('lines at a measure', linesAt(0.3, 24) === 1 && near(linesAt(48, 24), 2.5))

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
