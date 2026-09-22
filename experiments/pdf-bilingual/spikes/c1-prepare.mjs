// C1 preparation, shared by the native and the browser runs: a paper's source with its prose replaced (pseudo-translation)
// through the front end and a CJK strategy injected, written to a folder of its own. Images are hard-linked.
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { FORBIDDEN_TO_WARNING, latinFontsFor, loadProject, patch, pseudoTranslate, stripPdftexOption, XETEX_SHIM, XETEX_SHIM_R1 } from './latex-front.mjs'
import { analyze } from './paper-meta.mjs'

// ---------------------------------------------------------------- strategies
export const STRATEGIES = {
  'zh-cjkutf8': { lang: 'zh', engine: 'keep', pre: '\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{gbsn}}\n\\AtEndDocument{\\end{CJK}}\n' },
  'zh-xecjk': { lang: 'zh', engine: 'xelatex', pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n' },
  'zh-ctex': { lang: 'zh', engine: 'xelatex', pre: '\\usepackage[fontset=fandol,scheme=plain]{ctex}\n' },
  'ja-cjkutf8': { lang: 'ja', engine: 'keep', pre: '\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{ipxm}}\n\\AtEndDocument{\\end{CJK}}\n' },
  'ja-xecjk': { lang: 'ja', engine: 'xelatex', pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[AutoFakeBold=2.5]{ipaexm.ttf}\n' },
  'de-keep': { lang: 'de', engine: 'keep', pre: '' },
  // the same with the engine-adaptation rules R1–R3 (latex-front.mjs)
  'zh-xecjk+a': { lang: 'zh', engine: 'xelatex', adapt: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n' },
  'zh-cjkutf8+a': { lang: 'zh', engine: 'keep', adapt: true, pre: '\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{gbsn}}\n\\AtEndDocument{\\end{CJK}}\n' },
  'ja-xecjk+a': { lang: 'ja', engine: 'xelatex', adapt: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[AutoFakeBold=2.5]{ipaexm.ttf}\n' },
  'ja-cjkutf8+a': { lang: 'ja', engine: 'keep', adapt: true, pre: '\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{ipxm}}\n\\AtEndDocument{\\end{CJK}}\n' },
  'de-keep+a': { lang: 'de', engine: 'keep', adapt: true, pre: '' },
  // the same with table cells translated
  'de-keep+a+t': { lang: 'de', engine: 'keep', adapt: true, tables: true, pre: '' },
  'zh-xecjk+a+t': { lang: 'zh', engine: 'xelatex', adapt: true, tables: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n' },
  'zh-cjkutf8+a+t': { lang: 'zh', engine: 'keep', adapt: true, tables: true, pre: '\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{gbsn}}\n\\AtEndDocument{\\end{CJK}}\n' },
  'xe-only+a': { lang: 'zh', engine: 'xelatex', adapt: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n', translate: false },
  // the same with the document's own Latin faces under XeLaTeX (latinFontsFor, from the font probe of gt-orig.mjs)
  'zh-xecjk+a+t+f': { lang: 'zh', engine: 'xelatex', adapt: true, tables: true, fonts: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n' },
  'ja-xecjk+a+t+f': { lang: 'ja', engine: 'xelatex', adapt: true, tables: true, fonts: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[AutoFakeBold=2.5]{ipaexm.ttf}\n' },
  'ja-xecjk+a+t': { lang: 'ja', engine: 'xelatex', adapt: true, tables: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[AutoFakeBold=2.5]{ipaexm.ttf}\n' },
  'xe-only+a+f': { lang: 'zh', engine: 'xelatex', adapt: true, fonts: true, pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n', translate: false },
  // control: the engine switch alone, nothing translated — what XeLaTeX + xeCJK costs before the front end touches anything
  'xe-only': { lang: 'zh', engine: 'xelatex', pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n', translate: false },
}
const IMAGE = /\.(pdf|png|jpe?g|eps|ps|gif|tiff?|svg)$/i
// the document's font families per paper, from the probe in gt-orig.mjs's compiles of the originals
let fontsCache = null
const FONTS = () => (fontsCache ??= existsSync(new URL('../out/fonts.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('../out/fonts.json', import.meta.url), 'utf8')) : {})
export const walkFiles = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walkFiles(p) : [p] })

/** writes the variant's source to `work`; returns what the compile needs, or { result } when it cannot be prepared */
export function prepare(root, id, variant, work) {
  const st = STRATEGIES[variant]
  const src = join(root, 'data/corpus', id, 'src')
  const meta = analyze(src)
  const info = { id, variant, compiler: meta.compiler, documentclass: meta.documentclass, main: meta.main, bbl: meta.bbl, lang: st.lang }
  const engine = st.engine === 'keep' ? meta.compiler : st.engine
  info.engine = engine
  if (st.engine === 'keep' && meta.compiler !== 'pdflatex' && st.lang !== 'de') return { ...info, result: 'n/a' }
  let project
  try { project = loadProject(src, meta.main, { tables: !!st.tables }) } catch (e) { return { ...info, result: 'front-end-error', error: String(e).slice(0, 200) } }
  const translated = new Map(st.translate === false ? [] : project.units.map(u => [u, pseudoTranslate(u, st.lang)]))
  const files = patch(project, translated)
  info.units = project.units.length
  info.expectedCjk = 0; info.expectedDe = 0
  for (const pieces of translated.values()) for (const p of pieces) if (p.tr) { info.expectedCjk += (p.s.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length; info.expectedDe += (p.s.match(/Effizienz/g) ?? []).length }
  rmSync(work, { recursive: true, force: true })
  for (const f of walkFiles(src)) {
    const rel = relative(src, f), to = join(work, rel)
    mkdirSync(dirname(to), { recursive: true })
    if (IMAGE.test(f)) linkSync(f, to); else writeFileSync(to, readFileSync(f))
  }
  for (const [rel, bytes] of files) writeFileSync(join(work, rel), bytes)
  let main = readFileSync(join(work, project.main), 'latin1')
  const at = main.search(/\\begin\s*\{document\}/)
  if (at < 0) return { ...info, result: 'no-begin-document' }
  const fonts = st.fonts && engine === 'xelatex' ? latinFontsFor(FONTS()[id]) : ''
  info.fonts = fonts.trim().replace(/\n/g, ' ')
  main = main.slice(0, at) + (st.adapt ? FORBIDDEN_TO_WARNING : '') + st.pre + fonts + main.slice(at)
  // the translation is UTF-8, and a Latin-1 source was transcoded to UTF-8 on the way out: say so
  if (project.inputenc) main = main.replace(/(\\usepackage\s*\[)([^\]]*)(\]\s*\{inputenc\})/, (m, a1, opts, a3) => a1 + opts.split(',').map(o => (o.trim() === project.inputenc ? 'utf8' : o)).join(',') + a3)
  if (engine === 'xelatex') main = XETEX_SHIM + (st.adapt ? XETEX_SHIM_R1 : '') + main
  if (engine === 'xelatex' && st.adapt) {
    main = stripPdftexOption(main)
    for (const f of walkFiles(work)) if (/\.(tex|sty|cls)$/i.test(f) && f !== join(work, project.main)) { const t = readFileSync(f, 'latin1'), u = stripPdftexOption(t); if (u !== t) writeFileSync(f, Buffer.from(u, 'latin1')) }
  }
  writeFileSync(join(work, project.main), Buffer.from(main, 'latin1'))
  return info
}
