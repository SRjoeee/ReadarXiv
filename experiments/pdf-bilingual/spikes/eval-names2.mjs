// The name rule on top of joined figures: of the boxes the rule calls names that the engine still changes when the
// figure goes as one text (out/eval-join2-<lang>.json, 20 boxes a text, repeats once), which it saves (a name the
// engine mistranslated) and which it spoils (a word the engine translated right). The verdicts are a reading of the
// 140 distinct boxes, by hand, recorded here; a stricter rule is scored on the same verdicts (it can only drop boxes).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isName } from '../poc-reader/mt.mjs'
const root = new URL('..', import.meta.url).pathname
const d = JSON.parse(readFileSync(join(root, 'out/eval-join2-zh.json'), 'utf8'))
const papers = new Map(JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8')).map(p => [p.id, p.prose]))
const SAVES = new Set(['SpEED', 'Gemini-2.5-Flash', 'TensorCast', 'Mooncake', 'Sigmoid', 'Fr', 'Romance', 'Rotten Tomatoes', 'WikiText-2', 'Muon', 'Ant', 'Ant Big Maze', 'Ant Ball', 'Ant Push', 'Humanoid', 'cube-single-noisy-v0', 'cube-single-noisy-v0 (σ=1.0)', 'Ant Hardest Maze', 'CRL', 'puzzle-4x4-play', 'puzzle-4x4-noisy', 'puzzle-3x3-play', 'puzzle-4x5-play', 'puzzle-4x6-play', 'puzzle-3x3-noisy', 'puzzle-4x5-noisy', 'puzzle-4x6-noisy', 'Humanoid Big Maze', 'Humanoid Hardest Maze', 'Pile-2B 2-layer', 'Pile-2B 4-layer', 'BabyLM-10M BabyLM-100M Pile-2B', 'MedQA', 'DocBlocks', 'MATH', 'Magicoder', '(a2) Llama3-8B-Instruct, lr=2e-4', '(b3) Qwen2.5-7B-Instruct', 'Llama3-8B-Instruct', 'Beavertails', 'Aegis', 'Qwen2.5-7B-Instruct', 'ID', 'BP2 : M', 'OpenAI Anthropic Google', 'Opus 4.7', 'Opus 4.6', 'Opus 5', 'Ag', 'MIA AUC', '=1[correct ∧C(τ) ≤B]', 'Haiku', 'EmoDialogue', 'DISTS ↓', 'ECSD-Zero', 'Intern-S2-Preview-397B', 'VideoCoF', 'Qwen3.8-Max-Preview', 'DeepSeek-V4-Pro-Preview', 'Claude', 'Gemini', '2. Fable5', '5. Qwen3.8-Max-Preview', '7. Kimi K3', 'BadSpend%', 'Claude Opus 4.6', 'Claude Opus 4.7', 'Qwen3.8-Max-Preview 1', '5 Qwen3.8-Max-Preview', '11 DeepSeek-V4-Pro-Preview', '18 Qwen3.5-Plus', 'Qwen3.5-Plus 18', 'Claude Opus 4.8', 'MuSiQue-full'])
const NEUTRAL = new Set(['tJ/ℏ'])
const norm = s => (s ?? '').replace(/\s+/g, '').replace(/[，,。.、：:;；（）()]/g, '').toLowerCase()
const same = (a, b) => norm(a) === norm(b)
const rows = d.rows['20-dedupe']
const RULES = {
  now: isName,
  // an all-capital word the paper writes in lower case too is a word set in capitals (CONTENTS, INPUT, PASS)
  capsCommon(text, prose) {
    if (!isName(text, prose)) return false
    const quote = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.replace(/\s+/g, ' ').trim().split(' ').every(w => {
      const bare = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
      if (!/^[A-Z][A-Z-]*[A-Z]$/.test(bare)) return true
      return bare.split('-').some(piece => !new RegExp(`(^|[^A-Za-z])${quote(piece.toLowerCase())}($|[^A-Za-z])`).test(prose))
    })
  },
}
for (const [name, rule] of Object.entries(RULES)) {
  const flagged = new Map()
  for (const r of rows) if (!same(r.together, r.text) && rule(r.text, papers.get(r.id))) flagged.set(r.text, r)
  const saves = [...flagged.keys()].filter(t => SAVES.has(t))
  const spoils = [...flagged.keys()].filter(t => !SAVES.has(t) && !NEUTRAL.has(t))
  console.log(`${name}: flagged ${flagged.size}, saves ${saves.length}, spoils ${spoils.length}`)
  if (name !== 'now') { console.log('  saves lost:', [...SAVES].filter(t => [...RULES.now === rule ? [] : [t]].length && !flagged.has(t) && rows.some(r => r.text === t && !same(r.together, r.text) && RULES.now(r.text, papers.get(r.id)))).join(' | ')); console.log('  spoils left:', spoils.join(' | ')) }
}
