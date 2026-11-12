// The translation run (DESIGN §4 data flow, §10 scheduling, §6.3 / §8.2 fallback chain). Pure logic on the content
// side, talking to the translation service through the transport. Session-style (after Read Frog's loading model):
// the start only marks the blocks and hands them to one-shot observers; a block entering the viewport (plus the
// preload distance) is batched and requested, with a pending node carrying a ring inserted first (§7.6). There is no
// “whole paper done” end: what is scrolled to is translated.
import { toBcp47 } from '@/config/languages'
import { type Block, type TextBlock, markBlocks } from '@/core/extractor'
import type { SentenceAlignment } from '@/core/protector/alignment'
import { isPermanentErrorKind, type TranslateContext } from '@/providers/types'
import { PlaceholderIntegrityError, rehydrate, staleSlot, type WireFormat, type WireSpan } from '@/core/protector'
import { alignmentOf, wholeAlignment, wireOfContent } from '@/core/protector/units'
import {
  clearAllPending, enable, markPartial, markStructure, registerSentences, renderFailed, renderPending, renderTable, renderText, setState, stateOf, type Look, type Mode,
} from '@/core/renderer'
import { type CallBase, translateCall } from '@/core/run/call'
import { createRunLedger } from '@/core/run/ledger'
import type { PreloadOptions } from '@/core/scheduler/lazy'
import { failureReason } from '@/shared/diagnostics'
import type { ErrorInfo, TranslateCall, TranslateResponse } from '@/providers/transport'
import { planBatches, sectionTitles, type Batch, type Segment } from './batches'
import { unitOfSegment } from './units'

export interface Progress {
  /** on: the session is open and scrolling keeps triggering; stopped: the reader restored the original, or a fatal error stopped it */
  state: 'idle' | 'on' | 'stopped'
  total: number
  /** Blocks that entered the viewport and were requested */
  requested: number
  done: number
  failed: number
  cached: number
  /** Blocks in flight */
  inFlight: number
  /** An error like no-key / auth that would only fail again; once set, no new batch goes out */
  fatal?: string
}

export type Transport = (request: TranslateCall) => Promise<TranslateResponse>

export interface RunOptions {
  doc: Document
  blocks: Block[]
  target: string
  mode: Mode
  /** The reader's active appearance (§7.5); without it the page keeps whatever attributes it has */
  appearance?: Look
  paper: string
  capabilities: { maxBatchChars: number; maxBatchItems: number; renderPath: WireFormat }
  transport: Transport
  onProgress?: (progress: Progress) => void
  /**
   * These blocks just touched the DOM (a ring / a translation / a failure widget inserted), twice per batch and in
   * step with onProgress (issue #46). A callback of its own rather than a field of Progress: Progress goes to the
   * popup and must be serialisable, and a Block carries DOM nodes
   */
  onRendered?: (blocks: Block[]) => void
  /**
   * The service that actually served a batch, reported when it changes (the first batch, then
   * every hand-over down the chain). The caller decides what a hand-over means for the page
   */
  onProvider?: (id: string) => void
  /** The paper-level context (title, abstract, glossary), carried by every batch; the section heading is filled in by the batch itself */
  context?: TranslateContext
  /** The cancellation scope = the session id: carried by every call, and on stop the caller withdraws the queued and in-flight requests (§10) */
  scope?: string
  /**
   * Where a record of the run goes: the session's trace, which reaches the diagnostics log (issue #237). The halving of
   * a batch is the one thing recorded here (`shared/diagnostics.ts` `splitLine`)
   */
  trace?: (line: string) => void
  /** The viewport trigger distance and threshold (§10) */
  preload: PreloadOptions
  /**
   * May this block be asked for now. A block refused waits, unasked, and is offered again on `resume()` — the image
   * run's gate (§15), for the blocks that are a figure's text (§15.6). Absent, every block may
   */
  admit?: (block: Block) => boolean
}

export interface TranslationRun {
  /** Queue these blocks for translation: observer entry, retries and tests all come through here; blocks in flight are skipped */
  translate(blocks: Block[]): Promise<void>
  /** End the session: disconnect the observers, remove the pending nodes; nothing is rendered or reported after */
  stop(): void
  progress(): Progress
  /** The gate may have opened: the blocks it refused are offered again */
  resume(): void
  /** The blocks whose translation failed (document order); the popup's “retry failed” hands them to translate again */
  failed(): Block[]
  /** Every block still waiting for the viewport is queued now (the whole-paper range chosen mid-session, §10); returns how many */
  release(): number
}

/**
 * A segment's result: the translation, or the reason it failed (for the failure widget, §7.6).
 *
 * `alignment` is present only when the engine reported sentence boundaries and both sides could be rebuilt
 * (`alignment.ts`), to register the hover highlight. `fragment.offsets` likewise exists on the `rehydrate` path only:
 * a fragment the runs fallback assembled has no wire offsets, such a block cannot be registered, and hovering does
 * nothing — better than a highlight on the wrong sentence (issue #105).
 */
type SegmentResult = { fragment: DocumentFragment & { offsets?: WireSpan[] }; alignment?: SentenceAlignment } | { error: string }
type BatchResult = Map<Segment, SegmentResult>
/**
 * A failure reason is always written as `kind: diagnostic`, the shape of a provider error (`parseFatal` reads it):
 * the reader sees the sentence in the interface's language, and the half after `kind` is for diagnosis and never
 * reaches the interface (Codex on #161)
 */
const MISMATCH: SegmentResult = { error: 'invalid-response: the translation placeholders do not match the source' }
/**
 * The page changed under the block while its translation was out (a slot node replaced or moved). Not
 * the translation's fault, so no resend; `parseFatal` reads an unfamiliar prefix as `unknown`, and the widget's Retry
 * serialises the block afresh, which is the cure
 */
const stale = (e: PlaceholderIntegrityError): SegmentResult => ({ error: `stale: ${e.detail}` })
/**
 * A failure the service reported, as the page holds it (`data-axt-reason`, which the page's own scripts can read): the
 * kind, the HTTP status and the length of the message — the log's rule (`failureReason`, DESIGN §7.6). The reasons
 * above are this file's own words and stay as written
 */
const errorOf = (error: ErrorInfo): SegmentResult => ({ error: failureReason(error.kind, error.message, error.status) })

export function startTranslation(options: RunOptions): TranslationRun {
  const { doc, blocks, transport } = options
  // The bookkeeping shared with the image run (DESIGN §4.4): outcomes, the permanent-error record, stop, the scheduler
  const ledger = createRunLedger(blocks, {
    preload: options.preload,
    onEnter: entered => { void translate(entered) },
    onStop: () => clearAllPending(doc),
  })
  let cached = 0

  const progress = (): Progress => {
    const counts = ledger.progress()
    return { state: ledger.halted() ? 'stopped' : 'on', ...counts, cached, inFlight: counts.requested - counts.done - counts.failed }
  }
  const report = () => {
    if (!ledger.stopped()) options.onProgress?.(progress())
  }
  // No separate stopped guard: on the first call nothing yields the main thread between translate()'s halted() check
  // and this batch, and on the second the `if (stopped) return` above is the guard — a second check here would be dead code no test could reach
  const rendered = (blocks: Block[]) => options.onRendered?.(blocks)
  const halted = () => ledger.halted()
  let lastProvider: string | undefined
  const served = (id: string) => {
    if (id === lastProvider) return
    lastProvider = id
    options.onProvider?.(id)
  }

  // The block marks first, at once and unsliced (issue #67): both gates of side prep read data-axt-id — a container
  // “with unmarked blocks still inside” would be taken for static content and **cloned whole** into the right column,
  // and once the blocks inside were translated the right column would hold a whole extra passage of English.
  // Measured (three prep passes while marking was sliced): 36 places on 2312.17141, 87 on 2609.00245, all large blocks
  // like .ltx_para / .ltx_proof / .ltx_theorem. They are attribute writes no style of the page reads: 979 blocks
  // written in 1.2 ms, and the scheduler's anchors below resolve through them
  markBlocks(blocks)
  // Where the blocks are is asked **before anything that changes the layout is written** (DESIGN §10): `enable`
  // below restyles the whole paper, and the same question after it made the browser recalculate and lay out every
  // element in the middle of this script — with the first screen's requests waiting behind it, 230 ms on a paper of
  // 32 000 elements. The first screen is the one the reader was looking at when they asked
  ledger.measure()

  // The translation's language goes on <html>, and renderText writes it onto each translation node: the page's lang
  // names the original (en on arXiv), and unmarked, a screen reader would read Chinese in an English voice
  enable(doc, options.mode, options.appearance, toBcp47(options.target))
  const sectionOf = sectionTitles(blocks)
  // The structural marks the side-mode style sheet reads (multi-panel figures, tagged list items) go with them (DESIGN §7.2)
  markStructure(doc)
  // The states too, in the same go: a thousand attribute writes cost a millisecond or two. They used to be written in
  // slices with the scheduler started after the last, which is what put its geometry read behind `enable`. Nothing
  // yields between here and the scheduler's start at the end of this function, so a restore cannot come in between.
  // **Only a block no round has marked**: on a restart (another service, language or prompt, DESIGN §8.5) a block still
  // showing the round before's translation, or its failure, keeps the state that says so until it is asked again —
  // `renderPending` sets it then, as it takes the old node away. Written over, a translated original lost the mark
  // translation-only mode hides it by (modes.css), and every block the reader had not reached yet showed its original
  // beside the old translation
  for (const block of blocks) if (stateOf(block) === null) setState(block, 'pending')

  // The envelope is the session's, the same for the image labels and the title (run/call.ts)
  const base: CallBase = { target: options.target, ...(options.scope ? { scope: options.scope } : {}), ...(options.context ? { context: options.context } : {}) }
  const format = options.capabilities.renderPath

  // A wrong configuration would only fail again: recorded, the observers disconnected, no new batch queued; the batches in flight finish as usual
  const noteFatal = (error: ErrorInfo) => {
    if (isPermanentErrorKind(error.kind)) ledger.fatal(error.kind, error.message)
  }

  /**
   * The segments as units of the chain (protector/units.ts), their results filled back. The chain does what this side
   * did before (DESIGN §8.2, stage 4b): a unit a translator refused is asked again or goes to the next translator, and
   * past the last one is cut into its runs of text, a failure of the service is retried, cooled or handed over, a request
   * one unit sinks is halved. What comes back is one result per unit: a translation every placeholder of which is there,
   * or why there is none. `rehydrate` is the one gate on this side still: a block the page changed under (`stale`) is a
   * result, never resent
   */
  async function translateSegments(segments: Segment[], sectionTitle: string | undefined, out: BatchResult): Promise<void> {
    if (halted()) return
    const units = segments.map(s => unitOfSegment(s, format))
    const res = await transport(translateCall(base, units.map(u => u.unit), { ...(sectionTitle ? { sectionTitle } : {}) }))
    if (ledger.stopped()) return
    if (!res.ok) {
      noteFatal(res.error)
      for (const segment of segments) out.set(segment, errorOf(res.error))
      return
    }
    cached += res.cached
    const first = res.results.find(r => r.ok && r.engine)
    if (first?.ok && first.engine) served(first.engine)
    const byId = new Map(res.results.map(r => [r.id, r]))
    for (const [i, segment] of segments.entries()) {
      const r = byId.get(segment.id)
      const from = units[i] as (typeof units)[number]
      if (!r) {
        out.set(segment, { error: 'unknown: no result for this segment' })
        continue
      }
      if (!r.ok) {
        noteFatal(r.error)
        out.set(segment, errorOf(r.error))
        continue
      }
      const back = wireOfContent(r.content, from)
      const alignment = from.whole ? wholeAlignment(segment.text, back.wire) : alignmentOf(r.sentences, from, segment.text, back)
      try {
        out.set(segment, { fragment: rehydrate(back.wire, segment.protected, doc, alignment), ...(alignment ? { alignment } : {}) })
      } catch (e) {
        if (!(e instanceof PlaceholderIntegrityError)) throw e
        out.set(segment, e.reason === 'stale' ? stale(e) : MISMATCH)
      }
    }
  }

  // No layout is read when translations are inserted: the browser's native scroll anchoring keeps the viewport from jumping (§10)
  async function processBatch(batch: Batch): Promise<void> {
    const targets = batch.kind === 'table' && batch.block ? [batch.block] : batch.segments.map(s => s.block)
    // The pending nodes go in before the request goes out (§7.6)
    ledger.request(targets)
    for (const block of targets) renderPending(block)
    rendered(targets)
    report()
    const out: BatchResult = new Map()
    await translateSegments(batch.segments, batch.sectionTitle, out)
    if (ledger.stopped()) return // stop() has cleared the pending nodes already and reports no more
    // A fragment was built when its translation came back, and the batch may have waited on another segment's retry
    // since: the page could have changed under a block whose clone is already in hand (Devin on #212). Asked once
    // more here, in the same turn as the insertion below, so nothing can move in between
    for (const [segment, result] of out) {
      if (!('fragment' in result)) continue
      const changed = staleSlot(segment.protected)
      if (changed) out.set(segment, { error: `stale: ${changed}` })
    }
    if (batch.kind === 'table' && batch.block) {
      const cells = new Map<Element, DocumentFragment>()
      // A cell's source-side offsets and alignment can only be registered once renderTable has built the clone cell (§7.7)
      const pairs = new Map<Element, { spans: readonly WireSpan[]; offsets?: WireSpan[]; alignment?: SentenceAlignment }>()
      let reason = 'unknown: no result for the whole batch'
      for (const [segment, result] of out) {
        if ('fragment' in result) {
          if (!segment.cell) continue
          cells.set(segment.cell.el, result.fragment)
          pairs.set(segment.cell.el, { spans: segment.protected.offsets, offsets: result.fragment.offsets, alignment: result.alignment })
        } else reason = result.error
      }
      const renderedCells = new Map<Element, Element>()
      const registerCells = () => {
        for (const [cell, node] of renderedCells) {
          const p = pairs.get(cell)
          if (p) registerSentences(cell, node, p.spans, p.offsets, p.alignment)
        }
      }
      // One cell untranslated counts as a failure (Codex on #9); the half clone shows as usual, and the original table stays translated with a partial mark on top (Codex on #30)
      if (cells.size === batch.segments.length) {
        renderTable(batch.block, cells, renderedCells)
        registerCells()
        ledger.settle(batch.block, 'done')
      } else {
        if (cells.size > 0) {
          renderTable(batch.block, cells, renderedCells)
          registerCells()
          markPartial(batch.block)
        } else {
          renderFailed(batch.block, reason, () => { void translate([batch.block!]) })
        }
        ledger.settle(batch.block, 'failed', reason)
      }
    } else {
      for (const segment of batch.segments) {
        const result = out.get(segment)
        if (result && 'fragment' in result) {
          const spans = result.fragment.offsets
          const node = renderText(segment.block as TextBlock, result.fragment)
          registerSentences(segment.block.el, node, segment.protected.offsets, spans, result.alignment)
          ledger.settle(segment.block, 'done')
        } else {
          // The pending node and the previous round's translation are removed (after an engine / target-language change a
          // failed retranslation must not leave the old translation hanging; Codex on #9), and the failure widget goes in:
          // the reason + retry (§7.6)
          const reason = result?.error ?? 'unknown: no result for this segment'
          renderFailed(segment.block, reason, () => { void translate([segment.block]) })
          ledger.settle(segment.block, 'failed', reason)
        }
      }
    }
    rendered(targets)
    report()
  }

  /** What the gate refused: not asked for, and offered again when the gate may have opened */
  const held = new Set<Block>()
  async function translate(picked: Block[]): Promise<void> {
    const intake = ledger.intake(picked, options.admit)
    for (const block of intake.held) held.add(block)
    const { taken } = intake
    for (const block of taken) held.delete(block)
    if (taken.length === 0) return
    const batches = planBatches(taken, { maxBatchChars: options.capabilities.maxBatchChars, maxBatchItems: options.capabilities.maxBatchItems, renderPath: options.capabilities.renderPath }, block => sectionOf.get(block))
    // The batch goes straight to the service: the number in flight is held by the ported request-queue's rate limit (§8.2); no worker pool here any more
    await Promise.all(batches.map(processBatch))
  }

  // Last, with everything it calls defined: the first screen enters here, so its skeletons and its requests go out in
  // the task that enabled the page — one style recalculation and one layout show both, and the service is already
  // working while the browser does them
  ledger.observe()

  const resume = (): void => {
    if (held.size > 0) void translate([...held])
  }

  return { translate, stop: () => ledger.stop(), progress, failed: () => ledger.failed(), release: () => ledger.release(), resume }
}
