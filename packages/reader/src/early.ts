// `@readarxiv/reader/early`: what a host's page does before the reader's code has loaded, done as the reader does it. A host's
// head may ask the original's first range at once, so that it is under way while the reader's code loads: `firstAsk` is the
// reader's own first ask of it (its address and its Range), so the host can hand the answer over and the reader asks nothing
// again. A host's first paint may set the look the visitor chose on <html> before the chrome mounts: `themeOf` and `dimmed`
// are the readings the chrome applies (`data-theme`, `data-axt-dim`). This entry reaches nothing but these few files, no
// package, so that a page's head takes it whole (the package's tests hold it so: tests/early.test.ts).
export { firstAsk } from './bytes/chunk.ts'
export { type Appearance, dimmed, themeOf } from './chrome/look.ts'
