// lab/pdf/spikes/rules-publish.mjs
// Publishing the layout rule set (rules-as-data plan §6 and §8, Task R6): the two writes of the web Worker's rules routes,
// shared by the workflows that publish (rules-publish.yml, to staging on a merge and to production behind a reviewer) and
// the one that rolls back (rules-point.yml).
//   publish  the file is read as a reader reads one (readRules: its size, UTF-8, values, shape, ranges), then POSTed to
//            /api/v1/rules/publish (201 written, 200 the same bytes already there) and the pointer POSTed to /point, so that
//            the set a merge brought is the one readers take
//   point    the pointer alone, to a version already published: the rollback
// The secret is read from RULES_PUBLISH_SECRET and goes into one request header; it is never printed, and nothing a Worker
// answers is printed but its status and its short `why`. A route the Worker does not have yet (a 404 from /publish) is a
// failure that says so, not a silent skip.
//
// The newest set only: with `--next=<ref>` a publish first reads the set on that ref (origin/next, fetched by the workflow just
// before) and, where its version is newer than the file's own, writes nothing and says so. A set is a whole file, so a version
// skipped loses nothing, and the run of the newer one publishes it; the pointer then only ever moves to the newest merged set,
// except by a rollback.
//
//   RULES_PUBLISH_SECRET=… node lab/pdf/spikes/rules-publish.mjs publish --url=<origin> [--file=src/pdf-reader/engine/rules/layout-rules.json] [--next=origin/next]
//   RULES_PUBLISH_SECRET=… node lab/pdf/spikes/rules-publish.mjs point --url=<origin> --schema=1 --version=3
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = resolve(new URL('.', import.meta.url).pathname, '../../..')
/** the rule set's place in the repository, on any ref */
export const RULES_FILE = 'src/pdf-reader/engine/rules/layout-rules.json'

/** the origin a request goes to: https (http only for the machine's own, for a test), no credentials, nothing after the host */
export function originOf(text) {
  let u
  try { u = new URL(text) } catch { throw new Error('the Worker\'s url is not a url') }
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('the Worker\'s url is not https')
  if (u.username || u.password) throw new Error('the Worker\'s url carries credentials')
  return u.origin
}

/**
 * The version of the set on another ref when it is newer than the one this run would publish, else null: an equal version is this
 * run's own (or the same run again, which the Worker takes as done), and an older one is no reason to stand down. `onNext` is null
 * where there is no ref to hold the run to, or the file there names no version.
 */
export function supersededBy(own, onNext) {
  return Number.isInteger(own) && Number.isInteger(onNext) && onNext > own ? onNext : null
}

/** the version the set on a git ref names (`origin/next`), or null where the file there is no JSON with one; throws where the
 *  ref cannot be read, so that a publish that cannot tell whether it is the newest does not guess. `show` is git's, for a test. */
export function versionOn(ref, { show = (r, file) => execFileSync('git', ['show', `${r}:${file}`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 24 }) } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(String(ref))) throw new Error('--next is a git ref')
  let text
  try { text = show(ref, RULES_FILE) } catch { throw new Error(`cannot read ${RULES_FILE} on ${ref}: was it fetched?`) }
  try { const v = JSON.parse(text)?.version; return Number.isInteger(v) ? v : null } catch { return null }
}

/** a Worker's answer in a few words: its status, and its `why` where it is a short word of its own */
async function told(res) {
  let why = ''
  try { const j = JSON.parse(await res.text()); if (typeof j?.why === 'string' && /^[a-z0-9-]{1,40}$/.test(j.why)) why = `, ${j.why}` } catch { /* a body that is no JSON says nothing */ }
  return `HTTP ${res.status}${why}`
}

const call = (fetchImpl, origin, route, secret, body) => fetchImpl(`${origin}/api/v1/rules/${route}`, {
  method: 'POST', redirect: 'error',
  headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', 'user-agent': 'readarxiv-rules-ci' },
  body,
})

/** the pointer moved to `version` of `schema`; returns a line to print */
export async function point({ url, schema, version, secret, fetchImpl = fetch }) {
  if (!secret) throw new Error('RULES_PUBLISH_SECRET is not set')
  if (!Number.isInteger(schema) || schema < 1 || !Number.isInteger(version) || version < 1) throw new Error('schema and version are positive integers')
  const origin = originOf(url)
  const res = await call(fetchImpl, origin, 'point', secret, JSON.stringify({ schema, version }))
  if (res.status === 200) return `the pointer of s${schema} is at version ${version} on ${origin}`
  if (res.status === 404) throw new Error(`${origin}: no version ${version} of s${schema} to point to (${await told(res)}), or the route is not there`)
  throw new Error(`${origin}: the pointer was not moved (${await told(res)})`)
}

/** the file published and the pointer moved to it; returns the lines to print. `onNext`: the version of the set on the branch
 *  that publishes (`versionOn`), where one is newer than the file's own nothing is written */
export async function publish({ url, file, secret, fetchImpl = fetch, engine, onNext = null }) {
  if (!secret) throw new Error('RULES_PUBLISH_SECRET is not set')
  const origin = originOf(url)
  const bytes = new Uint8Array(readFileSync(file))
  const E = engine ?? await import(pathToFileURL(resolve(REPO, 'src/pdf-reader/engine/rules/layout.mjs')).href)
  const { set, sha256 } = await E.readRules(bytes)
  const newer = supersededBy(set.version, onNext)
  if (newer !== null) return [`superseded by version ${newer}; its own run publishes it`]
  const res = await call(fetchImpl, origin, 'publish', secret, bytes)
  const lines = []
  if (res.status === 201) lines.push(`published s${set.schema} version ${set.version} (${sha256.slice(0, 12)}) to ${origin}`)
  else if (res.status === 200) lines.push(`s${set.schema} version ${set.version} was already on ${origin} with these bytes`)
  else if (res.status === 404) throw new Error(`${origin}: no rules routes (${await told(res)}): is the Worker deployed with /api/v1/rules/publish?`)
  else if (res.status === 409) throw new Error(`${origin}: version ${set.version} of s${set.schema} holds other bytes: raise the version, or point to it`)
  else if (res.status === 401 || res.status === 403) throw new Error(`${origin}: the publish secret is refused (${await told(res)})`)
  else throw new Error(`${origin}: the set was not published (${await told(res)})`)
  lines.push(await point({ url, schema: set.schema, version: set.version, secret, fetchImpl }))
  return lines
}

const arg = (argv, name) => { const a = argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null }

async function main(argv) {
  const [command] = argv
  const secret = process.env.RULES_PUBLISH_SECRET, url = arg(argv, 'url')
  if (command === 'publish') for (const line of await publish({ url, file: resolve(arg(argv, 'file') ?? RULES_FILE), secret, onNext: arg(argv, 'next') ? versionOn(arg(argv, 'next')) : null })) console.log(line)
  else if (command === 'point') console.log(await point({ url, schema: Number(arg(argv, 'schema')), version: Number(arg(argv, 'version')), secret }))
  else throw new Error('usage: rules-publish.mjs publish | point')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(() => process.exit(0), e => { console.error(String(e?.message ?? e)); process.exit(1) })
}
