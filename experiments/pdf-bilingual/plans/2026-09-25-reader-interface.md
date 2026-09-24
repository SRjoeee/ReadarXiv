# The PDF reader's interface: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bilingual PDF reader's interface where it will stay — an extension page, React and TypeScript — with
the engine moved behind a typed controller, as the design specifies.

**Architecture:** The engine's modules move from `experiments/pdf-bilingual/poc-reader/` into `src/pdf-reader/engine/`
and keep running as JavaScript; the prototype's page script becomes the engine's session module, which a small host
module feeds with the page's panes and an event sink. A TypeScript controller folds the session's events into a state
the React interface subscribes to and passes its commands back. PDF.js comes from npm, pinned.

**Tech Stack:** WXT 0.21, React 19, TypeScript, Tailwind v4 (Part 3), PDF.js 6.3.289, Vitest + happy-dom, Playwright
for the browser checks.

**Spec:** `experiments/pdf-bilingual/plans/2026-09-25-reader-interface-design.md` (the design). Section references
below (§n) are the design's.

## Global Constraints

- Developer-visible text is English; reader-facing words come from the locale packs (`src/locales/zh-CN.ts`, `en.ts`),
  never hard-coded (design §11.6). `pnpm lint` runs the English gate.
- No reader-facing string names a technical path: LaTeX, TeX, compiling, typesetting, an engine, a provider (§1).
- No `:has()` in any of the reader's style sheets (§12; DESIGN §7.2).
- PDF.js is `pdfjs-dist` **6.3.289**, exact.
- The engine's behaviour is unchanged except where the design's §10 says, and except for the route its figure OCR takes
  (§11.2: the extension's own recogniser).
- Chrome 131 is the floor (`minimum_chrome_version`); no polyfills, no cross-browser branches. The reader itself runs
  only where PDF.js's modern build does (`readerRuns`, spec §2): elsewhere it is not offered (Part 1's final review).
- The gate before each commit that ends a task: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, judged by
  the exit code.
- Commits are local; the stage goes out as one pull request when the last part is done (never `main`; merge commits).
  Files are added by name, never `git add -A`. Demo papers (`poc-reader/papers/`) are never committed.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

- **A command given while the paper is still opening** (a click on the display switch before the session module has
  loaded): it is carried out once the session is ready, not dropped. Pinned in Task 4.
- **The translation's side replaced while the reader is reading it** (a preview swapped for the final): the right
  side's page count and page number the interface shows are the new viewer's, not the old one's. Pinned in Task 3
  (the session emits the new side's page after a swap) and checked in Task 6.
- **A run that ends without a translation** (no source, a language not verified, the service unreachable): the reader
  still shows the original, and the state says which case it is, so that the interface can grey the displays or show
  the reason. Pinned in Task 4.
- **Settings the extension cannot read** (a stored configuration from a newer version, say): the reader goes on with
  the defaults and the state says so, so that Part 2 can tell the reader. Pinned in Task 4.
- **A bitmap figure's text** read on the translation's side: it goes through the extension's recogniser, so the
  result is cached by the image's hash as on the HTML page and the package carries one recogniser. Pinned in Task 3.

## The parts

The design spans six pieces of work that each end in software that runs. This document holds **Part 1 in full**. Each
later part is written as its own plan, appended here, once the part before it is done: its code depends on the shape
the earlier parts actually take.

1. **The engine in the extension, behind the controller** (this document). The reader is a WXT page
   (`pdf-reader.html`) with the two panes and the way back; the engine's modules are in `src/pdf-reader/engine/`;
   PDF.js is bundled from npm; figure OCR goes through the extension; the controller's state and commands exist and are
   tested; every existing check of the engine passes on the new page.
2. **Shared settings** (§3, §9.1): the `pdfReader` group, `CONFIG_VERSION` 18 → 19 and its migration; the reader
   following `mode`, `reading.sentenceHighlight`, `image.enabled` / `image.modes`, `targetLanguage`, `uiLanguage`; the
   display written back as §9.1 says; the settings-unreadable notice; the `R` locale surface filled.
3. **The interface** (§4–§8, §13): the token sheet and page layout; the toolbar; the display switch and its glyph
   outlines (the script, `THIRD_PARTY.md`); the contents (and the engine keeping each heading's sectioning level); the
   page pills; the scroll indicators; the capsule and the card; the popovers on a fixed `Menu` (§9.4); appearance and
   dark pages; pinch zoom; the keys; narrow windows; the download.
4. **The engine's measured changes** (§10): overlays scaled by transform; overlays kept across a redraw; stopping early
   when the service fails, with 重试; the `abortSignal`; the test pinning PDF.js's internals; the pinch probe
   committed.
5. **The extension around the reader** (§2, §9.2–§9.3): the source check on the abstract page and by HEAD; the popup's
   two entries and its rules while the reader is open; the floating button; the settings page's section and the PDF
   translations' line in 数据; `#readarxiv` on a PDF address.
6. **Verification and words** (§12, §14): the new browser checks; the performance gates; the accessibility audit; a
   `better-interface` review and `break`; `docs/UI.md`'s surface R, `docs/DESIGN.md`, `REPORT.md`; then the pull
   request.

---

# Part 1: the engine in the extension, behind the controller

**File structure after this part**

| Path | Responsibility |
|---|---|
| `src/pdf-reader/engine/*.mjs` | The engine, moved: `anchors`, `sync`, `figures`, `engine`, `mt`, `live`, `latex-front`, `paper-meta`, `scripts`, `tar`, `cache`, `names`, and `session` (was `reader.js`) |
| `src/pdf-reader/engine/host.mjs` + `host.d.mts` | The page hands the session its panes, its parameters and its event sink before the session module loads |
| `src/pdf-reader/engine/session.d.mts` | The session's types for TypeScript: its events and its commands |
| `src/pdf-reader/engine/engine.css` | The engine's overlays and pane scrollers (was `reader.css`, its engine half) |
| `src/pdf-reader/pdfjs.ts` + `pdfjs-viewer.d.ts` | PDF.js, bundled; where its data files are in the build |
| `src/pdf-reader/ocr.ts` | A bitmap → the extension's OCR call |
| `src/pdf-reader/controller.ts` | The session's events folded into `ReaderState`; the interface's commands |
| `src/entrypoints/pdf-reader/` | The page: `index.html`, `main.tsx`, `App.tsx`, `page.css` |
| `tests/pdf-reader/*.test.ts` | Unit tests for `ocr.ts` and `controller.ts` |

The local variants harness (`poc-reader/variants.*`, untracked) stops working in Task 3; it stays on disk as the
visual reference until Part 3 has replaced it, and is deleted then.

### Task 1: the engine's modules in the extension's source

**Files:**
- Move: `experiments/pdf-bilingual/poc-reader/{anchors,sync,figures,engine,mt,live,latex-front,paper-meta,scripts,tar,cache,names}.mjs` → `src/pdf-reader/engine/`
- Modify: `src/pdf-reader/engine/figures.mjs:6`, `engine.mjs:6`, `mt.mjs:6`, `latex-front.mjs:9`
- Modify: every `experiments/pdf-bilingual/spikes/*.mjs` that imports a moved module
- Modify: `biome.json`, `scripts/english-allowlist.txt`
- Test: the six case spikes (`anchors-cases`, `cache-cases`, `lost-cases`, `mt-cases`, `sync-cases`, `wire-cases`),
  which exit non-zero on a failure

**Interfaces:**
- Produces: the engine's modules at `src/pdf-reader/engine/<name>.mjs`, importing the extension's source by `@/…`; the
  case spikes run with `pnpm exec tsx` from the repository root.

- [ ] **Step 1: The baseline — the cases pass where they are**

```bash
cd experiments/pdf-bilingual && node spikes/build-shared.mjs >/dev/null
for c in anchors-cases cache-cases lost-cases mt-cases sync-cases wire-cases; do node spikes/$c.mjs >/dev/null 2>&1 && echo "$c ok" || echo "$c FAILED"; done
```

Expected: six lines ending in `ok`.

- [ ] **Step 2: Move the modules**

```bash
cd "$(git rev-parse --show-toplevel)" && mkdir -p src/pdf-reader/engine
for m in anchors sync figures engine mt live latex-front paper-meta scripts tar cache names; do git mv experiments/pdf-bilingual/poc-reader/$m.mjs src/pdf-reader/engine/$m.mjs; done
```

- [ ] **Step 3: Run the cases to see them fail**

```bash
for c in anchors-cases cache-cases lost-cases mt-cases sync-cases wire-cases; do pnpm exec tsx experiments/pdf-bilingual/spikes/$c.mjs >/dev/null 2>&1 && echo "$c ok" || echo "$c FAILED"; done
```

Expected: six `FAILED` (their imports point at `../poc-reader/`).

- [ ] **Step 4: Import the extension's source directly**

In `src/pdf-reader/engine/figures.mjs`, replace

```js
import { TAG_RE } from './lib/axt/wire.mjs'
```

with

```js
import { TAG_RE } from '@/core/protector/tokens'
```

In `src/pdf-reader/engine/engine.mjs`, replace

```js
import { ABSTRACT_MAX_CHARS, createMessageTransport, isPermanentErrorKind, toBcp47 } from './lib/axt/extension.mjs'
```

with

```js
import { toBcp47 } from '@/config/languages'
import { ABSTRACT_MAX_CHARS } from '@/core/extractor/context'
import { isPermanentErrorKind } from '@/providers/types'
import { createMessageTransport } from '@/shared/transport'
```

In `src/pdf-reader/engine/mt.mjs`, replace

```js
import { fromAlpha, MIXED, TAG_RE, toAlpha } from './lib/axt/wire.mjs'
```

with

```js
import { MIXED } from '@/cache/pdf-record'
import { fromAlpha, TAG_RE, toAlpha } from '@/core/protector/tokens'
```

In `src/pdf-reader/engine/latex-front.mjs`, replace

```js
const nodeFs = typeof process !== 'undefined' && process.versions?.node ? await import('node:fs') : null
```

with

```js
// Node's file system for the spikes; in the page the branch is never taken, and the bundler is told not to follow it
const nodeFs = typeof process !== 'undefined' && process.versions?.node ? await import(/* @vite-ignore */ 'node:fs') : null
```

Update each module's header comment where it names `poc-reader`, `lib/axt` or `spikes/build-shared.mjs`: it now says
that the module is the reader's engine, in the extension's source, importing the extension's modules directly.

- [ ] **Step 5: Point the spikes at the new place**

```bash
cd experiments/pdf-bilingual/spikes
for f in $(grep -l "poc-reader/" *.mjs); do
  sed -i '' -E \
    -e "s#\.\./poc-reader/(anchors|sync|figures|engine|mt|live|latex-front|paper-meta|scripts|tar|cache|names)\.mjs#../../../src/pdf-reader/engine/\1.mjs#g" \
    -e "s#\.\./poc-reader/lib/axt/wire\.mjs#../../../src/cache/pdf-record.ts#g" \
    -e "s#\.\./poc-reader/lib/axt/figures\.mjs#../../../src/core/image/boxes.ts#g" "$f"
done
grep -n "poc-reader/" *.mjs
```

Expected from the last `grep`: only lines naming `poc-reader/papers`, `poc-reader/lib/pdf` (Node spikes that read
PDFs with the experiment's own PDF.js, left as they are), and the page (`extension.mjs`, handled in Task 6). Fix any
other line by hand. `spikes/latex-front.mjs` and `spikes/paper-meta.mjs` are one-line re-exports; after the `sed`
they read `export * from '../../../src/pdf-reader/engine/latex-front.mjs'` (and `paper-meta.mjs`) — check it.

Each spike's header line that says how to run it (`node spikes/x.mjs`) now says
`pnpm exec tsx experiments/pdf-bilingual/spikes/x.mjs` (from the repository root): the engine imports the
extension's source by `@/`, which tsx resolves through `tsconfig.json`.

- [ ] **Step 6: Run the cases to see them pass**

```bash
cd "$(git rev-parse --show-toplevel)"
for c in anchors-cases cache-cases lost-cases mt-cases sync-cases wire-cases; do pnpm exec tsx experiments/pdf-bilingual/spikes/$c.mjs >/dev/null 2>&1 && echo "$c ok" || echo "$c FAILED"; done
```

Expected: six `ok`.

- [ ] **Step 7: Lint as the experiment was linted, and move the English allowances**

In `biome.json`, the first override's `includes` becomes `["experiments/**", "src/pdf-reader/engine/**"]`, with a
comment above the override: the engine is research code moved as it is, linted as it was, until the next stage ports
it to TypeScript.

In `scripts/english-allowlist.txt`, rename the entries' paths and keep their counts and reasons:
`experiments/pdf-bilingual/poc-reader/anchors.mjs` → `src/pdf-reader/engine/anchors.mjs`, and the same for
`latex-front.mjs` and `mt.mjs`. Keep the list sorted by path.

```bash
git add biome.json scripts/english-allowlist.txt src/pdf-reader/engine experiments/pdf-bilingual/spikes
pnpm lint
```

Expected: exit 0; the English check lists no file over its allowance.

- [ ] **Step 8: Commit**

```bash
git commit -F - <<'EOF'
refactor(pdf-reader): the engine's modules move into the extension's source

anchors, sync, figures, engine, mt, live, latex-front, paper-meta, scripts,
tar, cache and names move from poc-reader/ to src/pdf-reader/engine/, and
import the extension's modules directly instead of the lib/axt build. The
case spikes run with tsx from the repository root and pass as before.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 2: PDF.js from npm, and its data files in the build

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/pdf-reader/pdfjs.ts`, `src/pdf-reader/pdfjs-viewer.d.ts`
- Modify: `wxt.config.ts`, `scripts/check-output.mjs`

**Interfaces:**
- Produces: `src/pdf-reader/pdfjs.ts` exporting `pdfjsLib` (the library namespace), `EventBus`, `LinkTarget`,
  `PDFLinkService`, `PDFViewer`, and `ASSETS: { cMapUrl: string; cMapPacked: true; standardFontDataUrl: string;
  wasmUrl: string }`, the options `getDocument` needs to find PDF.js's data files. The files are at
  `pdf-reader/pdfjs/{cmaps,standard_fonts,wasm}/` in the build.

- [ ] **Step 1: Add the package**

```bash
pnpm add pdfjs-dist@6.3.289 --save-exact
```

Expected: `package.json`'s `dependencies` has `"pdfjs-dist": "6.3.289"`.

- [ ] **Step 2: The failing check** — in `scripts/check-output.mjs`, add to the list checked after the recogniser's
  (the array of `[what, ok, detail]`):

```js
  ['PDF.js\'s character maps, fonts and decoders are in the build', ['pdfjs/cmaps/78-EUC-H.bcmap', 'pdfjs/standard_fonts/FoxitSerif.pfb', 'pdfjs/standard_fonts/LICENSE_FOXIT', 'pdfjs/wasm/openjpeg.wasm'].every(file => existsSync(join(OUT, 'pdf-reader', file))), 'pdf-reader/pdfjs/ is incomplete'],
```

and change the comment above `const built = …` to: the PDF reader's data files (`pdf-reader/`: PDF.js's WebAssembly
decoders among them) are the reader's and not counted by the recogniser's rules below.

```bash
pnpm build
```

Expected: exit 1, `✗ PDF.js's character maps, fonts and decoders are in the build: pdf-reader/pdfjs/ is incomplete`.

- [ ] **Step 3: Copy the data files** — in `wxt.config.ts`, below the imports, add:

```ts
/**
 * The files PDF.js reads by address rather than by import (the reader's design, §11.2): its character maps, the standard
 * fonts with their licences, and its WebAssembly decoders, copied from the pinned package as they are into
 * `pdf-reader/pdfjs/`. The library and its worker are bundled (src/pdf-reader/pdfjs.ts)
 */
const PDFJS = fileURLToPath(new URL('./node_modules/pdfjs-dist', import.meta.url))
function pdfjsFiles(): { absoluteSrc: string; relativeDest: string }[] {
  return ['cmaps', 'standard_fonts', 'wasm'].flatMap(dir =>
    readdirSync(join(PDFJS, dir))
      .filter(name => statSync(join(PDFJS, dir, name)).isFile())
      .map(name => ({ absoluteSrc: join(PDFJS, dir, name), relativeDest: `pdf-reader/pdfjs/${dir}/${name}` })),
  )
}
```

and in the `build:publicAssets` hook, `files.push(...licenceFiles(), ...pdfReaderFiles())` becomes
`files.push(...licenceFiles(), ...pdfReaderFiles(), ...pdfjsFiles())`.

- [ ] **Step 4: The module** — create `src/pdf-reader/pdfjs-viewer.d.ts`:

```ts
// pdfjs-dist ships the viewer components' types beside the library's, not beside web/pdf_viewer.mjs
declare module 'pdfjs-dist/web/pdf_viewer.mjs' {
  export * from 'pdfjs-dist/types/web/pdf_viewer.component'
}
```

and `src/pdf-reader/pdfjs.ts`:

```ts
// PDF.js for the reader (the design, §11.2): the library and its worker bundled from npm, pinned; its character maps,
// standard fonts and WebAssembly decoders copied into the build as they are (wxt.config.ts pdfjsFiles) and read from
// there by address
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { browser } from 'wxt/browser'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
// the viewer components read the core library from this global, so they are loaded once it is set
;(globalThis as { pdfjsLib?: typeof pdfjsLib }).pdfjsLib = pdfjsLib
const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs')

// copied by the build, not a public file WXT knows: hence the untyped getURL
const base = (browser.runtime.getURL as (path: string) => string)('/pdf-reader/pdfjs/')
/** what getDocument needs to find PDF.js's data files */
export const ASSETS = { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/` } as const
export { pdfjsLib }
export const { EventBus, LinkTarget, PDFLinkService, PDFViewer } = viewer
```

- [ ] **Step 5: Run the checks to see them pass**

```bash
pnpm typecheck && pnpm build
```

If `pnpm typecheck` finds no module for `…?url`, the builder's types do not declare Vite's asset imports: add
`/// <reference types="vite/client" />` as the first line of `src/pdf-reader/pdfjs-viewer.d.ts` and run it again.

Expected: exit 0; the build prints `✓ PDF.js's character maps, fonts and decoders are in the build`. (`pdfjs.ts` is not
imported yet; Task 5 brings it into the page's bundle, where `pnpm build` checks it compiles.)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/pdf-reader/pdfjs.ts src/pdf-reader/pdfjs-viewer.d.ts wxt.config.ts scripts/check-output.mjs
git commit -F - <<'EOF'
build(pdf-reader): PDF.js from npm, pinned, with its data files in the build

pdfjs-dist 6.3.289, exact. The library and its worker are bundled through
src/pdf-reader/pdfjs.ts; the character maps, standard fonts and WebAssembly
decoders are copied to pdf-reader/pdfjs/, and check-output fails a build
without them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 3: the session: the prototype's page script, fed by a host

**Files:**
- Move: `experiments/pdf-bilingual/poc-reader/reader.js` → `src/pdf-reader/engine/session.mjs`
- Delete: `experiments/pdf-bilingual/poc-reader/ocr-worker.mjs`
- Create: `src/pdf-reader/engine/host.mjs`, `host.d.mts`, `session.d.mts`, `src/pdf-reader/ocr.ts`
- Test: `tests/pdf-reader/ocr.test.ts`
- Modify: `scripts/english-allowlist.txt` (the `reader.js` entry)

**Interfaces:**
- Consumes: `ASSETS`, `pdfjsLib`, `EventBus`, `LinkTarget`, `PDFLinkService`, `PDFViewer` from `src/pdf-reader/pdfjs.ts`
  (Task 2).
- Produces (TypeScript imports the types through the `.mjs` paths; it finds each `.d.mts` beside its module):
  - `src/pdf-reader/engine/host.mjs`: `setHost(host: SessionHost): void`; the session reads it at load.
  - `src/pdf-reader/engine/session.mjs`, loaded once per page after `setHost`, exporting the commands
    `setDisplay(mode)`, `setSyncMode(mode)`, `setCompositor(on)`, `setFigures(on)`, `zoomBy(factor)`, `zoomTo(value)`,
    `goToPage(side, page)`, and `run: Promise<void>`; its events go to `host.emit`.
  - `src/pdf-reader/ocr.ts`: `ocrCall(bitmap: { width: number; height: number; close(): void }, paper: string):
    Promise<OcrCall>`.
  - The types, in `session.d.mts` (below), which Task 4 imports.

- [ ] **Step 1: The failing test** — create `tests/pdf-reader/ocr.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64 } from '@/core/image/run'
import { ocrCall } from '@/pdf-reader/ocr'
import { sha256Hex } from '@/shared/digest'

afterEach(() => vi.unstubAllGlobals())

describe('ocrCall', () => {
  it('sends a page bitmap as PNG, hashed as the HTML page hashes an image, and closes the bitmap', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer
    const drawn: unknown[] = []
    class FakeCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage: (image: unknown) => drawn.push(image) }
      }
      async convertToBlob(options: { type: string }) {
        expect(options.type).toBe('image/png')
        return new Blob([png])
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    const bitmap = { width: 40, height: 30, close: vi.fn() }
    const call = await ocrCall(bitmap, '2608.02163')
    expect(drawn).toEqual([bitmap])
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(call).toEqual({ imageHash: await sha256Hex(png), image: toBase64(png), mime: 'image/png', paper: '2608.02163' })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm vitest run tests/pdf-reader/ocr.test.ts
```

Expected: FAIL, `Failed to resolve import "@/pdf-reader/ocr"`.

- [ ] **Step 3: The OCR call** — create `src/pdf-reader/ocr.ts`:

```ts
// A bitmap from a PDF page → the call the extension's recogniser takes (src/shared/ocr.ts OcrCall), the HTML page's
// route: the background has it read by the one recogniser the package carries, and caches the result by the image's
// hash. The bitmap is encoded as PNG, the bytes hashed as the HTML page hashes an image's, and the bitmap closed
import { toBase64 } from '@/core/image/run'
import type { OcrCall } from '@/shared/ocr'
import { sha256Hex } from '@/shared/digest'

export async function ocrCall(bitmap: { width: number; height: number; close(): void }, paper: string): Promise<OcrCall> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')?.drawImage(bitmap as unknown as CanvasImageSource, 0, 0)
  bitmap.close()
  const bytes = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
  return { imageHash: await sha256Hex(bytes), image: toBase64(bytes), mime: 'image/png', paper }
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
pnpm vitest run tests/pdf-reader/ocr.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: The host and the types** — create `src/pdf-reader/engine/host.mjs`:

```js
// The page's side of the session (session.mjs): its two panes, its address's parameters and the sink for the session's
// events, handed over once, before the session module is loaded — the session runs at load, as the prototype's page
// script did, and waits for this first
let provide
export const hostReady = new Promise(resolve => { provide = resolve })
/** @param {import('./session.mjs').SessionHost} host */
export function setHost(host) { provide(host) }
```

`src/pdf-reader/engine/host.d.mts`:

```ts
import type { SessionHost } from './session.mjs'
export declare const hostReady: Promise<SessionHost>
export declare function setHost(host: SessionHost): void
```

`src/pdf-reader/engine/session.d.mts`:

```ts
// The session's types (session.mjs is JavaScript until the engine's port): what it reports, and what it takes
export type EngineDisplay = 'original' | 'translation' | 'bilingual'
export type SyncMode = 'off' | 'current' | 'same' | 'pointer' | 'matched'
export type SessionEvent =
  /** the developer's status line, English; the interface does not show it */
  | { type: 'status'; text: string }
  /** why the extension's settings could not be read (config/storage.ts FallbackReason), or null when they could */
  | { type: 'notice'; why: unknown }
  | { type: 'display'; mode: EngineDisplay }
  | { type: 'scale'; scale: number }
  | { type: 'page'; side: 'left' | 'right'; page: number; pages: number }
  /** one step of a run (live.mjs and session.mjs note), with the run's counts at that moment */
  | { type: 'note'; event: string; data: Record<string, unknown>; got: number; total: number; lost: number; again: boolean }
  /** a run that ended without a translation: which step, the developer's words, and the chain's error kind when known */
  | { type: 'fail'; event: string; text: string; kind?: string }
export interface SessionHost {
  left: HTMLElement
  right: HTMLElement
  params: URLSearchParams
  emit(event: SessionEvent): void
}
export declare function setDisplay(mode: EngineDisplay): void
export declare function setSyncMode(mode: SyncMode): void
export declare function setCompositor(on: boolean): void
export declare function setFigures(on: boolean): void
export declare function zoomBy(factor: number): void
export declare function zoomTo(value: number | 'page-width' | 'page-fit' | 'page-actual'): void
export declare function goToPage(side: 'left' | 'right', page: number): void
export declare const run: Promise<void>
```

- [ ] **Step 6: Move the page script**

```bash
git mv experiments/pdf-bilingual/poc-reader/reader.js src/pdf-reader/engine/session.mjs
git rm -q experiments/pdf-bilingual/poc-reader/ocr-worker.mjs
```

In `scripts/english-allowlist.txt`, the entry `experiments/pdf-bilingual/poc-reader/reader.js 3` becomes
`src/pdf-reader/engine/session.mjs 3`, reason kept, list kept sorted.

- [ ] **Step 7: Rewire the session** — in `src/pdf-reader/engine/session.mjs`, make these edits in order. Each "replace"
  quotes the text as it is now; nothing else in the file changes.

  1. The header comment (lines 1–10): keep it, and add after it:

     ```js
     // The session module: the prototype's page script, moved into the extension (the reader's design, §11.2). It runs
     // once, at load, after the page has handed it its host (host.mjs): the two panes, the address's parameters and the
     // sink for its events. What the prototype's header controls did, it now exports as commands; what it wrote into the
     // header, it reports as events (session.d.mts). The controller (../controller.ts) is its only caller.
     ```

  2. Replace the import block and the PDF.js set-up (from `import * as pdfjsLib from './lib/pdf.min.mjs'` through
     `const { EventBus, LinkTarget, PDFLinkService, PDFViewer } = await import('./lib/pdf_viewer.mjs')`) with:

     ```js
     import { createPdfStore } from '@/cache/pdf-store'
     import { isCurrent } from '@/cache/pdf-record'
     import { lookOf } from '@/config/appearance'
     import { toBcp47 } from '@/config/languages'
     import { isTranslatable, linesToBoxes } from '@/core/image/boxes'
     import { appearanceRule } from '@/core/renderer/style-preset'
     import { renderImage, setImageModes } from '@/core/renderer/image'
     import { sendMessage } from '@/shared/messages'
     import { createSurfaceConfig } from '@/shared/surface-config'
     import { ocrCall } from '../ocr'
     import { ASSETS, EventBus, LinkTarget, PDFLinkService, PDFViewer, pdfjsLib } from '../pdfjs'
     import { anchorUnits, boundsFromMarks, markWords, tokenizeDocument } from './anchors.mjs'
     import { decideWrite, digestOf, figureKeyOf, knownMarks, seedFrom, sourceHash, unitsOf } from './cache.mjs'
     import { openEngine, paperContext } from './engine.mjs'
     import { blockWire, figureLabels, figureRegions, splitBlock, vectorLines } from './figures.mjs'
     import { hostReady } from './host.mjs'
     import { openPaper, PIPELINE_VERSION, runLive } from './live.mjs'
     import { isName, plainSource, WIRE } from './mt.mjs'
     import { verified, VERIFIED } from './scripts.mjs'
     import { flowChain, knots, lineTable, makeMap } from './sync.mjs'
     import { unpackSource } from './tar.mjs'
     ```

  3. Replace

     ```js
     const PAPERS = ['2608.04322', '2608.00055']
     const params = new URLSearchParams(location.search)
     const paper = params.get('paper') ?? PAPERS[0]
     ```

     with

     ```js
     const host = await hostReady
     const { params } = host
     const paper = params.get('paper') ?? ''
     ```

  4. Replace

     ```js
     const status = text => { $('status').textContent = text }
     ```

     with

     ```js
     /** the developer's status line, for the probes (window.__reader.status) and the log; the interface does not show it */
     const status = text => { window.__reader.status = text; host.emit({ type: 'status', text }) }
     ```

     and delete the line `const $ = id => document.getElementById(id)`.

  5. Delete everything from `for (const p of PAPERS.includes(paper) ? PAPERS : [...PAPERS, paper]) $('paper').append(…)`
     through `$('paper').hidden = $('progressive').parentElement.hidden = !DEMO` (the paper menu, the link form and the
     progressive switch: the page is opened with its paper in its address).

  6. Delete the line `const LANGUAGES = Object.keys(LANG_CODE_TO_LOCALE_NAME).filter(code => verified(toBcp47(code)))`
     and the comment above it (the language menu goes; Part 3's comes from the controller).

  7. In `showMode()`, replace

     ```js
       for (const b of $('modes').children) b.setAttribute('aria-checked', String(b.dataset.mode === mode))
     ```

     with

     ```js
       host.emit({ type: 'display', mode })
     ```

     (the attribute on `<html>` stays: the layout must change before `relayout`'s next frame).

  8. Delete the `unreadable` helper (`const unreadable = why => (…)`) and its comment. In `showSettings()`, replace the
     lines from `const target = config.targetLanguage, look = config.appearance` through
     `$('notice').textContent = $('notice').title = why ? … : ''` (the two menus, the comment and the notice) with:

     ```js
       // the defaults are in effect — the service and its key set on the settings page are not — until they are repaired there
       host.emit({ type: 'notice', why: surface.state().fallbackReason ?? null })
     ```

  9. Delete the `save` helper and the two handlers `$('lang').onchange = …` and `$('band').onchange = …`, with their
     comments; keep `let writes = Promise.resolve()` and its comment (the language change's reload waits on it).

  10. Replace the handler `$('modes').onclick = e => { … }` with:

      ```js
      /** the display chosen: where the reader is read first, on the side still shown (Codex on #297) */
      export function setDisplay(next) {
        if (!MODES.includes(next) || next === mode) return
        const from = mode
        const place = from === 'bilingual' ? null : readingPlace(from === 'original' ? left : right)
        window.__reader.place = place
        mode = next
        showMode()
        void savePrefs({ mode })
        relayout(from, place)
        if (mode !== 'original') wantTranslation()
      }
      ```

  11. Delete the `EMBEDDED` block (from its comment `// Opened over arXiv's PDF page …` through the closing `}` of
      `if (EMBEDDED) { … }`): the way back is the page's (Task 5).

  12. Replace `const left = makeSide($('left'))` with `const left = makeSide(host.left)` and
      `let right = makeSide($('right'))` with `let right = makeSide(host.right)`.

  13. Delete `const LIB = new URL('./lib/', import.meta.url).href`. In `open()`, replace
      `pdfjsLib.getDocument({ url, cMapUrl: \`${LIB}cmaps/\`, cMapPacked: true, standardFontDataUrl: \`${LIB}standard_fonts/\`, wasmUrl: \`${LIB}wasm/\` })`
      with `pdfjsLib.getDocument({ url, ...ASSETS })`; in `marksOfPdf()`, the same with `{ data: bytes, ...ASSETS }`.

  14. After `const repaintFiguresSoon = …`, add `let figuresOn = true // figure text, the reader's switch (setFigures)`.
      In `paintFigures`, replace `if ($('figures').checked) {` with `if (figuresOn) {`.

  15. Replace the whole `recognise(page, id)` function, the `ocrWorker`, `ocrSeq` and `ocrWaiting` declarations and
      their comments with:

      ```js
      /** a bitmap of the page, by its object id: a copy (PDF.js keeps drawing its own), or null when it is too small to hold text */
      async function bitmapOf(page, id) {
        const obj = await new Promise(resolve => page.objs.get(id, resolve))
        let bitmap
        if (obj?.bitmap) bitmap = await createImageBitmap(obj.bitmap)
        else if (obj?.data) {
          const { width, height, data, kind } = obj, rgba = new Uint8ClampedArray(width * height * 4)
          // PDF.js's kinds: 1 one bit per pixel, 2 RGB, 3 RGBA
          if (kind === 3) rgba.set(data)
          else if (kind === 2) for (let i = 0, j = 0; i < width * height; i++, j += 3) rgba.set([data[j], data[j + 1], data[j + 2], 255], i * 4)
          else return null
          bitmap = await createImageBitmap(new ImageData(rgba, width, height))
        } else return null
        if (bitmap.width < 32 || bitmap.height < 32) { bitmap.close(); return null }
        return bitmap
      }
      /** a bitmap's lines, read by the extension's recogniser through the background, as the HTML page's are (ocr.ts) */
      async function recognise(page, id) {
        const bitmap = await bitmapOf(page, id)
        if (!bitmap) return []
        const reply = await sendMessage({ type: 'axt:ocr', ...(await ocrCall(bitmap, paper)) }).catch(e => ({ ok: false, error: { message: String(e?.message ?? e) } }))
        if (!reply.ok) { console.warn('[ocr]', reply.error.message); return [] }
        return reply.result.lines
      }
      ```

  16. Replace the three lines `$('sync').value = syncMode`, `$('compositor').checked = compositing`,
      `$('compositor').disabled = !CAN_COMPOSIT` and the two handlers `$('compositor').onchange` and
      `$('sync').onchange` with:

      ```js
      /** the follower on the compositor or by script (REPORT, seventeenth addendum) */
      export function setCompositor(on) {
        bake(); stopSpring(); clearTimeout(follow.rest)
        compositing = CAN_COMPOSIT && on
        void savePrefs({ compositor: compositing })
        rebase(); arm()
      }
      /** how the other side follows (REPORT, sixteenth and seventeenth addenda); the interface's switch is same or off */
      export function setSyncMode(next) {
        if (!SYNC_MODES.includes(next)) return
        bake()
        syncMode = next
        void savePrefs({ syncMode })
        stopGlide(); stopSpring(); clearTimeout(settleTimer); clearTimeout(follow.rest)
        rebase(); arm()
      }
      ```

  17. In `attach(side)`, replace the `scalechanging` line's `$('zoom').textContent = \`${Math.round(scale * 100)}%\``
      with `host.emit({ type: 'scale', scale })`, and add after the `pagesinit` lines:

      ```js
        // each side's page, for its pill; a viewer being laid out out of sight (replaceRight's) reports once it is the right
        const reportPage = () => { if (side === left || side === right) host.emit({ type: 'page', side: side === left ? 'left' : 'right', page: side.viewer.currentPageNumber, pages: side.viewer.pagesCount }) }
        side.eventBus.on('pagechanging', reportPage)
        side.eventBus.on('pagesinit', reportPage)
      ```

  18. Replace `$('figures').onchange = repaintFigures` and the two zoom handlers with:

      ```js
      /** figure text on or off */
      export function setFigures(on) { figuresOn = on; repaintFigures() }
      /** the sides shown scaled by a factor, within PDF.js's range */
      export function zoomBy(factor) { for (const s of sides) if (shown(s)) s.viewer.currentScale = Math.min(4, Math.max(0.25, s.viewer.currentScale * factor)) }
      /** the sides shown at a scale or a fit (page-width, page-fit, page-actual) */
      export function zoomTo(value) { for (const s of sides) if (shown(s)) s.viewer.currentScaleValue = String(value) }
      /** a side at a page */
      export function goToPage(which, page) { const s = which === 'left' ? left : right; if (s.doc) s.viewer.currentPageNumber = page }
      ```

  19. In `replaceRight`, after `invalidate(); paint(right)`, add:

      ```js
        // the right is a new viewer: its page and page count, not the old one's
        host.emit({ type: 'page', side: 'right', page: right.viewer.currentPageNumber, pages: right.viewer.pagesCount })
      ```

  20. In `live()`, at the start of `note`'s body, add
      `host.emit({ type: 'note', event, data, got, total, lost, again })` — before `L.events.push(…)` —; and move the
      counters' update so that the event carries the counts after this step: the line
      `if (event === 'translated') { got = data.total; if (data.how?.lost) { lost += data.how.lost; lostWhy = data.how.error } }`
      goes first in `note`, the `emit` right after it. Change `fail` to `const fail = (event, text, kind) => {` and add
      `host.emit({ type: 'fail', event, text, kind })` as its first line. Give the kinds a reader can be told of:
      `fail('fetch failed', …)` in both places takes `'network'` as a third argument; the `no engine` failure passes
      `e?.kind ?? 'unknown'`.

  21. In `demo()`, replace `const base = new URL(\`./papers/${paper}/\`, import.meta.url).href` with
      `const base = new URL(\`/pdf-reader/papers/${paper}/\`, location.href).href` (the demo papers are staged there by
      the probes' launcher), and after `window.__reader.debug = harness()` add:

      ```js
        // a demo is a translation already made: final, on screen
        for (const event of ['shown final', 'done']) host.emit({ type: 'note', event, data: { demo: true }, got: units.length, total: units.length, lost: 0, again: false })
      ```

  22. Replace the last three lines (`if (params.get('live') === '1') await live()` …) with:

      ```js
      /** the run: live, a demo, or nothing without a paper; a crash is a failure the controller hears of */
      export const run = (params.get('live') === '1' ? live() : DEMO ? demo() : Promise.resolve().then(() => { status('no paper'); window.__reader.ready = true }))
        .catch(e => { console.error('[reader]', e); host.emit({ type: 'fail', event: 'crashed', text: String(e?.message ?? e) }) })
      ```

- [ ] **Step 8: Check the session has no page script left**

```bash
grep -nF '$(' src/pdf-reader/engine/session.mjs; grep -n "import.meta.url\|lib/axt\|LIB}" src/pdf-reader/engine/session.mjs; grep -n "save(" src/pdf-reader/engine/session.mjs
```

Expected: no output from any of the three.

- [ ] **Step 9: The gate** (the session is not bundled yet; Task 5 loads it). The English gate and the boundary gate
  read git's index, so the files go in first:

```bash
git add src/pdf-reader/ocr.ts tests/pdf-reader/ocr.test.ts src/pdf-reader/engine/host.mjs src/pdf-reader/engine/host.d.mts src/pdf-reader/engine/session.d.mts src/pdf-reader/engine/session.mjs scripts/english-allowlist.txt
pnpm typecheck && pnpm lint && pnpm test
```

Expected: exit 0; `tests/pdf-reader/ocr.test.ts` passes with the rest. If the English gate says the session now holds
fewer lines with CJK than its entry grants (a deleted line held one), lower the entry to the count it names, and add
the list again.

- [ ] **Step 10: Commit**

```bash
git commit -F - <<'EOF'
refactor(pdf-reader): the page script becomes the engine's session module

reader.js moves to src/pdf-reader/engine/session.mjs and runs at load as
before, once the page has handed it its panes, parameters and event sink
(host.mjs). What its header controls did it exports as commands; what it
wrote into the header it reports as events (session.d.mts). A figure's
bitmap is read by the extension's recogniser through the background, as on
the HTML page (ocr.ts), so the package keeps one recogniser.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 4: the controller

**Files:**
- Create: `src/pdf-reader/controller.ts`
- Test: `tests/pdf-reader/controller.test.ts`

**Interfaces:**
- Consumes: `SessionEvent`, `SessionHost`, `EngineDisplay`, the session's command names (Task 3's `session.d.mts`).
- Produces (Parts 2–5 build on these; the names are fixed here):

```ts
export type Display = 'original' | 'bilingual' | 'translation'
export type Side = 'left' | 'right'
export type Phase = 'loading' | 'translating' | 'retranslating' | 'ready' | 'failed'
export interface ReaderState {
  display: Display
  available: boolean            // false: the paper cannot be had as a bilingual PDF (§8)
  phase: Phase
  progress: number              // 0–1
  failedUnits: number           // the notice's {n}
  failure: string | null        // the chain's error kind when nothing could be translated
  languageSupported: boolean
  finalReady: boolean           // 译文 PDF can be downloaded
  scale: number
  sides: Record<Side, { page: number; pages: number }>
  settingsUnreadable: boolean
}
export const INITIAL: ReaderState
export function reduce(state: ReaderState, event: SessionEvent): ReaderState
export type Session = Pick<typeof import('./engine/session.mjs'), 'setDisplay' | 'setSyncMode' | 'setCompositor' | 'setFigures' | 'zoomBy' | 'zoomTo' | 'goToPage'>
export interface ReaderController {
  getState(): ReaderState
  subscribe(listener: () => void): () => void
  attach(panes: { left: HTMLElement; right: HTMLElement }): Promise<Session>
  setDisplay(display: Display): void
  setSync(on: boolean): void
  setFigures(on: boolean): void
  zoomBy(factor: number): void
  zoomTo(value: number | 'page-width' | 'page-fit' | 'page-actual'): void
  goToPage(side: Side, page: number): void
}
export function createController(options: { open: (host: SessionHost) => Promise<Session>; params: URLSearchParams }): ReaderController
```

- [ ] **Step 1: The failing tests** — create `tests/pdf-reader/controller.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createController, INITIAL, reduce, type Session } from '@/pdf-reader/controller'
import type { SessionEvent, SessionHost } from '@/pdf-reader/engine/session.mjs'

const note = (event: string, counts: Partial<{ got: number; total: number; lost: number; again: boolean }> = {}): SessionEvent => ({ type: 'note', event, data: {}, got: 0, total: 0, lost: 0, again: false, ...counts })
const fold = (events: SessionEvent[], from = INITIAL) => events.reduce(reduce, from)

describe('reduce: the session events folded into the reader state', () => {
  it('follows the display, the scale and each side\'s page', () => {
    const state = fold([{ type: 'display', mode: 'bilingual' }, { type: 'scale', scale: 1.3 }, { type: 'page', side: 'right', page: 4, pages: 26 }])
    expect(state.display).toBe('bilingual')
    expect(state.scale).toBe(1.3)
    expect(state.sides).toEqual({ left: { page: 1, pages: 0 }, right: { page: 4, pages: 26 } })
  })

  it('is ready once the original is open, when the original alone is shown', () => {
    expect(fold([{ type: 'display', mode: 'original' }, note('opened')]).phase).toBe('ready')
    expect(fold([{ type: 'display', mode: 'bilingual' }, note('opened')]).phase).toBe('loading')
  })

  it('counts the translation\'s progress and the paragraphs the service failed on', () => {
    const state = fold([note('digest'), note('source', { total: 40 }), note('translated', { got: 10, total: 40, lost: 2 })])
    expect(state.phase).toBe('translating')
    expect(state.progress).toBeCloseTo(0.25)
    expect(state.failedUnits).toBe(2)
  })

  it('says translating again when this machine\'s copy is being made again', () => {
    expect(fold([note('cache hit'), note('shown cached'), note('translated', { got: 1, total: 4, again: true })]).phase).toBe('retranslating')
  })

  it('has the final ready once it is on screen, or once a current copy is', () => {
    expect(fold([note('translated', { got: 4, total: 4 }), note('shown final'), note('done', { got: 4, total: 4 })])).toMatchObject({ phase: 'ready', finalReady: true, progress: 1 })
    expect(fold([note('digest'), note('cache hit'), note('shown cached'), note('cache current')])).toMatchObject({ phase: 'ready', finalReady: true })
  })

  it('tells a paper that cannot be had from a language not supported from a failure', () => {
    expect(fold([{ type: 'fail', event: 'no source', text: '' }])).toMatchObject({ available: false, phase: 'ready', failure: null })
    expect(fold([{ type: 'fail', event: 'not verified', text: '' }])).toMatchObject({ languageSupported: false, phase: 'ready', failure: null })
    expect(fold([{ type: 'fail', event: 'no engine', text: '', kind: 'no-key' }])).toMatchObject({ phase: 'failed', failure: 'no-key' })
    expect(fold([{ type: 'fail', event: 'crashed', text: '' }])).toMatchObject({ phase: 'failed', failure: 'unknown' })
  })

  it('knows when the extension\'s settings could not be read', () => {
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }]).settingsUnreadable).toBe(true)
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }, { type: 'notice', why: null }]).settingsUnreadable).toBe(false)
  })

  it('keeps the same state object for an event that changes nothing', () => {
    expect(reduce(INITIAL, { type: 'status', text: 'opening…' })).toBe(INITIAL)
  })
})

const fakeSession = (): Session => ({ setDisplay: vi.fn(), setSyncMode: vi.fn(), setCompositor: vi.fn(), setFigures: vi.fn(), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn() })
const panes = () => ({ left: document.createElement('div'), right: document.createElement('div') })

describe('createController', () => {
  it('opens the session once, whatever the number of attaches, and tells its listeners of each change', async () => {
    const session = fakeSession()
    const open = vi.fn(async (host: SessionHost) => { host.emit({ type: 'display', mode: 'translation' }); return session })
    const controller = createController({ open, params: new URLSearchParams('paper=2608.02163') })
    const heard = vi.fn()
    controller.subscribe(heard)
    const p = panes()
    await Promise.all([controller.attach(p), controller.attach(p)])
    expect(open).toHaveBeenCalledOnce()
    expect(open.mock.calls[0]![0]).toMatchObject({ left: p.left, right: p.right })
    expect(open.mock.calls[0]![0].params.get('paper')).toBe('2608.02163')
    expect(controller.getState().display).toBe('translation')
    expect(heard).toHaveBeenCalledOnce()
  })

  it('carries out a command given while the session is still opening, once it is open', async () => {
    const session = fakeSession()
    let resolve!: (s: Session) => void
    const controller = createController({ open: () => new Promise<Session>(r => { resolve = r }), params: new URLSearchParams() })
    const attached = controller.attach(panes())
    controller.setDisplay('bilingual')
    controller.setSync(true)
    controller.setSync(false)
    expect(session.setDisplay).not.toHaveBeenCalled()
    resolve(session)
    await attached
    await Promise.resolve()
    expect(session.setDisplay).toHaveBeenCalledWith('bilingual')
    expect(vi.mocked(session.setSyncMode).mock.calls).toEqual([['same'], ['off']])
  })

  it('stops telling a listener that unsubscribed', async () => {
    const controller = createController({ open: async host => { host.emit({ type: 'scale', scale: 2 }); return fakeSession() }, params: new URLSearchParams() })
    const heard = vi.fn()
    controller.subscribe(heard)()
    await controller.attach(panes())
    expect(heard).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm vitest run tests/pdf-reader/controller.test.ts
```

Expected: FAIL, `Failed to resolve import "@/pdf-reader/controller"`.

- [ ] **Step 3: The controller** — create `src/pdf-reader/controller.ts`:

```ts
// The one boundary between the reader's engine and its interface (the reader's design, §11.3): the session's events
// folded into a state the interface subscribes to, and the interface's commands passed on to the session. pdfslick's
// per-viewer store, adopted: the engine's events drive the store, and nothing reads the viewers back
import type { EngineDisplay, SessionEvent, SessionHost } from './engine/session.mjs'
import type * as SessionModule from './engine/session.mjs'

export type Display = EngineDisplay
export type Side = 'left' | 'right'
export type Phase = 'loading' | 'translating' | 'retranslating' | 'ready' | 'failed'

export interface ReaderState {
  display: Display
  /** false: the paper cannot be had as a bilingual PDF (the design, §8): 对照 and 译文 greyed, the original shown */
  available: boolean
  phase: Phase
  /** 0–1, the share of the paper's paragraphs translated */
  progress: number
  /** the paragraphs the service failed on: the notice's {n} */
  failedUnits: number
  /** why nothing could be translated, as the chain's error kind (the popup's REASON); null otherwise */
  failure: string | null
  languageSupported: boolean
  /** the final translation is on screen: 译文 PDF can be downloaded */
  finalReady: boolean
  scale: number
  sides: Record<Side, { page: number; pages: number }>
  /** the extension's settings could not be read, and their defaults are in use */
  settingsUnreadable: boolean
}

export const INITIAL: ReaderState = {
  display: 'original',
  available: true,
  phase: 'loading',
  progress: 0,
  failedUnits: 0,
  failure: null,
  languageSupported: true,
  finalReady: false,
  scale: 1,
  sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } },
  settingsUnreadable: false,
}

/** the session's commands the controller passes on */
export type Session = Pick<typeof SessionModule, 'setDisplay' | 'setSyncMode' | 'setCompositor' | 'setFigures' | 'zoomBy' | 'zoomTo' | 'goToPage'>

/** the runs that end without a translation because of the paper, or of the language: not failures a reader can retry */
const CANNOT_BE_HAD = new Set(['no source'])
const NOT_SUPPORTED = new Set(['not verified'])
/** the steps of a run that mean a translation is being made (live.mjs and session.mjs note) */
const MAKING = new Set(['digest', 'source', 'anchored', 'translated', 'preview', 'shown preview', 'final'])

/** one event folded into the state; the same object when nothing changed, so that no listener hears of it */
export function reduce(state: ReaderState, event: SessionEvent): ReaderState {
  switch (event.type) {
    case 'display':
      return event.mode === state.display ? state : { ...state, display: event.mode }
    case 'scale':
      return event.scale === state.scale ? state : { ...state, scale: event.scale }
    case 'page':
      return { ...state, sides: { ...state.sides, [event.side]: { page: event.page, pages: event.pages } } }
    case 'notice':
      return (event.why != null) === state.settingsUnreadable ? state : { ...state, settingsUnreadable: event.why != null }
    case 'fail':
      if (CANNOT_BE_HAD.has(event.event)) return { ...state, available: false, phase: 'ready' }
      if (NOT_SUPPORTED.has(event.event)) return { ...state, languageSupported: false, phase: 'ready' }
      return { ...state, phase: 'failed', failure: event.kind ?? 'unknown' }
    case 'note': {
      const progress = event.total ? Math.min(1, event.got / event.total) : state.progress
      if (event.event === 'opened') return state.display === 'original' ? { ...state, phase: 'ready' } : state
      if (event.event === 'cache current') return { ...state, phase: 'ready', finalReady: true, progress: 1 }
      if (event.event === 'shown cached') return { ...state, finalReady: true }
      if (event.event === 'shown final') return { ...state, finalReady: true, progress: 1 }
      if (event.event === 'done') return { ...state, phase: state.phase === 'failed' ? 'failed' : 'ready', failedUnits: event.lost }
      if (MAKING.has(event.event)) return { ...state, phase: event.again ? 'retranslating' : 'translating', progress, failedUnits: event.lost }
      return state
    }
    default:
      return state
  }
}

export interface ReaderController {
  getState(): ReaderState
  subscribe(listener: () => void): () => void
  /** the panes drawn: the session opened in them, once however often this is called */
  attach(panes: { left: HTMLElement; right: HTMLElement }): Promise<Session>
  setDisplay(display: Display): void
  setSync(on: boolean): void
  setFigures(on: boolean): void
  zoomBy(factor: number): void
  zoomTo(value: number | 'page-width' | 'page-fit' | 'page-actual'): void
  goToPage(side: Side, page: number): void
}

export function createController({ open, params }: { open: (host: SessionHost) => Promise<Session>; params: URLSearchParams }): ReaderController {
  let state = INITIAL
  const listeners = new Set<() => void>()
  let session: Promise<Session> | null = null
  const emit = (event: SessionEvent) => {
    const next = reduce(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  /** a command: carried out once the session is open, in the order given (a click while the paper opens is not lost) */
  const later = (act: (s: Session) => void) => void session?.then(act)
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    attach(panes) {
      session ??= open({ ...panes, params, emit })
      return session
    },
    setDisplay: display => later(s => s.setDisplay(display)),
    // the interface's switch is the owner's design or nothing (REPORT, sixteenth addendum): top alignment, or off
    setSync: on => later(s => s.setSyncMode(on ? 'same' : 'off')),
    setFigures: on => later(s => s.setFigures(on)),
    zoomBy: factor => later(s => s.zoomBy(factor)),
    zoomTo: value => later(s => s.zoomTo(value)),
    goToPage: (side, page) => later(s => s.goToPage(side, page)),
  }
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
pnpm vitest run tests/pdf-reader/controller.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: The gate and the commit**

```bash
git add src/pdf-reader/controller.ts tests/pdf-reader/controller.test.ts
pnpm typecheck && pnpm lint && pnpm test
git commit -F - <<'EOF'
feat(pdf-reader): the controller between the engine and the interface

The session's events are folded into ReaderState: the display, the scale,
each side's page, the phase and progress of a run, the paragraphs the
service failed on, and whether the paper or its language cannot be had. The
interface's commands wait for the session to open and go in order.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Expected before the commit: exit 0.

### Task 5: the page

**Files:**
- Create: `src/entrypoints/pdf-reader/index.html`, `main.tsx`, `App.tsx`, `page.css`
- Move: `experiments/pdf-bilingual/poc-reader/reader.css` → `src/pdf-reader/engine/engine.css` (then trimmed)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts`, `src/ui/strings.ts` (the `R` surface, one string)
- Modify: `src/entrypoints/pdf.content.ts` (the frame's address), `wxt.config.ts`, `scripts/check-output.mjs`
- Delete: `experiments/pdf-bilingual/poc-reader/reader.html`, `experiments/pdf-bilingual/shared/*.ts`,
  `experiments/pdf-bilingual/spikes/build-shared.mjs`
- Modify: `experiments/pdf-bilingual/setup.mjs` (no `poc-reader/lib` any more), `experiments/pdf-bilingual/README.md`

**Interfaces:**
- Consumes: `createController`, `ReaderController` (Task 4); `setHost` (Task 3); `R.leave` (this task).
- Produces: `pdf-reader.html` in the build, taking `?paper=<id>` and the probes' parameters (`live`, `mode`, `site`,
  `endpoint`, `src`, `pdf`, `only`, `progressive`, `every`) and `embedded=1` when laid over arXiv's PDF page;
  `window.__reader.controller` and `window.__reader.session` for the probes; the way back is `button[data-leave]`.

- [ ] **Step 1: The failing check** — in `scripts/check-output.mjs`, add before the PDF.js check:

```js
  ['the PDF reader\'s page is built', existsSync(join(OUT, 'pdf-reader.html')), 'pdf-reader.html is missing'],
```

```bash
pnpm build
```

Expected: exit 1, `✗ the PDF reader's page is built: pdf-reader.html is missing`.

- [ ] **Step 2: The reader's first word** — in `src/locales/zh-CN.ts`, above `const REASON`, add:

```ts
/** The PDF reader's words (the reader's design §15; docs/UI.md surface R comes with Part 6) */
const R = {
  leave: '在默认查看器中打开',
}
```

and export it: `export const zh = { S, O, R, REASON } as const`. In `src/locales/en.ts`:

```ts
const R: Locale['R'] = {
  leave: 'Open in the default viewer',
}
```

and `export const en = { S, O, R, REASON }`. In `src/ui/strings.ts`, below the `O` binding:

```ts
/** The PDF reader's words (the reader's design §15) */
export let R: Locale['R'] = current.R
```

and in `setLocale`, after `O = current.O`, add `R = current.R`.

- [ ] **Step 3: The engine's style sheet**

```bash
git mv experiments/pdf-bilingual/poc-reader/reader.css src/pdf-reader/engine/engine.css
```

Trim it to the engine's own rules: keep `:root`'s `--axt-green` (drop `--bar`), `.viewerContainer`, `.axt-hl-layer`,
`.axt-hl`, `.viewerContainer.axt-incoming`, `.axt-fig` and its three child rules, each with its comment. Delete the
header, `#status`, `#notice`, `#modes`, `header select`, `header form…`, `html, body`, `main`, `.pane`, `.pane h2`,
the display rules and `[hidden]`: the page's own go into `page.css` below. Its first comment says it is the engine's
overlays and scrollers, for any page that hosts the session.

- [ ] **Step 4: The page** — create `src/entrypoints/pdf-reader/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/icon/mark-32.png" />
    <!-- Product copy: the name the tab shows; the paper's title replaces it once the interface has one (Part 3) -->
    <title>Read arXiv</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/entrypoints/pdf-reader/page.css`:

```css
/* The reader's page, Part 1: the two panes the engine draws into, the whole window; the interface proper comes with
   Part 3, and its tokens and layout replace this sheet */
html, body { margin: 0; height: 100%; font: 13px system-ui, sans-serif; background: #e9e9ec; color: #222; }
[hidden] { display: none !important; }
main { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; }
.pane { position: relative; min-width: 0; }
/* one document alone: at a reading width, centred (the design's full-width single display is Part 3's) */
html[data-axt-pdf-mode="original"] main, html[data-axt-pdf-mode="translation"] main { grid-template-columns: minmax(0, 1100px); justify-content: center; }
html[data-axt-pdf-mode="original"] .pane:last-child, html[data-axt-pdf-mode="translation"] .pane:first-child { display: none; }
.reader-leave { position: fixed; z-index: 10; inset-block-start: 8px; inset-inline-end: 12px; }
```

`src/entrypoints/pdf-reader/App.tsx`:

```tsx
import { useLayoutEffect, useRef } from 'react'
import type { ReaderController } from '@/pdf-reader/controller'
import { R } from '@/ui/strings'

/**
 * The reader's page, Part 1: the two panes the engine draws into, and, when the reader is laid over arXiv's PDF page,
 * the way back to the browser's viewer (pdf.content.ts takes the frame away on this message)
 */
export function App({ controller, embedded }: { controller: ReaderController; embedded: boolean }) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!left.current || !right.current) return
    void controller.attach({ left: left.current, right: right.current }).then(session => {
      // the probes' hooks (experiments/pdf-bilingual/spikes): beside the session's own on window.__reader
      Object.assign((window as unknown as { __reader: object }).__reader, { controller, session })
    })
  }, [controller])
  return (
    <>
      {embedded && (
        <button type="button" className="reader-leave" data-leave onClick={() => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')}>
          {R.leave}
        </button>
      )}
      <main>
        <section className="pane">
          <div className="viewerContainer" ref={left}>
            <div className="pdfViewer" />
          </div>
        </section>
        <section className="pane">
          <div className="viewerContainer" ref={right}>
            <div className="pdfViewer" />
          </div>
        </section>
      </main>
    </>
  )
}
```

`src/entrypoints/pdf-reader/main.tsx`:

```tsx
import 'pdfjs-dist/web/pdf_viewer.css'
import '@/styles/image.css'
import '@/pdf-reader/engine/engine.css'
import './page.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createController, type Session } from '@/pdf-reader/controller'
import { setHost } from '@/pdf-reader/engine/host.mjs'
import { applyLocale } from '@/ui/apply-locale'
import { App } from './App'

// The pack first, then the first paint: see ui/apply-locale.ts
await applyLocale()
const params = new URLSearchParams(location.search)
// the session runs once, at load: it is loaded only when the panes are there and the host is set (host.mjs)
const open = async (host: Parameters<typeof setHost>[0]): Promise<Session> => {
  setHost(host)
  return import('@/pdf-reader/engine/session.mjs')
}
const controller = createController({ open, params })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} embedded={params.get('embedded') === '1'} />
  </StrictMode>,
)
```

- [ ] **Step 5: The PDF page opens it** — in `src/entrypoints/pdf.content.ts`, `openReader` builds its address as:

```ts
  const url = browser.runtime.getURL(`/pdf-reader.html?${new URLSearchParams({ live: '1', paper: id, embedded: '1' })}` as '/pdf-reader.html')
```

and the `HEAD` check that the page exists goes (it is part of every build now); `openReader` then always shows the
frame and returns `true`. Its comment changes accordingly: the reader is the extension's page `pdf-reader.html`.

- [ ] **Step 6: The build** — in `wxt.config.ts`:
  - delete `PDF_READER`, `pdfReaderFiles()` and their comment; the hook's line becomes
    `files.push(...licenceFiles(), ...pdfjsFiles())`;
  - `web_accessible_resources`' second entry becomes `{ resources: ['pdf-reader.html'], matches: ['https://arxiv.org/*'] }`,
    and the comment above it says: arXiv's PDF page frames the reader's page; what that page loads for itself is asked
    for by the extension's own origin, as the popup's is, and needs no entry;
  - the `host_permissions` comment's last line says the reader's page fetches a paper's source and PDF.

In `scripts/check-output.mjs`, the comment above `const built = …` says that `pdf-reader/` holds PDF.js's data files
(copied by `wxt.config.ts`), not counted by the recogniser's rules.

- [ ] **Step 7: The experiment's old page and shared build go**

```bash
git rm -q experiments/pdf-bilingual/poc-reader/reader.html experiments/pdf-bilingual/shared/extension-entry.ts experiments/pdf-bilingual/shared/figures-entry.ts experiments/pdf-bilingual/shared/ocr-entry.ts experiments/pdf-bilingual/shared/wire-entry.ts experiments/pdf-bilingual/spikes/build-shared.mjs
```

In `experiments/pdf-bilingual/setup.mjs`, delete the steps that fill `poc-reader/lib` (PDF.js, the recogniser's
runtime and models, `build-shared.mjs`) and their comments; keep BusyTeX's. Its header says the reader's page is the
extension's own now (`src/entrypoints/pdf-reader/`) and needs nothing from here. In
`experiments/pdf-bilingual/README.md`, the paragraphs on `poc-reader/` and `lib/` say the same, and how the case
spikes run (`pnpm exec tsx experiments/pdf-bilingual/spikes/<name>.mjs` from the repository root).

```bash
grep -rn "poc-reader/lib\|build-shared\|lib/axt" --include=*.mjs --include=*.ts --include=*.md . | grep -v node_modules | grep -v "^./experiments/pdf-bilingual/REPORT.md"
```

Expected: only spikes that read PDFs in Node with the experiment's own PDF.js (`poc-reader/lib/pdf.min.mjs`); for
each, change the path to `experiments/pdf-bilingual/node_modules/pdfjs-dist/build/pdf.min.mjs` (`../node_modules/…`
from `spikes/`). `REPORT.md` keeps its history as written.

- [ ] **Step 8: The gate** — WXT's generated types learn the new page (`/pdf-reader.html`) from `wxt prepare`, and
  the gates read git's index, so both come first:

```bash
git add src/entrypoints/pdf-reader src/pdf-reader/engine/engine.css src/locales/zh-CN.ts src/locales/en.ts src/ui/strings.ts src/entrypoints/pdf.content.ts wxt.config.ts scripts/check-output.mjs experiments/pdf-bilingual/setup.mjs experiments/pdf-bilingual/README.md experiments/pdf-bilingual/spikes
pnpm exec wxt prepare
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: exit 0, with `✓ the PDF reader's page is built` and `✓ PDF.js's character maps, fonts and decoders are in
the build`; the recogniser's two rules still pass (the reader bundles no runtime and no WebAssembly).

- [ ] **Step 9: Commit**

```bash
git commit -F - <<'EOF'
feat(pdf-reader): the reader is the extension's page pdf-reader.html

A WXT page with React: the two panes the engine draws into and, laid over
arXiv's PDF page, the way back to the browser's viewer. The controller opens
the session when the panes are there. arXiv's PDF page frames the new page;
the experiment's copied page, its lib/ and the shared build go.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 6: the engine's checks on the new page

**Files:**
- Modify: `experiments/pdf-bilingual/spikes/extension.mjs`, `viewer-faults.mjs`, `cache-revisit.mjs`,
  `sync-smoke.mjs`, `sync-frames.mjs`, and any spike reading `#status` or `#notice`
- Modify: `tests/e2e/pdf-entry.mjs`

**Interfaces:**
- Consumes: `pdf-reader.html` and its parameters, `window.__reader.controller`, `window.__reader.session`,
  `window.__reader.status`, `button[data-leave]` (Task 5).

- [ ] **Step 1: The launcher** — in `spikes/extension.mjs`, the existence check becomes
  `existsSync(join(extension, 'pdf-reader.html'))` (its error: no reader in the build — `pnpm build` at the repository
  root), and `base` becomes `` `chrome-extension://${id}/pdf-reader.html` ``. Its header comment says the reader is the
  extension's page; the demo papers are still staged into a copy of the build at `pdf-reader/papers/`.

- [ ] **Step 2: The probes drive the controller, not the prototype's controls**

  - `viewer-faults.mjs`: `const choose = mode => page.click(\`#modes button[data-mode="${mode}"]\`)` becomes
    `const choose = mode => page.evaluate(m => window.__reader.controller.setDisplay(m), mode)`.
  - `cache-revisit.mjs`: `await page.click('#modes button[data-mode="bilingual"]')` becomes
    `await page.evaluate(() => window.__reader.controller.setDisplay('bilingual'))`.
  - `sync-smoke.mjs` and `sync-frames.mjs`: `page.selectOption('#sync', m)` becomes
    `page.evaluate(m => window.__reader.session.setSyncMode(m), m)` (the engine's five modes stay a probe's choice).
  - Every spike that reads `#status` or `#notice`:

    ```bash
    grep -n "'#status'\|\"#status\"\|#notice" experiments/pdf-bilingual/spikes/*.mjs
    ```

    reads `window.__reader.status` instead (the notice: the controller's `getState().settingsUnreadable`).

- [ ] **Step 3: The PDF entry check** — in `tests/e2e/pdf-entry.mjs`, `READER` becomes
  `existsSync(\`${EXT}/pdf-reader.html\`)`, its comment saying the reader is part of every build; in `throughReader`,
  the selector `'#close:not([hidden])'` becomes `'button[data-leave]'`.

- [ ] **Step 4: Run the checks**

Start what they need first: Docker, the TeX Live container, and (for the live runs) the TeX page:

```bash
open -a Docker && until docker info >/dev/null 2>&1; do sleep 2; done && docker start texlive-server
pnpm build
node tests/e2e/pdf-entry.mjs
cd experiments/pdf-bilingual
node spikes/viewer-faults.mjs
node spikes/cache-revisit.mjs
node spikes/cache-faults.mjs
node spikes/sync-frames.mjs
```

Expected: each exits 0 and prints no `✗`; `cache-revisit` reports the revisit shown from this machine's copy with no
compile, as in `REPORT.md`'s eighteenth addendum; `sync-frames` reports the follower within the frame budget, as in the
seventeenth. A check that fails is the move's defect: fix the move, never the check.

- [ ] **Step 5: The gate and the commit**

```bash
cd "$(git rev-parse --show-toplevel)" && pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add tests/e2e/pdf-entry.mjs experiments/pdf-bilingual/spikes
git commit -F - <<'EOF'
test(pdf-reader): the engine's browser checks run on the new page

The launcher opens pdf-reader.html; the probes drive the controller and the
session instead of the prototype's header controls, and read the status from
window.__reader. The PDF entry check leaves through the page's way back.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 7: Part 1's record

**Files:**
- Modify: `experiments/pdf-bilingual/REPORT.md` (a twentieth addendum), this plan (Part 2 appended)

- [ ] **Step 1: The addendum** — `## Twentieth addendum, <date>: the reader in the extension (Part 1) — BUILT`: what
  moved where; the session and its host; OCR through the extension; the controller's state; which checks ran and what
  they printed (the numbers, not "passed"); anything the move found.

- [ ] **Step 2: Part 2's plan** — written against the code as Part 1 left it, appended to this document under
  `# Part 2: shared settings`, in this format, and reviewed with the maintainer before it is executed.

- [ ] **Step 3: Commit**

```bash
git add experiments/pdf-bilingual/REPORT.md experiments/pdf-bilingual/plans/2026-09-25-reader-interface.md
git commit -F - <<'EOF'
docs(experiments): the reader in the extension, Part 1

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

# Part 2: shared settings

Written against the code as Part 1 left it (`acc1e6e7`), and revised after Part 1's final review (the three plan
defects it found: a follow on every landing of the settings, a check built with `new Function`, which the extension's
policy refuses, and the unreadable settings not checked). Its tasks continue Part 1's numbering.

**What changes from the overview.** The `R` locale surface is filled in Part 3, with the components that show its words
— strings nobody renders are dead weight. This part gives the interface one way to read and change the settings: the
session's own surface, the page's only writer, reached through the controller.

**File structure after this part**

| Path | Responsibility |
|---|---|
| `src/config/schema.ts`, `storage.ts`, `revision.ts` | The `pdfReader` group, `CONFIG_VERSION` 19 and its migration; the group classified as not part of the chain |
| `src/pdf-reader/settings.ts` | The display the settings ask for, the settings a display writes, whether figure text shows in a display |
| `src/pdf-reader/engine/session.mjs` | Reads the display, the sync, the highlight and figure text from the settings, writes what the reader chooses, follows changes made elsewhere; the reader's own `axtPdfReader` preferences go |
| `src/pdf-reader/controller.ts` | `ReaderState.settings`; the `patchSettings` command |
| `experiments/pdf-bilingual/spikes/reader-settings.mjs` | The browser check of all of it |

## Part 2 Review Focus

- **A stored `mode` of `'stack'`**: the reader shows the two sides; choosing side by side in the reader leaves
  `'stack'` stored, since that is already a side-by-side choice for the HTML page (§9.1). Pinned in Task 9, and in Task
  10's browser check.
- **Settings the extension cannot read**: every write is refused (`ConfigUnreadableError`); the reader's display still
  changes on screen, the write is dropped with a warning, and nothing throws. Pinned by the session's `save` in Task 10
  and checked there.
- **A change made in another tab**: the reader follows it without writing back, so two readers never echo each other's
  writes. Pinned in Task 10's browser check.
- **A landing that changes nothing the reader shows** — where a link opens set in the popup, a pack looked up, the
  defaults a refused write leaves in effect: the display and the sync stay as they are. Only what changed between the
  settings before and after is followed, and never on a refused write (the surface's `onLanded` says which). Pinned in
  Task 10's browser check.
- **A display this visit holds**: once a failure has put the reader on the original (the translation's side has nothing
  to show), a change of the settings does not take it back to an empty side; a display chosen in the reader does.
- **An address that names a display or a sync mode** (the probes'): it holds for that page, whatever the settings say,
  and is never written. Pinned in Task 10.
- **`CONFIG_VERSION` on another branch**: `next` may reach 19 first. The migration is written so that renumbering it at
  the merge is a one-line change; the pull request says to check.

### Task 8: the PDF reader's settings group

**Files:**
- Modify: `src/config/schema.ts`, `src/config/storage.ts`, `src/config/revision.ts`, `docs/DESIGN.md` (§9)
- Test: `tests/config/storage.test.ts`

**Interfaces:**
- Produces: `Config['pdfReader']: { enabled: boolean; original: boolean; sync: boolean; swapped: boolean; appearance:
  'light' | 'dark' | 'system'; dimPages: boolean }`; `DEFAULT_PDF_READER` exported from `src/config/schema.ts`;
  `CONFIG_VERSION === 19`.

- [ ] **Step 1: The failing test** — in `tests/config/storage.test.ts`, after the test that begins
  `it('v17 put the floating button\'s state into the configuration and v18 takes it out again`, add:

```ts
  it('v19 adds the PDF reader\'s settings with their defaults, and touches nothing else', async () => {
    const v18: Record<string, unknown> = { ...DEFAULT_CONFIG, version: 18, mode: 'only', reading: { sentenceHighlight: false, openIn: 'same-tab' } }
    delete v18.pdfReader
    await fakeBrowser.storage.local.set({ config: v18, config$: { v: 18 } })
    vi.resetModules()
    const fresh = await import('@/config/storage')
    const config = await fresh.getConfig()
    expect(fresh.configFallbackReason()).toBeNull()
    expect(config.version).toBe(CONFIG_VERSION)
    expect(config.pdfReader).toEqual({ enabled: true, original: false, sync: true, swapped: false, appearance: 'system', dimPages: true })
    expect(config.mode).toBe('only')
    expect(config.reading).toEqual({ sentenceHighlight: false, openIn: 'same-tab' })
  })
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm vitest run tests/config/storage.test.ts -t "v19 adds"
```

Expected: FAIL — `config.pdfReader` is `undefined`.

- [ ] **Step 3: The schema** — in `src/config/schema.ts`: `export const CONFIG_VERSION = 19`; above `configSchema`,

```ts
/**
 * The PDF reader's own settings (the reader's design, §9.1; v19): whether arXiv's PDFs open in it; whether it was last
 * left on the original alone (the HTML page's translation-on is its tab's session, not a setting); whether its sides
 * scroll together and are swapped; and its appearance — the extension's pages follow the system, the reader lets its
 * reader choose, and dim the pages in the dark
 */
export const DEFAULT_PDF_READER = { enabled: true, original: false, sync: true, swapped: false, appearance: 'system', dimPages: true } as const
```

in `configSchema`, after `uiLanguage`:

```ts
  /** The PDF reader's own settings (DEFAULT_PDF_READER says what each is) */
  pdfReader: z.object({
    enabled: z.boolean(),
    original: z.boolean(),
    sync: z.boolean(),
    swapped: z.boolean(),
    appearance: z.enum(['light', 'dark', 'system']),
    dimPages: z.boolean(),
  }),
```

and in `DEFAULT_CONFIG`, after `uiLanguage: 'auto',`: `pdfReader: { ...DEFAULT_PDF_READER },`.

- [ ] **Step 4: The migration** — in `src/config/storage.ts`, import `DEFAULT_PDF_READER` beside `DEFAULT_CONFIG`, and
  after the `18:` migration add:

```ts
    // v18 -> v19: the PDF reader's settings (the reader's design, §9.1), with their defaults: until now it kept its own
    // under another key, never released, which is not carried over
    19: (v18: (Omit<Config, 'version' | 'pdfReader'> & { version: 18 }) | null) =>
      typeof v18 !== 'object' || v18 === null ? v18 : { ...v18, version: 19 as const, pdfReader: { ...DEFAULT_PDF_READER } },
```

- [ ] **Step 5: Not the chain's** — in `src/config/revision.ts`, `VOLATILE_CONFIG_FIELDS` gains `'pdfReader'` at its
  end: none of it changes what a service is asked.

- [ ] **Step 6: Run the tests** — the new one, then the whole suite (a test that names the number 18 instead of
  `CONFIG_VERSION` is a finding: make it read `CONFIG_VERSION`)

```bash
pnpm vitest run tests/config/storage.test.ts
pnpm test
```

Expected: PASS, the new test with the rest.

- [ ] **Step 7: The design's record** — in `docs/DESIGN.md` §9, `CONFIG_VERSION = 16` becomes `CONFIG_VERSION = 19`,
  and the paragraph that lists the migrations that transform values gains, at its end: "v19 adds the PDF reader's own
  settings (`pdfReader`: whether it opens arXiv's PDFs, whether it was last left on the original, sync, swapped sides,
  its appearance, dim pages), with their defaults."

- [ ] **Step 8: The gate and the commit**

```bash
git add src/config/schema.ts src/config/storage.ts src/config/revision.ts tests/config/storage.test.ts docs/DESIGN.md
pnpm typecheck && pnpm lint && pnpm test
git commit -F - <<'EOF'
feat(config): the PDF reader's settings, CONFIG_VERSION 19

pdfReader: whether arXiv's PDFs open in the reader, whether it was last left
on the original alone, whether the sides scroll together and are swapped,
its appearance and whether the pages dim in the dark. The migration from 18
adds them with their defaults; none is part of the translation chain.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 9: the settings the reader reads and writes, as functions

**Files:**
- Create: `src/pdf-reader/settings.ts`
- Test: `tests/pdf-reader/settings.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 8), `EngineDisplay` (`session.d.mts`).
- Produces: `displayOf(config: Config): EngineDisplay`; `withDisplay(config: Config, display: EngineDisplay): Config`;
  `figuresShown(config: Config, display: EngineDisplay): boolean`.

- [ ] **Step 1: The failing tests** — create `tests/pdf-reader/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { displayOf, figuresShown, withDisplay } from '@/pdf-reader/settings'

const with_ = (patch: Partial<Config>, reader: Partial<Config['pdfReader']> = {}): Config => ({ ...DEFAULT_CONFIG, ...patch, pdfReader: { ...DEFAULT_CONFIG.pdfReader, ...reader } })

describe('displayOf: the display the shared settings ask for', () => {
  it('is the HTML page\'s mode, side by side or the translation alone, unless the reader was left on the original', () => {
    expect(displayOf(with_({ mode: 'side' }))).toBe('bilingual')
    expect(displayOf(with_({ mode: 'stack' }))).toBe('bilingual')
    expect(displayOf(with_({ mode: 'only' }))).toBe('translation')
    expect(displayOf(with_({ mode: 'only' }, { original: true }))).toBe('original')
  })
})

describe('withDisplay: what a display chosen in the reader writes', () => {
  it('writes the HTML page\'s mode and leaves the original', () => {
    expect(withDisplay(with_({ mode: 'side' }, { original: true }), 'translation')).toMatchObject({ mode: 'only', pdfReader: { original: false } })
    expect(withDisplay(with_({ mode: 'only' }), 'bilingual')).toMatchObject({ mode: 'side', pdfReader: { original: false } })
  })

  it('keeps stacked, already a side-by-side choice for the HTML page', () => {
    expect(withDisplay(with_({ mode: 'stack' }), 'bilingual').mode).toBe('stack')
  })

  it('marks the original and leaves the mode as it was', () => {
    const next = withDisplay(with_({ mode: 'only' }), 'original')
    expect(next.mode).toBe('only')
    expect(next.pdfReader.original).toBe(true)
  })

  it('changes nothing else', () => {
    const before = with_({ mode: 'side', targetLanguage: 'jpn' })
    const after = withDisplay(before, 'translation')
    expect({ ...after, mode: before.mode, pdfReader: before.pdfReader }).toEqual(before)
  })
})

describe('figuresShown: figure text in a display', () => {
  it('follows the switch and the modes ticked, a side-by-side display standing for the HTML page\'s side or stacked mode', () => {
    expect(figuresShown(with_({}), 'bilingual')).toBe(true)
    expect(figuresShown(with_({ image: { enabled: false, modes: ['stack', 'side', 'only'] } }), 'bilingual')).toBe(false)
    expect(figuresShown(with_({ mode: 'side', image: { enabled: true, modes: ['only'] } }), 'bilingual')).toBe(false)
    expect(figuresShown(with_({ mode: 'side', image: { enabled: true, modes: ['only'] } }), 'translation')).toBe(true)
    expect(figuresShown(with_({ mode: 'stack', image: { enabled: true, modes: ['stack'] } }), 'bilingual')).toBe(true)
  })

  it('is off for the original alone, which has no figure text to show', () => {
    expect(figuresShown(with_({}), 'original')).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm vitest run tests/pdf-reader/settings.test.ts
```

Expected: FAIL, `Failed to resolve import "@/pdf-reader/settings"`.

- [ ] **Step 3: The functions** — create `src/pdf-reader/settings.ts`:

```ts
// The reader's settings are the extension's (the reader's design, §3, §9.1): these say which display they ask for,
// what a display chosen in the reader writes back, and whether figure text shows in a display
import type { Config } from '@/config/schema'
import type { EngineDisplay } from './engine/session.mjs'

/** the display the settings ask for: the HTML page's mode, unless the reader was last left on the original alone */
export function displayOf(config: Config): EngineDisplay {
  if (config.pdfReader.original) return 'original'
  return config.mode === 'only' ? 'translation' : 'bilingual'
}

/** the HTML page's mode a translated display stands for: stacked stays stacked, a side-by-side choice already */
function modeOf(config: Config, display: Exclude<EngineDisplay, 'original'>): Config['mode'] {
  if (display === 'translation') return 'only'
  return config.mode === 'stack' ? 'stack' : 'side'
}

/** the settings a display chosen in the reader writes: the original is marked; a translated display is the mode */
export function withDisplay(config: Config, display: EngineDisplay): Config {
  if (display === 'original') return { ...config, pdfReader: { ...config.pdfReader, original: true } }
  return { ...config, mode: modeOf(config, display), pdfReader: { ...config.pdfReader, original: false } }
}

/** figure text in a display: the switch on, and the display's mode among the modes ticked (as on the HTML page) */
export function figuresShown(config: Config, display: EngineDisplay): boolean {
  if (display === 'original' || !config.image.enabled) return false
  return config.image.modes.includes(modeOf(config, display))
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
pnpm vitest run tests/pdf-reader/settings.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: The gate and the commit**

```bash
git add src/pdf-reader/settings.ts tests/pdf-reader/settings.test.ts
pnpm typecheck && pnpm lint && pnpm test
git commit -F - <<'EOF'
feat(pdf-reader): the display and figure text, read from the shared settings

The display the settings ask for is the HTML page's mode unless the reader
was last left on the original; a display chosen in the reader writes the
mode back, stacked kept as stacked. Figure text follows the image switch and
the modes ticked, as on the HTML page.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 10: the session follows the shared settings, and writes what the reader chooses

**Files:**
- Modify: `src/pdf-reader/engine/session.mjs`, `session.d.mts`, `src/pdf-reader/controller.ts`
- Test: `tests/pdf-reader/controller.test.ts`
- Create: `experiments/pdf-bilingual/spikes/reader-settings.mjs`

**Interfaces:**
- Consumes: `displayOf`, `withDisplay`, `figuresShown` (Task 9); `Config['pdfReader']` (Task 8).
- Produces: the session's `patchSettings(change: (latest: Config) => Config): void` and its event
  `{ type: 'settings'; config: Config }`; `ReaderState.settings: Config | null`; the controller's
  `patchSettings(change)`. The address's `mode`, `sync` and `compositor=0` fix those for a probe's page. The session
  follows a landing of the settings through the surface's `onLanded(config, from)` (`shared/surface-config.ts`,
  `Landing`), comparing it with the settings before.

- [ ] **Step 1: The failing tests** — in `tests/pdf-reader/controller.test.ts`, import `DEFAULT_CONFIG` from
  `@/config/schema`, add `patchSettings: vi.fn()` to `fakeSession()`, and add:

```ts
  it('holds the settings the session read', () => {
    expect(INITIAL.settings).toBeNull()
    expect(fold([{ type: 'settings', config: DEFAULT_CONFIG }]).settings).toBe(DEFAULT_CONFIG)
  })
```

  inside `describe('reduce: …')`, and inside `describe('createController', …)`:

```ts
  it('passes a change of the settings to the session, once it is open', async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, params: new URLSearchParams() })
    const change = (c: typeof DEFAULT_CONFIG) => ({ ...c, mode: 'only' as const })
    controller.patchSettings(change)
    await controller.attach(panes())
    controller.patchSettings(change)
    await Promise.resolve()
    expect(session.patchSettings).toHaveBeenCalledOnce()
    expect(session.patchSettings).toHaveBeenCalledWith(change)
  })
```

  (the first call, before `attach`, has no session to wait for and is dropped, as any command is).

```bash
pnpm vitest run tests/pdf-reader/controller.test.ts
```

Expected: FAIL — `settings` is not in `INITIAL`, `patchSettings` is not a function.

- [ ] **Step 2: The session's types** — in `session.d.mts`, add `import type { Config } from '@/config/schema'` at the
  top, `| { type: 'settings'; config: Config }` to `SessionEvent` (with the comment: the extension's settings, each
  time they land), and `export declare function patchSettings(change: (latest: Config) => Config): void`.

- [ ] **Step 3: The controller** — in `src/pdf-reader/controller.ts`:
  - import `type Config` from `@/config/schema`;
  - `ReaderState` gains `/** the extension's settings as they last landed; null before the first read */ settings: Config | null`, and `INITIAL` gains `settings: null`;
  - `reduce` gains `case 'settings': return event.config === state.settings ? state : { ...state, settings: event.config }`;
  - `Session` picks `'patchSettings'` too; `ReaderController` gains
    `/** a change of the extension's settings, on top of what storage holds when its turn comes */ patchSettings(change: (latest: Config) => Config): void`,
    and `createController` returns `patchSettings: change => later(s => s.patchSettings(change))`.

```bash
pnpm vitest run tests/pdf-reader/controller.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 4: The session reads and writes the settings** — in `src/pdf-reader/engine/session.mjs`:

  1. Imports: add `import { localeStale } from '@/ui/use-surface-config'` and
     `import { displayOf, figuresShown, withDisplay } from '../settings'`.
  2. Replace the whole section from `// ---------------------------------------------------------------- the extension's settings, and the display`
     through the closing `}` of `export function setDisplay(next) { … }` with:

     ```js
     // ---------------------------------------------------------------- the extension's settings, and the display
     // The reader's settings are the extension's (the reader's design, §3, §9.1), read and written as its popup and
     // settings page do and followed as they change there: the display — the HTML page's mode, and whether the reader
     // was last left on the original alone, where nothing is translated or compiled until a translation is shown —, the
     // sync, the highlight, figure text and the target language. The page has one writer, this surface: the interface
     // writes through the controller (patchSettings).
     const MODES = ['original', 'translation', 'bilingual']
     // The extension's settings as its popup and settings page have them (shared/surface-config.ts): each change a patch
     // on what storage holds when its turn comes, one after another, and a configuration that could not be read said so
     // (Codex on #297); a new interface language reloads the page, as it does the popup
     /** the settings as they last landed; null until the first read */
     let config = null
     const surface = createSurfaceConfig({ localeStale, reload: () => location.reload(), onLanded: (next, from) => landed(next, from) })
     await new Promise(resolve => { const off = surface.subscribe(() => { if (surface.state().config) { off(); resolve() } }); surface.start() })
     config = surface.state().config
     /** the display: the one the address names (a probe's page), else the one the settings ask for */
     let mode = MODES.includes(params.get('mode')) ? params.get('mode') : displayOf(config)
     function showMode() {
       document.documentElement.setAttribute('data-axt-pdf-mode', mode)
       host.emit({ type: 'display', mode })
     }
     showMode()
     function showSettings() {
       let sheet = document.getElementById('axt-look')
       if (!sheet) { sheet = document.createElement('style'); sheet.id = 'axt-look'; document.head.append(sheet) }
       sheet.textContent = appearanceRule(lookOf(config))
       host.emit({ type: 'settings', config })
       // the defaults are in effect — the service and its key set on the settings page are not — until they are repaired there
       host.emit({ type: 'notice', why: surface.state().fallbackReason ?? null })
     }
     showSettings()
     /** this page's writes of the settings, one after another; a new language's reload waits for them. A write the store
      *  refuses (its stored value cannot be read, config/storage.ts) is dropped: what the reader chose still holds on screen */
     let writes = Promise.resolve()
     const save = change => (writes = writes.then(() => surface.patch(change)).catch(e => console.warn('[settings]', e?.message ?? e)))
     /** a change of the settings from the interface (the controller's patchSettings) */
     export function patchSettings(change) { void save(change) }
     /** true once the translation has started: a new language then means another document, and the page starts again */
     let translating = false
     /** the viewers exist: until then the settings are read as the viewers are made, and there is nothing to follow */
     let viewersMade = false
     /** the display this visit holds whatever the settings say: the original, once the translation's side had nothing to
      *  show (fail); a display chosen in the reader lets it go */
     let held = null
     /** settings that landed (shared/surface-config.ts Landing): shown, and what changed followed. A refused write lands
      *  the defaults, which the reader's own choices on screen outlive (final review) */
     function landed(next, from) {
       if (!config || from === 'first') return
       const prev = config
       config = next
       showSettings()
       if (next.targetLanguage !== prev.targetLanguage && translating) void writes.then(() => location.reload())
       else if (viewersMade && from !== 'refused') followSettings(prev)
     }
     let wantTranslation = null
     const translationWanted = new Promise(resolve => { wantTranslation = resolve })
     if (mode !== 'original') wantTranslation()
     /** the display changed: where the reader is read first, on the side still shown (Codex on #297); written when the
      *  reader chose it here, not when it follows the settings */
     function changeDisplay(next, write) {
       if (!MODES.includes(next) || next === mode) return
       const from = mode
       const place = from === 'bilingual' ? null : readingPlace(from === 'original' ? left : right)
       window.__reader.place = place
       mode = next
       showMode()
       if (write) void save(c => withDisplay(c, mode))
       relayout(from, place)
       followFigures()
       if (mode !== 'original') wantTranslation()
     }
     /** the display chosen in the reader */
     export function setDisplay(next) { held = null; changeDisplay(next, true) }
     /** the settings changed elsewhere — the popup, the settings page, another reader — or here: what changed of the
      *  display and the sync is followed, the highlight and figure text as they now are; what the address names, and a
      *  display this visit holds, stay (final review: a follow on every landing flipped them back) */
     function followSettings(prev) {
       if (!params.has('mode') && !held && displayOf(config) !== displayOf(prev)) changeDisplay(displayOf(config), false)
       const sync = config.pdfReader.sync ? 'same' : 'off'
       if (!params.has('sync') && config.pdfReader.sync !== prev.pdfReader.sync && (syncMode === 'same' || syncMode === 'off') && sync !== syncMode) applySync(sync)
       if (!config.reading.sentenceHighlight) light(null)
       followFigures()
     }
     ```

  3. Replace `let figuresOn = true // figure text, the reader's switch (setFigures)` with
     `let figuresOn = figuresShown(config, mode) // figure text, as the settings say for this display (followFigures)`,
     and add below it:

     ```js
     /** figure text shown or not, as the settings say for the display now shown */
     function followFigures() { const on = figuresShown(config, mode); if (on !== figuresOn) { figuresOn = on; repaintFigures() } }
     ```

  4. In `light(id)`, make its first line `if (!config.reading.sentenceHighlight) id = null // the highlight is off in the settings`.

  5. Replace `let compositing = CAN_COMPOSIT && prefs.compositor !== false` with
     `let compositing = CAN_COMPOSIT && params.get('compositor') !== '0' // a probe's page can ask for the follower by script`,
     and `let syncMode = SYNC_MODES.includes(prefs.syncMode) ? prefs.syncMode : 'same'` with
     `let syncMode = SYNC_MODES.includes(params.get('sync')) ? params.get('sync') : config.pdfReader.sync ? 'same' : 'off'`.

  6. In `setCompositor`, delete the line `void savePrefs({ compositor: compositing })` (a probe's switch, not a
     setting). Replace `export function setSyncMode(next) { … }` with:

     ```js
     /** a sync mode in effect, nothing written */
     function applySync(next) {
       bake()
       syncMode = next
       stopGlide(); stopSpring(); clearTimeout(settleTimer); clearTimeout(follow.rest)
       rebase(); arm()
     }
     /** how the other side follows (REPORT, sixteenth and seventeenth addenda): the interface's switch is same or off,
      *  which is written to the settings; a probe's other modes are not */
     export function setSyncMode(next) {
       if (!SYNC_MODES.includes(next)) return
       applySync(next)
       if (next === 'same' || next === 'off') void save(c => ({ ...c, pdfReader: { ...c.pdfReader, sync: next === 'same' } }))
     }
     ```

  7. Replace `export function setFigures(on) { figuresOn = on; repaintFigures() }` with
     `export function setFigures(on) { void save(c => ({ ...c, image: { ...c.image, enabled: on } })) } // figure text on or off, in the settings; followFigures shows it`.

  8. After `for (const side of sides) attach(side)`, add `viewersMade = true`. In `live()`'s `fail`, where the
     Translation display with nothing on its side goes to the original, set `held = 'original'` before `mode = 'original'`.

  9. In `harness`, add `get syncMode() { return syncMode },` beside `get readingLine()` (the browser check reads it).

  Then check nothing of the reader's own preferences is left:

  ```bash
  grep -n "prefs\|savePrefs\|PREFS\|axtPdfReader" src/pdf-reader/engine/session.mjs
  pnpm exec biome lint --only=correctness/noUndeclaredVariables src/pdf-reader/engine/session.mjs 2>&1 | grep "undeclared" | grep -v "The chrome variable"
  ```

  Expected: no output from either.

- [ ] **Step 5: The browser check** — create `experiments/pdf-bilingual/spikes/reader-settings.mjs`:

```js
// The reader and the extension's settings (the reader's design, §3, §9.1), on a demo paper: the display the settings ask
// for is the one it opens in; a display chosen in the reader is written back, stacked kept; another tab's change is
// followed and not written back; the highlight and figure text follow their switches; a probe's address holds.
// Exits non-zero on a failure. Build first; the demo papers made (spikes/reader-papers.mjs).
//   node spikes/reader-settings.mjs
import { launchWithReader } from './extension.mjs'

const paper = '2608.02163'
const { context, readerUrl } = await launchWithReader({ profile: 'reader-settings', demos: true, viewport: { width: 1440, height: 900 } })
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
const open = async (query = {}) => {
  const page = await context.newPage()
  await page.goto(readerUrl({ paper, ...query }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
  return page
}
const state = page => page.evaluate(() => window.__reader.controller.getState())
/**
 * A change of the settings, as a plain object merged in the page one group deep: the extension's policy has no
 * 'unsafe-eval', so no function can be sent (final review)
 */
const patch = (page, change) => page.evaluate(p => window.__reader.controller.patchSettings(c => {
  const out = { ...c }
  for (const [k, v] of Object.entries(p)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
  return out
}), change)
const settle = page => page.waitForTimeout(700)

// the display the settings ask for
const a = await open()
await patch(a, { mode: 'only', pdfReader: { original: false } })
await settle(a)
check('a change of the settings moves the display', (await state(a)).display === 'translation', (await state(a)).display)
const b = await open()
check('a reader opens in the display the settings ask for', (await state(b)).display === 'translation', (await state(b)).display)

// a display chosen in the reader is written back; the other tab follows and writes nothing
await b.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
await settle(b)
const written = (await state(b)).settings
check('choosing side by side writes the side mode', written.mode === 'side' && written.pdfReader.original === false, `${written.mode}, original ${written.pdfReader.original}`)
await settle(a)
check('another reader follows it', (await state(a)).display === 'bilingual', (await state(a)).display)
await b.evaluate(() => window.__reader.controller.setDisplay('original'))
await settle(b)
const orig = (await state(b)).settings
check('choosing the original marks it and keeps the mode', orig.pdfReader.original === true && orig.mode === 'side', `${orig.mode}, original ${orig.pdfReader.original}`)
await patch(b, { mode: 'stack', pdfReader: { original: false } })
await settle(b)
check('stacked shows side by side', (await state(b)).display === 'bilingual', (await state(b)).display)
await patch(b, { mode: 'stack', pdfReader: { original: true } })
await settle(b)
await b.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
await settle(b)
const kept = (await state(b)).settings
check('side by side chosen with stacked stored keeps stacked', kept.mode === 'stack' && !kept.pdfReader.original, `${kept.mode}, original ${kept.pdfReader.original}`)

// the sync follows its setting, and the reader's switch writes it
await patch(b, { pdfReader: { sync: false } })
await settle(b)
check('the sync goes off with its setting', (await b.evaluate(() => window.__reader.debug.syncMode)) === 'off')
await b.evaluate(() => window.__reader.controller.setSync(true))
await settle(b)
check('the reader\'s switch writes it back', (await state(b)).settings.pdfReader.sync === true && (await b.evaluate(() => window.__reader.debug.syncMode)) === 'same')

// the highlight and figure text follow their switches
await patch(b, { reading: { sentenceHighlight: false }, image: { enabled: false } })
await settle(b)
const leftBox = await b.locator('#left').boundingBox()
await b.mouse.move(leftBox.x + leftBox.width * 0.3, leftBox.y + leftBox.height * 0.5)
await b.waitForTimeout(300)
check('no band with the highlight off', (await b.evaluate(() => document.querySelectorAll('.axt-hl').length)) === 0)
await b.waitForTimeout(800)
check('no figure text with the image switch off', (await b.evaluate(() => document.querySelectorAll('.axt-fig').length)) === 0)
await patch(b, { reading: { sentenceHighlight: true }, image: { enabled: true } })
await settle(b)

// an address that names a display writes nothing, and holds it whatever the settings say
const stored = (await state(b)).settings.pdfReader.original
const c = await open({ mode: 'original' })
await settle(c)
check('an address that names a display writes nothing', (await state(c)).settings.pdfReader.original === stored, `stored ${stored}, now ${(await state(c)).settings.pdfReader.original}`)
await patch(c, { mode: 'only', pdfReader: { original: false } })
await settle(c)
check('and holds it whatever the settings say', (await state(c)).display === 'original', (await state(c)).display)

// a change of something the reader does not show leaves the display and the sync as they are
await b.evaluate(() => window.__reader.controller.setDisplay('translation'))
await settle(b)
await patch(a, { reading: { openIn: 'same-tab' } })
await settle(b)
check('a change of nothing it shows leaves the display', (await state(b)).display === 'translation', (await state(b)).display)

// settings the extension cannot read: the display chosen here holds on screen, the writes dropped, nothing thrown
const stored0 = await b.evaluate(() => chrome.storage.local.get('config').then(r => r.config))
const errors = []
b.on('pageerror', e => errors.push(e.message))
await b.evaluate(c => chrome.storage.local.set({ config: { ...c, mode: 'nonsense' } }), stored0)
await settle(b)
check('unreadable settings are known', (await state(b)).settingsUnreadable === true)
await b.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
await settle(b)
check('unreadable settings: the display chosen holds', (await state(b)).display === 'bilingual', (await state(b)).display)
check('unreadable settings: nothing thrown', errors.length === 0, errors.join('; '))
await b.evaluate(c => chrome.storage.local.set({ config: c }), stored0)
await settle(b)
check('repaired settings are known', (await state(b)).settingsUnreadable === false)

console.log(failed ? `${failed} failed` : 'all passed')
await context.close()
process.exit(failed ? 1 : 0)
```

```bash
cd "$(git rev-parse --show-toplevel)" && pnpm build && node experiments/pdf-bilingual/spikes/reader-settings.mjs
```

Expected: `all passed`, exit 0. Then the engine's checks again — the settings changed where the display and the sync
come from:

```bash
node tests/e2e/pdf-entry.mjs
cd experiments/pdf-bilingual && node spikes/viewer-faults.mjs && node spikes/cache-revisit.mjs && node spikes/sync-frames.mjs
```

Expected: 17/17; `all passed` for each probe; the compositor follower 0 frames off.

- [ ] **Step 6: The gate and the commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/pdf-reader/engine/session.mjs src/pdf-reader/engine/session.d.mts src/pdf-reader/controller.ts tests/pdf-reader/controller.test.ts experiments/pdf-bilingual/spikes/reader-settings.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the reader follows the extension's settings

The display, the sync, the highlight and figure text come from the shared
settings and follow changes made elsewhere; what the reader chooses is
written back through the page's one writer, and the interface reaches it
through the controller. A new interface language reloads the page. The
reader's own preferences key goes.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 11: Part 2's record, and Part 3's plan

- [ ] **Step 1:** `REPORT.md`, a twenty-first addendum: what the reader reads and writes, and the browser check's output.
- [ ] **Step 2:** Part 3's plan (the interface), written against the code as Part 2 left it, appended here, and reviewed
  with the maintainer before it is executed.
- [ ] **Step 3:** Commit both.
