// @readarxiv/engine/today: the transition entry of the front half moved into this package (the source reader, the marked
// compile's layout, the instrument), JavaScript as it was. Each old path under src/pdf-reader/engine re-exports its module
// from here, so that the old engine, its tests and the lab run this package's one instance of each module (the source
// reader's state among them); nothing else imports it. A moved module is typed at its old path by the hand declaration file
// that stays there, and here by nothing. Exit: the cut-over deletes this entry with the old paths.

// ---- the source reader and its rule files (source/)
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/latex-front.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/paper-meta.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/paper-names.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/arg-roles.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/latexml-args.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/tex-kernel.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/tex-names.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/text-symbols.mjs'
// @ts-expect-error: JavaScript moved as it is (no declaration in the package; typed at its old path)
export * from './source/text-piece.mjs'
