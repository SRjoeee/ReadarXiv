# packages

The rebuild's workspace packages: private, ESM, TypeScript with erasable syntax only, named `@readarxiv/<name>`, entered
through `src/index.ts`. They hold only this project's own code (ported GPL code stays in the extension). The extension
is the root package and does not move; it imports these packages, never the other way round.

| Package | What it is | Its entry |
|---|---|---|
| `format` | the bundle's schema: the head, the units, a page's part, the rows; every object canonical JSON named by its SHA-256 | `read(kind, bytes, digest?)` checks the digest, the size bound, the values and the schema before it gives an object; `write(kind, value)` gives its bytes and digest; `unitId`, a unit's content identity |
| `engine` | the prepare: a paper's source and arXiv's PDF in, its bundle out | `prepareBack(instrument, arXiv's PDF, deps)`, the back half: arXiv's PDF read once, the marked compile's ownership of each glyph carried onto it (`align`, `locate`), arXiv's own runs wrapped in optional content groups (`wrap`), the bundle's objects made (`bundle`), each yielded as it is made. The front half (the source read into units, the marks written, the compile plan and its cache: `src/source/`, `src/marks/`, `src/compile/`) is in the package and not yet in its entry; the lab's gates reach it by path |
| `typeset` | a translated unit laid into its room: rules and language data, the breaker, the fit, the painters' display list | two pure functions of data and the translated text: `layFlowPrepared(members, rules)` lays a flow's members in order, `layPagePrepared(page, flows, ties, rules)` lays one page from its own part; no DOM, no clock, metrics from a table (`tableMetrics`) |
| `translate` | the translator contract, its adapters (Microsoft, Google, the browser's built-in) and the chain that falls back between them | `chainOf(ports)` gives the chain whose `translate(units, target, options)` yields each unit's result as it comes; `keyOf` and `identityOf` name what a host stores; `accept` judges a reply |
| `reader` | the bilingual reader: the page stack, composing, the session, the highlight, the chrome | `openReader(root, { host, paper, … })` opens a paper in two panes for a host (`Host`: its network, where arXiv's PDF is read, its preferences, and the rows it makes); `mountChrome` draws the toolbar, the capsule and the menus over it |
| `ui` | the controls, the design tokens and the one string catalogue the extension, the reader and the website share | the controls (`Button`, `Switch`, `Segmented`, `MenuList`, …), the design tokens (`ROLES`, `RAMP`, `resolve`; their sheet `@readarxiv/ui/tokens.css`), the live string bindings `S`, `O`, `R` |
| `text` | the small facts several packages share | `sentenceCuts`, the sentence cuts both the reader and the translators read |

## The dependency rule

Dependencies point one way, and `scripts/check-boundary.mjs` (part of `pnpm lint`; its table is `PACKAGES`) holds it:

- `format`, `text` and `ui` import no other package.
- `engine` and `typeset` may import `format` and `text`; `translate` may import `text`.
- `reader` may import `format`, `typeset`, `text` and `ui`.
- A package imports another only through its entry, `@readarxiv/<name>`, declared in its `package.json` as `workspace:*`;
  never a deep path, never a relative path across packages.
- No package imports the extension's `src/`, its aliases, `wxt` or its virtual modules.

## Per package

- `pnpm typecheck` checks each package under its own `tsconfig.json` (`tsc -b packages`): Node packages see no DOM types.
- `pnpm test` runs each package's `tests/` under the environment its `vitest.config.ts` names: Node, except `reader`
  and `ui` (happy-dom).
- Biome's formatter is on for `packages/**` alone (`pnpm lint` checks it; `pnpm exec biome format --write packages`).
- No hand-written declaration files, no enums, namespaces or parameter properties.
