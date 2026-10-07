// The capsule's dev page (a dev page, like the gallery: wxt.config.ts DEV_PAGES keeps it out of a release): the shared
// Capsule on the reader's sheet, playing a run as the website shows one (the web's round 4: queued → preparing →
// translating, its count arriving in bursts → a digit gained → making the pages → the capsule leaving), for
// tests/e2e/probes/capsule.mjs to record frame by frame, and to watch in a real browser. `?lang=zh-CN|en` the interface's
// language; `?chip=1` brings the chip that shows the translation with the first preview, as a narrow window does while
// the translation is not on screen. `window.__capsule` plays the run, or sets one state at a time. The words are round 4's (its `T`): the website's
// copy, which the extension's packs do not hold
import '../pdf-reader/reader.css'
import { Info } from 'lucide'
import { StrictMode, useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Capsule } from '@/pdf-reader/ui/Capsule'
import { plain, withCount } from '@/pdf-reader/ui/capsule-words'

type Stage = 'queued' | 'preparing' | 'translating' | 'typesetting'
/** a moment of the run: its stage, the passages translated of all, the preview's pages; or a sentence of its own */
interface Step { stage: Stage | null; n: number; total: number; pages: number; text?: string }

const query = new URLSearchParams(location.search)
const lang = query.get('lang') === 'en' ? 'en' : 'zh-CN'
const chipWanted = query.get('chip') === '1'
document.documentElement.lang = lang

// round 4's words (index.html `T`); the short count below 400 px in English (approved 2026-10-04)
const WORDS = {
  'zh-CN': { queued: '排队中', preparing: '正在准备', translating: '正在翻译 · {n} / {N} 段', short: '', typesetting: '正在生成页面', show: '查看译文', join: '，', count: '{n} / {N} 段' },
  en: { queued: 'Waiting in line', preparing: 'Preparing', translating: 'Translating · {n} of {N} passages', short: 'Translating {n} of {N}', typesetting: 'Making the pages', show: 'Show translation', join: ', ', count: '{n} of {N} passages' },
}[lang]
const fill = (t: string, s: Step) => t.replace('{n}', String(s.n)).replace('{N}', String(s.total))

// ------------------------------------------------------------------ the run's state, outside React
let step: Step | null = null
const listeners = new Set<() => void>()
const set = (next: Step | null) => {
  step = next
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** round 4's run (`play`, its seed 11): passages arrive in bursts, several within tens of ms, then a pause; returns its length in ms */
function play(): number {
  const timers: number[] = []
  const at = (ms: number, s: Step | null) => timers.push(window.setTimeout(() => set(s), ms))
  const total = 86
  let t = 0
  at(t, { stage: 'queued', n: 0, total, pages: 0 })
  t += 2200
  at(t, { stage: 'preparing', n: 0, total, pages: 0 })
  t += 1800
  at(t, { stage: 'translating', n: 0, total, pages: 0 })
  let n = 0, seed = 11
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  while (n < total) {
    t += 380 + rnd() * 900
    const burst = 1 + Math.floor(rnd() * 3)
    let tt = t
    for (let j = 0; j < burst && n < total; j++) {
      n = Math.min(total, n + 1 + Math.floor(rnd() * 5))
      at(tt, { stage: 'translating', n, total, pages: n >= 80 ? 11 : n >= 56 ? 6 : n >= 28 ? 2 : 0 })
      tt += 15 + rnd() * 45
    }
  }
  t += 600
  at(t, { stage: 'typesetting', n: total, total, pages: 11 })
  t += 3400
  at(t, null)
  stopping = () => { for (const id of timers) clearTimeout(id) }
  return t
}
let stopping = () => {}

declare global {
  interface Window { __capsule: { play(): number; set(s: Step | null): void; stop(): void } }
}
window.__capsule = { play: () => { stopping(); return play() }, set: s => { stopping(); set(s) }, stop: () => stopping() }

// ------------------------------------------------------------------ the capsule
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(innerWidth < 400)
  useEffect(() => {
    const on = () => setNarrow(innerWidth < 400)
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  return narrow
}

function Run() {
  const s = useSyncExternalStore(subscribe, () => step)
  const narrow = useNarrow()
  // a capsule that goes is kept 160 ms, leaving, as the reader's is (StatusCapsule)
  const [shown, setShown] = useState<Step | null>(null)
  // said once a stage, with the count it starts at (round 4's syncSpoken)
  const [spoken, setSpoken] = useState('')
  useEffect(() => {
    if (s) { setShown(s); return }
    const t = setTimeout(() => setShown(null), 160)
    return () => clearTimeout(t)
  }, [s])
  const stage = s?.stage ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: said as the stage changes, not as its count does
  useEffect(() => {
    if (!s) return
    const head = s.text ?? (s.stage === 'translating' ? WORDS.translating.split(' · ')[0] ?? '' : s.stage ? WORDS[s.stage] : '')
    setSpoken(s.stage === 'translating' ? `${head}${WORDS.join}${fill(WORDS.count, s)}` : head)
  }, [stage, s?.text])
  const at = s ?? shown
  if (!at) return null
  const words = at.text !== undefined ? plain(at.text)
    : at.stage === 'translating' ? withCount(fill((narrow && WORDS.short) || WORDS.translating, at), at.n)
    : plain(at.stage ? WORDS[at.stage] : '')
  const chip = chipWanted && at.pages > 0
  return (
    <Capsule kind="progress" icon={at.text !== undefined ? Info : 'spinner'} words={words} spoken={spoken} out={!s} alone={!chip} afterKey={chip ? 'show' : ''}
      after={chip && <button type="button" className="chip">{WORDS.show}</button>} />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="capsule-slot" role="status">
      <Run />
    </div>
  </StrictMode>,
)
