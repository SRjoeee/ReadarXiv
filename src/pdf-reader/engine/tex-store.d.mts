// tex-store.mjs's types
export declare const STORE: 'axt-tex-files'
export declare const LOCK: 'axt-tex'
export interface Want { type?: 'want'; id: number; files: string[]; bytes: boolean }
export interface Have { type: 'have'; id: number; files: Record<string, ArrayBuffer | true> }
export declare function answerWant(site: string, want: Want, caches?: CacheStorage): Promise<{ message: Have; transfer: ArrayBuffer[] }>
export declare function keepFile(site: string, keep: { url: string; bytes: ArrayBuffer }, caches?: CacheStorage): Promise<void>
export declare function pruneStore(site: string, urls: string[], caches?: CacheStorage): Promise<void>
export declare function shareLock(locks?: LockManager): Promise<void>
