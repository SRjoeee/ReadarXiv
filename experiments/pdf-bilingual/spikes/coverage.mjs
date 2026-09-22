// Coverage sample: for recent arXiv papers across fields, is there arXiv HTML, and is there TeX source?
// One request every 3.2 s (arXiv asks for no more than one per 3 s). Output: out/coverage.json
import { writeFileSync } from 'node:fs'
const CATS = ['cs.LG', 'cs.CL', 'cs.CV', 'math.AP', 'math.CO', 'hep-th', 'astro-ph.GA', 'cond-mat.mes-hall', 'quant-ph', 'stat.ML', 'q-bio.NC', 'eess.SP', 'econ.EM', 'physics.optics']
const PER_CAT = 6
const UA = 'ReadarXiv-research/0.1 (coverage sample; contact via github.com/SRjoeee/ReadarXiv)'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = []
for (const cat of CATS) {
  // submitted 10–20 days ago, so announcement and HTML conversion have certainly happened
  const q = `https://export.arxiv.org/api/query?search_query=cat:${cat}+AND+submittedDate:[202609020000+TO+202609120000]&sortBy=submittedDate&sortOrder=descending&max_results=${PER_CAT}`
  const xml = await (await fetch(q, { headers: { 'User-Agent': UA } })).text()
  await sleep(3200)
  const ids = [...xml.matchAll(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/g)].map(m => m[1])
  for (const id of ids) {
    const row = { cat, id }
    try {
      const h = await fetch(`https://arxiv.org/html/${id}`, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } })
      row.html = h.status
      await sleep(3200)
      const s = await fetch(`https://arxiv.org/e-print/${id}`, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } })
      row.src = s.status; row.srcType = s.headers.get('content-type'); row.srcLen = Number(s.headers.get('content-length') ?? 0)
      row.srcName = s.headers.get('content-disposition'); row.acao = s.headers.get('access-control-allow-origin')
      await sleep(3200)
    } catch (e) { row.error = String(e) }
    out.push(row); console.log(JSON.stringify(row))
    writeFileSync(new URL('../out/coverage.json', import.meta.url), JSON.stringify(out, null, 1))
  }
}
