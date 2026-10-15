// chain.mjs's types: a part's add-on chained after the parts before it, for the cutter's hooks (layer-proto/cut.mjs CutOptions)
import type { PagePlan } from './addon.mjs'
import type { RemovalManifest } from './addon-manifest.mjs'
import type { RemoverWhy } from './chain-wire.mjs'

/** the reason of a page whose plan alone passes what an ask holds */
export declare const PAST_ASK: string
/** the remover's answer as the service's transport gives it */
export type RemoverAnswer = { ok: true; tail: Uint8Array | null; entries: Uint8Array } | { ok: false; why: RemoverWhy }
/** the chain committed: the document's bytes so far, its last section's offset, the next free object number, the page tree's
 *  root, the removed pages' object numbers and the empty stream's, the removed pages so far (r), the boxes' share spent;
 *  and the remover's death (null while it lives) */
export interface AddonChainState { end: number; xref: number; next: number | null; root: number | null; kids: number[]; empty: number | null; r: number; boxes: { bytes: number; values: number }; dead: RemoverWhy | null }
/** the cutter's hooks of a chained add-on over the remover child */
export declare function chainedAddon(o: {
  N: number
  /** each page's view as the cutter writes the parts' (whole.left.pages) */
  views: readonly (readonly number[])[]
  /** arXiv's PDF's length and startxref (the head's base) */
  base: { bytes: number; xref: number }
  /** each page's plan (layout/addon.mjs pagePlanOf), a cheap lookup */
  planOf(page: number): PagePlan | null
  /** the version of the PDF.js that read the plans' facts */
  pdfjs: string
  /** the transport to the remover child: the ask's bytes, its answer */
  remove(ask: { from: number; to: number; plans: Uint8Array }): Promise<RemoverAnswer>
}): {
  chainAddon(index: number, o: { pages: [number, number] }): Promise<{ manifest: RemovalManifest; tail: Uint8Array | null } | null>
  /** commits the state of the range's last chainAddon call (none where that call threw or answered null) */
  acceptAddon(index: number, o: { pages: [number, number] }): void
  state(): AddonChainState
}
