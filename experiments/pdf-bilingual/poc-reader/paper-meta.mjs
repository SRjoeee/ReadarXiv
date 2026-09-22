// What arXiv would compile, and the features a failure might hang on. The main file and compiler come from arXiv's own
// 00README.json when the package carries one (arXiv writes it on submission); otherwise from the same heuristics as
// arXiv's preflight, in simplified form.
// Runs in Node and in the browser alike: `dir` is a directory (Node) or a file system of latex-front.mjs (folder,
// inMemory).
import { folder, latin1 } from './latex-front.mjs'

const uncomment = s => s.replace(/(^|[^\\])%.*$/gm, '$1')
const basename = p => p.slice(p.lastIndexOf('/') + 1)
const extname = p => { const b = basename(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : '' }
const utf8 = bytes => new TextDecoder().decode(bytes)

export function analyze(dir) {
  const fsys = typeof dir === 'string' ? folder(dir) : dir
  const files = fsys.list()
  const tex = files.filter(f => /\.(tex|ltx|latex)$/i.test(f))
  const read = f => { const b = fsys.read(f); return b ? uncomment(latin1(b)) : '' }
  const bodies = Object.fromEntries(tex.map(f => [f, read(f)]))
  const meta = { files: files.length, texFiles: tex.length }

  // arXiv's instructions for the package
  const readmeJson = files.find(f => f === '00README.json')
  if (readmeJson) {
    try {
      const r = JSON.parse(utf8(fsys.read(readmeJson)))
      meta.readme = 'json'
      meta.main = r.sources?.find(s => s.usage === 'toplevel')?.filename
      meta.compiler = r.process?.compiler
      meta.tlVersion = r.texlive_version ?? null
    } catch { meta.readme = 'json-unreadable' }
  } else if (files.find(f => /^00README(\.XXX)?$/i.test(f))) {
    meta.readme = 'legacy'
    const r = utf8(fsys.read(files.find(f => /^00README(\.XXX)?$/i.test(f))))
    meta.main = r.match(/^(\S+)\s+toplevelfile/m)?.[1]
  }
  const withClass = tex.filter(f => /\\document(class|style)\b/.test(bodies[f]))
  if (!meta.main || !files.includes(meta.main)) {
    meta.mainGuessed = true
    const included = new Set()
    for (const f of tex) for (const m of bodies[f].matchAll(/\\(?:input|include|subfile)\s*\{([^}]+)\}/g)) { const n = m[1].trim(); included.add(n); included.add(`${n}.tex`) }
    let cands = withClass.filter(f => !included.has(f) && !included.has(f.replace(/\.tex$/, '')))
    if (!cands.length) cands = withClass
    cands.sort((a, b) => (/^(main|ms|paper|manuscript|arxiv)\.tex$/i.test(basename(b)) - /^(main|ms|paper|manuscript|arxiv)\.tex$/i.test(basename(a))) || bodies[b].length - bodies[a].length)
    meta.main = cands[0] ?? null
    meta.mainCandidates = withClass.length
  }
  if (!meta.main) return { ...meta, verdict: 'no-main' }

  const main = bodies[meta.main] ?? read(meta.main)
  const all = Object.values(bodies).join('\n')
  meta.documentclass = main.match(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)?.[1]?.trim() ?? (/\\documentstyle/.test(main) ? 'LaTeX 2.09' : null)
  meta.classLocal = meta.documentclass ? files.some(f => basename(f) === `${meta.documentclass}.cls`) : false
  meta.localCls = files.filter(f => f.endsWith('.cls')).length
  meta.localSty = files.filter(f => f.endsWith('.sty')).length
  meta.inputs = (all.match(/\\(?:input|include|subfile)\s*\{/g) ?? []).length
  const stem = meta.main.replace(/\.[^.]+$/, '')
  meta.bbl = files.includes(`${stem}.bbl`)
  meta.bib = files.some(f => f.endsWith('.bib'))
  meta.biblatex = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bbiblatex\b/.test(all)
  const exts = files.map(f => extname(f).toLowerCase())
  meta.eps = exts.filter(e => e === '.eps' || e === '.ps').length
  meta.rasterOrPdf = exts.filter(e => ['.pdf', '.png', '.jpg', '.jpeg'].includes(e)).length
  meta.unicodeEngineOnly = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(fontspec|xeCJK|unicode-math|polyglossia|luatexja)\b/.test(all)
  meta.shellEscape = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(minted|svg|pythontex|shellesc)\b/.test(all) || /\\write18/.test(all)
  meta.tikz = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(tikz|pgfplots)\b/.test(all)
  if (!meta.compiler) {
    meta.compilerGuessed = true
    meta.compiler = meta.unicodeEngineOnly ? 'xelatex' : meta.eps && !meta.rasterOrPdf ? 'latex' : 'pdflatex'
  }
  return meta
}

// run as a script under Node: node paper-meta.mjs <dir>
if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(analyze(process.argv[2]), null, 1))
