// What a compiled PDF holds, compared with arXiv's own: words, unresolved references ("??", "[?]"), embedded images
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
export function profile(pdf) {
  if (!existsSync(pdf)) return null
  const text = sh('pdftotext', ['-q', pdf, '-']) ?? ''
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
  const bag = new Map()
  for (const w of words) bag.set(w, (bag.get(w) ?? 0) + 1)
  const images = (sh('pdfimages', ['-list', pdf]) ?? '').split('\n').filter(l => /^\s*\d+\s+\d+\s+image/.test(l)).length
  const pages = Number(sh('pdfinfo', [pdf])?.match(/^Pages:\s+(\d+)/m)?.[1]) || null
  return { pages, words: words.length, bag, unresolved: (text.match(/\?\?|\[\?\]/g) ?? []).length, images }
}
/** share of a's words (with multiplicity) that b also has */
export function overlap(a, b) { let common = 0, total = 0; for (const [w, n] of a.bag) { total += n; common += Math.min(n, b.bag.get(w) ?? 0) } return total ? common / total : 0 }
