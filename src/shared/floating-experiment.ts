// THROWAWAY — branch `exp/floating-variants` only, never merged. Lets the maintainer flip between four treatments of
// the floating button's mark on a live page (2026-09-18): A is what the feature branch ships, B / C / D are style
// overrides added to the button's shadow root from outside, so `core/floating/button.ts` is not touched. A small bar
// at the bottom of the page switches; the choice lives under its own storage key and reaches every open tab at once.
// Once a letter is chosen, its few rules go into button.ts on the feature branch and this branch is deleted.
import { FLOATING_CLASS } from '@/core/floating/button'

const KEY = 'axt-experiment-floating-variant'
const VARIANTS = [
  ['A', '原样'],
  ['B', '中性细环'],
  ['C', '灰药丸'],
  ['D', '无药丸'],
] as const
type Variant = (typeof VARIANTS)[number][0]

// After the button's own sheet in the same shadow root, so a tie in specificity goes to these
const OVERRIDES = `
/* B: a neutral hairline round the disc */
.dock[data-variant="B"] .disc { box-shadow: 0 0 0 1px rgb(0 0 0 / 0.1), 0 2px 5px rgb(0 0 0 / 0.06) }
.dock[data-variant="B"][data-lit="yes"] .disc { box-shadow: 0 0 0 1px rgb(0 0 0 / 0.14), 0 3px 8px rgb(0 0 0 / 0.14) }
/* C: a grey tab, the white disc as a knob on it */
.dock[data-variant="C"] .main { background: #ececef; border-color: #dcdce0 }
.dock[data-variant="C"] .disc { box-shadow: 0 0 0 1px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.18) }
.dock[data-variant="C"][data-lit="yes"] .disc { box-shadow: 0 0 0 1px rgb(0 0 0 / 0.05), 0 2px 6px rgb(0 0 0 / 0.26) }
/* D: no tab at all — the disc floats 8 px off the edge, and the two side buttons centre on it */
.dock[data-variant="D"][data-side="right"] { right: 8px }
.dock[data-variant="D"][data-side="left"] { left: 8px }
.dock[data-variant="D"] .main { width: 40px; height: 40px; border: 0; background: none; box-shadow: none; border-radius: 50% }
.dock[data-variant="D"] .disc, .dock[data-variant="D"] .mark { width: 40px; height: 40px }
.dock[data-variant="D"] .disc { margin: 0; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 12px rgb(0 0 0 / 0.16) }
.dock[data-variant="D"][data-lit="yes"] .disc { box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08), 0 6px 16px rgb(0 0 0 / 0.24) }
.dock[data-variant="D"][data-side="right"] .hidden-button { margin-right: 3px }
.dock[data-variant="D"][data-side="left"] .hidden-button { margin-left: 3px }
@media (prefers-color-scheme: dark) {
  .dock[data-variant="B"] .disc { box-shadow: 0 0 0 1px rgb(255 255 255 / 0.18), 0 2px 5px rgb(0 0 0 / 0.3) }
  .dock[data-variant="B"][data-lit="yes"] .disc { box-shadow: 0 0 0 1px rgb(255 255 255 / 0.26), 0 3px 8px rgb(0 0 0 / 0.4) }
  .dock[data-variant="C"] .main { background: #3a3a40; border-color: rgb(255 255 255 / 0.08) }
}
`

const BAR = `
:host { all: initial }
.bar {
  position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 2147483646;
  display: flex; align-items: center; gap: 4px; padding: 5px 6px 5px 12px; border-radius: 999px;
  background: rgb(28 28 30 / 0.92); color: #fff; font: 12px/1 -apple-system, "PingFang SC", system-ui, sans-serif;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
}
.bar span { opacity: 0.6; margin-right: 4px }
button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 999px; white-space: nowrap }
button:hover { background: rgb(255 255 255 / 0.12) }
button[aria-pressed="true"] { background: #fff; color: #1c1c1e }
@media print { .bar { display: none } }
`

export function installVariantExperiment(doc: Document): void {
  if (doc.querySelector('.axt-experiment')) return
  let variant: Variant = 'A'

  const dress = () => {
    for (const host of doc.querySelectorAll(`.${FLOATING_CLASS}`)) {
      const root = host.shadowRoot
      if (!root) continue
      if (!root.querySelector('style[data-experiment]')) {
        const sheet = doc.createElement('style')
        sheet.dataset.experiment = ''
        sheet.textContent = OVERRIDES
        root.append(sheet)
      }
      root.querySelector('.dock')?.setAttribute('data-variant', variant)
    }
    for (const button of bar.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.variant === variant))
  }

  const host = doc.createElement('div')
  host.className = 'axt-experiment'
  const root = host.attachShadow({ mode: 'open' })
  const sheet = doc.createElement('style')
  sheet.textContent = BAR
  const bar = doc.createElement('div')
  bar.className = 'bar'
  bar.innerHTML = '<span>悬浮按钮方案</span>'
  for (const [letter, name] of VARIANTS) {
    const button = doc.createElement('button')
    button.type = 'button'
    button.dataset.variant = letter
    button.textContent = `${letter} · ${name}`
    button.addEventListener('click', () => void browser.storage.local.set({ [KEY]: letter }))
    bar.append(button)
  }
  root.append(sheet, bar)
  doc.body.append(host)

  // The button is mounted after this, and again whenever the settings switch turns it back on
  new MutationObserver(dress).observe(doc.body, { childList: true })
  browser.storage.local.onChanged.addListener(changes => {
    const next = changes[KEY]?.newValue
    if (typeof next !== 'string' || !VARIANTS.some(([letter]) => letter === next)) return
    variant = next as Variant
    dress()
  })
  void browser.storage.local.get(KEY).then(stored => {
    const saved = (stored as Record<string, unknown>)[KEY]
    if (typeof saved === 'string' && VARIANTS.some(([letter]) => letter === saved)) variant = saved as Variant
    dress()
  })
}
