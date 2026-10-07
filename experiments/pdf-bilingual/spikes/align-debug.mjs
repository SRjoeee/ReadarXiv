// Debug view of align.mjs: for blocks below 0.85, which words failed — short samples, for diagnosis only
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('./align.mjs', import.meta.url), 'utf8')
  .replace(/const stat = \{\}[\s\S]*$/, `
let shown = 0
for (const b of blocks) {
  if (b.kind !== 'para' || b.ws.length < 6) continue
  const m = locate(b.ws) ?? []
  const cov = m.length / b.ws.length
  if (cov >= 0.85 || shown >= 8) continue
  shown++
  const got = new Set(m.map(k => words[k].t))
  const missing = b.ws.filter(w => !got.has(w)).slice(0, 14)
  console.log(cov.toFixed(2), 'len', b.ws.length, 'math', b.mathy, '| first:', b.ws.slice(0, 5).join(' '), '| missing:', missing.join(' '))
}
// how does the PDF stream look around a line end?
console.log('sample pdf words 200..240:', words.slice(200, 240).map(w => w.t).join(' '))
`)
const { writeFileSync } = await import('node:fs')
writeFileSync(new URL('./.align-debug-run.mjs', import.meta.url), src)
await import('./.align-debug-run.mjs')
