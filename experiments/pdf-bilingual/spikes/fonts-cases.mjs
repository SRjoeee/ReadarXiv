// experiments/pdf-bilingual/spikes/fonts-cases.mjs
// The faces every final embeds (spec §4.10, rows 11-20; the maintainer's font rulings of 2026-10-06): the files of the
// font role table (font-roles.mjs), which the instant layer draws in, set by the TeX path's strategies (scripts.mjs,
// latex-front.mjs roleFontsFor). Small documents through the reader's own translationFiles under each strategy, compiled
// natively in Docker as BusyTeX compiles — halting on the first error, no font made on the way, the faces the TeX page's
// tree serves beside TeX Live's on the font path (faithful.mjs) — and the PDF's fonts read by PDF.js: each run's font
// the table's file at its weight, by PostScript name (each file's own, read with otfinfo). Then Korean's space between
// a Latin word and the particle after it (row 17: each candidate's widths printed), and a Latin target's T1, under
// which an accented word hyphenates. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/fonts-cases.mjs [cjk ko-space ru latin t1]
// The groups named, or all.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { designOfNfss, FACES, faceFor, familyOfProbe, rolesFor } from '../../../src/pdf-reader/engine/font-roles.mjs'
import { openPaper, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { faithfulDockerArgs, hostedFontsDockerArgs } from './faithful.mjs'

const root = new URL('..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'fonts-cases-'))
const named = process.argv.slice(2), want = g => !named.length || named.includes(g)
const DOCKER = ['run', '--rm', '--network', 'none', ...faithfulDockerArgs(root), ...hostedFontsDockerArgs(join(root, 'data/fonts'))]
// PDF.js's character maps: without them a CJK PDF's text is not read
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const enc = s => new TextEncoder().encode(s)

// each face's PostScript name, the name a PDF embeds it under, from its own file
const ids = Object.keys(FACES)
const psOut = execFileSync('docker', [...DOCKER, '-w', '/', 'texlive/texlive:latest', 'sh', '-c', ids.map(id => { const f = FACES[id].file; return `p=$(kpsewhich -format="opentype fonts" ${f} || kpsewhich -format="truetype fonts" ${f}); echo "${id} $(otfinfo -p "$p")"` }).join('; ')], { encoding: 'utf8' })
const PS = new Map(psOut.trim().split('\n').map(l => l.split(' ')))
const psOf = id => PS.get(id) ?? `?${id}`

/**
 * A document's main file through translationFiles under `strategy` (nothing translated: its text is the case), with the
 * font probe's families `fonts`, `extra` TeX after the strategy's preamble and the files `beside` it; compiled once by the strategy's engine,
 * halting on the first error → { ok, log, error, runs: [{ str, font }] each text run of the PDF with its font's
 * PostScript name, subset tag stripped }
 */
async function compile(name, source, strategy, { fonts = null, extra = '', beside = [] } = {}) {
  const paper = openPaper(new Map([['main.tex', enc(source)]]))
  const s = extra ? { ...strategy, pre: (f, n) => strategy.pre(f, n) + extra } : strategy
  const files = translationFiles(paper, new Map(), { strategy: s, fonts, draft: false })
  const at = join(dir, name)
  mkdirSync(at, { recursive: true })
  writeFileSync(join(at, 'main.tex'), files.get('main.tex'))
  for (const f of beside) copyFileSync(f, join(at, basename(f)))
  let ok = true
  try { execFileSync('docker', [...DOCKER, '-v', `${at}:/work`, '-w', '/work', 'texlive/texlive:latest', strategy.engine, '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { stdio: 'ignore' }) } catch { ok = false }
  const log = existsSync(join(at, 'main.log')) ? readFileSync(join(at, 'main.log'), 'utf8') : ''
  ok &&= existsSync(join(at, 'main.pdf'))
  const runs = []
  if (ok) {
    const task = getDocument({ data: new Uint8Array(readFileSync(join(at, 'main.pdf'))), verbosity: 0, disableFontFace: true, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true })
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      await page.getOperatorList()
      for (const item of (await page.getTextContent()).items) {
        if (!item.str?.trim()) continue
        const font = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName).name : '?'
        runs.push({ str: item.str, font: String(font).replace(/^[A-Z]{6}\+/, '').replace(/-Identity-H$/, '') })
      }
    }
    await task.destroy()
  }
  rmSync(at, { recursive: true, force: true })
  return { ok, log, runs, error: log.match(/^! .*$/m)?.[0] ?? '' }
}
/** the fonts of the runs that hold `mark` */
const fontsOf = (runs, mark) => [...new Set(runs.filter(r => r.str.includes(mark)).map(r => r.font))]
const doc = (body, preamble = '') => `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`
const first = (lang, compiler = 'pdflatex') => strategiesFor({ compiler }, lang)[0]
const PROBES = { cm: { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr', enc: 'OT1' }, times: { rm: 'ptm', sf: 'phv', tt: 'pcr', body: 'ptm', enc: 'OT1' } }

// CJK (rows 11-15): each target's xeCJK strategy beside a Computer Modern paper (Light, its SemiBold) and a Times one
// (Regular, its Bold); a mark of its own in each style — the upright, bold, italic, bold italic and a heading (the
// serif's bold, the family's real bold now) — and each mark's font the table's face for that style
if (want('cjk')) {
  // \u7532 \u4e59 \u4e19 \u4e01 \u620a; Korean's Hangul \uac00 \ub098 \ub2e4 \ub77c \ub9c8
  const HAN = ['\u7532\u7532', '\u4e59\u4e59', '\u4e19\u4e19', '\u4e01\u4e01', '\u620a\u620a'], HANGUL = ['\uac00\uac00', '\ub098\ub098', '\ub2e4\ub2e4', '\ub77c\ub77c', '\ub9c8\ub9c8']
  for (const lang of ['zh', 'zh-Hant', 'ja', 'ko']) {
    const [up, bold, italic, boldItalic, heading] = lang === 'ko' ? HANGUL : HAN
    const body = `\\section{${heading}}\n${up} Latin text. \\textbf{${bold}} \\textit{${italic}} \\textbf{\\textit{${boldItalic}}}`
    for (const [family, fonts] of Object.entries(PROBES)) {
      const r = await compile(`cjk-${lang}-${family}`, doc(body), first(lang), { fonts })
      const roles = rolesFor(lang, familyOfProbe(fonts)), at = (b, i) => psOf(faceFor(roles, { script: 'cjk', cls: 'serif', design: 'cm', bold: b, italic: i, caps: false }))
      const want = [[up, at(false, false)], [bold, at(true, false)], [italic, at(false, true)], [boldItalic, at(true, true)], [heading, at(true, false)]]
      const got = want.map(([mark]) => fontsOf(r.runs, mark).join('|'))
      check(`${lang} beside ${family}: upright, bold, italic, bold italic and a heading in ${want.map(([, f]) => f).join(', ')}`, r.ok && want.every(([, f], k) => got[k] === f), r.error || `got ${got.join(', ')}`)
    }
  }
  // Korean's Hangul at its size (Face.size: Light 0.956, Regular 0.959, SemiBold 0.967, Bold 0.974), its syllables an
  // em wide: at 10 pt the face's size × 10 pt
  for (const [family, fonts] of Object.entries(PROBES)) {
    const probe = '\\setbox0\\hbox{\uac00}\\setbox2\\hbox{\\bfseries \uac00}\\typeout{AXT-HANGUL \\the\\wd0\\space\\the\\wd2}'
    const r = await compile(`ko-size-${family}`, doc(probe), first('ko'), { fonts })
    const [reg, bold] = (r.log.match(/^AXT-HANGUL ([\d.]+)pt ([\d.]+)pt/m) ?? []).slice(1).map(Number)
    const roles = rolesFor('ko', familyOfProbe(fonts)), want = [FACES[roles.cjk.body].size * 10, FACES[roles.cjk.bold].size * 10]
    check(`ko beside ${family}: a syllable ${want[0].toFixed(2)} pt upright, ${want[1].toFixed(2)} pt bold (Scale, BoldFeatures)`, r.ok && Math.abs(reg - want[0]) < 0.01 && Math.abs(bold - want[1]) < 0.01, r.error || `got ${reg} pt, ${bold} pt`)
  }
}

// Row 17: Korean writes no space between a Latin word and the particle after it where the translation has none
// (ImageNet-1k\uc5d0\uc11c), and keeps the translation's own (ImageNet-1k \uc5d0\uc11c). Each candidate's widths: the
// word and the particle together against each alone, the space between them the difference
if (want('ko-space')) {
  const word = 'ImageNet-1k', particle = '\uc5d0\uc11c'
  const probe = [
    `\\setbox0\\hbox{${word}}\\setbox2\\hbox{${particle}}`,
    `\\setbox4\\hbox{${word}${particle}}\\setbox6\\hbox{${word} ${particle}}`,
    `\\setbox8\\hbox{${particle}${word}}\\setbox10\\hbox{${particle} ${word}}`,
    `\\typeout{AXT-SPACE \\the\\dimexpr\\wd4-\\wd0-\\wd2\\relax\\space\\the\\dimexpr\\wd6-\\wd0-\\wd2\\relax\\space\\the\\dimexpr\\wd8-\\wd0-\\wd2\\relax\\space\\the\\dimexpr\\wd10-\\wd0-\\wd2\\relax\\space\\the\\fontdimen2\\font}`,
  ].join('\n')
  const CANDIDATES = {
    today: '',
    'CJKecglue={}': '\\xeCJKsetup{CJKecglue={}}\n',
    'CJKecglue={}, xCJKecglue=true': '\\xeCJKsetup{CJKecglue={},xCJKecglue=true}\n',
    'xCJKecglue=true': '\\xeCJKsetup{xCJKecglue=true}\n',
  }
  // the image's xeCJK, and the one the TeX page's tree holds (TeX Live 2026's release, BusyTeX's: XECJK_2026=<its
  // xeCJK.sty>, put beside the document so that TeX takes it)
  const trees = [['the image\'s xeCJK', []], ...(process.env.XECJK_2026 ? [['the tree\'s xeCJK', [process.env.XECJK_2026]]] : [])]
  for (const [tree, beside] of trees) {
    for (const [name, extra] of Object.entries(CANDIDATES)) {
      const r = await compile(`ko-space-${name.replace(/\W+/g, '_')}`, doc(probe), first('ko'), { fonts: PROBES.times, extra, beside })
      const version = r.log.match(/^Package: xeCJK (\S+)/m)?.[1] ?? '?'
      const [none, kept, after, afterKept, space] = (r.log.match(/^AXT-SPACE (\S+)pt (\S+)pt (\S+)pt (\S+)pt (\S+)pt/m) ?? []).slice(1).map(Number)
      const passes = r.ok && Math.abs(none) < 0.01 && kept > 0.5 * space
      console.log(`     ${tree} (${version}), ${name.padEnd(30)} ${r.ok ? `word+particle ${none} pt, word space particle ${kept} pt; particle+word ${after} pt, particle space word ${afterKept} pt (a space ${space} pt)` : r.error}${passes ? ' — passes both' : ''}`)
    }
  }
  if (!process.env.XECJK_2026) console.log('     skip the tree\'s xeCJK: XECJK_2026 names no file')
}

// The roles of a paper under a target, each in its own mark at each style: { tex, marks: [[mark, role, bold, italic]] }
const STYLES = [['up', false, false], ['bold', true, false], ['italic', false, true], ['bolditalic', true, true]]
const SWITCH = { up: m => m, bold: m => `\\textbf{${m}}`, italic: m => `\\textit{${m}}`, bolditalic: m => `\\textbf{\\textit{${m}}}` }
function roleMarks(markOf) {
  const marks = [], tex = []
  for (const role of ['rm', 'sf', 'tt']) {
    const line = STYLES.map(([style, bold, italic]) => { const m = markOf(role, style); marks.push([m, role, bold, italic]); return SWITCH[style](m) })
    tex.push(`{\\${role}family ${line.join(' ')}}`)
  }
  return { tex: tex.join('\n\n'), marks }
}
/** each mark's font against the table's face for its role's family and style under `lang` → the marks that differ */
function rolesWrong(runs, marks, lang, fonts) {
  const roles = rolesFor(lang, familyOfProbe(fonts)), CLS = { rm: 'serif', sf: 'sans', tt: 'mono' }, bad = []
  for (const [mark, role, bold, italic] of marks) {
    const d = designOfNfss(fonts[role]) ?? { design: 'other', cls: CLS[role] }
    const want = psOf(faceFor(roles, { script: 'latin', cls: d.cls, design: d.design, bold, italic, caps: false }))
    const got = fontsOf(runs, mark).join('|')
    if (got !== want) bad.push(`${mark}: ${got || 'none'} for ${want}`)
  }
  return bad
}
const FAMILIES = [
  ['Palatino', { rm: 'pplx', sf: 'phv', tt: 'pcr', body: 'pplx' }, '\\usepackage{mathpazo}\n'],
  ['Times, Helvetica, Courier', { rm: 'ptm', sf: 'phv', tt: 'pcr', body: 'ptm' }, '\\usepackage{times}\n'],
  ['Computer Modern', { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr' }, ''],
  ['Utopia, Bera Mono', { rm: 'put', sf: 'phv', tt: 'fvm', body: 'put' }, '\\usepackage{utopia}\\usepackage{beramono}\n'],
  ['Charter, Inconsolata', { rm: 'bch', sf: 'phv', tt: 'zi4', body: 'bch' }, '\\usepackage{charter}\\usepackage{inconsolata}\n'],
  ['XCharter', { rm: 'XCharter-TLF', sf: 'phv', tt: 'pcr', body: 'XCharter-TLF' }, '\\usepackage{XCharter}\n'],
  ['Erewhon', { rm: 'erewhon-TLF', sf: 'phv', tt: 'pcr', body: 'erewhon-TLF' }, '\\usepackage{erewhon}\n'],
  ['EB Garamond', { rm: 'EBGaramond-TLF', sf: 'cmss', tt: 'cmtt', body: 'EBGaramond-TLF' }, '\\usepackage{ebgaramond}\n'],
  ['Libertine', { rm: 'LinuxLibertineT-TLF', sf: 'LinuxBiolinumT-TLF', tt: 'zi4', body: 'LinuxLibertineT-TLF' }, '\\usepackage{libertine}\\usepackage{inconsolata}\n'],
]

// Cyrillic (row 18, the rulings' (c)): every role in the table's Cyrillic face for the paper's family, by the PDF's
// font names; and the paper's math the same as under pdfLaTeX's T2A
if (want('ru')) {
  // a Cyrillic word, then a letter of its own for each role and style
  const LETTERS = '\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u043a\u043b\u043c'
  const keys = ['rm', 'sf', 'tt'].flatMap(r => STYLES.map(([s]) => `${r}${s}`))
  const { tex, marks } = roleMarks((role, style) => `\u0420\u0443\u0441\u0441\u043a\u0438\u0439${LETTERS[keys.indexOf(`${role}${style}`)]}`)
  const [xe, t2a] = strategiesFor({ compiler: 'pdflatex' }, 'ru')
  for (const [name, fonts, preamble] of FAMILIES) {
    const r = await compile(`ru-${name.replace(/\W+/g, '_')}`, doc(tex, `\\usepackage[T1]{fontenc}\n${preamble}`), xe, { fonts })
    const bad = r.ok ? rolesWrong(r.runs, marks, 'ru', fonts) : []
    check(`ru, ${name}: every role in the table's Cyrillic faces`, r.ok && !bad.length, r.error || bad.join('; '))
  }
  const math = doc('Text.\n\\[ \\alpha^2 + \\sum_{i=1}^n x_i \\le \\mathcal{O}(n) \\]', '\\usepackage{amsmath}\n')
  const mx = await compile('ru-math-xe', math, xe, { fonts: PROBES.cm }), mp = await compile('ru-math-t2a', math, t2a, { fonts: PROBES.cm })
  const mathFonts = r => [...new Set(r.runs.map(x => x.font))].filter(f => /^CM(MI|SY|EX)\d/.test(f)).sort().join(' ')
  check(`ru: the paper's math in the same fonts under XeLaTeX as under pdfLaTeX in T2A (${mathFonts(mx)})`, mx.ok && mp.ok && mathFonts(mx) !== '' && mathFonts(mx) === mathFonts(mp), `${mx.error || mp.error} XeLaTeX ${mathFonts(mx)}; pdfLaTeX ${mathFonts(mp)}`)
}

// Latin under xeCJK (row 19): a CJK target's Latin runs in the table's Latin column for the paper's family
if (want('latin')) {
  const { tex, marks } = roleMarks((role, style) => `${role[0].toUpperCase()}${role[1]}${style}word`)
  for (const [name, fonts, preamble] of FAMILIES) {
    const r = await compile(`latin-${name.replace(/\W+/g, '_')}`, doc(tex, preamble), first('zh'), { fonts })
    const bad = r.ok ? rolesWrong(r.runs, marks, 'zh', fonts) : []
    check(`zh's Latin runs, ${name}: every role in the table's Latin faces`, r.ok && !bad.length, r.error || bad.join('; '))
  }
}

// T1 for a Latin target (row 20): German's accented word hyphenates under T1, and under OT1 it breaks nowhere; an OT1
// CM paper is set in Latin Modern
if (want('t1')) {
  const [de] = strategiesFor({ compiler: 'pdflatex' }, 'de')
  const body = '\\showhyphens{\u00dcbersetzungsqualit\u00e4t}\nDie \u00dcbersetzungsqualit\u00e4t.'
  const t1 = await compile('t1-de', doc(body), de, { fonts: PROBES.cm })
  const ot1 = await compile('t1-de-ot1', doc(body), { ...de, pre: (f, n) => de.pre(f, n).replace(/^[\s\S]*?\\usepackage\[T1\]\{fontenc\}\n/, '') }, { fonts: PROBES.cm })
  const broken = log => (log.match(/^\[\][^\n]*?(\S*bersetzungs\S*)/m)?.[1] ?? '')
  check(`de under T1: \u00dcbersetzungsqualit\u00e4t hyphenates (${broken(t1.log)})`, t1.ok && /-/.test(broken(t1.log)), t1.error || t1.log.match(/^\[\].*$/m)?.[0])
  check(`under OT1 it breaks nowhere (${broken(ot1.log)})`, ot1.ok && broken(ot1.log) && !/-/.test(broken(ot1.log)), ot1.error || ot1.log.match(/^\[\].*$/m)?.[0])
  check(`an OT1 CM paper's T1 text in Latin Modern (${fontsOf(t1.runs, 'Die').join('|')})`, fontsOf(t1.runs, 'Die').join('|') === 'LMRoman10-Regular', fontsOf(t1.runs, 'Die').join('|'))
  const times = await compile('t1-de-times', doc('Die \u00dcbersetzungsqualit\u00e4t.', '\\usepackage{times}\n'), de, { fonts: PROBES.times })
  check(`a Times paper keeps its own Type 1 Times under T1 (${fontsOf(times.runs, 'Die').join('|')})`, /^NimbusRomNo9L-Regu$/.test(fontsOf(times.runs, 'Die').join('|')), times.error || fontsOf(times.runs, 'Die').join('|'))
}
rmSync(dir, { recursive: true, force: true })
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
