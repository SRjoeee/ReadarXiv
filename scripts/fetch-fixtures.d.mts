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

export function ensureFixtures(options?: {
  root?: string
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
