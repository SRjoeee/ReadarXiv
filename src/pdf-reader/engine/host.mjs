// The page's side of the session (session.mjs): its two panes, its address's parameters and the sink for the session's
// events, handed over once, before the session module is loaded — the session runs at load, as the prototype's page
// script did, and waits for this first
let provide
export const hostReady = new Promise(resolve => { provide = resolve })
/** @param {import('./session.mjs').SessionHost} host */
export function setHost(host) { provide(host) }
