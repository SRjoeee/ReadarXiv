// lab/pdf/prepare-back/served-page.mjs: the route a probe's page stands behind in Chromium (canvas.mjs, split-probe.mjs): the
// page itself at `/`, the two documents it opens at `/pdf/<name>`, and PDF.js's own files under `/pdfjs/` from pdfjs-dist's
// folder; anything else is not found. Not shipped.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** a Playwright route handler: `PAGE` the probe's page (HTML), `files` the documents by name, `PDFJS` pdfjs-dist's folder */
export const servedPage = (PAGE, files, PDFJS) => (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE })
  if (path.startsWith('/pdf/')) return route.fulfill({ contentType: 'application/pdf', body: Buffer.from(files.get(path.slice(5))) })
  const f = join(PDFJS, path.slice('/pdfjs/'.length))
  return existsSync(f) ? route.fulfill({ contentType: f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream', body: readFileSync(f) }) : route.fulfill({ status: 404 })
}
