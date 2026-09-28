// The floating button's words on the full text (UI.md S-I-06): what a press does now. The press is the toggle of the
// key and the menu, decided in the background (background/context-menu.ts `decideToggle`); the words are asked of that
// same decision, never of a rule of their own, so the two cannot part — they had: in P6b a press re-translated under
// "Show original". Where the retranslate cue holds (`cued`), the popup's "Translate again" (S-P-52); anywhere else the
// words they always were.
//
// The decision reads the page's session, the saved settings and the refused-key record, which move while the page
// stays open. The page asks again when one of them may have (`refresh`, content/index.ts says where), and only while
// it shows its translation: the cue is a running page's, and an idle page has nothing to ask.
import type { Locale } from '@/locales'
import type { PageDecision } from '@/shared/page-action'

export interface ToggleWords {
  /** The main button's words in the pack in force (`active`: the page shows its translation) */
  label: (S: Locale['S'], active: boolean) => string
  /** The page began or stopped showing its translation */
  follow: (on: boolean) => void
  /** What the decision reads may have moved: asked again, while the page is on */
  refresh: () => void
}

export interface ToggleWordsDeps {
  /** The toggle's decision for this tab (`axt:toggle-decision`); nothing, or a rejection, is no cue */
  decide: () => Promise<Pick<PageDecision, 'cued'> | null | undefined>
  /** The cue moved: the button draws its words again */
  changed: () => void
}

export function createToggleWords(deps: ToggleWordsDeps): ToggleWords {
  let on = false
  let cued = false
  /** The asks made so far: answers may come back out of order, and only the newest ask's is believed */
  let asked = 0
  const set = (next: boolean) => {
    if (next === cued) return
    cued = next
    deps.changed()
  }
  const refresh = () => {
    const mine = ++asked
    // Off, the words are "Translate this page" whatever was cued, and a page that comes back on starts from a running
    // page's own words until the decision says otherwise
    if (!on) return set(false)
    void deps.decide().then(decision => decision?.cued === true, () => false).then(next => {
      if (mine === asked && on) set(next)
    })
  }
  return {
    label: (S, active) => (!active ? S.primary.translate : cued ? S.primary.retranslate : S.primary.restore),
    follow: next => {
      on = next
      refresh()
    },
    refresh,
  }
}
