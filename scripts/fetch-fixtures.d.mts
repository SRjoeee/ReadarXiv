// The types of fetch-fixtures.mjs, for the TypeScript that calls it (tests/global-setup.ts and its own tests); the
// script itself stays plain node, runnable before anything is installed or compiled
export interface RemoteFixture {
  /** Where the tests read it, relative to the repository root */
  path: string
  /** A pinned version of the paper on arxiv.org */
  url: string
  sha256: string
  bytes: number
}

export function readManifest(root?: string): Promise<RemoteFixture[]>

/** The machine's cache of pinned copies (READARXIV_FIXTURE_CACHE, else ~/.cache/readarxiv/fixtures), or null (empty variable, or CI) */
export function defaultCacheDir(env?: Record<string, string | undefined>): string | null

export function ensureFixtures(options?: {
  root?: string
  /** A directory of pinned copies, one file per SHA-256: read before the bucket and arXiv, written with every verified copy; none by default (the tests pass a temporary one) */
  cacheDir?: string | null
  fetchImpl?: typeof fetch
  log?: (line: string) => void
  /** Between two downloads and before a retry; the tests pass 0 */
  gapMs?: number
  /** Where READARXIV_CI_TOKEN and CF_ACCOUNT_ID are read from (the bucket is used only when both are set); process.env by default */
  env?: Record<string, string | undefined>
  /** Before a retry of a bucket read; the tests pass 0 */
  retryMs?: number
  /** The clock a bucket read is signed with */
  now?: () => Date
}): Promise<{ verified: string[]; downloaded: string[] }>
