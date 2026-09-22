// Our "static site" for the reader's live mode, on this machine: the TeX page (poc-site/tex.html), BusyTeX with the
// research patches, and the pregenerated fonts. The TeX Live file tree is the separate package server
// (texlive-server, http://localhost:8070).
import { createServer } from 'node:http'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
const root = new URL('..', import.meta.url).pathname
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }
const EXTRA = join(root, 'data/pk-flat')

/** → the server, listening on 127.0.0.1:`port` (0: any free port) */
export function serveSite(port = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(req.url.split('?')[0])
      res.setHeader('Access-Control-Allow-Origin', '*')
      // long-lived like a static site's assets, so that a returning visit is served from the browser's cache
      res.setHeader('Cache-Control', 'public, max-age=86400')
      // the pregenerated METAFONT fonts are optional (README.md, setup): without them, no extra files
      if (path === '/extra/list.json') return res.end(JSON.stringify(existsSync(EXTRA) ? readdirSync(EXTRA) : []))
      const file = path.startsWith('/lib/') ? join(root, 'node_modules/texlyre-busytex/dist', path.slice(5)) : path.startsWith('/busytex/') ? join(root, 'data/busytex-patched', path.slice(1)) : path.startsWith('/extra/') ? join(EXTRA, path.slice(7)) : join(root, 'poc-site', path.slice(1))
      try { res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file)) } catch { res.statusCode = 404; res.end() }
    })
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
