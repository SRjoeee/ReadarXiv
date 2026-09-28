// The floating button's words on the full text (UI.md S-I-06): what a press does now. The press is the toggle of the
// key and the menu, decided in the background (background/context-menu.ts `decideToggle`); the words are asked of that
// same decision, never of a rule of their own, so the two cannot part — they had: a press re-translated under "Show
// original" in P6b and on a page behind its settings, and retried a paused page under "Translate this page". The words
// are the popup's primary button's for the decided action (`S.primary`, keyed by `PageAction`): where the press cannot
// act and opens the control panel, the words that button shows disabled there.
//
// The decision reads the page's state and session, the saved settings and the refused-key record, which move while
// the page stays open. The page asks again when one of them may have: on a change of its state (`follow`), and while
// it runs on a restart or a change of the record (`refresh`) and on a write of the settings that moves a field the
// decision reads (`configChanged`) — the chain's fields alone (config/revision.ts `CHAIN_CONFIG_FIELDS`: the saved
// settings reach the decision only through the chain built from them). A colour dragged on the settings page writes
// the settings every frame and asks nothing; it asked back to back for as long as the drag lasted (Part 7's final
// review). One ask is out at a time, and at most one waits behind it.
import { chainConfigChanged } from '@/config/revision'
import type { Config } from '@/config/schema'
import type { Progress } from '@/core/pipeline/run'
import type { Locale } from '@/locales'
import type { PageAction, PageDecision } from '@/shared/page-action'

export interface ToggleWords {
  /** The main button's words in the pack in force (`active`: the page shows its translation) */
  label: (S: Locale['S'], active: boolean) => string
  /** The page's state changed: the decision made on the state before no longer holds */
  follow: (state: Progress['state']) => void
  /** What a running page's decision reads may have moved: asked again, while the page runs */
  refresh: () => void
  /**
   * The saved settings were written (`previous`: the value before, null when it did not parse): asked again, while the
   * page runs, when a field the decision reads moved
   */
  configChanged: (next: Config, previous: Config | null) => void
}

export interface ToggleWordsDeps {
  /** The toggle's decision for this tab (`axt:toggle-decision`); nothing, or a failure, is no decision */
  decide: () => Promise<Pick<PageDecision, 'action'> | null | undefined>
  /** The decided action moved: the button draws its words again */
  changed: () => void
}

export function createToggleWords(deps: ToggleWordsDeps): ToggleWords {
  let state: Progress['state'] = 'idle'
  /** The action the newest answer decided for the page's present state; null until one has come */
  let action: PageAction | null = null
  /** One more with every change of state: an answer asked on a state before is dropped */
  let generation = 0
  let inFlight = false
  /** Something moved while an ask was out: its answer is superseded, and one more ask goes out after it */
  let waiting = false
  const set = (next: PageAction | null) => {
    if (next === action) return
    action = next
    deps.changed()
  }
  const ask = () => {
    if (inFlight) {
      waiting = true
      return
    }
    inFlight = true
    const mine = generation
    // Through a promise even when `decide` throws at once — as a runtime message does once the extension context is
    // gone (reloaded or updated under the page): the failure is no decision, never a throw into the page's session
    void Promise.resolve().then(deps.decide).then(decision => decision?.action ?? null, () => null).then(next => {
      inFlight = false
      if (waiting) {
        waiting = false
        ask()
      } else if (mine === generation) set(next)
    })
  }
  const refresh = () => {
    // The settings and the record decide a running page's action alone (the same premise, the same test): a page
    // that is not running keeps the answer it has
    if (state === 'on') ask()
  }
  return {
    // With no decision — none yet for this state, or none to be had — the words say whether the page is on, as the
    // button did before it could ask
    label: (S, active) => S.primary[action ?? (active ? 'restore' : 'translate')],
    follow: next => {
      state = next
      generation++
      waiting = false
      set(null)
      // An idle page's press always translates, whatever the settings and the record (shared/page-action.ts
      // `pageAction`; pinned in tests/shared/page-action.test.ts, "what the settings and the record decide"): its
      // answer would be the words it has without one, so it is not asked. A stopped page's may be a retry
      if (next !== 'idle') ask()
    },
    refresh,
    configChanged: (next, previous) => {
      if (previous === null || chainConfigChanged(previous, next)) refresh()
    },
  }
}
