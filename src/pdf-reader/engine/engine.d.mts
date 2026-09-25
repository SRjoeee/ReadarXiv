// engine.mjs's types (JavaScript until the engine's port), as session.d.mts gives the session's
import type { RenderPath } from '@/cache/key'
import type { ProviderErrorKind } from '@/providers/types'

type Translated = { text: string; by: string | null } | null
export declare class EngineError extends Error {
  kind: ProviderErrorKind
  partial?: Translated[]
  lost?: Set<number>
}
export declare function paperContext(units: unknown[]): { paperTitle?: string; abstract?: string }
export declare function openEngine(options: { paper: string }): Promise<{
  lang: string
  format: RenderPath
  readonly engine: string
  identity: string
  now(): Promise<string>
  translate(texts: string[], context?: { paperTitle?: string; abstract?: string }): Promise<Translated[]>
  close(): Promise<unknown>
}>
