// Start what the reader's live mode needs on this machine, then use the reader in Chrome with any arXiv paper:
//   node spikes/serve-live.mjs          (the TeX page on http://127.0.0.1:8071, where the reader looks for it)
// The TeX Live file server must be up too (docker: texlive-server on port 8070).
import { serveSite } from './live-site.mjs'
const PORT = Number(process.env.PORT ?? 8071)
await serveSite(PORT)
const tex = await fetch('http://localhost:8070/').then(r => r.status).catch(() => null)
console.log(`The reader's TeX page: http://127.0.0.1:${PORT}/tex.html`)
console.log(tex ? 'TeX Live file server: up (http://localhost:8070)' : 'TeX Live file server: NOT reachable at http://localhost:8070 — start it: docker start texlive-server')
console.log(`\nIn Chrome: load the extension's build unpacked (pnpm build at the repository root, then .output/chrome-mv3 in
chrome://extensions, developer mode), open an arXiv PDF and choose the bilingual version, or open the reader page
(chrome-extension://<id>/pdf-reader.html?live=1&paper=<an arXiv id>).\nCtrl-C to stop.`)
