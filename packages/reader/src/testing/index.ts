// @readarxiv/reader/testing: the reader's internals a host's own tests and end-to-end scripts read, as
// @readarxiv/translate/testing gives the translators' test adapters: what composing shows of a unit's kind, the contents
// built from the units, the original's ranged source and the chunk store, the session's client to our server and its
// refusal, the paper's abstract title and its HTML version, what the session needs next, a link the chrome lets out, and
// the capsule's reading of a state. Only what no public entry (`@readarxiv/reader`, `@readarxiv/reader/early`) gives. No
// product imports it: scripts/check-boundary.mjs (testingViolations, in `pnpm lint`) refuses a product file that names a
// testing entry
export { linkable } from '../chrome/links.ts'
export { capsuleOf } from '../chrome/status.ts'
export { kindShown } from '../compose/classes.ts'
export { rangeSource } from '../bytes/source.ts'
export { chunkStore } from '../bytes/store.ts'
export { follow, objectStore, open, Refused } from '../session/client.ts'
export { createContents } from '../session/contents.ts'
export { needsOf } from '../session/machine.ts'
export { abstractTitleOf, htmlVersionOf } from '../session/paper.ts'
