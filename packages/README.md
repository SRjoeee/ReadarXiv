# packages

The rebuild's workspace packages: private, ESM, TypeScript with erasable syntax only, named `@readarxiv/<name>`, entered
through `src/index.ts`. They hold only this project's own code (ported GPL code stays in the extension). The extension
is the root package and does not move; it will import these packages, never the other way round.

| Package | What it is for |
|---|---|
| `format` | the schema of the bundle, read and write |
| `engine` | source, marks, ink, align, locate, wrap, bundle and prepare |
| `typeset` | layFlow, rules, language data and painters |
| `translate` | the translator contract, its adapters and the chain |
| `reader` | the page stack, composing, session, highlight and the Host |
| `ui` | the controls, the tokens and the strings |
| `text` | sentence cuts and paper ids: the small facts several packages share |

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
