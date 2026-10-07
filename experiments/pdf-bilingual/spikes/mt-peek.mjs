// A few units whose markers did not come back: the wire text sent and the text received, cut to 180 characters.
// For diagnosing the marker loss; prints short excerpts only.
import { analyze } from './paper-meta.mjs'
import { loadProject } from './latex-front.mjs'
const [id, lang = 'zh-Hans', n = 4] = process.argv.slice(2)
const src = new URL(`../data/corpus/${id}/src`, import.meta.url).pathname
const p = loadProject(src, analyze(src).main)
const toAlpha = i => { let x = i, o = ''; while (x > 0) { const r = (x - 1) % 26; o = String.fromCharCode(97 + r) + o; x = (x - 1 - r) / 26 } return o }
const utf8 = s => Buffer.from(s, 'latin1').toString('utf8')
const wires = p.units.map(u => { let w = '', k = 0; for (const x of u.pieces) { if (x.t === 'text') w += utf8(x.s).replace(/\s+/g, ' '); else { const m = `@${toAlpha(++k)}#`; w += (/\p{L}$/u.test(w) ? ' ' : '') + m + ' ' } } return { w: w.trim(), k } })
const withMarkers = wires.map((x, i) => ({ ...x, i })).filter(x => x.k > 0).slice(0, 40)
const res = await (await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: '', to: lang, isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withMarkers.map(x => x.w.replace(/@(?![a-z]+#)/g, '@@'))) })).json()
let shown = 0
res.forEach((r, j) => {
  const t = r.translations[0].text, want = withMarkers[j].k
  const got = new Set((t.match(/@([a-z]+)#/g) ?? []))
  if (got.size === want || shown >= Number(n)) return
  shown++
  console.log(`--- expected ${want}, got ${got.size}\n  sent: ${withMarkers[j].w.slice(0, 180)}\n  back: ${t.slice(0, 180)}`)
})
