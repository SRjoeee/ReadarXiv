// The request a session sends (DESIGN §8.0): the text run's batches, the image run's labels and the tab title all
// go out in one envelope, built here. It used to be written out in each of the three, and the part that must not
// differ between them is the context — it enters the prompt **and the cache key** (§9), where absent and empty do not
// serialise alike: two of the three left an empty context out, the third sent it as it was.
import type { RenderPath } from '@/cache/key'
import type { TranslateCall } from '@/providers/translate-service'
import type { TranslateContext, TranslateSegment } from '@/providers/types'

/** What every request of one session shares */
export interface CallBase {
  /** The target the session runs on — the chain's, recorded at start */
  target: string
  paper: string
  /** The session id: the cancellation scope (§10). Absent only where nothing can be withdrawn (tests) */
  scope?: string
  /** Title, abstract and glossary: with every request (§8.2) */
  context?: TranslateContext
}

export interface CallExtra {
  /** The heading the segments sit under — for an image, its caption: part of the context, so part of the cache key */
  sectionTitle?: string
  /** Write only, no read: the resend after a failed placeholder validation must not get that bad translation back (§6.3) */
  bypassCache?: boolean
}

/**
 * `renderPath` is per call, not per session: a block whose tags did not survive is resent as runs (§6.3), and the
 * cache keeps the two apart
 */
export function translateCall(base: CallBase, segments: TranslateSegment[], renderPath: RenderPath, extra: CallExtra = {}): TranslateCall {
  const context: TranslateContext = { ...base.context, ...(extra.sectionTitle ? { sectionTitle: extra.sectionTitle } : {}) }
  return {
    // **An empty context is left out**, never sent as `{}`: to the cache key the two are different contexts
    request: { segments, source: 'en', target: base.target, context: Object.keys(context).length ? context : undefined },
    cache: { paper: base.paper, renderPath, ...(extra.bypassCache ? { bypass: true } : {}) },
    ...(base.scope ? { scope: base.scope } : {}),
  }
}
