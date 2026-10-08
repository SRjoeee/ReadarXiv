// Our "static site" for the reader's live mode, on this machine: the TeX page as tex-page/build.mjs builds it
// (out/tex-site: the page, BusyTeX with our patches, its preloads split by engine, the tree's index) and the TeX Live
// tree beside it, served by tex-page/serve.mjs. Build it first: `node tex-page/build.mjs` (README.md, Setup).
import { existsSync } from 'node:fs'
import { serveTexSite } from '../tex-page/serve.mjs'

/** → the server, listening on 127.0.0.1:`port` (0: any free port) */
export function serveSite(port = 0) {
  if (!existsSync(new URL('../out/tex-site/tree.json', import.meta.url))) throw new Error('no TeX page built: node tex-page/build.mjs (README.md, Setup)')
  return serveTexSite({ port })
}
