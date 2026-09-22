// Draw the located blocks over the rendered page in a real Chromium, to see whether the boxes are clean.
//   node spikes/draw.mjs <paper.pdf> <rects.json> <page> <out.png>
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../', import.meta.url))
const { chromium } = require('playwright')
const [pdfPath, rectsPath, pageNo, outPath] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const server = createServer((req, res) => {
  const path = req.url.split('?')[0]
  if (path === '/') { res.setHeader('content-type', 'text/html'); return res.end(`<canvas id=c></canvas><script type=module>
    import * as pdfjs from '/node_modules/pdfjs-dist/build/pdf.min.mjs'
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
    const pdf = await pdfjs.getDocument({ url: '/pdf' }).promise
    const page = await pdf.getPage(${Number(pageNo)})
    const vp = page.getViewport({ scale: 2 })
    const c = document.getElementById('c'); c.width = vp.width; c.height = vp.height
    const ctx = c.getContext('2d')
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const rects = await (await fetch('/rects')).json()
    const colour = { para: 'rgba(0,120,255,.18)', caption: 'rgba(0,170,80,.25)', title: 'rgba(255,120,0,.3)', bib: 'rgba(150,0,200,.15)', cell: 'rgba(200,0,0,.2)' }
    for (const r of rects) for (const b of r.boxes) if (b.page === ${Number(pageNo)}) {
      const [ta, tb, tc, td, te, tf] = vp.transform; const pt = (x, y) => [ta * x + tc * y + te, tb * x + td * y + tf]
      const [x0, y0] = pt(b.x0, b.y0), [x1, y1] = pt(b.x1, b.y1)
      ctx.fillStyle = colour[r.kind]; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
    }
    document.title = 'done'
  </script>`) }
  try {
    const file = path === '/pdf' ? pdfPath : path === '/rects' ? rectsPath : root + path.slice(1)
    res.setHeader('content-type', path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'); res.end(readFileSync(file))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1300, height: 1700 } })
page.on('console', m => console.log('[console]', m.text())); page.on('pageerror', e => console.log('[pageerror]', e.message))
await page.goto(`http://localhost:${server.address().port}/`)
await page.waitForFunction(() => document.title === 'done', null, { timeout: 25000 })
await page.locator('#c').screenshot({ path: outPath })
await browser.close(); server.close()
