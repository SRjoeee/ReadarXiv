// arXiv's full-text page, served from this machine: the audit (a11y.mjs) needs the page's own style sheet and nothing
// else of arxiv.org, and a suite that reaches the network is a suite a rate limit can fail (issue #100).
//
//   /html/<id>[vN]   the fixture tests/fixtures/arxiv/<id>.html, byte for byte as arXiv served it
//   /static/…/*.css  the vendored style sheets (tests/e2e/fixtures/arxiv-css/README.md): what lays the paper out and
//                    sets its colours — without them axe's contrast rules judge a page nobody reads
//   anything else    404: arXiv's scripts, fonts and figures are not served. The page's own scripts matter to nothing
//                    the audit looks at, and a figure's `alt` is an attribute, which axe reads without the image
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const FIXTURES = join(ROOT, 'tests/fixtures/arxiv')
const CSS_ROOT = join(ROOT, 'tests/e2e/fixtures/arxiv-css')
const PAPER_PATH = /^\/html\/(\d{4}\.\d{4,5})(?:v\d+)?$/

/**
 * Starts the server on a free port of 127.0.0.1. `served` records what the page took from it: `html` (papers), `css`
 * (the style sheets, by path), `missing` (404s by path — the fonts and scripts the page asks for)
 */
export async function serveOffline() {
  const served = { html: 0, css: new Set(), missing: new Set() }
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const paper = PAPER_PATH.exec(path)
    if (paper) {
      const file = join(FIXTURES, `${paper[1]}.html`)
      if (!existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end(`no fixture for ${paper[1]}: pnpm fixtures:fetch (tests/fixtures/README.md)`)
        return
      }
      served.html++
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(readFileSync(file))
      return
    }
    // The path inside the vendored tree and nowhere else: `normalize` resolves any `..` before the prefix is checked
    const css = path.startsWith('/static/') && path.endsWith('.css') ? normalize(join(CSS_ROOT, path)) : null
    if (css?.startsWith(CSS_ROOT + sep) && existsSync(css)) {
      served.css.add(path)
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' }).end(readFileSync(css))
      return
    }
    served.missing.add(path)
    res.writeHead(404).end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  return { origin, served, close: () => server.close() }
}
