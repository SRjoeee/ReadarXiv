// Where the live reader fetches the paper and sends its typesetting (the reader's design, §2). Its own addresses unless
// told otherwise by its URL — and the only other addresses it takes are a server on this machine (the probes run
// theirs) and, for the paper itself, arXiv. The reader is a page arXiv's pages may frame, so its URL is not the
// reader's to trust: a page that frames it must not point its requests, or the paper's project, anywhere else (Devin
// on #301).

/**
 * The TeX page the reader typesets with (the S3a report's protocol 2), a build setting: our site's in a production build —
 * `pnpm build`, the one a reader or the maintainer's test gets —, and in development (`pnpm dev`, `wxt build --mode
 * development`, the unit tests) the one spikes/serve-live.mjs runs on this machine. Chosen by nothing a paper, a service
 * or a page that frames the reader says (the F2 review's I1: the test build met the protocol-1 page at 8071)
 */
export const TEX_PAGE = import.meta.env?.PROD ? 'https://tex.readarxiv.org' : 'http://127.0.0.1:8071'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const parse = value => { try { return value ? new URL(value) : null } catch { return null } }
const local = u => (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname) && !u.username && !u.password

/** { site, endpoint, src, pdf }: the TeX page's origin, its file server's origin (a protocol-1 page's alone), the paper's
 *  source and its PDF; `texPage` the build's (TEX_PAGE) */
export function readerAddresses(params, paper, texPage = TEX_PAGE) {
  const origin = (name, fallback) => { const u = parse(params.get(name)); return u && local(u) ? u.origin : fallback }
  const address = (name, fallback) => { const u = parse(params.get(name)); return u && (local(u) || (u.origin === 'https://arxiv.org' && !u.username && !u.password)) ? u.href : fallback }
  return {
    // our TeX page; in development, and the TeX Live file server a protocol-1 page reads, as spikes/serve-live.mjs starts
    // them on this machine
    site: origin('site', texPage),
    endpoint: origin('endpoint', 'http://localhost:8070'),
    src: address('src', `https://arxiv.org/src/${paper}`),
    pdf: address('pdf', `https://arxiv.org/pdf/${paper}`),
  }
}
