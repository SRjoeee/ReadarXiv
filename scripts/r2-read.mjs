// Reading a private object from Cloudflare R2's S3 endpoint with an R2 API token (Object Read on one bucket): the one
// implementation, used by the rules gate's pack (lab/pdf/spikes/gate-pack.mjs) and by the fixtures fetch
// (scripts/fetch-fixtures.mjs). Plain node, no dependency: both run before anything is installed or compiled.
//
// The token is sent only to Cloudflare's token-verify endpoint, which answers the token's id. Objects are read from
// `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`, each request signed (SigV4) with the key derived from the token
// (that id, and the SHA-256 of its value — Cloudflare: "Get S3 API credentials from an API token"). Neither the token nor the
// derived secret nor a signature is ever printed or thrown: what fails says a status and a key.
import { createHash, createHmac } from 'node:crypto'

/** the private bucket the pack (`gate-pack/<sha256>`) and the pinned fixtures (`fixtures/<sha256>`) are kept in */
export const BUCKET = 'readarxiv-ci'

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export const accountOf = account => {
  if (typeof account !== 'string' || !/^[0-9a-f]{32}$/.test(account)) throw new Error('CF_ACCOUNT_ID is not a Cloudflare account id')
  return account
}

/** whether a string is an object key this module reads: slashes between segments, none empty, dot or dot-dot, and a plain alphabet */
export const isKey = key => typeof key === 'string' && /^[A-Za-z0-9._/-]+$/.test(key) && key.split('/').every(s => s !== '' && s !== '.' && s !== '..')

/** an object's url as a read of R2's S3 API (path style): the slashes of the key literal, the rest escaped once */
export function keyUrl(account, key, bucket = BUCKET) {
  accountOf(account)
  if (!isKey(key)) throw new Error(`not an object key: ${JSON.stringify(String(key).slice(0, 80))}`)
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
}

const EMPTY_SHA = sha256('')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()

/**
 * The headers of a body-less, query-less request signed with AWS Signature Version 4: `headers` plus `x-amz-date`,
 * `x-amz-content-sha256` (the empty payload's digest) and `authorization`. `host` is signed from the URL but not returned (fetch
 * sets it). The path is signed as the URL carries it, each segment escaped once; header values are trimmed, nothing more.
 * Proven against AWS's own GET Object example (tests/scripts/r2-read.test.ts).
 */
export function signV4({ method, url, headers = {}, accessKeyId, secret, region, service, date }) {
  const u = new URL(url)
  if (u.search) throw new Error('signV4 signs requests without a query string')
  const stamp = date.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const scope = `${stamp.slice(0, 8)}/${region}/${service}/aws4_request`
  const sent = { ...headers, 'x-amz-date': stamp, 'x-amz-content-sha256': EMPTY_SHA }
  const signed = { host: u.host, ...Object.fromEntries(Object.entries(sent).map(([k, v]) => [k.toLowerCase(), String(v).trim()])) }
  const names = Object.keys(signed).sort()
  const canonical = `${method}\n${u.pathname}\n\n${names.map(n => `${n}:${signed[n]}\n`).join('')}\n${names.join(';')}\n${EMPTY_SHA}`
  const key = [...scope.split('/')].reduce(hmac, `AWS4${secret}`)
  const signature = hmac(key, `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha256(canonical)}`).toString('hex')
  return { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` }
}

/** the token as it is signed with: white space in it (a pasted newline, which a header drops and a digest keeps) is refused */
export const tokenOf = token => {
  if (typeof token !== 'string' || !token) throw new Error('READARXIV_CI_TOKEN is not set')
  if (!/^\S+$/.test(token)) throw new Error('READARXIV_CI_TOKEN has white space in it: set the token alone')
  return token
}

const sleep = ms => new Promise(ok => setTimeout(ok, ms))

/**
 * A request `send()` makes and `read(res)` reads, tried again twice (after retryMs, then twice that) when it fails for want of
 * the network or the server: a throw, a 5xx or a 429. The read is part of the operation: a connection that drops while the body
 * is read is the same failure as one that never opened. Returns { res, value } of the one that worked, or { res } (null when no
 * response came) of the one that did not: a 4xx at once, the others when the tries are spent.
 */
export async function withRetry(send, read, retryMs) {
  for (let attempt = 0; ; attempt++) {
    let res = null
    try {
      res = await send()
      if (res.ok) return { res, value: await read(res) }
    } catch { res = null }
    if (!(res === null || res.status >= 500 || res.status === 429) || attempt >= 2) return { res }
    await sleep(retryMs * (attempt + 1))
  }
}

/** `{ signal }` for a request that may take `timeoutMs` at most (the body's read included), nothing when no limit is asked for */
const limit = timeoutMs => (timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {})

/**
 * The S3 credentials of an R2 API token: the access key id is the token's own id, which Cloudflare's verify endpoint answers,
 * and the secret is the SHA-256 of the token's value. The one request that carries the token; nothing it fails with names the
 * token or the secret.
 */
export async function s3Credentials({ token, account, fetchImpl = fetch, retryMs = 1000, timeoutMs }) {
  tokenOf(token)
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountOf(account)}/tokens/verify`
  const { res, value } = await withRetry(() => fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, ...limit(timeoutMs) }), r => r.json(), retryMs)
  if (!value) throw new Error(res && res.status < 500 && res.status !== 429 ? `the token is not an active Account API token of this account (HTTP ${res.status})` : `Cloudflare's token-verify endpoint could not be read (${res ? `HTTP ${res.status}` : 'the request failed'})`)
  const id = value.result?.id
  if (value.success !== true || value.result?.status !== 'active' || typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) throw new Error(`the token is not an active Account API token of this account (HTTP ${res.status})`)
  return { accessKeyId: id, secret: sha256(token) }
}

/**
 * A signed GET of `url` (from `keyUrl`), the bytes read whole. Each attempt is signed with the clock of that attempt (`now()`),
 * and the retry rule is `withRetry`'s. Returns { res, value }: the bytes as a Buffer when it worked, else `res` (null when no
 * response came) for the caller to say what the status means.
 */
export function getObject({ url, credentials: { accessKeyId, secret }, fetchImpl = fetch, retryMs = 1000, now = () => new Date(), timeoutMs }) {
  return withRetry(
    () => fetchImpl(url, { headers: signV4({ method: 'GET', url, accessKeyId, secret, region: 'auto', service: 's3', date: now() }), ...limit(timeoutMs) }),
    async r => Buffer.from(await r.arrayBuffer()),
    retryMs,
  )
}
