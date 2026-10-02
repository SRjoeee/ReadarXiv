// Our static site's TeX page, framed by the reader (an extension page): BusyTeX in this origin, with its own caches.
// The protocol is tex-page.mjs's; this wires it to the messages of the window that frames it, when its origin may drive
// the page (tex-page.mjs mayDrive, build.json's framers). tex-page/build.mjs puts it in the site with build.json (the
// versions, the addresses, the manifest, the framers) and texlyre-busytex's runner (lib/).
import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex } from './lib/index.js'
import build from './build.json' with { type: 'json' }
import { mayDrive, texPage } from './tex-page.mjs'

const page = texPage({ build, Runner: BusyTexRunner, Engines: { PdfLatex, XeLatex, LuaLatex }, fetch: (url, init) => fetch(url, init), caches })
addEventListener('message', e => {
  if (e.source !== parent || !mayDrive(build.framers, e.origin)) return
  page.receive(e.data, (data, transfer = []) => e.source.postMessage(data, e.origin, transfer))
})
parent.postMessage(page.ready, '*')
