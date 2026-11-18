// lab/typeset/offline-route.mjs: the route a lab run of the reader's page stands behind (the checkpoints' entry-reader.mjs and
// real.mjs, the display gate's parity/render.mjs): every request but the harness server's own, a data: URL's and a blob: URL's
// is aborted and named in `refused`, which the run reports. Not shipped.

/** a Playwright route handler: `server` the harness's (packages/reader/e2e/server.mjs startServer), `refused` the list the
 *  requests it aborts are put on */
export const offlineRoute = (server, refused) => (route) => {
  const u = route.request().url()
  if (u.startsWith(server.origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
  refused.push(u)
  return route.abort()
}
