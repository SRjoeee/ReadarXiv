// Spike A: can each translated paragraph of a translated LaTeX project be located in the compiled translated PDF,
// from the PDF.js text layer alone? CJK is matched per character, Latin per word. Prints statistics only.
//   node spikes/align-tex.mjs <dir with .tex files> <translated.pdf>
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const [texDir, pdfPath] = process.argv.slice(2)
const GAP = '\u0000'
const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/
// tokens: one per CJK character, one per run of other letters or digits
function tokens(s) {
  const out = []
  for (const m of s.normalize('NFKC').toLowerCase().matchAll(/[㐀-鿿豈-﫿぀-ヿ가-힯]|[\p{L}\p{N}]+/gu)) {
    if (CJK.test(m[0])) out.push({ t: m[0], at: m.index, len: 1 })
    else for (const part of m[0].split(CJK).filter(Boolean)) out.push({ t: part, at: m.index, len: part.length })
  }
  return out
}

// ---- PDF side
const pdf = await getDocument({ data: new Uint8Array(readFileSync(pdfPath)), verbosity: 0, cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).pathname, cMapPacked: true, standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise
const words = []
for (let p = 1; p <= pdf.numPages; p++) {
  const { items } = await (await pdf.getPage(p)).getTextContent()
  for (const it of items) {
    if (!it.str) continue
    for (const tk of tokens(it.str)) words.push({ t: tk.t, page: p, x: it.transform[4] + (it.width * tk.at) / it.str.length, y: it.transform[5], h: it.height })
  }
}

// ---- LaTeX side: paragraphs of prose, math and references turned into gaps, commands unwrapped
function files(dir) { return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.tex') ? [p] : [] }) }
const SKIP_ENV = /\\begin\{(equation|align|gather|multline|eqnarray|tabular|tikzpicture|lstlisting|verbatim|algorithm|algorithmic|forest|thebibliography)\*?\}[\s\S]*?\\end\{\1\*?\}/g
const blocks = []
for (const file of files(texDir)) {
  let s = readFileSync(file, 'utf8').replace(/(^|[^\\])%.*$/gm, '$1')
  const body = s.indexOf('\\begin{document}')
  if (body >= 0) s = s.slice(body)
  s = s.replace(SKIP_ENV, `\n\n`)
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$]*\$|\\\([\s\S]*?\\\)/g, ` ${GAP} `)
    .replace(/\\(cite[a-z]*|ref|eqref|autoref|cref|Cref|label|includegraphics|input|bibliography|bibliographystyle|url|href)\*?(\[[^\]]*\])*\{[^}]*\}/g, ` ${GAP} `)
    .replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?/g, '\n\n')
    .replace(/\\(section|subsection|subsubsection|paragraph|caption|title)\*?(\[[^\]]*\])?\{/g, '\n\n{')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}~]/g, ' ')
  for (const para of s.split(/\n\s*\n/)) {
    const ws = para.split(/\s+/).flatMap(w => (w === GAP ? [GAP] : tokens(w).map(t => t.t)))
    const real = ws.filter(w => w !== GAP)
    if (real.length) blocks.push({ ws, real: real.length, cjk: real.filter(w => CJK.test(w)).length })
  }
}

// ---- the matcher of align.mjs: anchors, longest rising chain, bounded fill
const K = 3
const index = new Map()
for (let j = 0; j + K <= words.length; j++) { const key = words.slice(j, j + K).map(w => w.t).join(' '); (index.get(key) ?? index.set(key, []).get(key)).push(j) }
function locate(ws) {
  const hits = []
  for (let i = 0; i + K <= ws.length; i++) { const g = ws.slice(i, i + K); if (!g.includes(GAP)) for (const j of index.get(g.join(' ')) ?? []) hits.push([i, j]) }
  if (!hits.length) return null
  hits.sort((a, b) => a[1] - b[1])
  const span = ws.length * 3 + 80
  let best = [0, 0, 0]
  for (let lo = 0, hi = 0; lo < hits.length; lo++) { while (hi < hits.length && hits[hi][1] - hits[lo][1] <= span) hi++; if (hi - lo > best[0]) best = [hi - lo, lo, hi] }
  let win = hits.slice(best[1], best[2]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (win.length > 1500) win = win.filter((_, n) => n % Math.ceil(win.length / 1500) === 0)
  const len = win.map(() => 1), prev = win.map(() => -1)
  let tail = 0
  for (let a = 0; a < win.length; a++) { for (let b = 0; b < a; b++) if (win[b][0] < win[a][0] && win[b][1] < win[a][1] && len[b] + 1 > len[a]) { len[a] = len[b] + 1; prev[a] = b } if (len[a] > len[tail]) tail = a }
  const at = new Map()
  for (let a = tail; a !== -1; a = prev[a]) for (let k = 0; k < K; k++) if (!at.has(win[a][0] + k)) at.set(win[a][0] + k, win[a][1] + k)
  const anchored = [...at.keys()].sort((a, b) => a - b)
  const bounds = [[-1, at.get(anchored[0]) - (anchored[0] * 3 + 20)], ...anchored.map(i => [i, at.get(i)]), [ws.length, at.get(anchored.at(-1)) + (ws.length - anchored.at(-1)) * 3 + 20]]
  for (let b = 0; b + 1 < bounds.length; b++) { let j = Math.max(0, bounds[b][1] + 1); const stop = Math.min(words.length, bounds[b + 1][1]); for (let i = bounds[b][0] + 1; i < bounds[b + 1][0]; i++) { if (ws[i] === GAP) continue; for (let k = j; k < stop; k++) if (words[k].t === ws[i]) { at.set(i, k); j = k + 1; break } } }
  return [...at.values()].sort((a, b) => a - b)
}

const stat = { blocks: 0, short: 0, hi: 0, mid: 0, lo: 0, frag1: 0, frag2: 0, frag3: 0 }
const t0 = performance.now()
for (const b of blocks) {
  if (b.cjk < b.real * 0.3) continue // untranslated material (tables, names, English left in place) is not what is asked here
  stat.blocks++
  if (b.real < 12) { stat.short++; continue }
  const m = locate(b.ws)
  const cov = m ? m.length / b.real : 0
  if (cov >= 0.85) { stat.hi++; let f = 1; for (let i = 1; i < m.length; i++) if (words[m[i]].page !== words[m[i - 1]].page || words[m[i]].y > words[m[i - 1]].y + 40) f++; f === 1 ? stat.frag1++ : f === 2 ? stat.frag2++ : stat.frag3++ }
  else if (cov >= 0.5) stat.mid++
  else stat.lo++
}
console.log(JSON.stringify({ pdf: pdfPath.split('/').pop().slice(-30), pages: pdf.numPages, pdfTokens: words.length, matchMs: Math.round(performance.now() - t0), stat }))
