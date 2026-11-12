// v2-api.mjs's types: the stand-in of our server's /api/v2 routes, for its tests and the reader's browser checks
export interface Fixture {
  name: string
  paper: string
  version: number
  pages: number
  units: string[]
  catalog: string
  pdf: Uint8Array
  objects: Map<string, Uint8Array>
  rows(target?: string): unknown
}
export declare function loadFixture(name?: string): Fixture
/** a paper's segment (`.` and `/` as `_`), and its version's where one is given */
export declare const segOf: (paper: string, version?: number) => string
export declare const FACE_GROUP: string
export declare const FACE_FILE: string
/** a request as `handle` takes it: the URL's pathname and its query string, lower-case header names */
export interface ApiRequest { method: string; path: string; search?: string; headers?: Record<string, string | undefined>; body?: Uint8Array | null }
export interface RecordedRequest { method: string; path: string; headers: Record<string, string | undefined>; body: string | null; at: number }
export type Answer = { status: number; headers: Record<string, string>; body: Uint8Array } | { fault: 'reset' | 'hang' }
export interface V2Options {
  prepared?: string[]
  prepareMs?: number
  failed?: Record<string, string>
  refuse?: { why: 'quota' | 'busy'; retryAfterS: number } | null
  fault?: number | 'reset' | 'hang' | null
  fresh?: boolean
}
export interface V2Api {
  base: string
  extension: string
  fixtures: Fixture[]
  requests: RecordedRequest[]
  handle(request: ApiRequest): Answer | null
  /** the routes contract's target: a fault is a TypeError, as a fetch's network failure is */
  fetch(request: Request): Promise<Response>
  route(route: unknown, url: URL): Promise<unknown>
  release(): Promise<void>
  put(path: string, bytes: Uint8Array): Promise<void>
  known: { paper: string; latest: number; also: string }
  unknown: string
  set(o: V2Options): void
  asked(kind: 'open' | 'follow' | 'object' | 'static'): RecordedRequest[]
}
export declare function v2Api(o?: { fixtures?: Fixture[]; base?: string; extension?: string; prepareMs?: number; now?: () => number }): V2Api
