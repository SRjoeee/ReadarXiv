// layer-api.mjs's types: the stand-in of the layer API, for its tests and the reader's browser checks
export interface Sample { id: string; version: number; segment: string; pdf: Uint8Array; bundle: Uint8Array }
export declare function loadSample(dir?: URL): Sample
/** why a paper may be answered 404 with: the contract's five */
export declare const WHY: readonly ['not-prepared', 'no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions']
export type Why = (typeof WHY)[number]
export type Mode =
  | { kind: 'ready' }
  | { kind: 'preparing'; ms: number; begun: boolean }
  | { kind: 'refused'; retryAfterMs: number }
  | { kind: 'none'; why: Why }
  | { kind: 'error'; status: number }
  | { kind: 'reset' }
  | { kind: 'hang' }
export declare const mode: {
  ready(): Mode
  preparing(ms: number, o?: { begun?: boolean }): Mode
  refused(retryAfterMs?: number): Mode
  none(why: Why): Mode
  error(status?: number): Mode
  reset(): Mode
  hang(): Mode
}
/** whether a path is one of the stand-in's three routes (a layer's GET, a prepare, the original) */
export declare const serves: (path: string) => boolean
/** a request as `handle` takes it: the URL's pathname and its query string (with the `?`, or ''), lower-case header names */
export interface ApiRequest { method: string; path: string; search?: string; headers?: Record<string, string | string[] | undefined>; body?: Uint8Array | null }
/** a request as the stand-in kept it, whole: its body's length and its text to 200 characters, and what it answered */
export interface RecordedRequest {
  method: string
  path: string
  search: string
  headers: Record<string, string | string[] | undefined>
  body: { bytes: number; text: string } | null
  answered: number | 'reset' | 'hang'
}
export type Answer = { status: number; headers: Record<string, string>; body: Uint8Array } | { fault: 'reset' | 'hang'; status?: undefined }
export interface LayerApi {
  /** the mode of the layer routes and of the original route, either alone (the other as it was) */
  set(modes: { layer?: Mode | Mode['kind']; original?: Mode | Mode['kind'] }): LayerApi
  readonly mode: { layer: Mode; original: Mode }
  /** every request answered, in order, each kept whole */
  requests: RecordedRequest[]
  handle(request: ApiRequest): Answer
  /** a Playwright route handler */
  route(route: unknown): Promise<unknown>
  /** the requests left unanswered, aborted */
  release(): Promise<void>
  listen(o?: { port?: number; host?: string }): Promise<{ origin: string; close(): Promise<void> }>
  sample: Sample
  vtag: string
}
export declare function layerApi(o?: { sample?: Sample; vtag?: string; pollMs?: number; now?: () => number }): LayerApi
