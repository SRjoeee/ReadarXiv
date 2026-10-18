// Where the reader fetches the paper and its layer (Stage 5 Task 17): arXiv's PDF, and our server, the build's. Its own
// addresses unless told otherwise by its URL — and the only others it takes are a server on this machine (the probes run
// theirs; a development build's seam alone, never a release's) and, for the paper itself, arXiv. The reader is a page arXiv's pages may frame, so its URL is not the reader's to
// trust: a page that frames it must not point its requests anywhere else (PDF-READER §11.1).

declare const __AXT_READER_API__: string | undefined
declare const __AXT_LOOPBACK__: boolean | undefined
/** whether the reader's URL may point it at a server on this machine: a development build's (wxt.config.ts), and the unit
 *  tests'; never a release's, whose reader any arXiv page may frame */
export const LOOPBACK_ALLOWED: boolean = typeof __AXT_LOOPBACK__ === 'boolean' ? __AXT_LOOPBACK__ : true
/**
 * Our server, whose layer API the reader reads a paper's layer from (session/server.ts): a build setting, chosen by nothing a
 * paper, a service or a page that frames the reader says. `https://readarxiv.com` in a production build; a test build names
 * staging's (`pnpm build:staging`, wxt.config.ts READER_API), and so does a
 * development build by default. The unit tests' is production's
 */
export const READER_API: string = typeof __AXT_READER_API__ === 'string' && __AXT_READER_API__ ? __AXT_READER_API__ : 'https://readarxiv.com'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const parse = (value: string | null) => { try { return value ? new URL(value) : null } catch { return null } }
const local = (u: URL) => (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname) && !u.username && !u.password

/** { pdf, api }: the paper's PDF (arXiv's, or a server on this machine), and our server's origin (the build's, or a server on
 *  this machine: a probe's stand-in); this machine's only where `loopback` (LOOPBACK_ALLOWED) */
export function readerAddresses(params: URLSearchParams, paper: string, api = READER_API, o: { loopback?: boolean } = {}): { pdf: string; api: string } {
  const loopback = o.loopback ?? LOOPBACK_ALLOWED
  const pdf = parse(params.get('pdf')), server = parse(params.get('api'))
  return {
    pdf: pdf && ((loopback && local(pdf)) || (pdf.origin === 'https://arxiv.org' && !pdf.username && !pdf.password)) ? pdf.href : `https://arxiv.org/pdf/${paper}`,
    api: loopback && server && local(server) ? server.origin : api,
  }
}
