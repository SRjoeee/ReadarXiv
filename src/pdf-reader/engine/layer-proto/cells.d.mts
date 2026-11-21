/** whether a table cell's box is other cells' too: it spans columns or rows (\multirow, \multicolumn among its pieces) */
export declare function cellSpans(u: { cell?: { span?: number } | null; pieces?: readonly { t?: string; s?: string; src?: unknown }[] } | null | undefined): boolean
