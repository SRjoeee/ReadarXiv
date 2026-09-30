// Offline ablation only: one common median estimator, with writing-system profile data.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
export const CASES = [['zh', '2212.06817'], ['ja', '2608.05876'], ['ko', '2608.21180'], ['de', '2608.06701'], ['ru', '2608.24839']]
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const group = lang => ['zh', 'ja', 'ko'].includes(lang) ? lang : 'alphabet'
const median = xs => { const s = xs.slice().sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 }
export function profileRecords(root) {
  const out = []
  for (const lang of ['zh', 'ja', 'ko', 'de', 'ru']) for (const paper of readdirSync(join(root, lang))) {
    const file = join(root, lang, paper, 'index.json')
    if (!existsSync(file)) continue
    const bytes = readFileSync(file), r = JSON.parse(bytes), f = r.numbers?.fit
    if (f && Number.isFinite(f.g) && Number.isFinite(f.size)) out.push({ lang, paper, group: group(lang), file, hash: digest(bytes), g: f.g, size: f.size, type: f.type })
  }
  return out
}
export function profileFor(records, lang, paper) {
  const training = records.filter(r => r.paper !== paper && r.group === group(lang))
  if (!training.length || group(lang) !== 'alphabet' && training.some(r => !r.type)) throw new Error('Incomplete training profile')
  const cjk = group(lang) !== 'alphabet'
  return { group: group(lang), training: training.map(r => ({ lang: r.lang, paper: r.paper, hash: r.hash })),
    lead: cjk ? median(training.map(r => r.type.lead)) : Math.max(0.95, Math.min(1.1, median(training.map(r => r.g)))),
    track: cjk ? median(training.map(r => r.type.track)) : 0,
    scale: cjk ? median(training.map(r => r.type.scale)) : median(training.map(r => r.size)), cjk }
}
