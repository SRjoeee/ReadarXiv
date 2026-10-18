// lab/pdf/layer-lab/own-host.mjs
// The lab's guard against DNS rebinding. The server listens on 127.0.0.1 only, but a page of another site whose name is
// made to resolve to 127.0.0.1 reaches it all the same, same-origin to itself, with its own name in `Host` and no Origin
// to check on a GET: it could read the fixtures, finals and records (arXiv's papers and what is made from them, which are
// not to be published) and start the add-on's make-and-write. The lab's own page never sends any other Host.

/** whether a request's `Host` header is exactly the lab's own address, `127.0.0.1:<port>`: no other name, no other port, none */
export function isOwnHost(host, port) {
  return typeof host === 'string' && host === `127.0.0.1:${port}`
}
