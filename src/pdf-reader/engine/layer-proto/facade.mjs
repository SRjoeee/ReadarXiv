// src/pdf-reader/engine/layer-proto/facade.mjs
// The layout file a door holds while its parts come (the door design §0.5 and §1): every part's layout merged as the whole's is
// (layout/file.mjs mergeLayout: fonts by first appearance, rows by unit id, names by occurrence) and indexed (indexLayout),
// made again at each part that brings one, behind one object that never changes, so that what holds it (the run's hybrid, the
// text removal's protection) reads the parts told so far. A font's index may change from one making to the next (a later part
// may hold a smaller unit id), and the drawing reads none: no row's font, no name's, no index.font.

import { indexLayout, LAYOUT_SCHEMA, mergeLayout } from '../layout/file.mjs'

/**
 * The layout of a paper's parts as one layout file, the head's (`head`: readHead's: the paper, its versions, its base and its
 * lineskip). `index`: indexLayout's shape ({ file, unit, onPage, names, view, font }), the same object for the door's life,
 * answering from the parts added so far (before any: a file of no unit, the head's lineskip). `add(part)`: a part read by
 * readPart, in the chain's order; its views kept, its layout merged where it has one (a part with `layout: null`, or a refusal's
 * record, adds no unit).
 * The layer draws a unit only from the layout file, and a file's coordinates are the base page's: a head whose base is arXiv's
 * (`base.source` 'arxiv': a paper whose own compile was no base page, or a bundle of 7, drawn over arXiv's PDF) adds no layout
 * of its parts, so that its layer draws nothing and the host shows arXiv's PDF untranslated.
 */
/**
 * Whether the layer is drawn over this base (a head's `base`, or a whole bundle's): over ours only, the final pass of our compile,
 * for the layout file's coordinates are that page's. The one question the door's and the whole's opens both ask (a head always
 * says whose page; readHead's reading of a head of 7 says arXiv's), so that they answer alike for a paper.
 */
export const drawsFrom = base => base?.source === 'ours'

export function layoutFacade(head) {
  const { id, version, pages } = head.paper
  const ours = drawsFrom(head.base)
  const layouts = [], views = []
  const fileOf = () => ({
    schema: LAYOUT_SCHEMA, layout: head.versions.layout, pdfjs: head.versions.pdfjs, paper: { id, version, pages }, left: '',
    views: views.slice(), ...mergeLayout(layouts), lineskip: head.lineskip,
  })
  let now = indexLayout(fileOf())
  const index = Object.freeze({
    get file() { return now.file },
    unit: unit => now.unit(unit),
    onPage: page => now.onPage(page),
    names: page => now.names(page),
    view: page => now.view(page),
    font: at => now.font(at),
  })
  return {
    index,
    add(part) {
      const [a] = part.pages
      for (let q = a; q <= part.reach; q++) if (views.length < 4 * q) views.push(...part.views.slice(4 * (q - a), 4 * (q - a + 1)))
      if (part.layout === null || !ours) return
      layouts.push(part.layout)
      now = indexLayout(fileOf())
    },
  }
}
