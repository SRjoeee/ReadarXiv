// The request a session sends (DESIGN §8.0): the text run's batches, the image run's labels and the tab title all go out
// in one envelope, built here, as units of the chain (stage 4b). What must not differ between the three is the context:
// it enters the prompt of a translator that reads it **and its store key** (§9), where absent and empty do not serialise
// alike, so an empty context is left out.
import type { UnitIn } from '@readarxiv/translate'
import type { TranslateCall } from '@/providers/transport'
import type { TranslateContext } from '@/providers/types'

/** What every request of one session shares */
export interface CallBase {
  /** The target the session runs on — the chain's, recorded at start */
  target: string
  /** The session id: the cancellation scope (§10). Absent only where nothing can be withdrawn (tests) */
  scope?: string
  /** Title, abstract and glossary: with every request (§8.2) */
  context?: TranslateContext
}

export interface CallExtra {
  /** The heading the units sit under — for an image, its caption: part of the context */
  sectionTitle?: string
}

export function translateCall(base: CallBase, units: UnitIn[], extra: CallExtra = {}): TranslateCall {
  const context: TranslateContext = { ...base.context, ...(extra.sectionTitle ? { sectionTitle: extra.sectionTitle } : {}) }
  return {
    units,
    target: base.target,
    ...(Object.keys(context).length ? { context } : {}),
    ...(base.scope ? { scope: base.scope } : {}),
  }
}

/** A text with no placeholder (a title, a figure's label) as a unit of one text piece */
export const textUnit = (id: string, text: string): UnitIn => ({ id, content: [{ t: 'text', s: text }] })

/** A unit's translation as text again, when it held text alone */
export const textOf = (content: readonly { t: string; s?: string }[]): string => content.map(p => (p.t === 'text' ? (p.s ?? '') : '')).join('')
