// What the reader's session tells its controller (controller.ts reduce), and what the page gives it: the reading view's events
// as the interface holds them (host.ts fromView), the run's on the layer (run.ts RunEvent), and the settings' own
import type { Config } from '@/config/schema'
import type { ConfigReading } from '@/config/storage'
import type { ProviderErrorKind } from '@/providers/types'
import type { PackState } from '@/shared/pack'
import type { OutlineEntry } from '../engine/view/outline'

export type EngineDisplay = 'original' | 'translation' | 'bilingual'
/** why there is no bilingual version: for now (`refused`, a limit, its time given; `unreachable`, our server out of reach), or
 *  for this paper (`no-source`, `no-pdf`, `cannot-prepare`, `unknown-versions`: our server cannot make one for this version of
 *  the reader), or for this language (`target`) */
export type Unavailable = 'no-source' | 'no-pdf' | 'cannot-prepare' | 'unknown-versions' | 'refused' | 'unreachable' | 'target'
/** the unavailable states that are the paper's or the language's, not a moment's */
export const LASTING: ReadonlySet<Unavailable> = new Set<Unavailable>(['no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions', 'target'])
/** the sync as an address or the interface names it: off, or together (the probes' other names are together too) */
export type SyncMode = 'off' | 'current' | 'same' | 'pointer' | 'matched'
export type SessionEvent =
  /** a write of the settings by this page that went through: a refusal before it is mended */
  | { type: 'saved' }
  /** why the extension's settings could not be read (config/storage.ts FallbackReason), or null when they could */
  | { type: 'notice'; why: unknown }
  /** a write of the settings that storage refused or could not make, after the notice of settings that cannot be read when that is why */
  | { type: 'refused' }
  /** the contents: the paper's headings (outline.ts) */
  | { type: 'outline'; entries: OutlineEntry[] }
  /** the heading being read: the last one above the reading line on the pane read */
  | { type: 'heading'; id: number | null }
  /** the paper's id and its title for the toolbar, '' until known or when there is none */
  | { type: 'paper'; id: string; title: string }
  /** the panes scroll together, as the reader applies it */
  | { type: 'sync'; on: boolean }
  /** the extension's settings, each time they land */
  | { type: 'settings'; config: Config; pack: PackState | null }
  | { type: 'display'; mode: EngineDisplay }
  /** `zoom`: the fit or the scale applied, null after a step or a pinch */
  | { type: 'scale'; scale: number; zoom?: number | 'page-width' | 'page-fit' | 'page-actual' | null }
  /** the paper's PDF coming in, in bytes: the progress line while the reader loads */
  | { type: 'loading'; loaded: number; total: number }
  | { type: 'page'; side: 'left' | 'right'; page: number; pages: number }
  /** the original on screen: its pages laid out, in every display */
  | { type: 'opened' }
  /** the paper's HTML version with its translating hash, once the bilingual version cannot be had; null where arXiv has none */
  | { type: 'html'; url: string | null }
  /** the reader cannot go on: the original could not be fetched, the service cannot translate, or a crash; the chain's error
   *  kind where it is the service's */
  | { type: 'fail'; event: 'fetch failed' | 'service' | 'crashed'; text: string; kind?: ProviderErrorKind }
  /** the paper's layer being prepared (run.ts): told at each of our server's answers while it lasts */
  | { type: 'preparing'; position: number | null; progress: number | null }
  /** the layer is coming: a catalog, or a prepare's first objects */
  | { type: 'coming' }
  /** the layer's catalog: the paper's prepare, where there was one, is over */
  | { type: 'prepared' }
  /** the layer's side as the view tells it: opening, open, or refused (no layer for the visit), its pages laid, and (none where
   *  absent) the pages asked near the view it shows as arXiv's by the rule, never laid */
  | { type: 'layer'; state: 'opening' | 'open' | 'refused'; laid: number; total: number; original?: number }
  /** the translation under way, and its end for the attempt (`stopped`: why it stopped short) */
  | { type: 'translating'; got: number; total: number; lost: number }
  | { type: 'translated'; got: number; total: number; lost: number; stopped: ProviderErrorKind | null }
  /** no bilingual version for now, or for this paper or language (run.ts Unavailable) */
  | { type: 'unavailable'; why: Unavailable; retryAt: number | null }
export interface SessionHost {
  left: HTMLElement
  right: HTMLElement
  params: URLSearchParams
  emit(event: SessionEvent): void
  /** the page's own first read of the settings, bounded (ui/first-read.ts): the session starts on it at once; `null` when it
   *  did not answer in its time (the defaults then, not waited on again); absent, the session reads them itself */
  reading?: ConfigReading | null
}
