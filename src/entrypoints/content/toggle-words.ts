// The floating button's words on the full text (UI.md S-I-06): what a press does now. The press is the toggle of the
// key and the menu, decided in the background (background/context-menu.ts `decideToggle`); the words are asked of that
// same decision, never of a rule of their own, so the two cannot part — they had: a press re-translated under "Show
// original" in P6b and on a page behind its settings, and retried a paused page under "Translate this page". The words
// are the popup's primary button's for the decided action (`S.primary`, keyed by `PageAction`): where the press cannot
// act and opens the control panel, the words that button shows disabled there.
//
// The decision reads the page's state and session, the saved settings and the refused-key record, which move while
// the page stays open. The page asks again when one of them may have: on every change of its state (`follow`), and on
// a restart, a change of the settings or of the record while it runs (`refresh`, content/index.ts says where) — the
// settings and the record decide a running page's action alone (shared/page-action.ts `pageAction`).
import type { Locale } from '@/locales'
import type { PageAction, PageDecision } from '@/shared/page-action'

export interface ToggleWords {
  /** The main button's words in the pack in force (`active`: the page shows its translation) */
  label: (S: Locale['S'], active: boolean) => string
  /** The page's state changed (`on`: it shows its translation): the decision made before it no longer holds */
  follow: (on: boolean) => void
  /** What a running page's decision reads may have moved: asked again, while the page is on */
  refresh: () => void
}

export interface ToggleWordsDeps {
  /** The toggle's decision for this tab (`axt:toggle-decision`); nothing, or a rejection, is no decision */
  decide: () => Promise<Pick<PageDecision, 'action'> | null | undefined>
  /** The decided action moved: the button draws its words again */
  changed: () => void
}

export function createToggleWords(deps: ToggleWordsDeps): ToggleWords {
  let on = false
  /** The action the newest answer decided for the page's present state; null until one has come */
  let action: PageAction | null = null
  /** The asks made so far: answers may come back out of order, and only the newest ask's is believed */
  let asked = 0
  const set = (next: PageAction | null) => {
    if (next === action) return
    action = next
    deps.changed()
  }
  const ask = () => {
    const mine = ++asked
    void deps.decide().then(decision => decision?.action ?? null, () => null).then(next => {
      if (mine === asked) set(next)
    })
  }
  return {
    // With no decision — none yet for this state, or none to be had — the words say whether the page is on, as the
    // button did before it could ask
    label: (S, active) => S.primary[action ?? (active ? 'restore' : 'translate')],
    follow: next => {
      on = next
      set(null)
      ask()
    },
    refresh: () => {
      if (on) ask()
    },
  }
}
