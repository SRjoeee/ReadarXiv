// lab/pdf/layer-lab/rules-api.mjs
// The layer lab's rules routes (the rules-as-data plan §7), which serve.mjs mounts. Node only; the repository's root, the
// lab's own origin and the engine's rules module are handed in, so that the tests work in a temporary repository and never
// touch the worktree's real file.
//   GET  /api/rules            the worktree's file, its bytes as they are, the digest as the ETag
//   GET  /api/rules?ref=<ref>  that commit's file (`git show <commit>:<path>`): a commit sha, full or abbreviated, or an
//                              existing branch; a CI comment's link (`#rules=<head sha>`) opens the PR's set through it
//   GET  /api/rules/published?env=staging|production
//                              the published current set, fetched from the URL the lab was given for it (the web's rules
//                              route); 404 where none was given or the route answers 404, 502 where it is unreachable
//   POST /api/rules            a save: the set as JSON, `note` required, its `version` and an `If-Match` header (the digest
//                              the page was given with the file, as a GET's ETag) both the file's as the page last read
//                              it. Validated as a reader validates a set (readRules); refused with a 428 `precondition`
//                              where the header is missing, and with a 409 `stale`, nothing written, where the file has
//                              moved on since, by its version or by its bytes (another tab, a checkout, an edit by hand
//                              that kept the version); else its version set to the file's plus one, written in the
//                              canonical form (writeRules); the answer names the fields that changed
// The server listens on 127.0.0.1 and nothing else; a POST is refused unless it is application/json and its Origin is exactly
// the lab's own (a page of another origin can send neither without being refused), and one save at a time is written, by
// a temporary file renamed over the file, so that the file is either what it was or what the save made.
import { execFile } from 'node:child_process'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { diffRules } from './rules-model.mjs'

const run = promisify(execFile)
/** the rule set's file, from the repository's root */
export const RULES_PATH = 'src/pdf-reader/engine/rules/layout-rules.json'
const ENVS = ['staging', 'production']
/** a commit sha, abbreviated or full */
const SHA = /^[0-9a-f]{4,64}$/i
/** a branch name, local or remote-tracking: no option, no revision syntax, no path */
const BRANCH = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/
const wellFormed = ref => SHA.test(ref) || (BRANCH.test(ref) && !ref.includes('..') && !ref.includes('//') && !/[./]$/.test(ref) && !ref.endsWith('.lock'))
/** what the lab asks the web's route with: a project agent and nothing about the maintainer */
const AGENT = 'readarxiv-layer-lab'
const FETCH_MS = 5000
const GIT_MS = 10_000

const json = (res, status, body, headers = {}) => {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers })
  res.end(text)
}
const refuse = (res, status, error, why, extra = {}, headers = {}) => json(res, status, { ok: false, error, why, ...extra }, headers)
const hex = bytes => Buffer.from(bytes).toString('hex')

/**
 * The lab's rules routes. `root`: the repository holding the file. `origin`: the lab's own origin, a function because the
 * port is known only once the server listens. `rules`: the engine's rules module (readRules, writeRules, RulesRefusal,
 * RULES_CAP). `published`: the web's rules route by environment, null or left out where the lab was given none. `fetch`: the
 * fetch to ask it with
 */
export function createRulesApi({ root, origin, rules, published = {}, fetch: fetchImpl = globalThis.fetch }) {
  const { readRules, writeRules, RulesRefusal, RULES_CAP } = rules
  const file = join(root, RULES_PATH)
  const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes))

  /** bytes as the set's own answer: the digest as the ETag, a HEAD with the headers alone */
  async function sendBytes(req, res, bytes, headers = {}) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length, etag: `"${await digest(bytes)}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers })
    res.end(req.method === 'HEAD' ? undefined : bytes)
  }

  // ---- reading
  async function fromFile(req, res) {
    let bytes
    try { bytes = await readFile(file) } catch (e) {
      if (e?.code === 'ENOENT') return refuse(res, 404, 'file', `no ${RULES_PATH} in this worktree`)
      throw e
    }
    return sendBytes(req, res, bytes)
  }

  const git = (args, options = {}) => run('git', ['-C', root, ...args], { timeout: GIT_MS, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, ...options })
  /** the commit a ref names (its full sha), or null: a sha, abbreviated or not, then a branch of the repository's own or a
   *  remote-tracking one. The ref is one argument of git, and passed only once it is well formed */
  async function commitOf(ref) {
    const candidates = [...(SHA.test(ref) ? [ref.toLowerCase()] : []), ...(BRANCH.test(ref) ? [`refs/heads/${ref}`, `refs/remotes/${ref}`] : [])]
    for (const name of candidates) {
      try {
        const { stdout } = await git(['rev-parse', '--verify', '--quiet', `${name}^{commit}`])
        const sha = stdout.trim()
        if (/^[0-9a-f]{40,64}$/.test(sha)) return sha
      } catch {}
    }
    return null
  }
  async function fromRef(req, res, refs) {
    if (refs.length !== 1 || !wellFormed(refs[0])) return refuse(res, 400, 'ref', 'not a commit sha or a branch name, or given more than once')
    const commit = await commitOf(refs[0])
    if (commit === null) return refuse(res, 404, 'ref', 'not a commit or a branch of this repository')
    let bytes
    try { bytes = (await git(['show', `${commit}:${RULES_PATH}`], { encoding: 'buffer', maxBuffer: RULES_CAP * 2 })).stdout } catch (e) {
      if (e?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return refuse(res, 413, 'ref', "that commit's file is larger than a rule set may be", { field: 'bytes' })
      return refuse(res, 404, 'ref', 'no rules file at that commit')
    }
    return sendBytes(req, res, bytes, { 'x-rules-commit': commit })
  }

  /** the published current set: the route's bytes, its ETag and version, or why it is not there */
  async function fromPublished(req, res, env) {
    if (!ENVS.includes(env)) return refuse(res, 400, 'env', `one of ${ENVS.join(', ')}`)
    const url = published[env]
    if (!url) return refuse(res, 404, 'unavailable', `the lab was given no URL for ${env}`)
    let answer
    try { answer = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': AGENT }, redirect: 'error', signal: AbortSignal.timeout(FETCH_MS) }) } catch (e) {
      return refuse(res, 502, 'unreachable', String(e?.cause?.code ?? e?.message ?? e).slice(0, 200))
    }
    if (!answer.ok) {
      await answer.body?.cancel().catch(() => {})
      return refuse(res, answer.status === 404 ? 404 : 502, 'unavailable', `the route answered ${answer.status}`, { status: answer.status })
    }
    const chunks = []
    let size = 0
    try {
      for await (const chunk of answer.body ?? []) {
        size += chunk.length
        if (size > RULES_CAP) { await answer.body.cancel().catch(() => {}); return refuse(res, 502, 'too-large', `the route's answer is larger than ${RULES_CAP} bytes`) }
        chunks.push(chunk)
      }
    } catch (e) { return refuse(res, 502, 'unreachable', String(e?.cause?.code ?? e?.message ?? e).slice(0, 200)) }
    const bytes = Buffer.concat(chunks)
    const version = answer.headers.get('x-rules-version')
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length, etag: answer.headers.get('etag') ?? `"${await digest(bytes)}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(version ? { 'x-rules-version': version } : {}) })
    res.end(req.method === 'HEAD' ? undefined : bytes)
  }

  // ---- saving
  /** the body of a request, at most `cap` bytes: null where there is more (the rest is read and let go, so that the answer
   *  can be sent) */
  function body(req, cap) {
    return new Promise((done, fail) => {
      const chunks = []
      let size = 0
      req.on('data', chunk => { size += chunk.length; if (size <= cap) chunks.push(chunk) })
      req.on('end', () => done(size <= cap ? Buffer.concat(chunks) : null))
      req.on('error', fail)
    })
  }
  let chain = Promise.resolve()
  /** one save at a time: the version a save takes is the file's as the save before it left it */
  const alone = work => { const mine = chain.then(work, work); chain = mine.catch(() => {}); return mine }

  async function save(req, res) {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (req.headers.origin !== origin()) { req.resume(); return refuse(res, 403, 'origin', "a save comes from the lab's own page") }
    if (type !== 'application/json') { req.resume(); return refuse(res, 415, 'content-type', 'a save is sent as application/json') }
    const length = Number(req.headers['content-length'])
    const bytes = Number.isFinite(length) && length > RULES_CAP ? (req.resume(), null) : await body(req, RULES_CAP)
    if (bytes === null) return refuse(res, 413, 'refused', `more than ${RULES_CAP} bytes`, { field: 'bytes' }, { connection: 'close' })
    let set
    try { ({ set } = await readRules(new Uint8Array(bytes))) } catch (e) {
      if (e instanceof RulesRefusal) return refuse(res, e.field === 'bytes' ? 413 : 422, 'refused', e.why, { field: e.field })
      throw e
    }
    if (set.note.trim() === '') return refuse(res, 422, 'refused', 'a note says what changed and why', { field: 'note' })
    // (the digest of the file the page was given, as the strong ETag it came with: a save names what it was built on)
    const built = /^"([0-9a-f]{64})"$/.exec(String(req.headers['if-match'] ?? ''))?.[1]
    if (!built) return refuse(res, 428, 'precondition', "a save names the file it was built on: an If-Match header holding the digest the file came with")
    return alone(async () => {
      let current, onDisk
      try { ({ set: current, sha256: onDisk } = await readRules(new Uint8Array(await readFile(file)))) } catch (e) {
        if (e instanceof RulesRefusal || e?.code === 'ENOENT') return refuse(res, 500, 'file', `the worktree's file cannot be read (${e.field ?? 'missing'}: ${e.why ?? e.message}); restore it first`, e.field ? { field: e.field } : {})
        throw e
      }
      // (a save carries the file's version and digest as its page last read them: where either differs, the file has moved on, the
      // set is built on a file that is no more, and writing it would take the newer edits away. A digest catches what a version
      // cannot: a checkout or a hand edit that left the counter as it was. The page says so and loads the file; nothing is merged here)
      if (set.version !== current.version || built !== onDisk) {
        return refuse(res, 409, 'stale', set.version !== current.version ? `the file is at version ${current.version} now; this set was built on version ${set.version}` : `the file changed (it is still version ${current.version}); this set was built on its earlier bytes`, { version: current.version, sha256: onDisk })
      }
      const changed = diffRules(current, set)
      if (!changed.length) return refuse(res, 409, 'unchanged', 'no field differs from the file')
      const text = writeRules({ ...set, version: current.version + 1 })
      const written = Buffer.from(text, 'utf8')
      if (written.length > RULES_CAP) return refuse(res, 422, 'refused', `the written set would be ${written.length} bytes, more than ${RULES_CAP}`, { field: 'bytes' })
      const temporary = `${file}.${process.pid}.tmp`
      try {
        await writeFile(temporary, written)
        await rename(temporary, file)
      } catch (e) { await rm(temporary, { force: true }); throw e }
      return json(res, 200, { ok: true, version: current.version + 1, sha256: await digest(written), bytes: written.length, changed })
    })
  }

  /** answers a request for one of the lab's rules routes and says it did (true), or leaves it (false) */
  async function handle(req, res) {
    const { pathname, searchParams } = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (pathname !== '/api/rules' && pathname !== '/api/rules/published') return false
    try {
      const read = req.method === 'GET' || req.method === 'HEAD'
      if (pathname === '/api/rules/published') {
        if (!read) refuse(res, 405, 'method', 'GET', {}, { allow: 'GET, HEAD' })
        else await fromPublished(req, res, searchParams.get('env'))
      } else if (read) {
        if (searchParams.has('ref')) await fromRef(req, res, searchParams.getAll('ref'))
        else await fromFile(req, res)
      } else if (req.method === 'POST') await save(req, res)
      else refuse(res, 405, 'method', 'GET, HEAD or POST', {}, { allow: 'GET, HEAD, POST' })
    } catch (e) {
      if (!res.headersSent) refuse(res, 500, 'internal', String(e?.message ?? e).slice(0, 300))
      else res.destroy()
    }
    return true
  }
  return { handle }
}
