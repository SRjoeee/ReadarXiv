// Second pass over the coverage sample: is the HTML arXiv serves a usable conversion? Judged by content, since a
// failed conversion is served with HTTP 200 too. Records counts only. One request every 3.2 s.
import { readFileSync, writeFileSync } from 'node:fs'
const UA = 'ReadarXiv-research/0.1 (coverage sample; contact via github.com/SRjoeee/ReadarXiv)'
const rows = JSON.parse(readFileSync(new URL('../out/coverage.json', import.meta.url)))
const out = []
for (const { cat, id } of rows) {
  const row = { cat, id }
  try {
    const res = await fetch(`https://arxiv.org/html/${id}`, { headers: { 'User-Agent': UA } })
    const s = await res.text()
    row.status = res.status; row.bytes = s.length
    row.p = (s.match(/class="ltx_p/g) ?? []).length
    row.errors = (s.match(/class="[^"]*ltx_ERROR/g) ?? []).length
    row.math = (s.match(/<math /g) ?? []).length
    row.untitled = /<title>\s*Untitled Document/.test(s)
    row.generator = (s.match(/LaTeXML[^"<]{0,40}/) ?? [''])[0]
  } catch (e) { row.error = String(e) }
  out.push(row); console.log(JSON.stringify(row))
  writeFileSync(new URL('../out/coverage-html.json', import.meta.url), JSON.stringify(out, null, 1))
  await new Promise(r => setTimeout(r, 3200))
}
