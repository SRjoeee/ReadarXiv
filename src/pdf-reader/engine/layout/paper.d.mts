// paper.mjs's types: a paper's layout marks in one call, for the server's prepare child, the extension's reader and the layer gate's maker
import type { Compiled, CompileRequest, Paper } from '../pipeline/live.mjs'

/**
 * a paper's layout marks: the mark probe compiled (probeFiles(paper, { marks: true }), one pass) and its answers read
 * (readMarkProbe, readInkProbe, readInkTexts), then the layout-marked original compiled (originalFiles(paper, { lines:
 * true, layout: LAYOUT_CLASSES, switches, inkless })) and its marks read (layoutMarksOf over a document of its PDF and
 * its last pass's log, with the units and OPS), encoded (encodeLayoutMarks). `ms` times each stage. A stage that fails
 * gives { refused } naming it, with the times of the stages that ran: the probe where its compile gave no log, the
 * compile where the original's gave no PDF, the marks where `open` or the reading failed. `open` is called once, on the
 * original's PDF, and its `close` is called whatever the reading did. The compile and the PDF opening are the caller's
 * (a native TeX Live and PDF.js in Node, the TeX page and a worker in a browser): this module imports neither. Never throws
 */
export declare function layoutMarksOfPaper(paper: Paper, o: {
  compile(req: CompileRequest): Promise<Compiled>
  open(pdf: Uint8Array): Promise<{ doc: unknown; close(): Promise<void> }>
  OPS: Record<string, number>
}): Promise<{ marks: Uint8Array; ms: { probe: number; compile: number; marks: number } } | { refused: 'probe' | 'compile' | 'marks'; ms: Record<string, number> }>
