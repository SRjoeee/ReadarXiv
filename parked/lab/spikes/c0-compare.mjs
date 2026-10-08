// Beyond "a PDF came out": each compiled PDF against arXiv's own — word overlap, unresolved references ("??" and "[?]"),
// embedded images. Then a folder to look at the PDFs side by side: compare/<id>/{arxiv,native,browser}.pdf (symlinks) and
// compare/index.html. Output: out/c0-compare.json
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const native = Object.fromEntries(JSON.parse(readFileSync(join(root, 'out/c0-native.json'), 'utf8')).map(r => [r.id, r]))
const BROWSER = process.env.BROWSER ?? 'out/c0-browser.json'
const browser = existsSync(join(root, BROWSER)) ? Object.fromEntries(JSON.parse(readFileSync(join(root, BROWSER), 'utf8')).map(r => [r.id, r])) : {}
const unpatched = existsSync(join(root, 'out/c0-browser.json')) ? Object.fromEntries(JSON.parse(readFileSync(join(root, 'out/c0-browser.json'), 'utf8')).map(r => [r.id, r])) : {}
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }

function profile(pdf) {
  if (!existsSync(pdf)) return null
  const text = sh('pdftotext', ['-q', pdf, '-']) ?? ''
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
  const bag = new Map()
  for (const w of words) bag.set(w, (bag.get(w) ?? 0) + 1)
  const images = (sh('pdfimages', ['-list', pdf]) ?? '').split('\n').filter(l => /^\s*\d+\s+\d+\s+image/.test(l)).length
  return { words: words.length, bag, unresolved: (text.match(/\?\?|\[\?\]/g) ?? []).length, images }
}
// share of arXiv's words (with multiplicity) that the compiled PDF also has
function overlap(a, b) { let common = 0, total = 0; for (const [w, n] of a.bag) { total += n; common += Math.min(n, b.bag.get(w) ?? 0) } return total ? common / total : 0 }

const rows = []
for (const id of Object.keys(native)) {
  const arxiv = profile(join(root, 'data/corpus', id, 'arxiv.pdf'))
  const stem = (native[id].main ?? '').split('/').pop().replace(/\.[^.]+$/, '')
  const n = profile(join(root, 'data/runs/native', id, `${stem}.pdf`))
  const b = profile(join(root, 'data/runs/browser', `${id}.pdf`))
  const cmp = x => x && arxiv ? { words: +overlap(arxiv, x).toFixed(3), unresolved: x.unresolved, images: x.images } : null
  rows.push({ id, documentclass: native[id].documentclass, compiler: native[id].compiler, arxiv: arxiv && { unresolved: arxiv.unresolved, images: arxiv.images, pages: native[id].arxivPages },
    native: { result: native[id].result, pages: native[id].pages, seconds: Math.round(native[id].ms / 1000), ...cmp(n) },
    browser: browser[id] ? { result: browser[id].result, pages: browser[id].pages, seconds: browser[id].compileMs ? +(browser[id].compileMs / 1000).toFixed(1) : null, remoteFiles: browser[id].remote?.n, remoteKB: browser[id].remote ? Math.round(browser[id].remote.bytes / 1024) : null, peakMB: browser[id].peakRendererMB, error: browser[id].firstError || browser[id].error || '', ...cmp(b) } : null })
}
writeFileSync(join(root, 'out/c0-compare.json'), JSON.stringify(rows, null, 1))

// the folder to look at
const cmpDir = join(root, 'compare')
rmSync(cmpDir, { recursive: true, force: true })
for (const r of rows) {
  const d = join(cmpDir, r.id); mkdirSync(d, { recursive: true })
  const stem = (native[r.id].main ?? '').split('/').pop().replace(/\.[^.]+$/, '')
  const link = (from, to) => { if (existsSync(from)) symlinkSync(from, join(d, to)) }
  link(join(root, 'data/corpus', r.id, 'arxiv.pdf'), 'arxiv.pdf')
  link(join(root, 'data/runs/native', r.id, `${stem}.pdf`), 'native.pdf')
  link(join(root, 'data/runs/browser', `${r.id}.pdf`), 'browser.pdf')
}
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const cell = (r, side) => { const x = r[side]; if (!x) return '<td>–</td><td></td><td></td>'; const ok = x.result === 'pass'; return `<td class="${ok ? 'ok' : 'bad'}"><a href="${r.id}/${side}.pdf">${esc(x.result)}</a></td><td>${x.pages ?? '–'}</td><td>${x.words ?? '–'}${x.unresolved != null && r.arxiv && x.unresolved > r.arxiv.unresolved ? ` <span class="bad">??+${x.unresolved - r.arxiv.unresolved}</span>` : ''}</td>` }
writeFileSync(join(cmpDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>C0 compile comparison</title>
<style>body{font:13px system-ui;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 6px}.ok{background:#e6f4ea}.bad{background:#fce8e6}</style>
<h1>C0: unchanged arXiv sources, compiled natively (TeX Live 2026) and in the browser (BusyTeX)</h1>
<p>browser.pdf is from ${esc(BROWSER)} (the patched pipeline when that file says so). The column “unpatched” is the first browser run with BusyTeX as published.</p>
<p>Each row links to arXiv's PDF and the two compiles. "words" = share of arXiv's words the compile also has; "??+n" = more unresolved references than arXiv's PDF.</p>
<p>Chinese spike (2609.03768): <a href="../out/busytex-zh-xelatex.pdf">browser XeLaTeX + ctex</a> · <a href="../out/busytex-original.pdf">browser pdfLaTeX, unchanged</a> · <a href="../data/2609.03768v1.pdf">arXiv's PDF</a></p>
<table><tr><th>paper</th><th>class</th><th>engine</th><th>arXiv</th><th colspan=3>native</th><th colspan=3>browser</th><th>unpatched</th><th>browser s</th><th>remote files</th><th>error</th></tr>
${rows.map(r => `<tr><td>${r.id}</td><td>${esc(r.documentclass)}</td><td>${esc(r.compiler)}</td><td><a href="${r.id}/arxiv.pdf">${r.arxiv?.pages ?? '–'} p</a></td>${cell(r, 'native')}${cell(r, 'browser')}<td class="${unpatched[r.id]?.result === 'pass' ? 'ok' : 'bad'}">${esc(unpatched[r.id]?.result ?? '')}</td><td>${r.browser?.seconds ?? ''}</td><td>${r.browser?.remoteFiles ?? ''}</td><td>${esc((r.browser?.error ?? '').slice(0, 80))}</td></tr>`).join('\n')}
</table>`)
const summary = side => { const xs = rows.map(r => r[side]).filter(Boolean); return { n: xs.length, pass: xs.filter(x => x.result === 'pass').length, wordsBelow95: xs.filter(x => x.words != null && x.words < 0.95).length, moreUnresolved: rows.filter(r => r[side] && r.arxiv && r[side].unresolved > r.arxiv.unresolved).length, fewerImages: rows.filter(r => r[side] && r.arxiv && r[side].images < r.arxiv.images).length } }
console.log(JSON.stringify({ native: summary('native'), browser: summary('browser') }))
