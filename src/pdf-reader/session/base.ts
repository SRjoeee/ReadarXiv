// Whose PDF a layer is drawn over, as the extension's run reads it from a head (the layer route, design §3.2 and §3.5): one reading,
// the engine's `layerDraws` (BUNDLE 8) under its name, written here until the run takes the engine's export; the rule is the same.

/** whether a head's layer draws anything: only a layer over our own compile does (the head's `base.source` `ours`: the final pass
 *  of our marked compile, whose pages, boxes and lines the box proved arXiv's before it committed the head). The engine's reader
 *  draws nothing from a head whose base is arXiv's PDF — the check refused our compile as the base page (`base.why`), or the head
 *  names none (arXiv's with no why, every head of BUNDLE 7) —, so the run shows arXiv's PDF alone for it and translates nothing */
export const layerDraws = (base: unknown): boolean => base !== null && typeof base === 'object' && (base as { source?: unknown }).source === 'ours'
