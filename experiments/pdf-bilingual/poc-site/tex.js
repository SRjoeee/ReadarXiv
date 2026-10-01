// Our static site's TeX page, framed by the reader (an extension page): BusyTeX in this origin, with its own caches.
// The protocol is tex-page.mjs's; this wires it to the frame's messages, from extension pages only. tex-page/build.mjs
// puts it in the site with build.json (the versions, the addresses, the manifest) and texlyre-busytex's runner (lib/).
import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex } from './lib/index.js'
import build from './build.json' with { type: 'json' }
import { texPage } from './tex-page.mjs'

const page = texPage({ build, Runner: BusyTexRunner, Engines: { PdfLatex, XeLatex, LuaLatex }, fetch: (url, init) => fetch(url, init), caches })
addEventListener('message', e => {
  if (!e.origin.startsWith('chrome-extension://')) return
  page.receive(e.data, (data, transfer = []) => e.source.postMessage(data, e.origin, transfer))
})
parent.postMessage(page.ready, '*')
