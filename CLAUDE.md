# CLAUDE.md — Read arXiv

Chrome extension (MV3) that translates `https://arxiv.org/html/*` in place: structure-preserving, reversible, made for long bilingual reading sessions. Display name **Read arXiv**; repository `ReadarXiv`; everything the extension injects is prefixed `axt-` / `data-axt-` / `--axt-`.

## Where the truth lives

- `docs/DESIGN.md` — the current design: what the extension does, how it is built, why each non-obvious choice was made, with the measurements beside the decisions. Cite it by section (`DESIGN §7.2`). A decision that changes goes into its section in the same pull request as the code.
- `docs/UI.md` — the interface contract: every control and string of the popup and the settings page, by id (`S-P-80`), with the reasons behind them.
- `docs/RELEASE.md` — how a version is cut, and the store listing.
- `docs/THIRD_PARTY.md` — what was ported from which project, under which licence.
- `CHANGELOG.md` — reader-facing changes.
- The design's history — the rebuild's charter, checkpoint log, inventory, baseline numbers and one-decision-per-file records — was archived from the tree on 2026-09-17 and stays in the repository's history: `git show 48cdd9f:docs/rebuild/PROGRESS.md`, `git show 48cdd9f:docs/adr/`.

## Hard rules

Each is a product promise, a legal requirement, or a contract with something outside this repository.

1. **DOM invariants** (DESIGN §7.1, guarded by tests): a translation node is inserted only as the next sibling of its original block; an original node gains `data-axt-*` attributes and nothing else; global state lives only on `<html>`; after restore the DOM equals the pre-translation DOM node by node.
2. **Prefixes**: every injected class, data attribute and CSS variable starts with `axt-` / `data-axt-` / `--axt-`.
3. **Free and built-in translation APIs are unreliable by assumption**: their failure must be recoverable and must trigger the fallback chain; it must never take the extension down.
4. **Cache key** carries every input that changes a translation — today `CACHE_KEY_VERSION | providerId | model | PROMPT_VERSION | promptKey | context | RULES_VERSION | target | renderPath | normalizedText | cuts` (`src/cache/key.ts`); bump the matching version whenever a prompt, a rule or the request shape changes meaning.
5. **Secrets**: API keys live only in WXT storage — never in logs, cache keys, fixtures or git. A third party's public client constant (the Google web translator's key in `providers/google-web.ts`) is not a secret.
6. **Attribution**: code ported from the reference projects (KISS Translator, Read Frog, FluentRead — GPL-3.0) keeps the header `// Ported from reference/<repo>/<path>@<commit> (GPL-3.0), <YYYY-MM-DD>, modified` and an entry in `docs/THIRD_PARTY.md`.
7. **External contracts** get migration or compatibility handling, never silent replacement: the saved configuration schema (`CONFIG_VERSION` and a migration, DESIGN §9), the Native Messaging protocol with the installed `axt-helper` (DESIGN §15.3), the installer surface (`helper/`).
8. **The platform boundary** (DESIGN §4.2, checked by `pnpm lint` through `scripts/check-boundary.mjs`): `src/core`, `src/providers` and `src/cache` import nothing from `wxt`, the entry points, the UI, the locale packs, the WXT configuration store or runtime messaging; what the core needs from the host enters as a dependency, and what it shows a reader is a code the host turns into a sentence.
9. **No `:has()` in the injected style sheets** (DESIGN §7.2, gate `tests/styles/no-has.test.ts`): Chrome answers a `:has()` in an author sheet by recalculating the whole document's styles on every DOM insertion. Every structural condition the layout needs is a `data-axt-*` mark written by the code that creates the structure; `:has()` stays available to TypeScript queries.

Two defaults, open to re-evaluation with evidence: `ltx_*` selectors live only in `src/core/rules/latexml.ts` (style sheets may use them for layout only); the wire format (tags / markers / runs) is negotiated from the provider's declared `wireFormats`, never chosen by provider identity in the renderer.

## Stack

WXT + React + TypeScript with pnpm · Vercel AI SDK for LLM providers (structured output via `generateText` + `Output.object` + zod) · Dexie for the translation cache · WXT storage with schema versions and migrations · Vitest + happy-dom for unit tests, Playwright for e2e · Biome, linter only · Swift for the macOS image-recognition helper. Target is Chrome MV3 (`minimum_chrome_version` in `wxt.config.ts`); no cross-browser branches or polyfills; runtime feature detection stays because a free API can be absent on the same Chrome.

## Working rules

- **A pull request is one complete, explainable, verifiable change.** Cross-module changes update the interface and every caller together; unrelated changes stay out; a coherent change is not split to look small.
- **Gate before every pull request** — the same four steps CI runs: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, judged by the exit code, plus the e2e scripts relevant to the change. `pnpm test` is vitest and does not type-check.
- **Self-review before asking for review**: after adding a constraint, grep for everyone else on that path; read your own diff as someone else's code and ask what used to work and now does not.
- **Wait for CI and the review's terminal signal before merging**; verify every review comment against a fixture, a probe or the code before adopting it, and write down what was declined and why. Merge with a merge commit, never squash. Nothing merges into `main` and no version is released without the maintainer's explicit request.
- **Measure before deciding**: a performance claim comes with a probe or a measurement (`tests/e2e/probes/`, `AXT_MEASURE=1 pnpm vitest run tests/perf`); a claim in a document or an old comment is a hypothesis until checked.
- **Ported code**: keep only what is called; when a ported module is touched, its unused parts go.

## Language

Everything written for developers is English: identifiers, comments, docs, test names, scripts, commit messages (`type(scope): summary`), pull requests, issues. `pnpm check:english` (`scripts/check-english.mjs`, part of `pnpm lint`) is the gate: a file may hold no more lines with CJK characters than `scripts/english-allowlist.txt` grants it — lower an entry freely, raise one only with a reason.

Chinese that is product data stays: the locale packs (`src/locales/*`, `public/_locales`) and the few reader-facing strings marked as such outside them; the language table (`config/languages.ts`); multilingual test inputs and expectations, and the Chinese labels the e2e scripts locate controls by; an observed machine-translation output quoted as evidence.

## Commands

```
pnpm install
pnpm dev                 # WXT dev mode; load .output/chrome-mv3-dev unpacked
pnpm typecheck           # tsc --noEmit — vitest does not type-check
pnpm lint                # Biome linter, the English gate, the boundary gate; pnpm lint:fix applies safe fixes
pnpm test                # vitest; pnpm test:watch
pnpm build               # wxt build + scripts/check-output.mjs
pnpm e2e                 # real Chromium with the extension (pnpm build first; once: npx playwright install chromium)
pnpm e2e:layout          # side-mode layout contract in a real browser
pnpm e2e:a11y            # A/B axe audit: only differences the extension introduces
pnpm e2e:local-endpoint  # an http endpoint without CORS headers can translate a whole page
pnpm e2e:image           # image translation through the installed helper (SKIP without it)
pnpm e2e:placeholders    # placeholder survival per sentence shape against a live engine (DESIGN §6.3)
pnpm fixtures:fetch      # download and verify the fixtures the repository may not hold (tests/fixtures/README.md); pnpm test does it too
pnpm fixtures:stats      # rule coverage audit over the fixtures
pnpm helper:build        # Swift helper; pnpm helper:smoke talks to the binary over Native Messaging frames
pnpm zip                 # the store archive; pnpm icons regenerates the icons
AXT_MEASURE=1 pnpm vitest run tests/perf       # the cost measurements (readings, not assertions)
AXT_CHROME=<binary> pnpm e2e                   # the e2e suite on a chosen Chrome; probes live in tests/e2e/probes/
```
