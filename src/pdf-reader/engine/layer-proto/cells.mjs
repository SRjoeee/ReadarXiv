// A table cell's facts the layer reads of its source unit (no import: run.mjs, which the reader's page and the layer gate's
// load in a browser, imports it, as does rows.mjs).

/** whether a table cell's box is other cells' too: it spans columns (its `cell.span`) or rows (a \multirow, or a
 *  \multicolumn its span does not tell, among its source pieces) */
export const cellSpans = u => (u?.cell?.span ?? 1) > 1 || (Array.isArray(u?.pieces) ? u.pieces : []).some(p => /\\multi(?:row|column)(?![A-Za-z])/.test(typeof p?.src === 'string' ? p.src : ''))
