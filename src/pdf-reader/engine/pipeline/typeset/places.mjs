// A compile's unit marks and its pages' columns, read from its PDF (marksOf): what the marked original's readings carry
// (live.mjs readingsOf) and the layout marks gate compares (lab/pdf/spikes/layout-marks-gate.mjs). The typesetting measures
// that read two compiles' marks against each other (alignment, drifts) were the compiled translation's, and went with it
// (2026-11-04, the rules audit's F4).
/**
 * Every unit's start and end mark — the axt-<n>s / axt-<n>e destinations MARK_DEF writes (page 0-based, PDF points) —
 * from a PDF.js document, the reader's or pdfjs-dist's; the page's width and height; and each page's columns, 1 or 2,
 * as MARK_DEF's axt-c<n>-<k> on the page says its compile set it, 0 where the page has none (a compile without
 * LaTeX's shipout hooks: counted as one column).
 * Read from TeX, not judged from the marks: a page's starts in its right half are no measure of its columns — a run-in
 * label or a centred caption puts a start there on a one-column page (Chinese 2608.02991, three of six starts on nine
 * pages), and a right column of one paragraph or one float puts none there (2608.06233's fifth page)
 */
export async function marksOf(pdf) {
  const dests = await pdf.getDestinations()
  const marks = new Map(), columns = new Array(pdf.numPages).fill(0)
  for (const [name, d] of dests instanceof Map ? dests : Object.entries(dests)) {
    if (!d) continue
    if (/^axt-\d+[se]$/.test(name)) marks.set(name.slice(4), { page: await pdf.getPageIndex(d[0]), x: d[2], y: d[3] })
    else { const c = /^axt-c([12])-\d+$/.exec(name); if (c) columns[await pdf.getPageIndex(d[0])] = Number(c[1]) }
  }
  const [x0, y0, x1, y1] = (await pdf.getPage(1)).view
  return { pages: pdf.numPages, width: x1 - x0, height: y1 - y0, columns, marks }
}
