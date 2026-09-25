// Where the live reader fetches the paper and sends its typesetting (the reader's design, §2). Its own addresses unless
// told otherwise by its URL — and the only other addresses it takes are a server on this machine (the probes run
// theirs) and, for the paper itself, arXiv. The reader is a page arXiv's pages may frame, so its URL is not the
// reader's to trust: a page that frames it must not point its requests, or the paper's project, anywhere else (Devin
// on #301).

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const parse = value => { try { return value ? new URL(value) : null } catch { return null } }
const local = u => (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname) && !u.username && !u.password

/** { site, endpoint, src, pdf }: the TeX page's origin, its file server's origin, the paper's source and its PDF */
export function readerAddresses(params, paper) {
  const origin = (name, fallback) => { const u = parse(params.get(name)); return u && local(u) ? u.origin : fallback }
  const address = (name, fallback) => { const u = parse(params.get(name)); return u && (local(u) || (u.origin === 'https://arxiv.org' && !u.username && !u.password)) ? u.href : fallback }
  return {
    // our TeX page and the TeX Live file server, as spikes/serve-live.mjs starts them on this machine
    site: origin('site', 'http://127.0.0.1:8071'),
    endpoint: origin('endpoint', 'http://localhost:8070'),
    src: address('src', `https://arxiv.org/src/${paper}`),
    pdf: address('pdf', `https://arxiv.org/pdf/${paper}`),
  }
}
