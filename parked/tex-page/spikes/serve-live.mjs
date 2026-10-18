// Start what the reader's live mode needs on this machine, then use the reader in Chrome with any arXiv paper:
//   node spikes/serve-live.mjs          (the TeX page and its tree on http://127.0.0.1:8071, where the reader looks)
// The page is the one tex-page/build.mjs built (out/tex-site); it reaches the TeX Live tree through this server, so
// texlive-server is no longer needed.
import { serveSite } from './live-site.mjs'
const PORT = Number(process.env.PORT ?? 8071)
await serveSite(PORT)
console.log(`The reader's TeX page: http://127.0.0.1:${PORT}/tex.html`)
console.log(`\nIn Chrome: load the extension's build unpacked (pnpm build at the repository root, then .output/chrome-mv3 in
chrome://extensions, developer mode), open an arXiv PDF and choose the bilingual version, or open the reader page
(chrome-extension://<id>/pdf-reader.html?live=1&paper=<an arXiv id>).\nCtrl-C to stop.`)
