// The engine's versions a reader checks what it is given against, kept apart from the paper's pipeline (live.mjs, which
// re-exports PIPELINE_VERSION) so that a reader loads no part of it: the layer bundle (layer-proto/bundle.mjs) names them in its
// versions and its key. The layout file's (layout/file.mjs LAYOUT) stays beside its parser, which the readers load already.
// What each covers and when it is raised is docs/PDF-READER.md §18.2 and §18.3; what each version moved, one line a version,
// §18.10 (the notes kept here until 2026-11-04 are in the file's history). Imports nothing.

/** PIPELINE_VERSION, the extraction's: what a unit is (its cutting, kinds and texts), the cells' places, the left side's marks;
 *  raised with TRANSLATE_VERSION while a stored translation is judged by it (§18.2). In a bundle's key and the rows' identity */
export const PIPELINE_VERSION = '75'
/** the PDF.js the engine reads arXiv's PDF with, and the readers draw it with: the repository's pinned pdfjs-dist (a
 *  test holds the two equal). A layer bundle's geometry is measured with it, so its key names it */
export const PDFJS = '6.3.289'
/** REMOVAL, how our page's ink a drawn unit replaces is taken away (the head's `versions.removal`, in the key: VTAG): since 8 our
 *  page's own streams wrapped by optional content, each unit's ink in groups of its own (layout/wrap.mjs, own.mjs) */
export const REMOVAL = '26'
