// experiments/pdf-bilingual/spikes/tex-path-cases.mjs
// The TeX path's failures the layer lab's finals met when compiled as BusyTeX compiles (halting on the first error; the
// lab's report of 2026-10-06, concern 1), each as a small document through the reader's own translationFiles, compiled
// natively in Docker with -halt-on-error. Each case with the fix and without it: the fix sets the document, and without
// it TeX stops, or loses letters, where the lab's finals did. Exits non-zero on a failure.
//   [AXT_DATA=<the experiment's data>] pnpm exec tsx experiments/pdf-bilingual/spikes/tex-path-cases.mjs [R P U S F N I …]
// The cases named, or all. The METAFONT outputs the file server adds (spikes/make-metafont.mjs, AXT_DATA/metafont, as
// faithful.mjs mounts them) are on the font path where they are there: a case that needs one is skipped without them
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { openPaper, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'

const dir = mkdtempSync(join(tmpdir(), 'tex-path-cases-'))
const named = process.argv.slice(2), want = c => !named.length || named.includes(c)
const METAFONT = join(process.env.AXT_DATA ?? new URL('../data', import.meta.url).pathname, 'metafont')
const faithful = ['-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', ...(existsSync(METAFONT) ? ['-v', `${METAFONT}:/axt-metafont:ro`, '-e', 'TFMFONTS=/axt-metafont//:'] : [])]
// PDF.js's character maps: without them a CJK PDF's text is not read
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const enc = s => new TextEncoder().encode(s)
/**
 * A document (`files`: path → text, main.tex the main file) through translationFiles under `strategy`, with what
 * `translate(paper)` gives (unit → pieces), `undo(paper)` first where the case is compiled without its fix, `alter` on
 * the main file's text as written (its bytes read as Latin-1 and written back so), `fonts` the font probe's families;
 * compiled once by the strategy's engine halting on the first error, no font made on the way (faithful.mjs) → { ok:
 * TeX's exit status, log, error: its first, text: the PDF's }
 */
async function compile(name, files, strategy, { translate = () => new Map(), undo = null, alter = null, fonts = null } = {}) {
  const paper = openPaper(new Map(Object.entries(files).map(([p, t]) => [p, enc(t)])))
  undo?.(paper)
  const out = new Map([...paper.fsys.list().map(p => [p, paper.fsys.read(p)]), ...translationFiles(paper, translate(paper), { strategy, fonts, draft: false })])
  const at = join(dir, name)
  mkdirSync(at, { recursive: true })
  for (const [p, b] of out) { mkdirSync(dirname(join(at, p)), { recursive: true }); writeFileSync(join(at, p), alter && p === 'main.tex' ? Buffer.from(alter(Buffer.from(b).toString('latin1')), 'latin1') : b) }
  let ok = true
  try { execFileSync('docker', ['run', '--rm', '--network', 'none', ...faithful, '-v', `${at}:/work`, '-w', '/work', 'texlive/texlive:latest', strategy.engine, '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { stdio: 'ignore' }) } catch { ok = false }
  const log = existsSync(join(at, 'main.log')) ? readFileSync(join(at, 'main.log'), 'latin1') : ''
  if (ok && strategy.engine === 'xelatex') ok = existsSync(join(at, 'main.pdf'))
  let text = ''
  if (ok) {
    const task = getDocument({ data: new Uint8Array(readFileSync(join(at, 'main.pdf'))), verbosity: 0, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true }), doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) text += `${(await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join('')}\n`
    await task.destroy()
  }
  rmSync(at, { recursive: true, force: true })
  return { ok, log, text, error: log.match(/^! .*$/m)?.[0] ?? '' }
}
const doc = (body, preamble = '') => `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`

// R: a cell's row commands, which an engine moved after the cell's words (1512.03385 into es: "Nombre de la capa @a#",
// the row's \hline; 1810.04805 into es and fr, \toprule): written where the row has them, TeX sets the table; as the
// engine sent them, "Misplaced \noalign"
if (want('R')) {
  const R = { 'main.tex': doc('\\begin{tabular}{ll}\n\\toprule\nlayer name & output size \\\\\n\\midrule\nconv1 & 112 \\\\\n\\bottomrule\n\\end{tabular}', '\\usepackage{booktabs}\n') }
  const [es] = strategiesFor({ compiler: 'pdflatex' }, 'es')
  /** each cell translated as the engine sent it back: its words first, then every placeholder */
  const translate = paper => new Map(paper.units.filter(u => u.kind === 'cell').map(u => [u, [{ t: 'text', tr: true, s: `${u.pieces.filter(p => p.t === 'text').map(p => p.s.trim()).join(' ')} ` }, ...u.pieces.filter(p => p.t === 'ph')]]))
  const fixed = await compile('r-fixed', R, es, { translate }), bare = await compile('r-bare', R, es, { translate, undo: paper => { for (const u of paper.units) { delete u.rowLead; delete u.rowTrail } } })
  check('R: a cell whose rule the engine moved after its words sets, the rule first again', fixed.ok, fixed.error)
  check('R: as the engine sent it, the rule after the words: "Misplaced \\noalign" (as the finals stopped)', !bare.ok && /Misplaced \\noalign/.test(bare.log), bare.error)
}

// P: an image sized in pdfTeX's px (1810.04805: \includegraphics[width=360px]), its pdfLaTeX paper set by XeLaTeX for a
// CJK target: given in bp, its value, the image sets; as the source has it, "Illegal unit of measure"
if (want('P')) {
  const P = { 'main.tex': doc('An image \\includegraphics[width=36px]{example-image} and another \\includegraphics[height=0.1\\textwidth]{example-image}.\\setbox0\\hbox{\\includegraphics[width=36px]{example-image}}\\typeout{AXT-WIDTH=\\the\\wd0}', '\\usepackage{graphicx}\n') }
  const [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  const fixed = await compile('p-fixed', P, xe), bare = await compile('p-bare', P, xe, { alter: tex => tex.replace(/\\makeatletter\\def\\axt@px[^\n]*\\makeatother\n/, '') })
  check('P: an image sized in px sets under XeLaTeX, 36px as wide as pdfTeX sets it (36 bp, 36.135 pt)', fixed.ok && /AXT-WIDTH=36\.135pt/.test(fixed.log), fixed.error || (fixed.log.match(/AXT-WIDTH=.*$/m)?.[0] ?? 'no width'))
  check('P: without it, XeTeX has no unit px: "Illegal unit of measure" (as the CJK finals failed)', !bare.ok && /Illegal unit of measure/.test(bare.log), bare.error)
}

// U: a translated heading a class uppercases (2307.16209's abntex2, its running heads; here book's), set under CJKutf8:
// with each CJK byte protected the case changers pass it by; as CJK defines them, "Extra \else"
if (want('U')) {
  const U = { 'main.tex': '\\documentclass{book}\n\\begin{document}\n\\chapter{Results of the study}\nWords of the chapter.\\newpage\nMore words of it.\\newpage\nAnd more.\n\\end{document}\n' }
  const [, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  const translate = paper => new Map(paper.units.filter(u => u.kind === 'heading').map(u => [u, [{ t: 'text', tr: true, s: '\u7814\u7a76\u7ed3\u679c' }]]))
  const fixed = await compile('u-fixed', U, cjkutf8, { translate }), bare = await compile('u-bare', U, cjkutf8, { translate, alter: tex => tex.replace('\\axtcjkprotect}', '}') })
  check('U: a translated chapter title in book\'s uppercased running heads sets under CJKutf8', fixed.ok && !/Missing character/.test(fixed.log), fixed.error)
  check('U: without the bytes protected, \\MakeUppercase expands them: "Extra \\else" (as the thesis stopped)', !bare.ok && /^! Extra \\else\./m.test(bare.log), bare.error || 'it set')
}

// S: a paper that loads siunitx, its locale Chinese (2307.16209 into zh under XeLaTeX): siunitx 3.6.2 opens
// babel-Hans-.ini; with a file that is not there passed over, the document sets. Without, it stops — under 3.6.2 alone
if (want('S')) {
  const S = { 'main.tex': doc('A number, \\num{1.5}, in a paragraph.', '\\usepackage{siunitx}\n') }
  const [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  const fixed = await compile('s-fixed', S, xe), bare = await compile('s-bare', S, xe, { alter: tex => tex.replace(/\\ExplSyntaxOn\n\\IfPackageAtLeastTF \{ siunitx \}[\s\S]*?\\ExplSyntaxOff\n/, '') })
  const version = fixed.log.match(/^Package: siunitx \S+ (v[\d.]+)/m)?.[1] ?? '?'
  check(`S: siunitx (${version}) with the target's locale Chinese sets`, fixed.ok, fixed.error)
  if (version === 'v3.6.2') check('S: without it, siunitx 3.6.2 stops at "File \'babel-Hans-.ini\' not found" (as the thesis did)', !bare.ok && /babel-Hans-\.ini' not found/.test(bare.log), bare.error)
  else console.log(`skip S without the fix: siunitx ${version} is not 3.6.2, the version with the misnamed file`)
}

// F: a style that sets its subsection headings in a font it loads by name (cvpr.sty: \font\elvbf = ptmb scaled 1100),
// translated into Russian (1512.03385 into ru): declared again in the strategy's encoding, the heading has its letters,
// under T2A and under XeLaTeX; as the style loads it, the heading's letters are the raw font's glyphs or none
if (want('F')) {
  const F = {
    'main.tex': '\\documentclass{article}\n\\usepackage{times}\n\\usepackage{style}\n\\begin{document}\n\\subsection{Implementation}\nWords of the section.\n\\end{document}\n',
    'style.sty': '\\font\\elvbf  = ptmb scaled 1100 % ptmb7t elsewhere\n\\def\\subsection{\\@startsection{subsection}{2}{\\z@}{8pt}{6pt}{\\elvbf}}\n',
  }
  const translate = paper => new Map(paper.units.map(u => [u, [{ t: 'text', tr: true, s: u.kind === 'heading' ? 'Реализация' : 'Слова раздела.' }]]))
  const fonts = { rm: 'ptm', sf: 'phv', tt: 'pcr', body: 'ptm' }
  const without = tex => tex.replace(/\\makeatletter\n\\begingroup\\fontencoding[\s\S]*?\\makeatother\n/, '')
  for (const s of strategiesFor({ compiler: 'pdflatex' }, 'ru')) {
    const fixed = await compile('f-fixed', F, s, { translate, fonts }), bare = await compile('f-bare', F, s, { translate, fonts, alter: without })
    check(`F (${s.name}): a heading in a font the style loads by name has its Russian letters`, fixed.ok && !/Missing character/.test(fixed.log) && fixed.text.includes('Реализация'), fixed.error || (fixed.log.match(/^Missing character.*$/m)?.[0] ?? `the PDF reads ${JSON.stringify(fixed.text.slice(0, 40))}`))
    // the symptom is in the PDF alone: under T2A the raw font sets its own glyphs at T2A's slots, "—åàºŁçàöŁÿ", and
    // logs a missing character only for the slots it has none at; the paragraph, in NFSS's T2A font, has its letters
    check(`F (${s.name}): without it, the heading's letters are not in the PDF, the paragraph's are (as 1512.03385's headings)`, bare.ok && !bare.text.includes('Реализация') && bare.text.includes('Слова раздела'), bare.error || `the PDF reads ${JSON.stringify(bare.text.slice(0, 60))}`)
  }
}

// N: a font loaded by name declared again in the document's weight and shape (the review of fix/tex-path-errors, I1):
// NAACL's ruler, \\font\\naaclhv = phvb at 8pt, and CVPR's \\font\\elvbf = ptmb scaled 1100 are the fonts the document's
// own \\sffamily\\bfseries and \\rmfamily\\bfseries give at their sizes — asked for in series b and shape up, on a Computer
// Modern paper under T2A the ruler was CM sans medium, lass0800 for lasx0800 —, and no shape up is undefined on the way
if (want('N')) {
  const style = '\\font\\naaclhv = phvb at 8pt\n\\font\\elvbf  = ptmb scaled 1100\n'
  const probe = '\\AtBeginDocument{{\\fontsize{8}{8}\\sffamily\\bfseries\\upshape\\selectfont\\typeout{AXT-OWN=\\fontname\\font}}{\\fontsize{11}{11}\\rmfamily\\bfseries\\upshape\\selectfont\\typeout{AXT-OWN=\\fontname\\font}}\\typeout{AXT-NAMED=\\fontname\\naaclhv}\\typeout{AXT-NAMED=\\fontname\\elvbf}}\n'
  const main = times => `\\documentclass{article}\n${times ? '\\usepackage{times}\n' : ''}\\usepackage{style}\n${probe}\\begin{document}\nWords of the paper.\n\\end{document}\n`
  const translate = paper => new Map(paper.units.map(u => [u, [{ t: 'text', tr: true, s: 'Слова статьи.' }]]))
  const [own, xe] = strategiesFor({ compiler: 'pdflatex' }, 'ru')
  // TeX writes its log in lines of 79 characters: an OpenType font's name runs over two
  const read = (r, what) => [...r.log.replace(/^(.{79})\n/gm, '$1').matchAll(new RegExp(`^AXT-${what}=(.*)$`, 'gm'))].map(m => m[1].trim())
  const same = r => { const a = read(r, 'NAMED'), b = read(r, 'OWN'); return a.length === 2 && a.every((f, k) => f === b[k]) }
  const shapeUp = r => r.log.match(/^LaTeX Font Warning: Font shape `[^']*\/up' undefined/m)?.[0] ?? ''
  const cases = [['a Times paper', own, true], ['a Times paper', xe, true], ['a Computer Modern paper', xe, false]]
  // under T2A a Computer Modern paper's sans and roman are the LH fonts, METAFONT's
  if (existsSync(join(METAFONT, 'tfm', 'lasx0800.tfm'))) cases.push(['a Computer Modern paper', own, false])
  else console.log(`skip N on a Computer Modern paper under T2A: no LH metrics in ${METAFONT} (spikes/make-metafont.mjs)`)
  for (const [paper, s, times] of cases) {
    const fonts = times ? { rm: 'ptm', sf: 'phv', tt: 'pcr', body: 'ptm' } : { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr' }
    const r = await compile('n', { 'main.tex': main(times), 'style.sty': style }, s, { translate, fonts })
    check(`N (${s.name}, ${paper}): the fonts the style loads by name are the document's own bold sans and roman, no shape up undefined`, r.ok && same(r) && !shapeUp(r), r.error || shapeUp(r) || `${read(r, 'NAMED').join(', ')} against ${read(r, 'OWN').join(', ')}`)
  }
}

// I: F's font, in a file TeX reads that loadProject does not walk (the re-review of fix/tex-path-errors, N1): a file the
// preamble \\inputs, a package named by its path, a file a style \\inputs. Declared again, the heading has its Russian
// letters; missed, it is the raw font's glyphs again
if (want('I')) {
  const fontsTeX = '\\font\\elvbf  = ptmb scaled 1100\n\\def\\subsection{\\@startsection{subsection}{2}{\\z@}{8pt}{6pt}{\\elvbf}}\n'
  const main = load => `\\documentclass{article}\n\\usepackage{times}\n${load}\n\\begin{document}\n\\subsection{Implementation}\nWords of the section.\n\\end{document}\n`
  const arrangements = [
    ['a file the preamble \\inputs', { 'main.tex': main('\\makeatletter\\input{style}\\makeatother'), 'style.tex': fontsTeX }],
    ['a package named by its path', { 'main.tex': main('\\usepackage{sty/style}'), 'sty/style.sty': fontsTeX }],
    ['a file a style \\inputs', { 'main.tex': main('\\usepackage{style}'), 'style.sty': '\\input{sub/fonts}\n', 'sub/fonts.tex': fontsTeX }],
  ]
  const translate = paper => new Map(paper.units.map(u => [u, [{ t: 'text', tr: true, s: u.kind === 'heading' ? 'Реализация' : 'Слова раздела.' }]]))
  const [own] = strategiesFor({ compiler: 'pdflatex' }, 'ru')
  for (const [where, files] of arrangements) {
    const r = await compile('i', files, own, { translate, fonts: { rm: 'ptm', sf: 'phv', tt: 'pcr', body: 'ptm' } })
    check(`I: CVPR's heading font in ${where} is declared again, the heading has its Russian letters`, r.ok && r.text.includes('Реализация') && r.text.includes('Слова раздела'), r.error || `the PDF reads ${JSON.stringify(r.text.slice(0, 60))}`)
  }
}

rmSync(dir, { recursive: true, force: true })
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
