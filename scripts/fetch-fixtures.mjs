// The fixtures that are not in the repository (tests/fixtures/remote.json): five papers, one figure of one of them and
// the recognition helper's reference image are under arXiv's non-exclusive licence — arXiv may distribute them, this
// repository may not. Each is downloaded from the pinned version into the path the tests read, once, and only a copy
// whose SHA-256 is the recorded one is accepted: the rule-coverage snapshots and the measured numbers in DESIGN were
// taken from exactly these bytes.
//
//   pnpm fixtures:fetch                  # every fixture: download what is missing, verify everything
//   pnpm fixtures:fetch --for tests      # only what one consumer reads (`tests`, `helper-smoke`)
//
// `pnpm test` fetches the `tests` ones first (tests/global-setup.ts); `pnpm fixtures:stats` and `pnpm helper:smoke`
// fetch theirs.
import { createHash, randomBytes } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = 'tests/fixtures/remote.json'
/** Says who is asking: arXiv asks automated clients to identify themselves */
const USER_AGENT = 'ReadarXiv-fixtures/1 (+https://github.com/SRjoeee/ReadarXiv)'
/** Between two downloads: arXiv asks automated clients for one request every three seconds */
const GAP_MS = 3_000
const TIMEOUT_MS = 60_000
const ATTEMPTS = 3
/** The longest `Retry-After` honoured before giving up on the attempt */
const MAX_RETRY_AFTER_MS = 60_000

/** Where a fixture may be written: the two fixture directories, nowhere else */
const FIXTURE_DIRS = ['tests/fixtures', 'helper/Tests/Fixtures']
/** Who reads a fixture; an entry names the one it is for */
export const CONSUMERS = ['tests', 'helper-smoke']
const ARXIV = 'https://arxiv.org/'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The manifest, refused whole — before anything is fetched — unless every entry is well formed, names a plain path
 * inside a fixture directory that no other entry names, and an address on arXiv. The file is data a pull request can
 * change, and what it names is written to disk and cached by CI (Devin on #229)
 *
 * @returns {Promise<{ path: string; url: string; sha256: string; bytes: number; for: string }[]>}
 */
export async function readManifest(root = ROOT) {
  const manifest = JSON.parse(await readFile(join(root, MANIFEST), 'utf8'))
  if (!Array.isArray(manifest?.fixtures)) throw new Error(`${MANIFEST}: no "fixtures" array`)
  const seen = new Set()
  for (const entry of manifest.fixtures) {
    const where = `${MANIFEST}: ${JSON.stringify(entry?.path)}`
    if (typeof entry?.path !== 'string' || typeof entry.url !== 'string' || typeof entry.sha256 !== 'string' || typeof entry.for !== 'string') {
      throw new Error(`${where}: an entry needs "path", "url", "sha256" and "for" as strings`)
    }
    const inside = relative(root, resolve(root, entry.path)).split('\\').join('/')
    if (isAbsolute(entry.path) || inside !== entry.path || !FIXTURE_DIRS.some(dir => inside.startsWith(`${dir}/`))) {
      throw new Error(`${where} is not a plain path inside ${FIXTURE_DIRS.join(' or ')}`)
    }
    if (seen.has(entry.path)) throw new Error(`${where} is named twice`)
    seen.add(entry.path)
    if (!entry.url.startsWith(ARXIV)) throw new Error(`${where}: "${entry.url}" is not an ${ARXIV} address`)
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error(`${where}: "sha256" is not 64 lowercase hex digits`)
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) throw new Error(`${where}: "bytes" is not a positive integer`)
    if (!CONSUMERS.includes(entry.for)) throw new Error(`${where}: "for" is not one of ${CONSUMERS.join(', ')}`)
  }
  return manifest.fixtures
}

/** The file's bytes, or null when it is not there */
async function existing(file) {
  try {
    return await readFile(file)
  } catch (e) {
    if (e?.code === 'ENOENT') return null
    throw e
  }
}

/** A `Retry-After` header as milliseconds, when it is one this client will wait for */
function retryAfterMs(response) {
  const value = response.headers.get('retry-after')
  if (!value) return undefined
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now()
  return Number.isFinite(ms) && ms >= 0 && ms <= MAX_RETRY_AFTER_MS ? ms : undefined
}

/** A failure no retry can change */
class FinalError extends Error {}

/**
 * One download. Retried on what a retry can help with — a network error, a timeout, a 5xx, a 429 (after its
 * `Retry-After` when it gives one). Any other answer is final and says so: an HTTP 404 is a pin that needs moving,
 * not a missing connection. A redirect is followed only within arXiv
 */
async function download(entry, fetchImpl, gapMs) {
  let last
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let wait = gapMs * attempt
    try {
      const response = await fetchImpl(entry.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
      if (response.redirected && !response.url.startsWith(ARXIV)) {
        throw new FinalError(`${entry.url} redirected to ${response.url}, outside arXiv; nothing was written. The pin needs checking (tests/fixtures/README.md)`)
      }
      if (response.ok) return Buffer.from(await response.arrayBuffer())
      if (response.status < 500 && response.status !== 429) {
        throw new FinalError(`arXiv answered HTTP ${response.status} for ${entry.url}; nothing was written. The pinned version is not served there any more: the pin needs moving (tests/fixtures/README.md)`)
      }
      last = new Error(`HTTP ${response.status}`)
      wait = retryAfterMs(response) ?? wait
    } catch (e) {
      if (e instanceof FinalError) throw e
      last = e
    }
    if (attempt < ATTEMPTS) await sleep(wait)
  }
  throw new Error(
    `${entry.path} is not in the repository (its paper's licence does not allow it) and could not be downloaded from ${entry.url}: ${last?.message ?? last}. `
    + 'Once arXiv can be reached, `pnpm fixtures:fetch` fetches it; it stays on disk afterwards.',
  )
}

/**
 * Make the remote fixtures present and verified — all of them, or those one consumer reads.
 *
 * @param {{ root?: string; fetchImpl?: typeof fetch; log?: (line: string) => void; gapMs?: number; for?: string }} [options]
 * @returns {Promise<{ verified: string[]; downloaded: string[] }>}
 */
export async function ensureFixtures({ root = ROOT, fetchImpl = fetch, log = () => undefined, gapMs = GAP_MS, for: consumer } = {}) {
  if (consumer !== undefined && !CONSUMERS.includes(consumer)) throw new Error(`no fixtures are for "${consumer}"; one of ${CONSUMERS.join(', ')}`)
  const verified = []
  const downloaded = []
  const realRoot = await realpath(root)
  for (const entry of await readManifest(root)) {
    if (consumer !== undefined && entry.for !== consumer) continue
    const file = join(root, entry.path)
    const present = await existing(file)
    if (present) {
      // A file that is there but is not the pinned one is never replaced silently: it may be a maintainer's candidate for a new pin
      if (sha256(present) !== entry.sha256) {
        throw new Error(`${entry.path} is not the pinned fixture (SHA-256 ${sha256(present).slice(0, 12)}…, the manifest records ${entry.sha256.slice(0, 12)}…). Delete it to download the pinned copy, or see tests/fixtures/README.md for moving the pin.`)
      }
      verified.push(entry.path)
      continue
    }
    if (downloaded.length > 0) await sleep(gapMs)
    const bytes = await download(entry, fetchImpl, gapMs)
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(
        `${entry.url} now serves other bytes than the pinned fixture (SHA-256 ${sha256(bytes).slice(0, 12)}…, ${bytes.length} bytes; the manifest records ${entry.sha256.slice(0, 12)}…, ${entry.bytes} bytes): a new rendering of the paper, or a page in its place. `
        + 'Nothing was written: the snapshots and measurements were taken from the pinned bytes, and moving the pin is a maintainer\'s decision (tests/fixtures/README.md).',
      )
    }
    const dir = dirname(file)
    await mkdir(dir, { recursive: true })
    // The directory as it really is: a symbolic link inside the fixture tree must not carry the write elsewhere
    const realDir = await realpath(dir)
    if (!FIXTURE_DIRS.some(fixtures => `${realDir}/`.startsWith(`${join(realRoot, fixtures)}/`))) {
      throw new Error(`${entry.path}: its directory resolves to ${realDir}, outside the fixture directories; nothing was written`)
    }
    // Written beside the target under a name of this run's own, created exclusively (never through a link someone left
    // there), then renamed over the target: two runs fetching at once each land a whole file, and an interrupted run
    // leaves no half file for the next one to reject
    const partial = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.partial`
    try {
      await writeFile(partial, bytes, { flag: 'wx' })
      await rename(partial, file)
    } catch (e) {
      await rm(partial, { force: true })
      throw e
    }
    log(`fetched ${entry.path} (${bytes.length} bytes) from ${entry.url}`)
    downloaded.push(entry.path)
  }
  return { verified, downloaded }
}

/** Run as a script: compared by real path, so a checkout reached through a symbolic link runs too */
const invoked = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (invoked()) {
  const at = process.argv.indexOf('--for')
  const consumer = at >= 0 ? process.argv[at + 1] : undefined
  try {
    const { verified, downloaded } = await ensureFixtures({ log: line => console.log(line), ...(consumer ? { for: consumer } : {}) })
    console.log(`remote fixtures${consumer ? ` for ${consumer}` : ''}: ${downloaded.length} downloaded, ${verified.length} already there, all verified`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
