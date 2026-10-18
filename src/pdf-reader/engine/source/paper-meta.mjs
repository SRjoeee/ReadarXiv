// What arXiv would compile, and the features a failure might hang on. The main file and compiler come from arXiv's own
// 00README.json when the package carries one (arXiv writes it on submission); otherwise from the same heuristics as
// arXiv's preflight, in simplified form.
// Runs in Node and in the browser alike: `fsys` is a file system of latex-front.mjs (inMemory), or of node-files.mjs (folder:
// a directory under Node, which the spikes' paper-meta.mjs hands in).
import { jobName, latin1, normalizePath } from './latex-front.mjs'

const uncomment = s => s.replace(/(^|[^\\])%.*$/gm, '$1')
const basename = p => p.slice(p.lastIndexOf('/') + 1)
const extname = p => { const b = basename(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : '' }
const utf8 = bytes => new TextDecoder().decode(bytes)

export function analyze(fsys) {
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
      const main = r.sources?.find(s => s.usage === 'toplevel')?.filename
      // the file the package holds (latex-front.mjs normalizePath), whatever spelling named it
      meta.main = main && normalizePath(main)
      meta.compiler = r.process?.compiler
      meta.tlVersion = r.texlive_version ?? null
    } catch { meta.readme = 'json-unreadable' }
  } else if (files.find(f => /^00README(\.XXX)?$/i.test(f))) {
    meta.readme = 'legacy'
    const r = utf8(fsys.read(files.find(f => /^00README(\.XXX)?$/i.test(f))))
    const main = r.match(/^(\S+)\s+toplevelfile/m)?.[1]
    meta.main = main && normalizePath(main)
  }
  const withClass = tex.filter(f => /\\document(class|style)\b/.test(bodies[f]))
  if (!meta.main || !files.includes(meta.main)) {
    meta.mainGuessed = true
    const included = new Set()
    // a part is no main: each file named by \input, \include or \subfile, or import.sty's {dir}{file}, by the name the
    // package holds it under (\subfile{./chapters/ch1}: chapters/ch1.tex, a subfile's own \documentclass and all)
    for (const f of tex) for (const m of bodies[f].matchAll(/\\(input|include|subfile|(?:sub)?(?:import|inputfrom|includefrom))\s*\*?\s*\{([^}]+)\}(?:\s*\{([^}]+)\})?/g)) { const n = normalizePath(/^(input|include|subfile)$/.test(m[1]) || m[3] === undefined ? m[2].trim() : `${m[2].trim()}/${m[3].trim()}`); included.add(n); included.add(`${n}.tex`) }
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
  // the bibliography TeX reads, in the root under the job's name (a main file in a directory: latex/arxiv.tex → arxiv.bbl)
  meta.bbl = files.includes(`${jobName(meta.main)}.bbl`)
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

