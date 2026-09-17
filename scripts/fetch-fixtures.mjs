// The fixtures that are not in the repository (tests/fixtures/remote.json): five papers, one figure of one of them and
// the recognition helper's reference image are under arXiv's non-exclusive licence — arXiv may distribute them, this
// repository may not. Each is downloaded from the pinned version into the path the tests read, once, and only a copy
// whose SHA-256 is the recorded one is accepted: the rule-coverage snapshots and the measured numbers in DESIGN were
// taken from exactly these bytes.
//
//   pnpm fixtures:fetch        # download what is missing, verify everything
//
// `pnpm test` runs the same thing first (tests/global-setup.ts), as do `pnpm fixtures:stats` and `pnpm helper:smoke`.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = 'tests/fixtures/remote.json'
/** Says who is asking: arXiv asks automated clients to identify themselves */
const USER_AGENT = 'ReadarXiv-fixtures/1 (+https://github.com/SRjoeee/ReadarXiv)'
/** Between two downloads. Seven files once per checkout is nothing, and still not a burst */
const GAP_MS = 1_000
const TIMEOUT_MS = 60_000
const ATTEMPTS = 3

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Where a fixture may be written: the two fixture directories, nowhere else */
const FIXTURE_DIRS = ['tests/fixtures', 'helper/Tests/Fixtures']

/**
 * The manifest, refused whole if an entry could write outside the fixture directories or fetch from anywhere but
 * arXiv: the file is data a pull request can change, and what it names is written to disk and cached by CI
 * (Devin on #229)
 *
 * @returns {Promise<{ path: string; url: string; sha256: string; bytes: number }[]>}
 */
export async function readManifest(root = ROOT) {
  const entries = JSON.parse(await readFile(join(root, MANIFEST), 'utf8')).fixtures
  for (const entry of entries) {
    const inside = relative(root, resolve(root, String(entry.path))).split('\\').join('/')
    if (isAbsolute(String(entry.path)) || inside !== entry.path || !FIXTURE_DIRS.some(dir => inside.startsWith(`${dir}/`))) {
      throw new Error(`${MANIFEST}: "${entry.path}" is not a plain path inside ${FIXTURE_DIRS.join(' or ')}`)
    }
    if (!/^https:\/\/arxiv\.org\//.test(String(entry.url))) throw new Error(`${MANIFEST}: "${entry.url}" is not an https://arxiv.org/ address`)
  }
  return entries
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

/**
 * One download, retried on what a retry can help with: a network error, a timeout, a 5xx or a 429. A 404 is final — the
 * pinned version is gone — and so is a body that is not the recorded one
 */
async function download(entry, fetchImpl, gapMs) {
  let last
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(entry.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
      if (response.ok) return Buffer.from(await response.arrayBuffer())
      last = new Error(`HTTP ${response.status}`)
      if (response.status < 500 && response.status !== 429) break
    } catch (e) {
      last = e
    }
    if (attempt < ATTEMPTS) await sleep(gapMs * attempt)
  }
  throw new Error(
    `${entry.path} is not in the repository (its paper's licence does not allow it) and could not be downloaded from ${entry.url}: ${last?.message ?? last}. `
    + 'With a network connection, `pnpm fixtures:fetch` fetches it once; it stays on disk afterwards.',
  )
}

/**
 * Make every remote fixture present and verified.
 *
 * @param {{ root?: string; fetchImpl?: typeof fetch; log?: (line: string) => void; gapMs?: number }} [options]
 * @returns {Promise<{ verified: string[]; downloaded: string[] }>}
 */
export async function ensureFixtures({ root = ROOT, fetchImpl = fetch, log = () => undefined, gapMs = GAP_MS } = {}) {
  const verified = []
  const downloaded = []
  for (const entry of await readManifest(root)) {
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
    if (sha256(bytes) !== entry.sha256) {
      throw new Error(
        `${entry.url} now serves other bytes than the pinned fixture (SHA-256 ${sha256(bytes).slice(0, 12)}…, ${bytes.length} bytes; the manifest records ${entry.sha256.slice(0, 12)}…, ${entry.bytes} bytes). `
        + 'arXiv has rendered the paper again. Nothing was written: the snapshots and measurements were taken from the pinned bytes, and moving the pin is a maintainer\'s decision (tests/fixtures/README.md).',
      )
    }
    // Written beside the target and renamed: an interrupted run leaves no half file for the next one to reject
    await mkdir(dirname(file), { recursive: true })
    const partial = `${file}.partial`
    await writeFile(partial, bytes)
    await rename(partial, file).catch(async e => { await rm(partial, { force: true }); throw e })
    log(`fetched ${entry.path} (${bytes.length} bytes) from ${entry.url}`)
    downloaded.push(entry.path)
  }
  return { verified, downloaded }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { verified, downloaded } = await ensureFixtures({ log: line => console.log(line) })
    console.log(`remote fixtures: ${downloaded.length} downloaded, ${verified.length} already there, all verified`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
