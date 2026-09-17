// The types of fetch-fixtures.mjs, for the TypeScript that calls it (tests/global-setup.ts and its own tests); the
// script itself stays plain node, runnable before anything is installed or compiled
export interface RemoteFixture {
  /** Where the tests read it, relative to the repository root */
  path: string
  /** A pinned version of the paper on arxiv.org */
  url: string
  sha256: string
  bytes: number
  /** The one consumer that reads it */
  for: 'tests' | 'helper-smoke'
}

export const CONSUMERS: readonly ['tests', 'helper-smoke']

export function readManifest(root?: string): Promise<RemoteFixture[]>

export function ensureFixtures(options?: {
  root?: string
  fetchImpl?: typeof fetch
  log?: (line: string) => void
  /** Between two downloads and before a retry; the tests pass 0 */
  gapMs?: number
  /** Only the fixtures this consumer reads; all of them when absent */
  for?: 'tests' | 'helper-smoke'
}): Promise<{ verified: string[]; downloaded: string[] }>
