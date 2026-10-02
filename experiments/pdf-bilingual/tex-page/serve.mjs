// The TeX page's static site on this machine, as a CDN would serve it: out/tex-site (build.mjs) and the TeX Live tree
// under t/<tid>/, every file with its brotli copy when the browser takes brotli (HTTPS only, in Chrome), the versioned
// files immutable. `today: true` serves today's page instead (poc-site at measure.mjs TODAY, BusyTeX's full preloaded
// tier, and the tree as texlive-server answers, GET /tl/<format>/<name>, resolved by the same index — kpathsea's choice
// among files of one name, where texlive-server took another for two small files): the comparison.
// `link: { rtt, mbit }` makes the server a slow link: every response waits one round trip before its first byte, and
// all bodies share the link's rate. `tls: true` serves HTTP/2 over TLS with a self-signed certificate (the browser
// must accept it), as a CDN does. `upstream: <origin>` serves the site deployed there instead of out/tex-site (LIVE:
// https://tex.readarxiv.org): every object fetched from it as it is asked for — with brotli, which the site requires
// —, its status and headers passed on, its bytes decoded, so that the checks run against the deployed objects with
// their request log and their faults still this server's.
//   node experiments/pdf-bilingual/tex-page/serve.mjs [--port=8072] [--tls] [--today] [--rtt=30 --mbit=50] [--upstream=<origin>]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createSecureServer } from 'node:http2'
import { dirname, extname, join } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants } from 'node:zlib'
import { parseIndex, resolve } from '../poc-site/tex-tree.mjs'

const HERE = new URL('.', import.meta.url).pathname
const EXP = join(HERE, '..')
const SITE = join(EXP, 'out/tex-site')
const BR = join(EXP, 'out/tex-br')
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.html': 'text/html', '.txt': 'text/plain' }
const brotli = promisify(brotliCompress)
const sleep = ms => new Promise(r => setTimeout(r, ms))

function certificate() {
  const dir = join(EXP, 'out/tex-tls')
  if (!existsSync(join(dir, 'cert.pem'))) {
    mkdirSync(dir, { recursive: true })
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '365', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' })
  }
  return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }
}
/** the certificate's public key's SHA-256, for Chromium's --ignore-certificate-errors-spki-list: a browser that trusts
 *  it treats the site as valid, and caches its responses (it caches nothing from a site whose certificate it doubts) */
export function certificateSpki() {
  certificate()
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: execFileSync('openssl', ['x509', '-pubkey', '-noout', '-in', join(EXP, 'out/tex-tls/cert.pem')]) })
  return createHash('sha256').update(der).digest('base64')
}

/**
 * → the server, listening on 127.0.0.1:`port` (0: any free port). `log(row)` hears of every response:
 * { t, path, status, bytes (on the wire), encoding }
 */
export async function serveTexSite({ port = 0, tls = false, today = false, link = null, log = null, upstream = null } = {}) {
  const tree = upstream ? null : JSON.parse(readFileSync(join(SITE, 'tree.json'), 'utf8'))
  let index = null
  const treeIndex = () => (index ??= parseIndex(readFileSync(join(SITE, 't', tree.tid, tree.index), 'utf8')))
  const todayDir = join(EXP, 'out/tex-today')
  /** a request's path → { file, br (its brotli copy's path, made on demand when null), type, immutable } or null */
  function locate(path) {
    if (today) {
      if (path === '/tex.html' || path === '/tex.js') return { file: join(todayDir, path.slice(1)), type: TYPES[extname(path)] }
      if (path === '/extra/list.json') return { body: '[]', type: TYPES['.json'] }
      if (path.startsWith('/lib/')) return { file: join(EXP, 'node_modules/texlyre-busytex/dist', path.slice(5)), type: TYPES['.js'], cache: true }
      if (path.startsWith('/busytex/')) return { file: join(EXP, 'data/busytex-patched', path.slice(1)), type: TYPES[extname(path)], cache: true }
      const m = /^\/tl\/(\d+)\/(.+)$/.exec(path)
      if (m) { const p = resolve(treeIndex(), Number(m[1]), m[2]); return p ? { file: join(tree.root, p), tree: p, cache: true } : null }
      return null
    }
    if (path === '/tex.html') return { file: join(SITE, 'tex.html'), type: TYPES['.html'] }
    const m = new RegExp(`^/t/${tree.tid}/(.+)$`).exec(path)
    if (m && !existsSync(join(SITE, path.slice(1)))) return { file: join(tree.root, m[1]), tree: m[1], immutable: true }
    if (!/^\/(b|c|e|t)\//.test(path)) return null
    return { file: join(SITE, path.slice(1)), type: TYPES[extname(path)], immutable: true, site: true }
  }
  /** today's page is served as it is today, uncompressed */
  async function brotliOf(at) {
    if (today) return null
    if (at.site) return existsSync(`${at.file}.br`) ? readFileSync(`${at.file}.br`) : null
    if (!at.tree) return null
    const copy = join(BR, 't', tree.tid, `${at.tree}.br`)
    if (!existsSync(copy)) {
      const bytes = readFileSync(at.file)
      mkdirSync(dirname(copy), { recursive: true })
      writeFileSync(copy, await brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }))
    }
    return readFileSync(copy)
  }
  // the link's clock: the time its last reserved byte is through
  let free = 0
  // in slices that wait for the connection to drain: an HTTP/2 session refuses new streams once it holds more than its
  // memory allows, and a 90 MB body written at once is more
  async function send(res, body) {
    const rate = link?.mbit ? (link.mbit * 1e6) / 8 / 1000 : 0 // bytes per ms
    const slice = Math.max(65536, Math.round(rate * 5))
    for (let at = 0; at < body.length; at += slice) {
      const piece = body.subarray(at, at + slice)
      if (rate) {
        free = Math.max(performance.now(), free) + piece.length / rate
        const wait = free - performance.now()
        if (wait > 1) await sleep(wait)
      }
      if (!res.write(piece)) await new Promise(r => res.once('drain', r))
    }
    res.end()
  }
  /** the deployed site's answer to a request, as it gave it: its status, the headers a page reads, its bytes decoded */
  async function fromUpstream(req, res, t, path) {
    const r = await fetch(new URL(req.url, upstream), { headers: { 'accept-encoding': 'br' } })
    const body = Buffer.from(await r.arrayBuffer())
    if (link?.rtt) await sleep(link.rtt)
    res.statusCode = r.status
    for (const h of ['content-type', 'cache-control', 'content-security-policy', 'x-content-type-options', 'last-modified', 'etag']) { const v = r.headers.get(h); if (v) res.setHeader(h, v) }
    res.setHeader('content-length', body.length)
    log?.({ t, path, status: r.status, bytes: body.length, encoding: 'identity' })
    await send(res, body)
  }
  const handler = async (req, res) => {
    const t = Date.now()
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    res.setHeader('access-control-allow-origin', '*')
    try {
      if (upstream) return await fromUpstream(req, res, t, path)
      const at = locate(path)
      if (link?.rtt) await sleep(link.rtt)
      if (!at || (at.file && (!existsSync(at.file) || !statSync(at.file).isFile()))) {
        res.statusCode = 404
        log?.({ t, path, status: 404, bytes: 0 })
        return res.end()
      }
      res.setHeader('content-type', at.type ?? 'application/octet-stream')
      res.setHeader('cache-control', at.immutable ? 'public, max-age=31536000, immutable' : at.cache ? 'public, max-age=86400' : 'no-cache')
      const raw = at.body !== undefined ? Buffer.from(at.body) : readFileSync(at.file)
      const br = /\bbr\b/.test(req.headers['accept-encoding'] ?? '') ? await brotliOf(at) : null
      const body = br ?? raw
      if (br) res.setHeader('content-encoding', 'br')
      else res.setHeader('content-length', raw.length)
      log?.({ t, path, status: 200, bytes: body.length, encoding: br ? 'br' : 'identity' })
      await send(res, body)
    } catch (e) {
      res.statusCode = 500
      res.end(String(e?.stack ?? e))
    }
  }
  const server = tls ? createSecureServer({ ...certificate(), allowHTTP1: true, maxSessionMemory: 256 }, handler) : createServer(handler)
  await new Promise((r, reject) => { server.on('error', reject); server.listen(port, '127.0.0.1', r) })
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
  const tls = process.argv.includes('--tls')
  const server = await serveTexSite({ port: Number(arg('port', '8072')), tls, today: process.argv.includes('--today'), link: arg('mbit', '') ? { rtt: Number(arg('rtt', '0')), mbit: Number(arg('mbit', '0')) } : null, upstream: arg('upstream', null) })
  console.log(`The TeX page: ${tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}/tex.html`)
}
