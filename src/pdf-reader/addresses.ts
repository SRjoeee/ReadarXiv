// Where the reader fetches the paper and its layer (Stage 5 Task 17): arXiv's PDF, and our server, the build's. Its own
// addresses unless told otherwise by its URL — and the only others it takes are a server on this machine (the probes run
// theirs) and, for the paper itself, arXiv. The reader is a page arXiv's pages may frame, so its URL is not the reader's to
// trust: a page that frames it must not point its requests anywhere else (PDF-READER §11.1).

declare const __AXT_READER_API__: string | undefined
/**
 * Our server, whose layer API the reader reads a paper's layer from (session/server.ts): a build setting, chosen by nothing a
 * paper, a service or a page that frames the reader says. `https://readarxiv.com` in a production build; a test build names
 * staging's (`AXT_READER_API=https://app-staging.readarxiv.org pnpm build`, wxt.config.ts READER_API), and so does a
 * development build by default. The unit tests' is production's
 */
export const READER_API: string = typeof __AXT_READER_API__ === 'string' && __AXT_READER_API__ ? __AXT_READER_API__ : 'https://readarxiv.com'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const parse = (value: string | null) => { try { return value ? new URL(value) : null } catch { return null } }
const local = (u: URL) => (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname) && !u.username && !u.password

/** { pdf, api }: the paper's PDF (arXiv's, or a server on this machine), and our server's origin (the build's, or a server on
 *  this machine: a probe's stand-in) */
export function readerAddresses(params: URLSearchParams, paper: string, api = READER_API): { pdf: string; api: string } {
  const pdf = parse(params.get('pdf')), server = parse(params.get('api'))
  return {
    pdf: pdf && (local(pdf) || (pdf.origin === 'https://arxiv.org' && !pdf.username && !pdf.password)) ? pdf.href : `https://arxiv.org/pdf/${paper}`,
    api: server && local(server) ? server.origin : api,
  }
}
