// The fixtures that are not in the repository (tests/fixtures/remote.json): five papers and one figure of one of them
// are under arXiv's non-exclusive licence — arXiv may distribute them, this
// repository may not — and one more figure is under CC BY-NC-ND, whose terms a GPL tree cannot carry. Each is downloaded from the pinned version into the path the tests read, once, and only a copy
// whose SHA-256 is the recorded one is accepted: the rule-coverage snapshots and the measured numbers in DESIGN were
// taken from exactly these bytes.
//
//   pnpm fixtures:fetch                  # download what is missing, verify everything
//
// A missing fixture is looked for in this order: the file on disk (kept if it is the pinned one), the machine's own cache
// of pinned copies (`defaultCacheDir`: one file per digest, so every checkout and worktree of this machine shares it, and
// a run with no network finds what an earlier run fetched; every fetched or verified copy is put there), the private bucket
// `readarxiv-ci` under `fixtures/<sha256>` (only where READARXIV_CI_TOKEN and CF_ACCOUNT_ID are both set: CI, never a fork's
// pull request or a contributor's machine), and arXiv. arXiv's pages carry its own chrome, which it redeploys independently
// of the paper, so the pinned bytes are kept where they cannot move; what the bucket serves is checked against the pin like
// every other copy, and a bucket that cannot be read says so in one line and gives way to arXiv. A fixture already on disk
// prints nothing; each one fetched prints one line, its path, its source and the status.
//
// `pnpm test` fetches them first (tests/global-setup.ts), and so does `pnpm fixtures:stats`.
import { createHash, randomBytes } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getObject, keyUrl, s3Credentials } from './r2-read.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = 'tests/fixtures/remote.json'
/** Says who is asking: arXiv asks automated clients to identify themselves */
const USER_AGENT = 'ReadarXiv-fixtures/1 (+https://github.com/SRjoeee/ReadarXiv)'
/** Between two downloads: arXiv asks automated clients for one request every three seconds */
const GAP_MS = 3_000
const TIMEOUT_MS = 60_000
const ATTEMPTS = 3
/** The longest `Retry-After` waited for; asked to wait longer, the download stops and says so */
const MAX_RETRY_AFTER_MS = 60_000
/** A temporary file older than this is a crashed run's, not a concurrent one's (one lives only between its write and its rename) */
const STALE_PARTIAL_MS = 10 * 60_000

/** Where a fixture may be written: the fixture directory, nowhere else */
const FIXTURE_DIR = 'tests/fixtures'
const ARXIV = 'https://arxiv.org/'

/**
 * The machine's cache of pinned copies, or null when there is none: READARXIV_FIXTURE_CACHE names it (empty: no cache),
 * else `~/.cache/readarxiv/fixtures`; none in CI, which has the Actions cache and the bucket. A cache is a convenience:
 * every copy read from it is checked against the pin like any other, and one that fails is ignored
 */
export function defaultCacheDir(env = process.env) {
  if (env.READARXIV_FIXTURE_CACHE !== undefined) return env.READARXIV_FIXTURE_CACHE || null
  if (env.CI) return null
  return join(homedir(), '.cache', 'readarxiv', 'fixtures')
}

/** The pinned bytes the cache holds for this entry, or null (absent, or not the pinned bytes: then it is left alone and ignored) */
async function cached(cacheDir, entry) {
  if (!cacheDir) return null
  const bytes = await existing(join(cacheDir, entry.sha256)).catch(() => null)
  return bytes && bytes.length === entry.bytes && sha256(bytes) === entry.sha256 ? bytes : null
}

/** Put verified pinned bytes into the cache, whole or not at all; a cache that cannot be written is no failure */
async function remember(cacheDir, entry, bytes) {
  if (!cacheDir) return
  const file = join(cacheDir, entry.sha256)
  if (await stat(file).then(() => true, () => false)) return
  const partial = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.partial`
  try {
    await mkdir(cacheDir, { recursive: true })
    await writeFile(partial, bytes, { flag: 'wx' })
    await rename(partial, file)
  } catch {
    await rm(partial, { force: true }).catch(() => undefined)
  }
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The manifest, refused whole — before anything is fetched — unless every entry is well formed, names a plain path
 * inside a fixture directory that no other entry names, and an address on arXiv. The file is data a pull request can
 * change, and what it names is written to disk and cached by CI (Devin on #229)
 *
 * @returns {Promise<{ path: string; url: string; sha256: string; bytes: number }[]>}
 */
export async function readManifest(root = ROOT) {
  const manifest = JSON.parse(await readFile(join(root, MANIFEST), 'utf8'))
  if (!Array.isArray(manifest?.fixtures)) throw new Error(`${MANIFEST}: no "fixtures" array`)
  const seen = new Set()
  for (const entry of manifest.fixtures) {
    const where = `${MANIFEST}: ${JSON.stringify(entry?.path)}`
    if (typeof entry?.path !== 'string' || typeof entry.url !== 'string' || typeof entry.sha256 !== 'string') {
      throw new Error(`${where}: an entry needs "path", "url" and "sha256" as strings`)
    }
    const inside = relative(root, resolve(root, entry.path)).split('\\').join('/')
    if (isAbsolute(entry.path) || inside !== entry.path || !inside.startsWith(`${FIXTURE_DIR}/`)) {
      throw new Error(`${where} is not a plain path inside ${FIXTURE_DIR}`)
    }
    if (seen.has(entry.path)) throw new Error(`${where} is named twice`)
    seen.add(entry.path)
    if (!entry.url.startsWith(ARXIV)) throw new Error(`${where}: "${entry.url}" is not an ${ARXIV} address`)
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error(`${where}: "sha256" is not 64 lowercase hex digits`)
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) throw new Error(`${where}: "bytes" is not a positive integer`)
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

/** HTTP's date form (IMF-fixdate), the only one besides seconds that `Retry-After` may carry */
const IMF_FIXDATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/

/** A `Retry-After` header as milliseconds; a value in neither of its two forms is ignored */
function retryAfterMs(response) {
  const value = response.headers.get('retry-after')?.trim()
  if (!value) return undefined
  const ms = /^\d{1,9}$/.test(value) ? Number(value) * 1000 : IMF_FIXDATE.test(value) ? Date.parse(value) - Date.now() : NaN
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

/** A failure no retry can change */
class FinalError extends Error {}

/** The hash is right and the size is not: the manifest's `bytes` is what is wrong */
const sizeMismatch = (entry, length) =>
  `${MANIFEST} records ${entry.bytes} bytes for ${entry.path}, whose SHA-256 matches a ${length}-byte file: the manifest's "bytes" is wrong`

/** The directory itself, or the nearest ancestor of it that exists */
async function nearestExisting(dir) {
  for (let at = dir; ; at = dirname(at)) {
    try {
      await stat(at)
      return at
    } catch (e) {
      if (e?.code !== 'ENOENT' || dirname(at) === at) throw e
    }
  }
}

/** The temporary name one run writes this fixture under: `<file>.<pid>.<8 hex digits>.partial` */
const partialOf = file => new RegExp(`^${basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+\\.[0-9a-f]{8}\\.partial$`)

/**
 * A crashed run's temporary files for this fixture — exactly that name, regular files only — removed once old enough
 * not to be a concurrent run's. Swept whenever the fixture is looked at, so a leftover beside a file another run landed
 * goes too
 */
async function dropStalePartials(file) {
  const pattern = partialOf(file)
  const names = await readdir(dirname(file)).catch(() => [])
  for (const name of names) {
    if (!pattern.test(name)) continue
    const path = join(dirname(file), name)
    const info = await lstat(path).catch(() => null)
    if (info?.isFile() && Date.now() - info.mtimeMs > STALE_PARTIAL_MS) await rm(path, { force: true })
  }
}

/** The statuses a later attempt can change: a timeout the server reports, a rate limit, a server error */
const retryable = status => status === 408 || status === 429 || status >= 500

/**
 * One download. Retried on what a retry can help with — a network error, a timeout, 408, 429, a 5xx — never sooner
 * than the gap between downloads, and not sooner than a `Retry-After` asks; asked to wait longer than a minute, it
 * stops and says so. Any other answer is final and says what it means: 404 or 410 is a pin that needs moving, anything
 * else a refusal to look into — neither is a missing connection. The final address must be on arXiv; the content is
 * checked by its hash whatever the route
 */
async function download(entry, fetchImpl, gapMs) {
  let last
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let wait = gapMs * attempt
    try {
      const response = await fetchImpl(entry.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
      if (response.redirected && !response.url.startsWith(ARXIV)) {
        throw new FinalError(`${entry.url} ended at ${response.url}, outside arXiv; nothing was written. The pin needs checking (tests/fixtures/README.md)`)
      }
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), status: response.status }
      // Nothing more is read from an answer that is not the file: an unread body would keep the connection, and the process, open
      await response.body?.cancel().catch(() => undefined)
      if (response.status === 404 || response.status === 410) {
        throw new FinalError(`arXiv answered HTTP ${response.status} for ${entry.url}; nothing was written. The pinned version is not served there any more: the pin needs moving (tests/fixtures/README.md)`)
      }
      if (!retryable(response.status)) {
        throw new FinalError(`arXiv answered HTTP ${response.status} for ${entry.url}; nothing was written, and a retry will not change the answer`)
      }
      last = new Error(`HTTP ${response.status}`)
      const asked = retryAfterMs(response)
      if (asked !== undefined && asked > MAX_RETRY_AFTER_MS) {
        throw new FinalError(`arXiv asks to wait ${Math.round(asked / 1000)} s before ${entry.url} is fetched again (HTTP ${response.status}); nothing was written. Try later`)
      }
      wait = Math.max(wait, asked ?? 0)
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
 * The bucket as a source of the pinned bytes: a function of an entry that answers its bytes, or null (with one line logged,
 * a status and a key) when it cannot — the caller then reads arXiv. null itself unless the token and the account are both set.
 * The S3 credentials are derived once, by the first fixture that needs them; a derivation that fails says so once and every
 * later fixture goes to arXiv without asking again. Nothing logged carries the token, its digest or a signature
 *
 * @returns {((entry: { sha256: string; bytes: number }) => Promise<{ bytes: Buffer; status: number } | null>) | null}
 */
function bucketSource({ env, fetchImpl, retryMs, now, log }) {
  const token = env.READARXIV_CI_TOKEN
  const account = env.CF_ACCOUNT_ID
  if (!token || !account) return null
  let credentials
  return async entry => {
    const key = `fixtures/${entry.sha256}`
    try {
      credentials ??= s3Credentials({ token, account, fetchImpl, retryMs, timeoutMs: TIMEOUT_MS }).catch(e => {
        log(`bucket: ${e.message}; reading arXiv instead`)
        return null
      })
      const derived = await credentials
      if (!derived) return null
      const { res, value } = await getObject({ url: keyUrl(account, key), credentials: derived, fetchImpl, retryMs, now, timeoutMs: TIMEOUT_MS })
      if (!value) {
        log(`bucket ${key}: ${res ? `HTTP ${res.status}` : 'the request failed'}; reading arXiv instead`)
        return null
      }
      if (value.length !== entry.bytes || sha256(value) !== entry.sha256) {
        log(`bucket ${key}: HTTP ${res.status}, but the bytes are not the pinned ones; nothing was written, reading arXiv instead`)
        return null
      }
      return { bytes: value, status: res.status }
    } catch {
      log(`bucket ${key}: could not be read; reading arXiv instead`)
      return null
    }
  }
}

/**
 * Make the remote fixtures present and verified.
 *
 * @param {{ root?: string; cacheDir?: string | null; fetchImpl?: typeof fetch; log?: (line: string) => void; gapMs?: number; env?: Record<string, string | undefined>; retryMs?: number; now?: () => Date }} [options]
 * @returns {Promise<{ verified: string[]; downloaded: string[] }>}
 */
export async function ensureFixtures({ root = ROOT, cacheDir = null, fetchImpl = fetch, log = () => undefined, gapMs = GAP_MS, env = process.env, retryMs = 1000, now = () => new Date() } = {}) {
  const verified = []
  const downloaded = []
  const fromBucket = bucketSource({ env, fetchImpl, retryMs, now, log })
  let askedArxiv = false
  const realRoot = await realpath(root)
  for (const entry of await readManifest(root)) {
    const file = join(root, entry.path)
    const dir = dirname(file)
    await dropStalePartials(file)
    const present = await existing(file)
    if (present) {
      const digest = sha256(present)
      if (digest === entry.sha256 && present.length !== entry.bytes) throw new Error(sizeMismatch(entry, present.length))
      // A file that is there but is not the pinned one is never replaced silently: it may be a maintainer's candidate for a new pin
      if (digest !== entry.sha256) {
        throw new Error(`${entry.path} is not the pinned fixture (SHA-256 ${digest.slice(0, 12)}…, the manifest records ${entry.sha256.slice(0, 12)}…). Delete it to download the pinned copy, or see tests/fixtures/README.md for moving the pin.`)
      }
      await remember(cacheDir, entry, present)
      verified.push(entry.path)
      continue
    }
    const kept = await cached(cacheDir, entry)
    let got = kept ? { bytes: kept, status: 'cache' } : await fromBucket?.(entry)
    let source = kept ? `the machine's cache (${join(cacheDir ?? '', entry.sha256)})` : `the bucket (fixtures/${entry.sha256})`
    if (!got) {
      // The gap is arXiv's: between two requests to it, not before the first
      if (askedArxiv) await sleep(gapMs)
      askedArxiv = true
      got = await download(entry, fetchImpl, gapMs)
      source = entry.url
      const { bytes } = got
      const digest = sha256(bytes)
      if (digest === entry.sha256 && bytes.length !== entry.bytes) throw new Error(sizeMismatch(entry, bytes.length))
      if (digest !== entry.sha256) {
        throw new Error(
          `${entry.url} now serves other bytes than the pinned fixture (SHA-256 ${digest.slice(0, 12)}…, ${bytes.length} bytes; the manifest records ${entry.sha256.slice(0, 12)}…, ${entry.bytes} bytes): a new rendering of the paper, or a page in its place. `
          + 'Nothing was written: the snapshots and measurements were taken from the pinned bytes, and moving the pin is a maintainer\'s decision (tests/fixtures/README.md).',
        )
      }
    }
    const { bytes, status } = got
    // The path as it really is, checked before anything is created: the part of it that exists must resolve to itself
    // under the root — a symbolic link on the way would carry a directory or the file elsewhere — and once created, the
    // directory must be inside a fixture directory
    const near = await nearestExisting(dir)
    if (await realpath(near) !== join(realRoot, relative(root, near))) {
      throw new Error(`${entry.path}: ${relative(root, near) || '.'} resolves to ${await realpath(near)}, through a symbolic link; nothing was written`)
    }
    await mkdir(dir, { recursive: true })
    const realDir = await realpath(dir)
    if (!`${realDir}/`.startsWith(`${join(realRoot, FIXTURE_DIR)}/`)) {
      throw new Error(`${entry.path}: its directory resolves to ${realDir}, outside the fixture directory; nothing was written`)
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
    if (!kept) await remember(cacheDir, entry, bytes)
    log(`fetched ${entry.path} (${bytes.length} bytes) from ${source}${status === 'cache' ? '' : `: HTTP ${status}`}`)
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
  // It takes no argument, and one given is a mistake. pnpm passes a literal `--` through when it is given one
  // (`pnpm fixtures:fetch --`)
  if (process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === '--')).length > 0) {
    console.error('usage: fetch-fixtures.mjs')
    process.exit(2)
  }
  try {
    const { verified, downloaded } = await ensureFixtures({ cacheDir: defaultCacheDir(), log: line => console.log(process.env.GITHUB_ACTIONS === 'true' && line.startsWith('bucket') ? `::warning::${line}` : line) })
    console.log(`remote fixtures: ${downloaded.length} downloaded, ${verified.length} already there, all verified`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
