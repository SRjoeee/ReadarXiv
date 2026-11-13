// Every behaviour digest of the repository, with what it is the hash of: the acceptance rule's, each adapter's, the chain's.
// A digest is the SHA-256 of a function's outputs over a case table, written as a literal in its source; it moves only when
// an outcome does, and every chain's identity (identityOf) reads it, so a digest that moves is the announcement that rows
// are asked again. `pnpm digests` (scripts/digests.ts) recomputes each and compares it with its literal, and
// `pnpm digests --write` writes the literals that moved; tests/digests.test.ts holds every literal to its table. No test
// runner is imported here: the script reads this module as it is.
import { ACCEPT_DIGEST, accept } from '../src/accept.ts'
import { CHROME_DIGEST, chrome } from '../src/adapters/chrome.ts'
import { GOOGLE_DIGEST, google, TAGS_DIGEST } from '../src/adapters/google.ts'
import { MICROSOFT_DIGEST, microsoft } from '../src/adapters/microsoft.ts'
import { CHAIN_DIGEST } from '../src/chain.ts'
import type { Fetch } from '../src/contract.ts'
import { sha256Hex } from '../src/sha256.ts'
import { goldenOf } from '../src/testing/golden.ts'
import { CASES as ACCEPT_CASES } from './accept-cases.ts'
import { GOOGLE_REPLIES, MICROSOFT_REPLIES, MICROSOFT_UNITS, TAGS_UNITS } from './adapters/fixtures.ts'
import { chainDigest } from './chain-cases.ts'

export interface Digest {
  /** the constant, as its source exports it */
  name: string
  /** its source, from packages/translate */
  file: string
  /** the literal its source holds */
  literal: string
  /** what it is the hash of, computed now */
  compute(): Promise<string>
}

/** a digest is taken over `write` and `read` alone: an adapter is built over a fetch that is never called */
const none: Fetch = async () => {
  throw new Error('no request: a behaviour digest reads write and read alone')
}
/** the tags wire with its elements as voids, the built-in translator's codec and the Google adapter's `tagsWire` */
const tags = async () =>
  goldenOf(chrome({ api: null }), { target: 'zh-Hans', units: TAGS_UNITS, replies: GOOGLE_REPLIES })

export const DIGESTS: readonly Digest[] = [
  {
    name: 'ACCEPT_DIGEST',
    file: 'src/accept.ts',
    literal: ACCEPT_DIGEST,
    compute: async () => sha256Hex(JSON.stringify(ACCEPT_CASES.map(([unit, out]) => accept(unit, out)))),
  },
  {
    name: 'GOOGLE_DIGEST',
    file: 'src/adapters/google.ts',
    literal: GOOGLE_DIGEST,
    compute: async () =>
      goldenOf(google({ fetch: none }), { target: 'zh-Hans', units: TAGS_UNITS, replies: GOOGLE_REPLIES }),
  },
  { name: 'TAGS_DIGEST', file: 'src/adapters/google.ts', literal: TAGS_DIGEST, compute: tags },
  { name: 'CHROME_DIGEST', file: 'src/adapters/chrome.ts', literal: CHROME_DIGEST, compute: tags },
  {
    name: 'MICROSOFT_DIGEST',
    file: 'src/adapters/microsoft.ts',
    literal: MICROSOFT_DIGEST,
    compute: async () =>
      goldenOf(microsoft({ fetch: none }), { target: 'zh-Hans', units: MICROSOFT_UNITS, replies: MICROSOFT_REPLIES }),
  },
  { name: 'CHAIN_DIGEST', file: 'src/chain.ts', literal: CHAIN_DIGEST, compute: () => chainDigest() },
]
