// tex-page.mjs's types, for the tests
export declare const PROTOCOL: 2
export type Entry = [format: number, name: string, path: string, size: number]
export interface Build {
  cv: string
  eid: string
  tid: string
  engine: string
  tree: string
  /** the index's file name in the tree's directory, versioned on its own */
  index: string
  page?: string
  packages: Record<string, number>
  wasm: number
  engines: Record<string, string[]>
  manifest: { engines: Record<string, Entry[]>; fonts: Record<string, Entry[]> }
  extra?: string[]
}
export declare function texPage(options: {
  build: Build
  // biome-ignore lint/suspicious/noExplicitAny: the runner and its engines are texlyre-busytex's classes, or fakes
  Runner: any
  // biome-ignore lint/suspicious/noExplicitAny: as above
  Engines: Record<string, any>
  fetch: (url: string) => Promise<Response>
  // biome-ignore lint/suspicious/noExplicitAny: Cache Storage, or a fake of the part the page uses
  caches: any
  progressEvery?: number
  now?: () => number
}): {
  ready: { type: 'ready'; protocol: number; cv: string; eid: string; tid: string }
  receive(msg: Record<string, unknown>, reply: (data: Record<string, unknown> & { type?: string }, transfer?: Transferable[]) => void): Promise<void>
}
