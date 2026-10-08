// experiments/pdf-bilingual/spikes/cjk-cases.mjs
// What the CJK strategy under XeLaTeX adds for papers that failed there as they stood (scripts.mjs; the investigation of
// XeLaTeX under BusyTeX, 2026-10-01): small documents through the reader's own translationFiles, compiled natively in
// Docker with -halt-on-error, as BusyTeX compiles (a TeX error is a failure, not a PDF cut short). Each case with the
// fix and without it: the fix sets the paper, and without it TeX stops where the papers stopped. Exits non-zero on a
// failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/cjk-cases.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { openPaper, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'

const dir = mkdtempSync(join(tmpdir(), 'cjk-cases-'))
// PDF.js's character maps: without them a CJK PDF's text is not read
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
/** a document through translationFiles under `strategy` (nothing translated: the preamble is what is checked), compiled
 *  once by xelatex halting on the first error → { ok: TeX's exit status, log, text: the PDF's text } */
async function compile(name, source, strategy, sub = '') {
  const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(source)]]))
  const main = translationFiles(paper, new Map(), { strategy, fonts: null, draft: false }).get('main.tex')
  const at = join(dir, sub)
  mkdirSync(at, { recursive: true })
  writeFileSync(join(at, `${name}.tex`), main)
  let ok = true
  try { execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${at}:/work`, '-w', '/work', 'texlive/texlive:latest', 'xelatex', '-interaction=nonstopmode', '-halt-on-error', `${name}.tex`], { stdio: 'ignore' }) } catch { ok = false }
  const log = existsSync(join(at, `${name}.log`)) ? readFileSync(join(at, `${name}.log`), 'latin1') : ''
  let text = ''
  if (ok && existsSync(join(at, `${name}.pdf`))) {
    const doc = await getDocument({ data: new Uint8Array(readFileSync(join(at, `${name}.pdf`))), verbosity: 0, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true }).promise
    for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join('')
  }
  return { ok, log, text, error: log.match(/^! .*$/m)?.[0] ?? '' }
}
const [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
/** the strategy without one of its additions: what the papers met */
const without = (s, what) => ({ ...s, ...(what === 'front' ? { front: '' } : { pre: f => s.pre(f).replace(/\\makeatletter\\ExplSyntaxOn\n\\cs_if_exist:NT \\__xeCJK_get_ambiguous_slot:[\s\S]*?\\ExplSyntaxOff\\makeatother\n/, '') }) })

// A: a paper that loads CJKutf8 itself and sets a name in its CJK environment (2608.06007, 10322, 13505, 29778)
const A = '\\documentclass{article}\n\\usepackage{CJKutf8}\n\\begin{document}\nA paragraph with a name, \\begin{CJK*}{UTF8}{gbsn}\u5f20\u4e09\\end{CJK*}, in it.\n\\end{document}\n'
{
  const fixed = await compile('a-fixed', A, xe), bare = await compile('a-bare', A, without(xe, 'front'))
  check('A: a paper loading CJKutf8 sets under xeCJK, its CJK environment a plain group', fixed.ok && fixed.text.includes('\u5f20\u4e09'), fixed.error || 'the name missing from the PDF')
  check('A: without the strategy\'s front, xeCJK refuses CJKutf8 (as the papers failed)', !bare.ok && /can not be loaded with `xeCJK'/.test(bare.log), bare.error)
}
// E: microtype measuring a TS1 symbol of an 8-bit font after xeCJK (gensymb's and textcomp's under acmart: 2608.06007,
// 25210): microtype's own values, as its TFM code gives them, where the unpatched xeCJK stopped
const E = '\\documentclass{article}\n\\usepackage{microtype}\n\\begin{document}\n\\usefont{TS1}{cmr}{m}{n}\\textperiodcentered\\typeout{AXT-SLOT lp=\\the\\lpcode\\font183, rp=\\the\\rpcode\\font183}\n\\end{document}\n'
{
  const fixed = await compile('e-fixed', E, xe), bare = await compile('e-bare', E, without(xe, 'slot'))
  check('E: microtype measures a TS1 symbol after xeCJK, with its own values (lp 83, rp 111)', fixed.ok && /AXT-SLOT lp=83, rp=111/.test(fixed.log), fixed.error || (fixed.log.match(/AXT-SLOT.*$/m)?.[0] ?? 'no reading'))
  check('E: without the slot set again, xeCJK\'s patch has microtype ask \\XeTeXglyph of an 8-bit font', !bare.ok && /Cannot use \\?XeTeXglyph with tcrm/.test(bare.log), bare.error)
}
// E again under the xeCJK the TeX page's tree holds (TeX Live 2026's release, which BusyTeX compiles with), whose
// function keeps its slots under another name than the image's newer one: XECJK_2026=<its xeCJK.sty>, put beside the
// document so that TeX takes it (research/pdf-bilingual/data/tl2026/2026/texmf-dist/tex/xelatex/xecjk/xeCJK.sty)
if (process.env.XECJK_2026) {
  mkdirSync(join(dir, 'tl2026'), { recursive: true })
  copyFileSync(process.env.XECJK_2026, join(dir, 'tl2026', 'xeCJK.sty'))
  const fixed = await compile('e-fixed', E, xe, 'tl2026'), bare = await compile('e-bare', E, without(xe, 'slot'), 'tl2026')
  const version = fixed.log.match(/^Package: xeCJK (\S+ v[\d.]+)/m)?.[1] ?? '?'
  check(`E under the tree's xeCJK (${version}): microtype's own values`, fixed.ok && /AXT-SLOT lp=83, rp=111/.test(fixed.log), fixed.error || (fixed.log.match(/AXT-SLOT.*$/m)?.[0] ?? 'no reading'))
  check('E under the tree\'s xeCJK, without the fix: \\XeTeXglyph of an 8-bit font', !bare.ok && /Cannot use \\?XeTeXglyph with tcrm/.test(bare.log), bare.error)
} else console.log('skip E under the tree\'s xeCJK: XECJK_2026 names no file')
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
