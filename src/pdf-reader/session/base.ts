// Whose PDF a layer is drawn over, as the extension's run reads it from a head (the layer route, design §3.2 and §3.5): the engine's
// own `layerDraws`, so that the host and the engine cannot read it two ways.

/** whether a head's layer draws anything: only a layer over our own compile does (the head's `base.source` `ours`: the final pass
 *  of our marked compile, whose pages, boxes and lines the box proved arXiv's before it committed the head). The engine's reader
 *  draws nothing from a head whose base is arXiv's PDF — the check refused our compile as the base page (`base.why`), or the head
 *  names none (arXiv's with no why, every head of BUNDLE 7) —, so the run shows arXiv's PDF alone for it and translates nothing */
export { layerDraws } from '../engine/layer.mjs'
