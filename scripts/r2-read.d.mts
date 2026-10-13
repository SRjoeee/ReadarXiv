// The types of r2-read.mjs, for the TypeScript that calls it (its own tests); the script itself stays plain node
export declare const BUCKET: 'readarxiv-ci'
export declare function sha256(bytes: Uint8Array | string): string
export declare function accountOf(account: string | undefined): string
export declare function isKey(key: unknown): boolean
export declare function keyUrl(account: string | undefined, key: string, bucket?: string): string
export declare function signV4(o: { method: string; url: string; headers?: Record<string, string>; accessKeyId: string; secret: string; region: string; service: string; date: Date }): Record<string, string>
export declare function tokenOf(token: string | undefined): string
export interface R2Response { ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }
export type R2Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<R2Response>
export declare function withRetry<T>(send: () => Promise<R2Response>, read: (res: R2Response) => Promise<T>, retryMs: number): Promise<{ res: R2Response | null; value?: T }>
export declare function s3Credentials(o: { token: string | undefined; account: string | undefined; fetchImpl?: R2Fetch; retryMs?: number; timeoutMs?: number }): Promise<{ accessKeyId: string; secret: string }>
export declare function getObject(o: { url: string; credentials: { accessKeyId: string; secret: string }; fetchImpl?: R2Fetch; retryMs?: number; now?: () => Date; timeoutMs?: number }): Promise<{ res: R2Response | null; value?: Buffer }>
