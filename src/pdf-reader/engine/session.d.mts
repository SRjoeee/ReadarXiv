// The session's types (session.mjs is JavaScript until the engine's port): what it reports, and what it takes
import type { Config } from '@/config/schema'
import type { PackState } from '@/shared/pack'
import type { OutlineEntry } from '../outline'

export type EngineDisplay = 'original' | 'translation' | 'bilingual'
export type SyncMode = 'off' | 'current' | 'same' | 'pointer' | 'matched'
export type SessionEvent =
  /** the developer's status line, English; the interface does not show it */
  | { type: 'status'; text: string }
  /** why the extension's settings could not be read (config/storage.ts FallbackReason), or null when they could */
  | { type: 'notice'; why: unknown }
  /** the contents: the paper's headings, each by its text and page on the translation's side (outline.ts) */
  | { type: 'outline'; entries: OutlineEntry[] }
  /** the heading being read: the last one above the reading line on the side read (the translation's when shown) */
  | { type: 'heading'; id: number | null }
  /** the paper's id and its title for the toolbar, '' until known or when there is none */
  | { type: 'paper'; id: string; title: string }
  /** the sides scroll together, as the reader applies it (off, or any other mode) */
  | { type: 'sync'; on: boolean }
  /** the extension's settings, each time they land */
  | { type: 'settings'; config: Config; pack: PackState | null }
  | { type: 'display'; mode: EngineDisplay }
  | { type: 'scale'; scale: number }
  | { type: 'page'; side: 'left' | 'right'; page: number; pages: number }
  /** one step of a run (live.mjs and session.mjs note), with the run's counts at that moment */
  | { type: 'note'; event: string; data: Record<string, unknown>; got: number; total: number; lost: number; again: boolean }
  /** a run that ended without a translation: which step, the developer's words, and the chain's error kind when known */
  | { type: 'fail'; event: string; text: string; kind?: string }
export interface SessionHost {
  left: HTMLElement
  right: HTMLElement
  params: URLSearchParams
  emit(event: SessionEvent): void
}
export declare function setDisplay(mode: EngineDisplay): void
export declare function setSyncMode(mode: SyncMode): void
export declare function setCompositor(on: boolean): void
export declare function setFigures(on: boolean): void
export declare function zoomBy(factor: number): void
export declare function zoomTo(value: number | 'page-width' | 'page-fit' | 'page-actual'): void
export declare function goToPage(side: 'left' | 'right', page: number): void
export declare function patchSettings(change: (latest: Config) => Config): void
export declare function goToUnit(id: number): void
export declare function pdfBytes(which: 'translation' | 'original'): Promise<Uint8Array | null>
export declare const run: Promise<void>
