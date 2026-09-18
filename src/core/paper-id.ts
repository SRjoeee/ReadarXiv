// An arXiv paper id as it appears in a URL path. One place, because three pages carry the same shapes: the HTML
// full text, the abstract page and the PDF (§4.0b).

/** New style since 2007, five digits since 2015 (`1501.00001`), optionally versioned */
const NEW_STYLE = /^\d{4}\.\d{4,5}(v\d+)?$/
/** Old style, with its optional subject class: `hep-th/9711200`, `math.GT/0309136` */
const OLD_STYLE = /^[a-z-]+(\.[A-Z]{2})?\/\d{7}(v\d+)?$/

/**
 * The id under `/<section>/…`, or null when the path is not a paper's.
 *
 * The version the reader opened is kept: what is offered on a PDF or an abstract page must be the version in front
 * of them, not the latest.
 */
export function paperIdFrom(pathname: string, section: 'pdf' | 'abs' | 'html'): string | null {
  const prefix = `/${section}/`
  if (!pathname.startsWith(prefix)) return null
  const path = pathname.slice(prefix.length).replace(/\.pdf$/, '').replace(/\/$/, '')
  return NEW_STYLE.test(path) || OLD_STYLE.test(path) ? path : null
}
