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
- ~~**A display this visit holds**: once a failure has put the reader on the original (the translation's side has nothing
  to show), a change of the settings does not take it back to an empty side; a display chosen in the reader does.~~
  Removed in Part 3's Task 23: a failure no longer leaves its display; the card fills the translation's pane.
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

// settings the extension cannot read. A value written elsewhere that cannot be read is not followed (config/storage.ts
// watchConfig passes valid values alone): the reader learns of it when its own write is refused. The display chosen
// then holds on screen, though the defaults refused into effect ask for another; the write is dropped, nothing thrown
const stored0 = await b.evaluate(() => chrome.storage.local.get('config').then(r => r.config))
const errors = []
b.on('pageerror', e => errors.push(e.message))
await b.evaluate(c => chrome.storage.local.set({ config: { ...c, mode: 'nonsense' } }), stored0)
await settle(b)
await b.evaluate(() => window.__reader.controller.setDisplay('original'))
await settle(b)
check('unreadable settings: a refused write says so', (await state(b)).settingsUnreadable === true)
check('unreadable settings: the display chosen holds', (await state(b)).display === 'original', (await state(b)).display)
check('unreadable settings: nothing thrown', errors.length === 0, errors.join('; '))
const d = await open()
check('unreadable settings: a reader opened on them knows at once', (await state(d)).settingsUnreadable === true)
await d.close()
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

---

# Part 3: the interface

Written against the code as Part 2 left it (`26d8f62c`). Its tasks continue the numbering. The spec's sections it
builds: §4 (the visual language), §5 (layout), §6 (components), §7 (interaction), §8 (states), §9.4 (the shared `Menu`),
§10.4's heading level, §11.4–§11.6, §13 (accessibility), §15 (copy).

**What changes from the overview, and why**

1. **Tailwind without Preflight.** The page imports Tailwind's theme and utilities only. Preflight's resets
   (`box-sizing: border-box` everywhere, `display: block` on media, zeroed margins) would reach inside PDF.js's viewers,
   whose layout assumes the browser's defaults; a box-sizing of ours once shifted the highlight off its words
   (2026-09-22). The chrome gets its own small base under one class, `chrome`, and the viewers keep theirs. Task 13's
   browser check pins it: in every page the canvas, the text layer and the highlight layer share one rectangle.
2. **The shared `Menu`'s behaviour becomes a hook, `useMenuNav` (`src/ui/menu-nav.ts`).** The reader has its own
   visual language (§1), so it cannot take the popup's rows as they are; it takes their behaviour. §9.4's fixes (the
   active item announced, Home and End, typing a letter, focus back on the trigger, no buttons inside a listbox) go into
   the hook, and the popup's `Menu` is rebuilt on it: every user gets them.
3. **The service list is shared** (`src/ui/service-items.ts`, moved out of the popup's view model), and the session's
   `settings` event carries the language pack's state with the configuration, since the service list needs both. The
   page keeps one reader and writer of the settings: the session's surface.
4. **重试 reloads the page in this part.** The translations already made come back from the cache and the missing
   paragraphs are asked again, which is what §8 promises; Part 4 replaces the reload with a retry in place, together
   with stopping early (§10.3).
5. **The title** is the PDF's own metadata title; when the PDF carries none, the abstract page's `citation_title`, one
   request to arXiv made only then; a demo paper's, its first heading. With none, the toolbar shows the id alone.
6. **A failure with nothing translated stays in its display, and the card fills the translation's pane** (§8, the card
   "in the translation's pane"). Until now the session left the Translation display for the original, since the pane
   would have been blank (Codex on #297); the card is what now fills it. Part 2's `held` display, which existed only for
   that switch, goes with it, and `viewer-faults.mjs` checks the card instead.
7. **The narrow window** (§5) is measured by the interface and applied by the session (`setNarrow`): the translation
   alone, the display still 对照, the sync idle while one side is shown.
8. **A checkpoint for the maintainer after Task 17**: a test package with the frame, the toolbar and the display
   switch, before the menus and states are built on them.
9. The variants harness (`poc-reader/variants.*`, untracked) is deleted in Task 25, once the page has replaced it.
10. The session's English status line (§11.6: "its status text … goes") stays as `window.__reader.status` for the
    probes, which read it; the interface never shows it, and nothing else emits it.

**File structure after this part**

| Path | Responsibility |
|---|---|
| `src/entrypoints/pdf-reader/reader.css` | The reader's token sheet (§4.1), Tailwind's theme and utilities, the chrome's base, the layout (§5), PDF.js's pages, dark pages, the scroll indicators' timeline, the motion; replaces `page.css` |
| `src/entrypoints/pdf-reader/App.tsx` | The page: the toolbar, the contents, the document area with a pill and an indicator per pane, the capsule, the card |
| `src/pdf-reader/ui/use-reader.ts` | The reader's state for React (`useSyncExternalStore`) |
| `src/pdf-reader/ui/appearance.ts` | The theme and the dimmed pages (§4.3), applied to `<html>` |
| `src/pdf-reader/ui/icons.tsx`, `display-glyphs.ts` | Lucide icons at the reader's weight; the display switch's three icons, the letters' outlines generated |
| `scripts/pdf-reader-glyphs.py` | Generates `display-glyphs.ts` from Noto Sans SC |
| `src/pdf-reader/ui/tip.tsx` | Tooltips: a hint popover anchored to its control |
| `src/pdf-reader/ui/Toolbar.tsx` and its parts | `ToolbarButton`, `DisplaySwitch`, `PaperTitle`, `Zoom`, the menus, `ReadingOptions` |
| `src/pdf-reader/ui/Popover.tsx`, `ReaderMenu.tsx` | An anchored popover; the reader's menu rows on `useMenuNav` |
| `src/pdf-reader/ui/Outline.tsx` | The contents |
| `src/pdf-reader/ui/PagePill.tsx`, `ScrollIndicator.tsx` | One of each per pane |
| `src/pdf-reader/ui/status.ts`, `StatusCapsule.tsx`, `FailureCard.tsx` | §8's table as a function; the capsule; the card |
| `src/pdf-reader/ui/languages.ts` | The nine languages the reader typesets, each by its own name |
| `src/ui/menu-nav.ts`, `src/ui/service-items.ts` | Shared with the popup: a menu's keyboard behaviour; the service list |
| `src/pdf-reader/controller.ts`, `engine/session.mjs` | The paper, the outline, the pack, narrow; the commands `pinch`, `goToHeading`, `lead`, `retry`, `download`, `setNarrow` |
| `src/pdf-reader/engine/latex-front.mjs`, `cache.mjs` | A heading unit keeps its sectioning level (§10.4), in the stored copy too |
| `experiments/pdf-bilingual/spikes/reader-ui.mjs` | The interface in a real browser, grown task by task |

## Part 3 Review Focus

- **An old-style arXiv id** (`hep-th/9711200`): the arXiv link, the title's request and the download's file names all
  take the id with its slash; a file name replaces the slash (`hep-th_9711200.pdf`). Pinned in Task 19's tests.
- **A PDF with no title in its metadata, offline**: the abstract page cannot be read either; the toolbar shows the id
  alone and nothing throws. Pinned in Task 17.
- **A stored copy made before heading levels**: its headings have none; the contents list them flat, every one at the
  first level, never empty. Pinned in Task 21.
- **The display keys typed where text goes**: 1, 2 or 3 in the page number, the language search or any field type
  there; they switch nothing. Pinned in Task 16.
- **Dark pages under the highlight**: the canvas is inverted and the band keeps its colour; the band's `multiply` blend,
  which vanishes over a dark page, becomes `screen` there. Pinned in Task 13's browser check and its screenshot.

### Task 12: the reader's words

**Files:**
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (the `R` surface), `docs/UI.md` (a new §3.5)
- Modify: `scripts/english-allowlist.txt`
- Test: `tests/pdf-reader/ui/copy.test.ts`

**Interfaces:**
- Produces: `R` (`src/ui/strings.ts`, a live binding) with `bar`, `contents`, `abstract`, `display.{name, original,
  bilingual, translation}`, `swap`, `sync`, `zoom.{out, in, value, width, page, actual}`, `options.{name, color,
  appearance, light, dark, system, dim}`, `download.{name, translation, original}`, `leave`, `pill.{original,
  translation, previous, next}`, `status.{loading, translating, again, close, unsupported(language), chooseLanguage,
  narrow}`. The reader takes the popup's own words where §15 marks them reused: `S.rows.language`, `S.rows.service`,
  `S.menu.searchLanguages`, `S.menu.noMatch`, `S.rows.highlight`, `S.rows.images`, `S.settings`, `S.failed.text(n)`,
  `S.failed.retry`, `reasonText(kind)`.

- [ ] **Step 1: The failing test** — create `tests/pdf-reader/ui/copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/locales'

/** every string a pack's R holds, by its path; a function is called with a sample */
function strings(value: unknown, path = 'R'): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') return [[path, String((value as (x: string) => string)('Deutsch'))]]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`))
  return []
}
/** the reader never names a technical path (the reader's design, §1): what a technical reason makes unavailable is greyed */
const TECHNICAL = /\b(la)?tex\b|compil|typeset|engine|provider|pipeline|编译|排版|引擎|服务商|管线/i

describe("the reader's words", () => {
  it('carry the design\'s table (§15)', () => {
    const { R } = LOCALES['zh-CN']
    expect(R.display).toEqual({ name: '显示', original: '原文', bilingual: '对照', translation: '译文' })
    expect(R.status.unsupported('Deutsch')).toBe('PDF 对照暂不支持Deutsch')
    expect(R.status.narrow).toBe('窗口较窄，暂只显示译文')
    expect(LOCALES.en.R.display.bilingual).toBe('Side by side')
  })

  for (const [code, pack] of Object.entries(LOCALES)) {
    it(`are all there in ${code}, none empty`, () => {
      const found = strings(pack.R)
      expect(found.map(([p]) => p)).toEqual(strings(LOCALES['zh-CN'].R).map(([p]) => p))
      for (const [p, s] of found) expect(s.trim(), p).not.toBe('')
    })

    it(`name no technical path in ${code}`, () => {
      for (const [p, s] of strings(pack.R)) expect(s, p).not.toMatch(TECHNICAL)
    })
  }
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm vitest run tests/pdf-reader/ui/copy.test.ts
```

Expected: FAIL — `R.display` is undefined.

- [ ] **Step 3: The words** — in `src/locales/zh-CN.ts`, replace the `R` block with:

```ts
/**
 * The PDF reader's words (the reader's design §15; docs/UI.md §3.5, S-R). Where the popup says the same thing the
 * reader takes the popup's string (S), so the two never drift apart: the service and language rows, the language
 * search, 对照高亮, 图片翻译, 设置, the failures' count and 重试, the reasons
 */
const R = {
  bar: '阅读器', // S-R-01: the toolbar's name, for screen readers
  contents: '目录', // S-R-02
  abstract: '在 arXiv 打开摘要页', // S-R-03
  display: { name: '显示', original: '原文', bilingual: '对照', translation: '译文' }, // S-R-04
  swap: '交换左右', // S-R-05
  sync: '同步滚动', // S-R-06
  zoom: { out: '缩小', in: '放大', value: '缩放比例', width: '适合宽度', page: '适合页面', actual: '实际大小' }, // S-R-07
  options: { name: '阅读选项', color: '高亮颜色', appearance: '外观', light: '浅色', dark: '深色', system: '跟随系统', dim: '深色时调暗页面' }, // S-R-08
  download: { name: '下载', translation: '译文 PDF', original: '原文 PDF' }, // S-R-09
  leave: '在默认查看器中打开', // S-R-10
  pill: { original: '原文页码', translation: '译文页码', previous: '上一页', next: '下一页' }, // S-R-11
  status: {
    loading: '正在加载', // S-R-12
    translating: '正在翻译',
    again: '正在按当前设置重新翻译',
    close: '关闭', // S-R-15: a notice's close button
    unsupported: (language: string) => `PDF 对照暂不支持${language}`, // S-R-13
    chooseLanguage: '选择语言',
    narrow: '窗口较窄，暂只显示译文', // S-R-14, after S-P-74
  },
}
```

  In `src/locales/en.ts`, replace the `R` block with:

```ts
const R: Locale['R'] = {
  bar: 'Reader',
  contents: 'Contents',
  abstract: 'Open the abstract on arXiv',
  display: { name: 'Display', original: 'Original', bilingual: 'Side by side', translation: 'Translation' },
  swap: 'Swap sides',
  sync: 'Sync scrolling',
  zoom: { out: 'Zoom out', in: 'Zoom in', value: 'Zoom', width: 'Fit width', page: 'Fit page', actual: 'Actual size' },
  options: { name: 'Reading options', color: 'Highlight colour', appearance: 'Appearance', light: 'Light', dark: 'Dark', system: 'System', dim: 'Dim pages in dark mode' },
  download: { name: 'Download', translation: 'Translation PDF', original: 'Original PDF' },
  leave: 'Open in the default viewer',
  pill: { original: "Original's page", translation: "Translation's page", previous: 'Previous page', next: 'Next page' },
  status: {
    loading: 'Loading',
    translating: 'Translating',
    again: 'Translating again with the current settings',
    close: 'Close',
    unsupported: (language: string) => `A bilingual PDF isn't available in ${language} yet`,
    chooseLanguage: 'Choose language',
    narrow: 'The window is narrow, so this shows the translation alone for now',
  },
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
pnpm vitest run tests/pdf-reader/ui/copy.test.ts tests/ui/locales.test.ts
```

Expected: PASS.

- [ ] **Step 5: The contract** — in `docs/UI.md`, after §3.4, add:

```markdown
### 3.5 PDF reader (S-R) [decided 2026-09-25, built in the reader's Part 3]

The bilingual PDF reader's own words (the reader's design, `experiments/pdf-bilingual/plans/2026-09-25-reader-interface-design.md`
§15). Where the popup already says the same thing, the reader shows the popup's string: 翻译服务 (S-P-10), 目标语言
(S-P-20), 搜索语言 and 没有匹配的语言 (S-P-22/23), 对照高亮 (S-P-80), 图片翻译 (S-P-85), 设置 (S-P-02), {n} 处翻译失败 and
重试 (S-P-60/61), and the reasons (S-E). No reader-facing string names a technical path (a test checks both packs).

| ID | Where | Copy | Notes |
|---|---|---|---|
| S-R-01 | The toolbar's name | 阅读器 | `aria-label`, for screen readers |
| S-R-02 | Contents toggle, and the sidebar's header | 目录 | Pressed while the sidebar is open |
| S-R-03 | The arXiv id's tooltip | 在 arXiv 打开摘要页 | The id links to the abstract page, in a new tab |
| S-R-04 | The display switch | 显示 · 原文 · 对照 · 译文 | The radio group's name and its three choices, in tooltips and to screen readers; keys 1 2 3 |
| S-R-05 | Swap sides | 交换左右 | 对照 only; greyed in the single displays |
| S-R-06 | Sync scrolling | 同步滚动 | 对照 only; greyed in the single displays |
| S-R-07 | Zoom | 缩小 · 放大 · 缩放比例 · 适合宽度 · 适合页面 · 实际大小 | ⌘− and ⌘+ (Ctrl elsewhere) |
| S-R-08 | Reading options | 阅读选项 · 高亮颜色 · 外观 · 浅色 · 深色 · 跟随系统 · 深色时调暗页面 | With S-P-80 and S-P-85 |
| S-R-09 | Download | 下载 · 译文 PDF · 原文 PDF | 译文 PDF greyed until the final translation is on screen |
| S-R-10 | Leave | 在默认查看器中打开 | Back to the browser's own viewer |
| S-R-11 | Page pills | 原文页码 · 译文页码 · 上一页 · 下一页 | |
| S-R-12 | The status capsule | 正在加载 · 正在翻译 · 正在按当前设置重新翻译 | Progress fills the capsule |
| S-R-13 | Language not supported | PDF 对照暂不支持{语言} · 选择语言 | The action opens the language menu |
| S-R-14 | Narrow window | 窗口较窄，暂只显示译文 | Once, when 对照 shows the translation alone (after S-P-74) |
| S-R-15 | A notice's close button | 关闭 | |
```

  In `scripts/english-allowlist.txt`, raise `docs/UI.md`'s allowance by the lines just added with CJK (count them:
  `git diff docs/UI.md | grep '^+' | grep -cP '\p{Han}'`), with the reason `2026-09-25: §3.5, the PDF reader's surface
  (S-R)`, and add `tests/pdf-reader/ui/copy.test.ts 5  # the reader's words, zh-CN expectations and the technical terms
  checked in Chinese`.

- [ ] **Step 6: The gate and the commit**

```bash
git add src/locales/zh-CN.ts src/locales/en.ts docs/UI.md scripts/english-allowlist.txt tests/pdf-reader/ui/copy.test.ts
pnpm typecheck && pnpm lint && pnpm test
git commit -F - <<'EOF'
feat(pdf-reader): the reader's words, surface R

Every word the reader's interface shows, in both packs, with the popup's own
string wherever the popup already says the same thing. docs/UI.md gains
§3.5 (S-R). A test checks the two packs hold the same words and that none
names a technical path.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 13: the page's frame — tokens, layout, appearance

**Files:**
- Create: `src/entrypoints/pdf-reader/reader.css`; delete `src/entrypoints/pdf-reader/page.css`
- Modify: `src/entrypoints/pdf-reader/main.tsx`, `App.tsx`
- Create: `src/pdf-reader/ui/use-reader.ts`, `src/pdf-reader/ui/appearance.ts`
- Modify: `src/pdf-reader/engine/session.mjs` (fit width at a reading width, §3)
- Test: `tests/pdf-reader/ui/appearance.test.ts`; create `experiments/pdf-bilingual/spikes/reader-ui.mjs`

**Interfaces:**
- Consumes: `ReaderState.settings.pdfReader` (Part 2), `ReaderState.display`.
- Produces: `useReader(controller): ReaderState`; `themeOf(appearance): 'light' | 'dark' | null`;
  `dimmed(appearance, systemDark, dimPages): boolean`; `applyAppearance(root, { theme, dim }, animate)`. The page's
  structure, which later tasks fill: `header.chrome[role=toolbar]` with three zones (`[data-zone=lead|centre|trail]`),
  `aside.chrome[data-contents]`, `div.doc` holding `section.pane[data-side=left|right]`, each with its
  `.viewerContainer#left|#right`. `<html>` carries `data-theme`, `data-axt-dim`, `data-axt-swapped`,
  `data-axt-contents` (the interface's) and `data-axt-pdf-mode`, `data-axt-narrow` (the session's).
  `reader-ui.mjs` ends with the line `console.log(failed ? \`${failed} failed\` : 'all passed')`; each later task adds
  its checks just above it.

- [ ] **Step 1: The failing browser check** — create `experiments/pdf-bilingual/spikes/reader-ui.mjs`:

```js
// The reader's interface in a real browser (the reader's design §4–§8, §13), on a demo paper, grown task by task in Part
// 3 of plans/2026-09-25-reader-interface.md. Exits non-zero on a failure or a page error; screenshots in out/reader-ui/.
// Build first; the demo papers made (spikes/reader-papers.mjs).
//   node experiments/pdf-bilingual/spikes/reader-ui.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-ui')
mkdirSync(out, { recursive: true })
const paper = '2608.02163'
const { context, readerUrl } = await launchWithReader({ profile: 'reader-ui', demos: true, viewport: { width: 1440, height: 900 } })
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
async function open(query = {}, viewport) {
  const page = await context.newPage()
  if (viewport) await page.setViewportSize(viewport)
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.goto(readerUrl({ paper, ...query }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
  await page.waitForTimeout(600)
  return page
}
const state = page => page.evaluate(() => window.__reader.controller.getState())
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) })
/** a change of the settings, as a plain object merged one group deep (the extension's policy refuses eval) */
const patch = (page, change) => page.evaluate(p => window.__reader.controller.patchSettings(c => {
  const next = { ...c }
  for (const [k, v] of Object.entries(p)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
  return next
}), change)
const box = (page, selector) => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }, selector)

// ---------------------------------------------------------------- Task 13: the frame
{
  const page = await open({ mode: 'bilingual' })
  const bar = await box(page, 'header[role="toolbar"]'), doc = await box(page, '.doc')
  check('the toolbar is 44 px, the document area under it', bar?.h === 44 && doc?.y === 44, JSON.stringify({ bar, doc }))
  const [l, r] = [await box(page, '.pane[data-side="left"]'), await box(page, '.pane[data-side="right"]')]
  check('side by side: two panes, an 8 px gutter', l && r && Math.round(r.x - (l.x + l.w)) === 8, JSON.stringify({ l, r }))
  // the viewers keep the browser's defaults: canvas, text layer and highlight layer share one rectangle in every page
  const layers = await page.evaluate(() => [...document.querySelectorAll('#left .page')].slice(0, 3).map(p => ['.canvasWrapper', '.textLayer', '.axt-hl-layer'].map(s => { const r = p.querySelector(s)?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round).join(',') : null })))
  check('the page layers share one rectangle', layers.length > 0 && layers.every(ls => ls.filter(Boolean).every(x => x === ls[0])), JSON.stringify(layers))
  await patch(page, { pdfReader: { swapped: true } })
  await page.waitForTimeout(400)
  const [l2, r2] = [await box(page, '.pane[data-side="left"]'), await box(page, '.pane[data-side="right"]')]
  check('swapped: the translation on the left', r2.x < l2.x, JSON.stringify({ l2, r2 }))
  await patch(page, { pdfReader: { swapped: false, appearance: 'dark', dimPages: true } })
  await page.waitForTimeout(600)
  const dark = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, dim: document.documentElement.hasAttribute('data-axt-dim'), filter: getComputedStyle(document.querySelector('#left .page canvas')).filter, blend: (() => { window.__reader.debug.light(3); const b = document.querySelector('.axt-hl'); return b && getComputedStyle(b).mixBlendMode })() }))
  check('dark: the theme, the canvas inverted, the band screened', dark.theme === 'dark' && dark.dim && /invert/.test(dark.filter) && dark.blend === 'screen', JSON.stringify(dark))
  await shot(page, '13-dark-bilingual')
  await patch(page, { pdfReader: { appearance: 'system', dimPages: true } })
  await page.close()
}
{
  const page = await open({ mode: 'translation' })
  const pane = await box(page, '.pane[data-side="right"]'), pg = await box(page, '#right .page')
  check('one display: the pane spans the window', pane?.w === 1440, JSON.stringify(pane))
  check('one display: fit width stops at a reading width', pg && pg.w <= 1062 && pg.w >= 1000, JSON.stringify(pg))
  await shot(page, '13-translation')
  await page.close()
}

console.log(failed ? `${failed} failed` : 'all passed')
await context.close()
process.exit(failed ? 1 : 0)
```

```bash
pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs
```

Expected: FAIL — no `header[role="toolbar"]`, no `.doc`, no `data-side`.

- [ ] **Step 2: The appearance's failing test** — create `tests/pdf-reader/ui/appearance.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAppearance, dimmed, themeOf } from '@/pdf-reader/ui/appearance'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-axt-dim')
  vi.unstubAllGlobals()
})

describe('the appearance (the reader\'s design, §4.3)', () => {
  it('is the one chosen, or none to follow the system', () => {
    expect(themeOf('light')).toBe('light')
    expect(themeOf('dark')).toBe('dark')
    expect(themeOf('system')).toBeNull()
  })

  it('dims the pages when it is dark in effect and the switch is on', () => {
    expect(dimmed('dark', false, true)).toBe(true)
    expect(dimmed('system', true, true)).toBe(true)
    expect(dimmed('system', false, true)).toBe(false)
    expect(dimmed('dark', false, false)).toBe(false)
    expect(dimmed('light', true, true)).toBe(false)
  })

  it('is applied to the root, crossfaded only when asked', () => {
    const transition = vi.fn((run: () => void) => run())
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    Object.assign(document, { startViewTransition: transition })
    const root = document.documentElement
    applyAppearance(root, { theme: 'dark', dim: true }, false)
    expect([root.dataset.theme, root.hasAttribute('data-axt-dim'), transition]).toEqual(['dark', true, transition])
    expect(transition).not.toHaveBeenCalled()
    applyAppearance(root, { theme: null, dim: false }, true)
    expect(transition).toHaveBeenCalledOnce()
    expect([root.dataset.theme, root.hasAttribute('data-axt-dim')]).toEqual([undefined, false])
  })
})
```

```bash
pnpm vitest run tests/pdf-reader/ui/appearance.test.ts
```

Expected: FAIL — `Failed to resolve import "@/pdf-reader/ui/appearance"`.

- [ ] **Step 3: The appearance** — create `src/pdf-reader/ui/appearance.ts`:

```ts
// The reader's appearance (the reader's design, §4.3): light, dark or the system's, and the pages dimmed in the dark
// when the reader wants them so. Applied to <html> as data-theme (absent: the system's) and data-axt-dim; a change
// after the first paint is one crossfade of the whole page, not element by element, unless motion is reduced
export type Appearance = 'light' | 'dark' | 'system'

export const themeOf = (appearance: Appearance): 'light' | 'dark' | null => (appearance === 'system' ? null : appearance)

export const dimmed = (appearance: Appearance, systemDark: boolean, dimPages: boolean): boolean =>
  dimPages && (appearance === 'dark' || (appearance === 'system' && systemDark))

export function applyAppearance(root: HTMLElement, look: { theme: 'light' | 'dark' | null; dim: boolean }, animate: boolean): void {
  const apply = () => {
    if (look.theme) root.dataset.theme = look.theme
    else delete root.dataset.theme
    root.toggleAttribute('data-axt-dim', look.dim)
  }
  const doc = root.ownerDocument as Document & { startViewTransition?: (run: () => void) => unknown }
  if (animate && doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(apply)
  else apply()
}
```

```bash
pnpm vitest run tests/pdf-reader/ui/appearance.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 4: The state hook** — create `src/pdf-reader/ui/use-reader.ts`:

```ts
// The reader's state for React: the controller is an external store (the reader's design, §11.3)
import { useSyncExternalStore } from 'react'
import type { ReaderController, ReaderState } from '../controller'

export const useReader = (controller: ReaderController): ReaderState => useSyncExternalStore(controller.subscribe, controller.getState)
```

- [ ] **Step 5: The token sheet and the layout** — create `src/entrypoints/pdf-reader/reader.css`:

```css
/* The PDF reader's page (the reader's design, §4, §5, §11.5): its own tokens, not the extension's ui.css, with
   Tailwind's theme and utilities and **without Preflight**, whose resets would reach inside PDF.js's viewers: their
   layout assumes the browser's defaults (a box-sizing of ours once shifted the highlight, 2026-09-22). The chrome — every
   control the page draws — takes its own small base under the class `chrome`; the viewers keep theirs */
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);

/* §4.1: one cool neutral ramp at hue 255 and one status hue; dark by the system, or chosen (data-theme) */
:root,
[data-theme="light"] {
  color-scheme: light;
  --n-0: oklch(1 0 0); --n-1: oklch(0.985 0.002 255); --n-2: oklch(0.962 0.004 255); --n-3: oklch(0.935 0.006 255);
  --n-4: oklch(0.905 0.007 255); --n-5: oklch(0.86 0.008 255); --n-7: oklch(0.62 0.012 255); --n-8: oklch(0.505 0.014 255);
  --n-10: oklch(0.235 0.012 255);
  --danger: oklch(0.545 0.17 28);
  --focus: oklch(0.55 0.15 255);
  --page-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.05), 0 1px 2px oklch(0 0 0 / 0.04);
  --float-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.08), 0 4px 16px oklch(0 0 0 / 0.08);
  --pop-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.14);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --n-0: oklch(0.255 0.006 255); --n-1: oklch(0.215 0.006 255); --n-2: oklch(0.185 0.006 255); --n-3: oklch(0.275 0.007 255);
    --n-4: oklch(0.31 0.008 255); --n-5: oklch(0.36 0.009 255); --n-7: oklch(0.56 0.01 255); --n-8: oklch(0.71 0.01 255);
    --n-10: oklch(0.935 0.005 255);
    --danger: oklch(0.69 0.15 28);
    --focus: oklch(0.72 0.12 255);
    --page-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.4), 0 4px 16px oklch(0 0 0 / 0.35);
    --float-shadow: 0 0 0 0.5px oklch(1 0 0 / 0.08), 0 6px 20px oklch(0 0 0 / 0.4);
    --pop-shadow: 0 0 0 0.5px oklch(1 0 0 / 0.1), 0 14px 36px oklch(0 0 0 / 0.5);
  }
}
[data-theme="dark"] {
  color-scheme: dark;
  --n-0: oklch(0.255 0.006 255); --n-1: oklch(0.215 0.006 255); --n-2: oklch(0.185 0.006 255); --n-3: oklch(0.275 0.007 255);
  --n-4: oklch(0.31 0.008 255); --n-5: oklch(0.36 0.009 255); --n-7: oklch(0.56 0.01 255); --n-8: oklch(0.71 0.01 255);
  --n-10: oklch(0.935 0.005 255);
  --danger: oklch(0.69 0.15 28);
  --focus: oklch(0.72 0.12 255);
  --page-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.4), 0 4px 16px oklch(0 0 0 / 0.35);
  --float-shadow: 0 0 0 0.5px oklch(1 0 0 / 0.08), 0 6px 20px oklch(0 0 0 / 0.4);
  --pop-shadow: 0 0 0 0.5px oklch(1 0 0 / 0.1), 0 14px 36px oklch(0 0 0 / 0.5);
}
/* the roles (§4.1) */
:root {
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "PingFang SC", "Noto Sans SC", sans-serif;
  --bar: 44px;
  --side: 236px;
  --canvas: var(--n-3); --chrome: var(--n-0); --chrome-line: var(--n-4); --ink: var(--n-10); --ink-2: var(--n-8); --ink-3: var(--n-7);
  --fill: var(--n-3); --well: var(--n-3); --lift: var(--n-0);
  --float-bg: color-mix(in oklab, var(--n-0) 90%, transparent);
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
@theme inline {
  --color-canvas: var(--canvas); --color-chrome: var(--chrome); --color-line: var(--chrome-line);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-fill: var(--fill); --color-well: var(--well); --color-lift: var(--lift); --color-float: var(--float-bg);
  --color-danger: var(--danger); --color-focus: var(--focus);
  --font-sans: var(--font);
  --ease-reader: cubic-bezier(0.2, 0, 0, 1);
  --shadow-float: var(--float-shadow); --shadow-pop: var(--pop-shadow);
}

@layer base {
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { background: var(--canvas); color: var(--ink); font: 13px/1.4 var(--font); -webkit-font-smoothing: antialiased; }
  [hidden] { display: none !important; }
  /* the chrome: border-box and bare controls; PDF.js's viewers keep the browser's defaults (the note at the top) */
  .chrome, .chrome * { box-sizing: border-box; }
  .chrome button, .chrome input { font: inherit; color: inherit; margin: 0; }
  .chrome button { background: none; border: 0; padding: 0; cursor: pointer; }
  .chrome button:disabled, .chrome [aria-disabled="true"] { cursor: default; }
  .chrome :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  kbd { font: inherit; }
}

/* ----- §5: the toolbar fixed at the top, three zones; the document area under it, moved by the contents ----- */
header[role="toolbar"] {
  position: fixed; inset: 0 0 auto 0; z-index: 20; height: var(--bar);
  display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 16px;
  padding-inline: 8px; background: var(--chrome); box-shadow: 0 0.5px 0 var(--chrome-line); color: var(--ink);
}
.doc { position: fixed; inset: var(--bar) 0 0 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 8px; transition: left 200ms var(--ease); }
html[data-axt-contents] .doc { left: var(--side); }
.pane { position: relative; min-width: 0; overflow: hidden; timeline-scope: --pane-y; }
.pane .viewerContainer { scroll-timeline: --pane-y block; scrollbar-width: none; }
/* one display alone, or 对照 in a narrow window: the scroller spans the window, the page centred in it (§3) */
html[data-axt-pdf-mode="original"] .doc, html[data-axt-pdf-mode="translation"] .doc, html[data-axt-narrow] .doc { grid-template-columns: minmax(0, 1fr); column-gap: 0; }
html[data-axt-pdf-mode="original"] .pane[data-side="right"],
html[data-axt-pdf-mode="translation"] .pane[data-side="left"],
html[data-axt-pdf-mode="bilingual"][data-axt-narrow] .pane[data-side="left"] { display: none; }
html[data-axt-pdf-mode="bilingual"][data-axt-swapped] .pane[data-side="left"] { order: 2; }
@media (prefers-reduced-motion: reduce) { .doc { transition: none; } }

/* ----- PDF.js's pages: a hairline and a soft shadow, 14 px apart (§4.1); PDF.js's own border and its margin, whose
   foot is negative, give way (as in the harness the maintainer approved) ----- */
.pdfViewer .page { border: 0 !important; margin-block: 14px !important; box-shadow: var(--page-shadow); }
/* dark pages (§4.3): the canvas alone inverted, a page not drawn yet already its colour, so nothing flashes white; the
   highlight and the figures keep their colours, the band screened over the dark page as it is multiplied over a white one */
html[data-axt-dim] .pdfViewer .page { background-color: rgb(29 29 29) !important; }
html[data-axt-dim] .pdfViewer .page canvas { filter: invert(88.8%) hue-rotate(180deg); }
html[data-axt-dim] .axt-hl { mix-blend-mode: screen; }
/* the appearance changes as one crossfade of the whole page (the View Transitions API) */
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 260ms; animation-timing-function: var(--ease); }
```

  Delete `src/entrypoints/pdf-reader/page.css`. In `main.tsx`, replace `import './page.css'` with
  `import './reader.css'`.

- [ ] **Step 6: The page's structure** — replace `src/entrypoints/pdf-reader/App.tsx` with:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReaderController } from '@/pdf-reader/controller'
import { type Appearance, applyAppearance, dimmed, themeOf } from '@/pdf-reader/ui/appearance'
import { useReader } from '@/pdf-reader/ui/use-reader'
import { R } from '@/ui/strings'

/**
 * The reader's page (the reader's design, §5): the toolbar, the contents, the document area with its two panes (the
 * engine draws into their scrollers, and owns them), and what floats over them. The panes' ids are the probes' too
 */
export function App({ controller, embedded }: { controller: ReaderController; embedded: boolean }) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const state = useReader(controller)
  useLayoutEffect(() => {
    if (!left.current || !right.current) return
    // a session that cannot open is in the controller's state (a failure); nothing is left to catch here
    void controller.attach({ left: left.current, right: right.current }).then(
      session => {
        // the probes' hooks (experiments/pdf-bilingual/spikes): beside the session's own on window.__reader
        Object.assign((window as unknown as { __reader: object }).__reader, { controller, session })
      },
      () => {},
    )
  }, [controller])
  useAppearance(state.settings?.pdfReader.appearance, state.settings?.pdfReader.dimPages)
  const swapped = state.settings?.pdfReader.swapped ?? false
  useEffect(() => { document.documentElement.toggleAttribute('data-axt-swapped', swapped) }, [swapped])
  return (
    <>
      <header role="toolbar" aria-label={R.bar} className="chrome">
        <div data-zone="lead" className="flex min-w-0 items-center gap-1" />
        <div data-zone="centre" className="flex items-center" />
        <div data-zone="trail" className="flex items-center justify-self-end gap-1">
          {embedded && (
            <button type="button" data-leave onClick={() => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')}>
              {R.leave}
            </button>
          )}
        </div>
      </header>
      <div className="doc">
        <section className="pane" data-side="left">
          <div className="viewerContainer" id="left" ref={left}>
            <div className="pdfViewer" />
          </div>
        </section>
        <section className="pane" data-side="right">
          <div className="viewerContainer" id="right" ref={right}>
            <div className="pdfViewer" />
          </div>
        </section>
      </div>
    </>
  )
}

/** the appearance the settings ask for, on <html>; changes after the first crossfade, and the system's is followed */
function useAppearance(appearance: Appearance | undefined, dimPages: boolean | undefined) {
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(query.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [])
  const first = useRef(true)
  useLayoutEffect(() => {
    if (!appearance) return
    applyAppearance(document.documentElement, { theme: themeOf(appearance), dim: dimmed(appearance, systemDark, dimPages ?? true) }, !first.current)
    first.current = false
  }, [appearance, dimPages, systemDark])
}
```

- [ ] **Step 7: Fit width at a reading width** — in `src/pdf-reader/engine/session.mjs`, above `function relayout(`,
  add:

```js
/** CSS px: the widest a page is fitted in a single display (the reader's design, §3), the width the old 1100 px column gave */
const READING_WIDTH = 1060
/** the scale that fits a side's pages to its pane, never beyond a reading width while one side alone is shown */
function fitWidth(side) {
  const view = side.viewer.getPageView(0)?.pdfPage?.view
  if (!view || mode === 'bilingual' && !narrow) return 'page-width'
  const cap = READING_WIDTH / ((view[2] - view[0]) * (96 / 72))
  return side.container.clientWidth - 40 > READING_WIDTH ? cap : 'page-width'
}
```

  In `relayout`, replace `s.viewer.currentScaleValue = 'page-width'` with `s.viewer.currentScaleValue = fitWidth(s)`; in
  the `pagesinit` handler in `attach`, replace `const value = side.scale ?? 'page-width'` with
  `const value = side.scale ?? fitWidth(side)`; and replace `export function zoomTo(value) { … }` with:

```js
/** the sides shown at a scale or a fit (page-width, page-fit, page-actual); fitting the width keeps to a reading width */
export function zoomTo(value) { for (const s of sides) if (shown(s)) s.viewer.currentScaleValue = value === 'page-width' ? fitWidth(s) : String(value) }
```

  `narrow` is Task 23's; until then declare it beside `mode`: `let narrow = false // the window too narrow for two sides (setNarrow)`.

- [ ] **Step 8: Run the checks**

```bash
pnpm vitest run tests/pdf-reader && pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs
```

Expected: the unit tests pass; `all passed` — the frame, the layers, swapped, dark, the reading width.

- [ ] **Step 9: The gate and the commit**

```bash
git add src/entrypoints/pdf-reader/reader.css src/entrypoints/pdf-reader/main.tsx src/entrypoints/pdf-reader/App.tsx src/pdf-reader/ui/use-reader.ts src/pdf-reader/ui/appearance.ts src/pdf-reader/engine/session.mjs tests/pdf-reader/ui/appearance.test.ts experiments/pdf-bilingual/spikes/reader-ui.mjs
git rm src/entrypoints/pdf-reader/page.css
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the reader's frame, tokens and appearance

The page takes its own token sheet and Tailwind's theme and utilities
without Preflight, whose resets would reach inside PDF.js's viewers; the
chrome has its own base. The toolbar, the document area with an 8 px gutter,
one pane spanning the window in a single display with the page fitted to a
reading width, swapped sides, the appearance with its crossfade and dark
pages (the canvas inverted, the band screened). reader-ui.mjs checks it in a
real browser, the page layers' shared rectangle included.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 14: the icons, and the display switch's letters

**Files:**
- Create: `scripts/pdf-reader-glyphs.py`, `src/pdf-reader/ui/display-glyphs.ts` (its output), `src/pdf-reader/ui/icons.tsx`
- Modify: `docs/THIRD_PARTY.md`
- Test: `tests/pdf-reader/ui/icons.test.tsx`

**Interfaces:**
- Produces: `Icon({ node, size = 16, className })`, a Lucide node drawn at stroke 1.5; `DisplayIcon({ display })`, the
  switch's icon on its 24 × 18 pane; `GLYPH_A`, `GLYPH_WEN` (path data); `WEN_GAIN = 0.16`.

- [ ] **Step 1: The failing test** — create `tests/pdf-reader/ui/icons.test.tsx`:

```tsx
import { createElement } from 'react'
import { Settings } from 'lucide'
import { afterEach, describe, expect, it } from 'vitest'
import { GLYPH_A, GLYPH_WEN } from '@/pdf-reader/ui/display-glyphs'
import { DisplayIcon, Icon, WEN_GAIN } from '@/pdf-reader/ui/icons'
import { mountElement } from '../../ui/render-hook'

afterEach(() => { document.body.innerHTML = '' })

describe("the reader's icons (the reader's design, §4.2, §6.2)", () => {
  it('draw Lucide at 16 px, stroke 1.5, hidden from assistive technology', async () => {
    const { container } = await mountElement(createElement(Icon, { node: Settings }))
    const svg = container.querySelector('svg')!
    expect([svg.getAttribute('width'), svg.getAttribute('stroke-width'), svg.getAttribute('aria-hidden')]).toEqual(['16', '1.5', 'true'])
  })

  it('draw the three displays on one pane: A in the original, the split, 文 in the translation', async () => {
    const paths = async (display: 'original' | 'bilingual' | 'translation') => {
      const { container, unmount } = await mountElement(createElement(DisplayIcon, { display }))
      const svg = container.querySelector('svg')!
      const out = { box: svg.getAttribute('viewBox'), rect: !!svg.querySelector('rect'), d: [...svg.querySelectorAll('path')].map(p => p.getAttribute('d')), gain: svg.querySelector('path')?.getAttribute('stroke-width') }
      await unmount()
      return out
    }
    expect(await paths('original')).toMatchObject({ box: '0 0 24 18', rect: true, d: [GLYPH_A] })
    expect(await paths('bilingual')).toMatchObject({ rect: true, d: ['M12 2.5v13'] })
    expect(await paths('translation')).toMatchObject({ rect: true, d: [GLYPH_WEN], gain: String(WEN_GAIN) })
  })
})
```

```bash
pnpm vitest run tests/pdf-reader/ui/icons.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/pdf-reader/ui/display-glyphs"`.

- [ ] **Step 2: The letters' script** — create `scripts/pdf-reader-glyphs.py`:

```python
# The display switch's two letters as outlines (the reader's design, §6.2): A and 文 of Noto Sans SC (SIL OFL 1.1) at
# weight 350, the face's DemiLight, each centred by its ink on the switch's 24 × 18 pane, A 8 px high and 文 9 px (a CJK
# glyph looks smaller than a Latin capital of its height); 文 narrowed across to 0.8 of its width, the weight that takes
# from its verticals given back by a stroke of 0.16 px round its outline (icons.tsx WEN_GAIN). Outlines, so that every
# system draws the same shapes. Prints display-glyphs.ts:
#   python3 scripts/pdf-reader-glyphs.py <NotoSansSC-VariableFont_wght.ttf> > src/pdf-reader/ui/display-glyphs.ts
# Needs fontTools (pip install fonttools); the font is Google Fonts' Noto Sans SC, the variable face.
import sys
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = instantiateVariableFont(TTFont(sys.argv[1]), {'wght': 350})
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()


def outline(ch, height, narrow=1.0, cx=12, cy=9):
    """a glyph's outline, `height` px high, scaled across by `narrow`, its ink centred on (cx, cy), y down"""
    rec = DecomposingRecordingPen(glyphs)
    glyphs[cmap[ord(ch)]].draw(rec)
    bounds = BoundsPen(glyphs)
    rec.replay(bounds)
    x0, y0, x1, y1 = bounds.bounds
    s = height / (y1 - y0)
    pen = SVGPathPen(None, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    rec.replay(TransformPen(pen, (s * narrow, 0, 0, -s, cx - s * narrow * (x0 + x1) / 2, cy + s * (y0 + y1) / 2)))
    return pen.getCommands()


print("// Generated by scripts/pdf-reader-glyphs.py from Noto Sans SC (SIL OFL 1.1, docs/THIRD_PARTY.md): the display")
print("// switch's letters as outlines on its 24 × 18 pane (the reader's design, §6.2). Not edited by hand: run the script")
print(f"export const GLYPH_A = '{outline('A', 8)}'")
print(f"export const GLYPH_WEN = '{outline('文', 9, 0.8)}'")
```

```bash
python3 scripts/pdf-reader-glyphs.py ~/Library/Fonts/NotoSansSC-VariableFont_wght.ttf > src/pdf-reader/ui/display-glyphs.ts
node -e "
const f = require('fs').readFileSync('src/pdf-reader/ui/display-glyphs.ts', 'utf8'), h = require('fs').readFileSync('experiments/pdf-bilingual/poc-reader/variants.js', 'utf8')
const q = n => f.match(new RegExp(n + \" = '([^']+)'\"))[1]
console.log(h.includes(q('GLYPH_A')) && h.includes(q('GLYPH_WEN')) ? 'the approved outlines' : 'DIFFERENT')"
```

Expected: `the approved outlines` — the paths the maintainer approved in the harness, to the digit. Different means the
script is not the one that made them: find why before going on.

- [ ] **Step 3: The icons** — create `src/pdf-reader/ui/icons.tsx`:

```tsx
// The reader's icons (the reader's design, §4.2): Lucide's (ISC, docs/THIRD_PARTY.md) at 16 px with a 1.5 stroke on the
// 24 grid, one CSS pixel; and the display switch's own three on a 24 × 18 pane at 1.2, the letters filled (§6.2)
import type { IconNode } from 'lucide'
import { createElement } from 'react'
import type { Display } from '../controller'
import { GLYPH_A, GLYPH_WEN } from './display-glyphs'

export function Icon({ node, size = 16, className }: { node: IconNode; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  )
}

/** 文 is narrowed to 0.8 of its width: a stroke this wide round its outline gives back the weight its verticals lost */
export const WEN_GAIN = 0.16

export function DisplayIcon({ display }: { display: Display }) {
  return (
    <svg aria-hidden="true" width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" overflow="visible">
      <rect x="2.25" y="2.5" width="19.5" height="13" rx="3" />
      {display === 'bilingual' && <path d="M12 2.5v13" />}
      {display === 'original' && <path d={GLYPH_A} fill="currentColor" stroke="none" />}
      {display === 'translation' && <path d={GLYPH_WEN} fill="currentColor" strokeWidth={WEN_GAIN} />}
    </svg>
  )
}
```

```bash
pnpm vitest run tests/pdf-reader/ui/icons.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 4: The licences** — in `docs/THIRD_PARTY.md`:
  - the Lucide row (`src/core/floating/button.ts` (icons), …) gains `src/pdf-reader/ui/*` in its first cell and, in its
    list, the reader's `panel-left`, `arrow-up-right`, `arrow-left-right`, `link-2`, `minus`, `plus`, `chevron-down`,
    `chevron-left`, `chevron-right`, `download`, `log-out`, `info`, `circle-alert`;
  - a new row after it: `src/pdf-reader/ui/display-glyphs.ts` | Noto Sans SC (SIL Open Font License 1.1), the variable
    face at weight 350 — https://github.com/notofonts/noto-cjk | 2026-09-25 | Two glyphs, A and 文, as outline path data
    generated by `scripts/pdf-reader-glyphs.py` (文 narrowed across to 0.8); no font file is bundled. The OFL allows
    embedding glyph outlines in software; the licence notice goes into the package's third-party notices with the npm
    packages'.
  - The package's notices (`scripts/third-party-notices.mjs`, `BUNDLED_DATA`, which already names the recogniser's
    models) gain an entry: `{ name: 'Noto Sans SC — two glyph outlines (the PDF reader\'s display switch)', licence: 'OFL-1.1', source: 'https://github.com/notofonts/noto-cjk', text: read(join(KEPT_TEXTS, 'noto-sans-cjk-OFL-1.1.txt')) }`,
    the licence's text saved from the font's own repository:
    `curl -sL https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE -o licenses/noto-sans-cjk-OFL-1.1.txt`.
    If the notices' tests name `BUNDLED_DATA`'s length or contents, they take the new entry.

- [ ] **Step 5: The gate and the commit**

```bash
git add scripts/pdf-reader-glyphs.py src/pdf-reader/ui/display-glyphs.ts src/pdf-reader/ui/icons.tsx tests/pdf-reader/ui/icons.test.tsx docs/THIRD_PARTY.md scripts/third-party-notices.mjs licenses/noto-sans-cjk-OFL-1.1.txt
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the reader's icons and the display switch's letters

Lucide's icons at the reader's weight, and the display switch's own three:
a pane with A for the original, the split for side by side, 文 for the
translation. The letters are Noto Sans SC's (OFL) at 350 as outlines, made
by scripts/pdf-reader-glyphs.py, so every system draws the same shapes;
they are the ones the maintainer approved, to the digit.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 15: tooltips and toolbar buttons

**Files:**
- Create: `src/pdf-reader/ui/tip.tsx`, `src/pdf-reader/ui/ToolbarButton.tsx`
- Modify: `src/entrypoints/pdf-reader/reader.css` (the controls' layer)
- Test: `tests/pdf-reader/ui/tip.test.tsx`, create `tests/pdf-reader/ui/popover-stub.ts`

**Interfaces:**
- Produces: `useTip(label, hint?, { side = 'bottom' } = {}): { props, tip }` — `props` spread on the control (its anchor
  name, the handlers), `tip` rendered beside it; `ToolbarButton({ label, hint, pressed, disabled, onClick, children })`,
  a 30 × 30 icon button named by `label`, its tooltip `label` and `hint` (a shortcut, lighter). The controls' classes in
  `reader.css`: `.tbtn`, `.seg`, `.thumb`, `.switch`, `.tip`, `.pop`, `.row`, `.sep`, `.chip`.

- [ ] **Step 1: The popover stub** — happy-dom has no popover API. Create `tests/pdf-reader/ui/popover-stub.ts`:

```ts
// The popover API as the reader uses it, for happy-dom, which has none: showPopover / hidePopover / togglePopover, the
// open state as an attribute the tests read, and the toggle event a light dismiss sends
import { vi } from 'vitest'

export function stubPopovers() {
  const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>
  const saved = { show: proto.showPopover, hide: proto.hidePopover }
  const fire = (el: HTMLElement, open: boolean) => el.dispatchEvent(Object.assign(new Event('toggle'), { newState: open ? 'open' : 'closed', oldState: open ? 'closed' : 'open' }))
  proto.showPopover = vi.fn(function (this: HTMLElement) { if (!this.hasAttribute('data-open')) { this.setAttribute('data-open', ''); fire(this, true) } })
  proto.hidePopover = vi.fn(function (this: HTMLElement) { if (this.hasAttribute('data-open')) { this.removeAttribute('data-open'); fire(this, false) } })
  return () => { proto.showPopover = saved.show; proto.hidePopover = saved.hide }
}
export const isOpen = (el: Element | null) => !!el?.hasAttribute('data-open')
```

- [ ] **Step 2: The failing test** — create `tests/pdf-reader/ui/tip.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolbarButton } from '@/pdf-reader/ui/ToolbarButton'
import { mountElement } from '../../ui/render-hook'
import { isOpen, stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers(); vi.useFakeTimers() })
afterEach(() => { restore(); vi.useRealTimers(); document.body.innerHTML = '' })

const mount = (props: Partial<Parameters<typeof ToolbarButton>[0]> = {}) =>
  mountElement(createElement(ToolbarButton, { label: '放大', hint: '⌘ +', onClick: () => {}, ...props }, 'x'))

describe('a toolbar button and its tooltip (the reader\'s design, §6.1, §13)', () => {
  it('is named by its words, and its tooltip shows them with the shortcut', async () => {
    const { container } = await mount()
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('放大')
    expect(container.querySelector('[popover]')!.textContent).toBe('放大⌘ +')
  })

  it('shows its tooltip after 500 ms of hover, and hides it on leaving', async () => {
    const { container } = await mount()
    const button = container.querySelector('button')!, tip = container.querySelector('[popover]')
    await act(async () => { button.dispatchEvent(new Event('pointerenter')) })
    await act(async () => { vi.advanceTimersByTime(499) })
    expect(isOpen(tip)).toBe(false)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(isOpen(tip)).toBe(true)
    await act(async () => { button.dispatchEvent(new Event('pointerleave')) })
    expect(isOpen(tip)).toBe(false)
  })

  it('shows it at once on keyboard focus, not on a press', async () => {
    const { container } = await mount()
    const button = container.querySelector('button')!, tip = container.querySelector('[popover]')
    await act(async () => { button.focus() })
    expect(isOpen(tip)).toBe(true)
    await act(async () => { button.blur() })
    await act(async () => { button.dispatchEvent(new Event('pointerdown')); button.focus() })
    expect(isOpen(tip)).toBe(false)
  })

  it('does nothing when disabled, and says so', async () => {
    const onClick = vi.fn()
    const { container } = await mount({ disabled: true, onClick })
    const button = container.querySelector('button')!
    button.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })
})
```

```bash
pnpm vitest run tests/pdf-reader/ui/tip.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/pdf-reader/ui/ToolbarButton"`.

- [ ] **Step 3: The tooltip** — create `src/pdf-reader/ui/tip.tsx`:

```tsx
// Tooltips (the reader's design, §6.1, §13): one line always; after 500 ms of hover, at once on keyboard focus, never on a
// press; a shortcut or a second thought in a lighter span. A hint popover (it closes no menu) anchored to its control by
// CSS anchor positioning, below it and kept inside the window by position-try (reader.css .tip), so nothing is measured.
// Its words are the control's name already, so the tip is hidden from assistive technology
import { type CSSProperties, type FocusEvent, type ReactNode, useId, useRef } from 'react'

export interface Tip {
  props: { style: CSSProperties; onPointerEnter(): void; onPointerLeave(): void; onPointerDown(): void; onFocus(e: FocusEvent): void; onBlur(): void }
  tip: ReactNode
}

export function useTip(label: string, hint?: string, { side = 'bottom' }: { side?: 'bottom' | 'right' } = {}): Tip {
  const name = `--tip-${useId().replace(/[^\w-]/g, '')}`
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  /** the pointer pressed the control: the focus that follows is not the keyboard's */
  const pressed = useRef(false)
  const open = useRef(false)
  const show = () => {
    // no tip over an open menu or popover
    if (open.current || document.querySelector('.pop[data-open], .pop:popover-open')) return
    ref.current?.showPopover()
    open.current = true
  }
  const hide = () => {
    clearTimeout(timer.current)
    if (open.current) ref.current?.hidePopover()
    open.current = false
  }
  return {
    props: {
      style: { anchorName: name } as CSSProperties,
      onPointerEnter: () => { clearTimeout(timer.current); timer.current = window.setTimeout(show, 500) },
      onPointerLeave: hide,
      onPointerDown: () => { pressed.current = true; hide() },
      onFocus: () => { if (!pressed.current) show() },
      onBlur: () => { pressed.current = false; hide() },
    },
    tip: (
      <div ref={ref} popover="hint" aria-hidden="true" className="tip" data-side={side} style={{ positionAnchor: name } as CSSProperties}>
        <span>{label}</span>
        {hint && <kbd>{hint}</kbd>}
      </div>
    ),
  }
}
```

  (`document.querySelector('.pop:popover-open')` throws in happy-dom? If it does, the `.pop[data-open]` half is the
  stub's and the selector is split into two `querySelector` calls inside a `try`; say so in the ledger.)

- [ ] **Step 4: The button** — create `src/pdf-reader/ui/ToolbarButton.tsx`:

```tsx
// A toolbar button (the reader's design, §6.1): 30 × 30, a 7 px radius, its hit area grown to the bar's height; the fill
// on hover, while pressed and while its popover is open; a press scales it to 0.96. Named by its words, which its
// tooltip shows. A disabled one stays in place, greyed, so the bar never reflows
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTip } from './tip'

export function ToolbarButton({ label, hint, pressed, disabled, onClick, children, className = '', ...rest }: {
  label: string
  hint?: string
  pressed?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled' | 'children' | 'className'>) {
  const { props, tip } = useTip(label, hint)
  return (
    <>
      <button type="button" aria-label={label} aria-pressed={pressed} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick} className={`tbtn ${className}`} {...props} {...rest}>
        {children}
      </button>
      {tip}
    </>
  )
}
```

- [ ] **Step 5: The controls' styles** — at the end of `reader.css`, add:

```css
/* ----- the controls (§6, §7): component classes, the layout around them in utilities ----- */
@layer components {
  .tbtn { position: relative; height: 30px; min-width: 30px; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border-radius: 7px; color: var(--ink-2); transition: background-color 150ms ease-out, color 150ms ease-out, scale 150ms ease-out; }
  .tbtn::before { content: ""; position: absolute; inset: -7px -2px; }
  .tbtn:hover, .tbtn[aria-expanded="true"], .tbtn[aria-pressed="true"] { background: var(--fill); color: var(--ink); }
  .tbtn:active { scale: 0.96; }
  .tbtn[aria-disabled="true"] { background: none; color: var(--ink-3); opacity: 0.55; }
  .tbtn[aria-disabled="true"]:active { scale: 1; }
  .divider { width: 0.5px; height: 18px; margin-inline: 6px; flex: none; background: var(--chrome-line); }

  /* tooltips: below their control, centred on it, kept inside the window; one line always */
  .tip { position: fixed; inset: auto; margin: 8px 0 0; position-area: bottom; position-try-fallbacks: bottom span-right, bottom span-left;
    padding: 5px 8px; border: 0; border-radius: 6px; background: oklch(0.22 0.01 255); color: oklch(0.96 0 0); font: 12px/1.2 var(--font);
    white-space: nowrap; display: none; gap: 10px; box-shadow: 0 4px 12px oklch(0 0 0 / 0.2); pointer-events: none; overflow: visible; }
  .tip:popover-open { display: flex; animation: tip-in 120ms ease-out; }
  .tip[data-side="right"] { margin: 0 0 0 8px; position-area: right; position-try-fallbacks: none; }
  .tip kbd { color: oklch(0.74 0.01 255); }
}
@keyframes tip-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .tbtn, .tbtn:active { transition: none; scale: 1; } }
```

- [ ] **Step 6: Run the test**

```bash
pnpm vitest run tests/pdf-reader/ui/tip.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 7: The gate and the commit**

```bash
git add src/pdf-reader/ui/tip.tsx src/pdf-reader/ui/ToolbarButton.tsx src/entrypoints/pdf-reader/reader.css tests/pdf-reader/ui/tip.test.tsx tests/pdf-reader/ui/popover-stub.ts
pnpm typecheck && pnpm lint && pnpm test
git commit -F - <<'EOF'
feat(pdf-reader): tooltips and toolbar buttons

A tooltip is a hint popover anchored to its control by CSS anchor
positioning: after 500 ms of hover, at once on keyboard focus, never on a
press, one line always, kept inside the window without measuring. A toolbar
button is named by its words and stays in place, greyed, when disabled.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 16: the display switch

**Files:**
- Create: `src/pdf-reader/ui/DisplaySwitch.tsx`
- Modify: `src/entrypoints/pdf-reader/reader.css`
- Test: `tests/pdf-reader/ui/display-switch.test.tsx`

**Interfaces:**
- Consumes: `DisplayIcon` (Task 14), `useTip` (Task 15), `R.display` (Task 12).
- Produces: `DisplaySwitch({ value, translatable, onChange })` — a radio group of three 40 px segments; `translatable`
  false greys 对照 and 译文 (§8, cannot be had or the language not supported) and the arrows and keys skip them; keys 1,
  2, 3 anywhere outside a text field.

- [ ] **Step 1: The failing test** — create `tests/pdf-reader/ui/display-switch.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DisplaySwitch } from '@/pdf-reader/ui/DisplaySwitch'
import { mountElement } from '../../ui/render-hook'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const mount = (value: 'original' | 'bilingual' | 'translation', translatable = true) => {
  const onChange = vi.fn()
  return mountElement(createElement(DisplaySwitch, { value, translatable, onChange })).then(m => ({ ...m, onChange }))
}
const key = (target: EventTarget, k: string) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })

describe('the display switch (the reader\'s design, §6.2)', () => {
  it('is a radio group named 显示, its three choices named by their words, the chosen one checked', async () => {
    const { container } = await mount('bilingual')
    expect(container.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('显示')
    const radios = [...container.querySelectorAll('[role="radio"]')]
    expect(radios.map(r => [r.getAttribute('aria-label'), r.getAttribute('aria-checked')])).toEqual([['原文', 'false'], ['对照', 'true'], ['译文', 'false']])
    expect(radios.map(r => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('moves the choice with the arrows, wrapping', async () => {
    const { container, onChange } = await mount('translation')
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('original')
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('bilingual')
  })

  it('takes 1, 2 and 3 anywhere on the page, but not where text goes', async () => {
    const { onChange } = await mount('original')
    await key(document.body, '3')
    expect(onChange).toHaveBeenLastCalledWith('translation')
    const input = document.body.appendChild(document.createElement('input'))
    await key(input, '2')
    expect(onChange).toHaveBeenCalledTimes(1)
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true })) })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('greys the translated displays when there is no translation to be had, and skips them', async () => {
    const { container, onChange } = await mount('original', false)
    const radios = [...container.querySelectorAll('[role="radio"]')]
    expect(radios.map(r => r.getAttribute('aria-disabled'))).toEqual([null, 'true', 'true'])
    ;(radios[1] as HTMLElement).click()
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowRight')
    await key(document.body, '2')
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

```bash
pnpm vitest run tests/pdf-reader/ui/display-switch.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/pdf-reader/ui/DisplaySwitch"`.

- [ ] **Step 2: The switch** — create `src/pdf-reader/ui/DisplaySwitch.tsx`:

```tsx
// The display switch (the reader's design, §6.2): three equal 40 px segments in a well, whatever the interface's
// language, the chosen one on a lifted thumb that slides; icons, the words in tooltips and to screen readers. A single
// choice, so a radio group: arrows move the choice (a display that cannot be had skipped), and 1, 2, 3 choose anywhere on
// the page outside a text field
import { type KeyboardEvent, useEffect, useRef } from 'react'
import { R } from '@/ui/strings'
import type { Display } from '../controller'
import { DisplayIcon } from './icons'
import { useTip } from './tip'

const ORDER: readonly Display[] = ['original', 'bilingual', 'translation']
/** a key typed where text goes is the text's */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

export function DisplaySwitch({ value, translatable, onChange }: { value: Display; translatable: boolean; onChange: (display: Display) => void }) {
  const can = (d: Display) => d === 'original' || translatable
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const choose = (d: Display, focus = false) => {
    if (!can(d) || d === value) return
    onChange(d)
    if (focus) buttons.current[ORDER.indexOf(d)]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    let i = ORDER.indexOf(value)
    for (let k = 0; k < ORDER.length; k++) {
      i = (i + step + ORDER.length) % ORDER.length
      if (can(ORDER[i]!)) return choose(ORDER[i]!, true)
    }
  }
  // 1, 2, 3 anywhere on the page, outside a text field and without a modifier (⌘1 is the browser's)
  const latest = useRef(choose)
  latest.current = choose
  useEffect(() => {
    const onDoc = (e: globalThis.KeyboardEvent) => {
      const n = ['1', '2', '3'].indexOf(e.key)
      if (n < 0 || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      latest.current(ORDER[n]!)
    }
    document.addEventListener('keydown', onDoc)
    return () => document.removeEventListener('keydown', onDoc)
  }, [])
  const names: Record<Display, string> = { original: R.display.original, bilingual: R.display.bilingual, translation: R.display.translation }
  return (
    <div role="radiogroup" aria-label={R.display.name} className="seg display" style={{ '--i': ORDER.indexOf(value) } as React.CSSProperties} onKeyDown={onKey}>
      <span className="thumb" aria-hidden="true" />
      {ORDER.map((d, i) => (
        <Segment key={d} display={d} name={names[d]} hint={String(i + 1)} checked={d === value} disabled={!can(d)} onPick={() => choose(d)} buttonRef={el => { buttons.current[i] = el }} />
      ))}
    </div>
  )
}

function Segment({ display, name, hint, checked, disabled, onPick, buttonRef }: { display: Display; name: string; hint: string; checked: boolean; disabled: boolean; onPick: () => void; buttonRef: (el: HTMLButtonElement | null) => void }) {
  const { props, tip } = useTip(name, hint)
  return (
    <>
      <button ref={buttonRef} type="button" role="radio" aria-checked={checked} aria-disabled={disabled || undefined} aria-label={name} tabIndex={checked ? 0 : -1} onClick={onPick} {...props}>
        <DisplayIcon display={display} />
      </button>
      {tip}
    </>
  )
}
```

- [ ] **Step 3: Its styles** — inside `@layer components` in `reader.css`, add:

```css
  /* a segmented control: equal segments in a well, the chosen one on a lifted thumb that slides (§6.2, §7) */
  .seg { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; height: 30px; padding: 2px; border-radius: 9px; background: var(--well); --i: 0; }
  .seg .thumb { position: absolute; inset-block: 2px; inset-inline-start: 2px; width: calc((100% - 4px) / var(--n, 3)); border-radius: 7px; background: var(--lift);
    box-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.08); translate: calc(var(--i) * 100%) 0; transition: translate 220ms var(--ease); pointer-events: none; }
  .seg > button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; height: 100%; padding: 0 12px; border-radius: 7px; color: var(--ink-2); font: 500 12.5px/1 var(--font); white-space: nowrap; transition: color 150ms ease-out; }
  .seg > button[aria-checked="true"], .seg > button[aria-pressed="true"] { color: var(--ink); }
  .seg > button:not([aria-checked="true"]):not([aria-disabled="true"]):hover { color: var(--ink); }
  .seg > button[aria-disabled="true"] { color: var(--ink-3); opacity: 0.55; }
  .seg.display > button { width: 40px; padding: 0; }
  .seg.small { height: 26px; }
  .seg.small > button { padding: 0 10px; font-size: 12px; }
```

  and after the `@layer` block: `@media (prefers-reduced-motion: reduce) { .seg .thumb { transition: none; } }`.

- [ ] **Step 4: Run the test**

```bash
pnpm vitest run tests/pdf-reader/ui/display-switch.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: The gate and the commit**

```bash
git add src/pdf-reader/ui/DisplaySwitch.tsx src/entrypoints/pdf-reader/reader.css tests/pdf-reader/ui/display-switch.test.tsx
pnpm typecheck && pnpm lint && pnpm test
git commit -F - <<'EOF'
feat(pdf-reader): the display switch

Three 40 px segments in a well with a sliding thumb, whatever the
interface's language: 原文, 对照, 译文 as icons, their words in tooltips and
to screen readers. A radio group: arrows move the choice, 1, 2, 3 choose it
anywhere outside a text field, and a display that cannot be had is greyed and
skipped.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 17: the toolbar — title, display, swap, sync, zoom, settings, leave

**Files:**
- Modify: `src/pdf-reader/engine/session.mjs`, `session.d.mts` (the `paper` event), `src/pdf-reader/controller.ts`
- Create: `src/pdf-reader/ui/Toolbar.tsx`, `src/pdf-reader/ui/PaperTitle.tsx`
- Modify: `src/entrypoints/pdf-reader/App.tsx`, `reader.css`
- Test: `tests/pdf-reader/controller.test.ts`, create `tests/pdf-reader/ui/fake-controller.ts`,
  `tests/pdf-reader/ui/toolbar.test.tsx`; `reader-ui.mjs` gains its toolbar checks

**Interfaces:**
- Consumes: `ToolbarButton`, `useTip` (Task 15), `DisplaySwitch` (Task 16), `Icon` (Task 14).
- Produces: the session's event `{ type: 'paper'; id: string; title: string }`; `ReaderState.paper: { id, title }`
  (the id from the address at once, the title when it is known); `Toolbar({ controller, state, embedded })`, whose
  trail later tasks fill; `fakeController(state?)` for the interface's tests: `{ controller, set(partial) }`, every
  command a `vi.fn()`.

- [ ] **Step 1: The failing tests** — in `tests/pdf-reader/controller.test.ts`, inside `describe('reduce: …')`:

```ts
  it('knows the paper and its title', () => {
    expect(fold([{ type: 'paper', id: '2608.02163', title: 'A Title' }]).paper).toEqual({ id: '2608.02163', title: 'A Title' })
  })
```

  and inside `describe('createController', …)`:

```ts
  it('knows the paper\'s id from the address before the session says anything', () => {
    const controller = createController({ open: async () => fakeSession(), params: new URLSearchParams('paper=hep-th/9711200') })
    expect(controller.getState().paper).toEqual({ id: 'hep-th/9711200', title: '' })
  })
```

  Create `tests/pdf-reader/ui/fake-controller.ts`:

```ts
// A controller for the interface's tests: a state the test sets, every command a spy
import { vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { INITIAL, type ReaderController, type ReaderState } from '@/pdf-reader/controller'

export function fakeController(over: Partial<ReaderState> = {}) {
  let state: ReaderState = { ...INITIAL, settings: DEFAULT_CONFIG, paper: { id: '2608.02163', title: 'From Simple QA to Deep Research' }, display: 'bilingual', phase: 'ready', ...over }
  const listeners = new Set<() => void>()
  const controller = {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
    attach: vi.fn(async () => ({})),
    setDisplay: vi.fn(), setSync: vi.fn(), setFigures: vi.fn(), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn(), patchSettings: vi.fn(),
  } as unknown as ReaderController & Record<string, ReturnType<typeof vi.fn>>
  return { controller, set(next: Partial<ReaderState>) { state = { ...state, ...next }; for (const l of listeners) l() } }
}
```

  (Later tasks add their commands to this list as the controller gains them.)

  Create `tests/pdf-reader/ui/toolbar.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { Toolbar } from '@/pdf-reader/ui/Toolbar'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers(); fakeBrowser.reset() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const mount = (over = {}, embedded = true) => {
  const fake = fakeController(over)
  return mountElement(createElement(Toolbar, { controller: fake.controller, embedded })).then(m => ({ ...m, ...fake }))
}
const button = (c: HTMLElement, name: string) => c.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!

describe('the toolbar (the reader\'s design, §6.1)', () => {
  it('shows the title, and the id as a link to the abstract page in a new tab', async () => {
    const { container } = await mount({ paper: { id: 'hep-th/9711200', title: 'Large N' } })
    expect(container.querySelector('[data-title]')!.textContent).toBe('Large N')
    const link = container.querySelector<HTMLAnchorElement>('a[data-arxiv]')!
    expect([link.textContent, link.href, link.target]).toEqual(['arXiv:hep-th/9711200', 'https://arxiv.org/abs/hep-th/9711200', '_blank'])
  })

  it('shows the id alone when no title is known (none in the PDF, the abstract page out of reach)', async () => {
    const { container } = await mount({ paper: { id: '2608.02163', title: '' } })
    expect(container.querySelector('[data-title]')).toBeNull()
    expect(container.querySelector('a[data-arxiv]')!.textContent).toBe('arXiv:2608.02163')
  })

  it('passes the display chosen, and sync and swap, which act side by side only', async () => {
    const { container, controller, set } = await mount()
    button(container, '译文').click()
    expect(controller.setDisplay).toHaveBeenCalledWith('translation')
    button(container, '同步滚动').click()
    expect(controller.setSync).toHaveBeenCalledWith(false)
    button(container, '交换左右').click()
    expect(controller.patchSettings).toHaveBeenCalledOnce()
    await act(async () => set({ display: 'translation' }))
    expect([button(container, '同步滚动').getAttribute('aria-disabled'), button(container, '交换左右').getAttribute('aria-disabled')]).toEqual(['true', 'true'])
  })

  it('zooms by a tenth each way, and shows the scale', async () => {
    const { container, controller } = await mount({ scale: 1.25 })
    expect(container.querySelector('[data-zoom-value]')!.textContent).toBe('125%')
    button(container, '放大').click()
    button(container, '缩小').click()
    expect(controller.zoomBy.mock.calls).toEqual([[1.1], [1 / 1.1]])
  })

  it('offers the way back only over arXiv\'s page', async () => {
    const over = await mount({}, true)
    expect(button(over.container, '在默认查看器中打开')).toBeTruthy()
    await over.unmount()
    const alone = await mount({}, false)
    expect(alone.container.querySelector('button[aria-label="在默认查看器中打开"]')).toBeNull()
  })
})
```

```bash
pnpm vitest run tests/pdf-reader/controller.test.ts tests/pdf-reader/ui/toolbar.test.tsx
```

Expected: FAIL — `paper` is not in the state; `Toolbar` does not resolve.

- [ ] **Step 2: The paper in the controller** — in `session.d.mts`, add `| { type: 'paper'; id: string; title: string }` to
  `SessionEvent` (with the comment: the paper's id and its title for the toolbar, '' until known). In `controller.ts`:
  `ReaderState` gains `/** the paper: its id from the address, its title once known ('' until then, or when there is none) */ paper: { id: string; title: string }`,
  `INITIAL` gains `paper: { id: '', title: '' }`, `reduce` gains
  `case 'paper': return { ...state, paper: { id: event.id, title: event.title } }`, and `createController` begins with
  `let state: ReaderState = { ...INITIAL, paper: { id: params.get('paper') ?? '', title: '' } }` in place of
  `let state = INITIAL`.

- [ ] **Step 3: The title in the session** — in `session.mjs`, after `function showMode() { … }`, add:

```js
/**
 * The paper's title for the toolbar (the reader's design, §6.1): the PDF's own metadata title; when it carries none,
 * the abstract page's citation_title, one request to arXiv made only then (the extension may read arxiv.org); a demo's,
 * its first heading. None found, the toolbar shows the id alone
 */
async function reportPaper(doc, fallback = '') {
  const meta = await doc.getMetadata().catch(() => null)
  let title = String(meta?.info?.Title ?? '').trim()
  if (!title && !fallback) title = await abstractTitle()
  host.emit({ type: 'paper', id: paper, title: title || fallback })
}
async function abstractTitle() {
  try {
    const res = await fetch(`https://arxiv.org/abs/${paper}`, { credentials: 'omit' })
    if (!res.ok) return ''
    return new DOMParser().parseFromString(await res.text(), 'text/html').querySelector('meta[name="citation_title"]')?.getAttribute('content')?.trim() ?? ''
  } catch {
    return ''
  }
}
```

  In `live()`, after `note('opened')`, add `void reportPaper(left.doc)`; in `demo()`, after the `Promise.all` that opens
  both sides, add `void reportPaper(left.doc, units.find(u => u.kind === 'heading')?.src ?? '')`.

- [ ] **Step 4: The title's component** — create `src/pdf-reader/ui/PaperTitle.tsx`:

```tsx
// The lead of the toolbar (the reader's design, §6.1): the title, one line, truncating first, whole in its tooltip; the
// arXiv id in ink-2 tabular figures, a link to the abstract page in a new tab, an arrow sliding in on hover or focus.
// Below 1100 px only the id is left, and its tooltip carries the title
import { ArrowUpRight } from 'lucide'
import { R } from '@/ui/strings'
import { Icon } from './icons'
import { useTip } from './tip'

export function PaperTitle({ id, title }: { id: string; title: string }) {
  const whole = useTip(title)
  const link = useTip(title || R.abstract, title ? R.abstract : undefined)
  return (
    <div className="paper-title flex min-w-0 items-baseline gap-2 ps-1.5">
      {title && (
        <>
          <b data-title className="min-w-0 truncate text-[13px] font-semibold" {...whole.props}>
            {title}
          </b>
          {whole.tip}
        </>
      )}
      {id && (
        <>
          <a data-arxiv href={`https://arxiv.org/abs/${id}`} target="_blank" rel="noopener noreferrer" className="arxiv-id" {...link.props}>
            arXiv:{id}
            <Icon node={ArrowUpRight} size={12} />
          </a>
          {link.tip}
        </>
      )}
    </div>
  )
}
```

  Inside `@layer components` in `reader.css`, add:

```css
  .arxiv-id { display: inline-flex; flex: none; align-items: center; gap: 2px; margin: -2px -4px; padding: 2px 4px; border-radius: 5px; color: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; text-decoration: none; transition: color 150ms, background-color 150ms; }
  .arxiv-id svg { opacity: 0; translate: -2px 2px; transition: opacity 150ms, translate 150ms ease-out; }
  .arxiv-id:hover, .arxiv-id:focus-visible { color: var(--ink); background: var(--fill); }
  .arxiv-id:hover svg, .arxiv-id:focus-visible svg { opacity: 1; translate: 0 0; }
  @media (width < 1100px) { .paper-title [data-title] { display: none; } }
```

- [ ] **Step 5: The toolbar** — create `src/pdf-reader/ui/Toolbar.tsx`:

```tsx
// The toolbar (the reader's design, §5, §6.1): 44 px, three zones — the lead (the contents, the title, the id), the
// centre (the display switch), the trail (the side-by-side pair, zoom, the translation's menus and the reading options,
// the download, the settings, the way back), a hairline divider between the trail's groups. Everything here goes
// through the controller; nothing reads the viewers
import { ArrowLeftRight, Link2, LogOut, Minus, Plus, Settings } from 'lucide'
import { browser } from 'wxt/browser'
import { R, S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { DisplaySwitch } from './DisplaySwitch'
import { Icon } from './icons'
import { PaperTitle } from './PaperTitle'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'

/** ⌘ on a Mac, Ctrl elsewhere, as the zoom's shortcuts show them */
const MOD = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'
const openSettings = () => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)('/options.html#pdf-reader') })

export function Toolbar({ controller, embedded }: { controller: ReaderController; embedded: boolean }) {
  const state = useReader(controller)
  const reader = state.settings?.pdfReader
  const sideBySide = state.display === 'bilingual' && !state.narrow
  return (
    <header role="toolbar" aria-label={R.bar} className="chrome">
      <div data-zone="lead" className="flex min-w-0 items-center gap-1">
        <PaperTitle id={state.paper.id} title={state.paper.title} />
      </div>
      <div data-zone="centre" className="flex items-center">
        <DisplaySwitch value={state.display} translatable={state.available && state.languageSupported} onChange={controller.setDisplay} />
      </div>
      <div data-zone="trail" className="flex items-center gap-1 justify-self-end">
        <ToolbarButton label={R.swap} pressed={reader?.swapped ?? false} disabled={!sideBySide} onClick={() => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, swapped: !c.pdfReader.swapped } }))}>
          <Icon node={ArrowLeftRight} />
        </ToolbarButton>
        <ToolbarButton label={R.sync} pressed={reader?.sync ?? true} disabled={!sideBySide} onClick={() => controller.setSync(!(reader?.sync ?? true))}>
          <Icon node={Link2} />
        </ToolbarButton>
        <span className="divider" />
        <div className="flex items-center" data-zoom>
          <ToolbarButton label={R.zoom.out} hint={`${MOD} −`} onClick={() => controller.zoomBy(1 / 1.1)} className="!w-[26px] !min-w-[26px]">
            <Icon node={Minus} />
          </ToolbarButton>
          <span data-zoom-value className="min-w-[52px] px-1.5 text-center text-[12.5px] tabular-nums">{Math.round(state.scale * 100)}%</span>
          <ToolbarButton label={R.zoom.in} hint={`${MOD} +`} onClick={() => controller.zoomBy(1.1)} className="!w-[26px] !min-w-[26px]">
            <Icon node={Plus} />
          </ToolbarButton>
        </div>
        <span className="divider" />
        <ToolbarButton label={S.settings} onClick={openSettings}>
          <Icon node={Settings} />
        </ToolbarButton>
        {embedded && (
          <ToolbarButton label={R.leave} data-leave onClick={() => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')}>
            <Icon node={LogOut} />
          </ToolbarButton>
        )}
      </div>
    </header>
  )
}
```

  `state.narrow` is Task 23's; until then add `narrow: false` to `ReaderState` and `INITIAL` with the comment "the window
  too narrow for two sides: 对照 shows the translation alone (Task 23 sets it)".

- [ ] **Step 6: The page takes the toolbar** — in `App.tsx`, replace the `<header …>…</header>` element with
  `<Toolbar controller={controller} embedded={embedded} />`, import it, drop the unused `R` import, and add, after the
  swapped effect, `useEffect(() => { document.title = state.paper.title || 'Read arXiv' }, [state.paper.title])` (the
  tab says what is being read; the product's name until the title is known).

- [ ] **Step 7: The browser check** — in `reader-ui.mjs`, above the summary line, add:

```js
// ---------------------------------------------------------------- Task 17: the toolbar
{
  const page = await open({ mode: 'bilingual' })
  const s = await state(page)
  check('the title is known, from the PDF or its first heading', s.paper.title.length > 10, JSON.stringify(s.paper))
  check('the tab carries the title', (await page.title()) === s.paper.title)
  await page.getByRole('radio', { name: '译文' }).click()
  await page.waitForTimeout(500)
  check('the display switch changes the display', (await state(page)).display === 'translation')
  check('sync and swap grey out in a single display', await page.evaluate(() => ['同步滚动', '交换左右'].every(n => document.querySelector(`button[aria-label="${n}"]`)?.getAttribute('aria-disabled') === 'true')))
  await page.keyboard.press('2')
  await page.waitForTimeout(500)
  check('the 2 key comes back to side by side', (await state(page)).display === 'bilingual')
  const before = (await state(page)).scale
  await page.getByRole('button', { name: '放大' }).click()
  await page.waitForTimeout(300)
  check('zooming in scales both sides by a tenth', Math.abs((await state(page)).scale - before * 1.1) < 0.01, `${before} → ${(await state(page)).scale}`)
  await page.getByRole('button', { name: '放大' }).hover()
  await page.waitForTimeout(700)
  check('a tooltip after the hover, one line', await page.evaluate(() => { const t = [...document.querySelectorAll('.tip')].find(x => x.matches(':popover-open')); return !!t && t.getBoundingClientRect().height < 30 }))
  await shot(page, '17-toolbar')
  await page.close()
}
```

- [ ] **Step 8: Run the checks**

```bash
pnpm vitest run tests/pdf-reader && pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs && node tests/e2e/pdf-entry.mjs
```

Expected: the unit tests pass; `all passed`; `e2e:pdf` 19/19 (its way-back button is `button[data-leave]` still).

- [ ] **Step 9: The gate, the commit, and the checkpoint**

```bash
git add src/pdf-reader/engine/session.mjs src/pdf-reader/engine/session.d.mts src/pdf-reader/controller.ts src/pdf-reader/ui/Toolbar.tsx src/pdf-reader/ui/PaperTitle.tsx src/entrypoints/pdf-reader/App.tsx src/entrypoints/pdf-reader/reader.css tests/pdf-reader/controller.test.ts tests/pdf-reader/ui/fake-controller.ts tests/pdf-reader/ui/toolbar.test.tsx experiments/pdf-bilingual/spikes/reader-ui.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the toolbar

The title (the PDF's own, else the abstract page's, requested only then),
the id as a link to the abstract page, the display switch, the side-by-side
pair greyed in a single display, zoom by a tenth with the scale shown, the
settings and the way back. The tab carries the title.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

  **Checkpoint**: copy `.output/chrome-mv3` to `~/Downloads/readarxiv-test/readarxiv-0.4.1dev-pdf-reader-<sha>/` with its
  zip, and tell the maintainer what to look at (the frame, the toolbar, the switch, dark pages, the reading width) with
  the screenshots in `out/reader-ui/`. The work goes on meanwhile.

### Task 18: a menu's behaviour, shared and made accessible (§9.4); the reader's popover

**Files:**
- Create: `src/ui/menu-nav.ts`; modify `src/ui/Menu.tsx` (rebuilt on it)
- Create: `src/pdf-reader/ui/Popover.tsx`; modify `src/pdf-reader/ui/ToolbarButton.tsx`, `reader.css`
- Test: `tests/ui/menu.test.ts` (a new `describe`), create `tests/pdf-reader/ui/popover.test.tsx`

**Interfaces:**
- Produces: `useMenuNav({ count, initial, isDisabled, labelOf, onPick, onClose, typeahead }): { active, setActive,
  onKeyDown, activeId, idOf }`; the popup's `Menu` with the same props as today, its rows `role="option"` elements with
  no button inside, an item's `action` shown inside its row and run by picking it; `usePopover(kind)`:
  `{ open, anchor, trigger, popover }` — `trigger` spread on the button (`popovertarget`, `aria-haspopup`,
  `aria-expanded`), `popover` spread on `Popover`; `Popover({ id, anchor, role, label, onClosed, className, children })`;
  `ToolbarButton` gains `anchor?: string` (the popover's anchor name, beside the tooltip's).

- [ ] **Step 1: The failing tests** — at the end of `tests/ui/menu.test.ts`, add:

```ts
describe('Menu keyboard and semantics (the reader\'s design, §9.4)', () => {
  const g = globalThis as { getComputedStyle: typeof getComputedStyle }
  const saved = g.getComputedStyle
  beforeEach(() => {
    g.getComputedStyle = ((el: Element) => new Proxy(saved(el), { get: (t, k) => (k === 'transform' ? 'none' : Reflect.get(t, k)) })) as typeof getComputedStyle
  })
  afterEach(() => { g.getComputedStyle = saved; document.body.innerHTML = '' })
  const five = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((name, i) => ({ id: name.toLowerCase(), name, selected: i === 1, disabled: name === 'Gamma' }))
  async function open(extra: Record<string, unknown> = {}) {
    const trigger = document.body.appendChild(document.createElement('button'))
    const ref = createRef<HTMLElement>()
    ref.current = trigger
    const picked: string[] = [], closed: number[] = []
    const mounted = await mountElement(createElement(Menu, { anchor: ref, items: five, label: 'L', onSelect: (id: string) => picked.push(id), onClose: () => closed.push(1), ...extra }))
    const list = mounted.container.querySelector<HTMLElement>('[role="listbox"]')!
    const key = (k: string) => act(async () => { list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
    return { list, key, picked, closed, trigger }
  }
  const active = (list: HTMLElement) => document.getElementById(list.getAttribute('aria-activedescendant') ?? '')?.textContent

  it('announces the active item, and skips a disabled one', async () => {
    const { list, key } = await open()
    expect(active(list)).toBe('Beta')
    await key('ArrowDown')
    expect(active(list)).toBe('Delta')
  })

  it('goes to either end with Home and End, and to an item by its first letter', async () => {
    const { list, key } = await open()
    await key('End')
    expect(active(list)).toBe('Epsilon')
    await key('Home')
    expect(active(list)).toBe('Alpha')
    await key('d')
    expect(active(list)).toBe('Delta')
  })

  it('puts no button inside the list, and runs an item\'s action when that item is picked', async () => {
    const acted: string[] = []
    const withAction = [...five.slice(0, 4), { id: 'pack', name: 'Pack', selected: false, disabled: true, action: { label: 'Get' } }]
    const { list, key } = await open({ items: withAction, onAction: (id: string) => acted.push(id) })
    expect(list.querySelector('button')).toBeNull()
    await key('End')
    await key('Enter')
    expect(acted).toEqual(['pack'])
  })

  it('gives the focus back to its trigger when it closes with a pick or Escape', async () => {
    const { key, picked, closed, trigger } = await open()
    await key('Enter')
    expect([picked, document.activeElement]).toEqual([['beta'], trigger])
    await key('Escape')
    expect(closed.length).toBe(2)
  })
})
```

  (`act` joins the file's imports from `react`.) Create `tests/pdf-reader/ui/popover.test.tsx`:

```tsx
import { act, createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Popover, usePopover } from '@/pdf-reader/ui/Popover'
import { mountElement } from '../../ui/render-hook'
import { isOpen, stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

function Harness() {
  const pop = usePopover('menu')
  const [closedCount, setClosed] = useState(0)
  return createElement('div', null,
    createElement('button', { ...pop.trigger, 'data-trigger': '' }, 'open'),
    createElement(Popover, { ...pop.popover, role: 'menu', label: 'Zoom', onClosed: () => setClosed(n => n + 1) }, createElement('button', { 'data-inside': '' }, 'item')),
    createElement('output', null, String(closedCount)))
}

describe('the reader\'s popover (the reader\'s design, §6.7)', () => {
  it('is a light-dismiss popover its button opens, the button saying whether it is open', async () => {
    const { container } = await mountElement(createElement(Harness))
    const trigger = container.querySelector<HTMLButtonElement>('[data-trigger]')!, pop = container.querySelector<HTMLElement>('[popover]')!
    expect([pop.getAttribute('popover'), trigger.getAttribute('popovertarget'), pop.id]).toEqual(['auto', pop.id, pop.id])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { pop.showPopover() })
    expect([isOpen(pop), trigger.getAttribute('aria-expanded')]).toEqual([true, 'true'])
  })

  it('gives the focus back to its button when it closes with the focus inside', async () => {
    const { container } = await mountElement(createElement(Harness))
    const trigger = container.querySelector<HTMLButtonElement>('[data-trigger]')!, pop = container.querySelector<HTMLElement>('[popover]')!
    await act(async () => { pop.showPopover() })
    container.querySelector<HTMLButtonElement>('[data-inside]')!.focus()
    await act(async () => { pop.hidePopover() })
    expect(document.activeElement).toBe(trigger)
    expect(container.querySelector('output')!.textContent).toBe('1')
  })
})
```

```bash
pnpm vitest run tests/ui/menu.test.ts tests/pdf-reader/ui/popover.test.tsx
```

Expected: FAIL — no `aria-activedescendant`, a `button` inside the list, `Popover` does not resolve.

- [ ] **Step 2: The behaviour** — create `src/ui/menu-nav.ts`:

```ts
// A menu's keyboard behaviour (the reader's design, §9.4), one for the popup's Menu and the reader's menus: the arrows
// move the active item, and assistive technology hears of it through aria-activedescendant; Home and End go to the
// ends; a letter goes to the next item that begins with it (a few typed quickly spell a word); Enter or Space picks,
// Escape closes. A disabled item is passed over — unless it carries an action, which picking it runs
import { type KeyboardEvent, useId, useRef, useState } from 'react'

export interface MenuNav {
  active: number
  setActive: (index: number) => void
  onKeyDown: (e: KeyboardEvent) => void
  /** the active item's element id, for aria-activedescendant on the element with the focus */
  activeId: string | undefined
  idOf: (index: number) => string
}

export function useMenuNav({ count, initial, isDisabled, labelOf, onPick, onClose, typeahead = true }: {
  count: number
  initial: number
  isDisabled: (index: number) => boolean
  labelOf: (index: number) => string
  onPick: (index: number) => void
  onClose: () => void
  /** off where a search field has the focus: the letters are its */
  typeahead?: boolean
}): MenuNav {
  const base = useId()
  const [active, setActive] = useState(() => Math.max(0, initial))
  const typed = useRef({ text: '', at: 0 })
  const step = (from: number, by: 1 | -1) => {
    for (let i = from + by, k = 0; k < count; i += by, k++) {
      const j = (i + count) % count
      if (!isDisabled(j)) return j
    }
    return from
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (!count) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => step(a, 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => step(a, -1)); return }
    if (e.key === 'Home') { e.preventDefault(); setActive(step(-1, 1)); return }
    if (e.key === 'End') { e.preventDefault(); setActive(step(count, -1)); return }
    if (e.key === 'Enter' || (e.key === ' ' && typeahead)) { e.preventDefault(); onPick(active); return }
    if (typeahead && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = e.timeStamp || performance.now()
      typed.current = { text: now - typed.current.at < 500 ? typed.current.text + e.key.toLowerCase() : e.key.toLowerCase(), at: now }
      const q = typed.current.text
      for (let k = 1; k <= count; k++) {
        const j = (active + (q.length > 1 ? 0 : k)) % count
        if (!isDisabled(j) && labelOf(j).toLowerCase().startsWith(q)) { setActive(j); return }
        if (q.length > 1 && k === 1) continue
      }
    }
  }
  const idOf = (index: number) => `${base}-item-${index}`
  return { active, setActive, onKeyDown, activeId: count ? idOf(active) : undefined, idOf }
}
```

  (The typeahead loop's `q.length > 1` branch is meant as: a single letter searches from the item after the active
  one, a word from the active one itself; write it as two plain loops if the one above reads badly when implementing —
  the tests fix the behaviour.)

- [ ] **Step 3: The popup's `Menu` on it** — in `src/ui/Menu.tsx`:
  - replace the `active` state and the `onKey` handler with
    `const nav = useMenuNav({ count: shown.length, initial: shown.findIndex(i => i.selected), isDisabled: i => !!shown[i]?.disabled && !shown[i]?.action, labelOf: i => shown[i]?.name ?? '', onPick: i => pick(shown[i]), onClose: close, typeahead: !search })`,
    with `const close = () => { (trigger ?? anchor).current?.focus(); onClose() }` and
    `const pick = (item?: MenuItem) => { if (!item) return; if (item.action && item.disabled) { onAction?.(item.id); return } if (item.disabled) return; (trigger ?? anchor).current?.focus(); onSelect(item.id) }`;
    the search field's `onChange` calls `nav.setActive(0)`; the scroll-into-view effect reads `nav.active`;
  - the root gets `aria-activedescendant={nav.activeId}` and `onKeyDown={nav.onKeyDown}`; the search field keeps the
    focus and passes its keys to the same handler (`onKeyDown={nav.onKeyDown}` on it too, since keys typed there must
    reach the list);
  - each row becomes one element:
    `<div key={item.id} id={nav.idOf(index)} role="option" aria-selected={item.selected} aria-disabled={item.disabled || undefined} data-index={index} onMouseEnter={() => nav.setActive(index)} onClick={() => pick(item)} className={`flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2 ${index === nav.active ? 'bg-control' : ''} ${item.disabled && !item.action ? 'cursor-default text-fg-2' : 'text-fg'}`}>`
    holding the name and hint as now, the `Check` when selected, and the action as a span —
    `{item.action && (item.action.busy ? <Spinner className="text-accent" /> : <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-white">{item.action.label}</span>)}`;
  - an outside press still calls `onClose` alone: the focus stays where the reader put it.

  Then look for anyone who found the rows as buttons:

```bash
grep -rn "button\[role=.option\|role=\"option\"\]" tests src | grep -v "src/ui/Menu.tsx"
```

  Expected: nothing, or selectors to update to `[role="option"]` in the same commit.

- [ ] **Step 4: The reader's popover** — create `src/pdf-reader/ui/Popover.tsx`:

```tsx
// The reader's popovers (the reader's design, §6.7): anchored under their button, 6 px below it, kept within the window
// (position-try); they grow from the button. The browser's own light-dismiss popover: its button opens and closes it
// (popovertarget), Escape and a press outside close it; the focus comes back to the button when it closes with the
// focus inside. Its contents are drawn only while it is open
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

export function usePopover(kind: 'menu' | 'listbox' | 'dialog') {
  const raw = useId().replace(/[^\w-]/g, '')
  const id = `pop-${raw}`, anchor = `--pop-${raw}`
  const [open, setOpen] = useState(false)
  return {
    open,
    anchor,
    trigger: { popoverTarget: id, 'aria-haspopup': kind, 'aria-expanded': open } as const,
    popover: { id, anchor, open, onOpenChange: setOpen },
  }
}

export function Popover({ id, anchor, open, onOpenChange, role, label, onClosed, className = '', children }: {
  id: string
  anchor: string
  open: boolean
  onOpenChange: (open: boolean) => void
  role: 'menu' | 'listbox' | 'dialog'
  label: string
  onClosed?: () => void
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onToggle = (e: Event) => {
      const now = (e as Event & { newState?: string }).newState === 'open'
      onOpenChange(now)
      if (now) return
      if (el.contains(document.activeElement) || document.activeElement === document.body) document.querySelector<HTMLElement>(`[popovertarget="${id}"]`)?.focus()
      onClosed?.()
    }
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [id, onOpenChange, onClosed])
  return (
    <div ref={ref} id={id} popover="auto" role={role} aria-label={label} className={`pop chrome ${className}`} style={{ positionAnchor: anchor } as React.CSSProperties}>
      {open && children}
    </div>
  )
}
```

  In `ToolbarButton.tsx`, add the prop `anchor?: string` and give the button
  `style={{ anchorName: anchor ? `${(props.style as { anchorName: string }).anchorName}, ${anchor}` : (props.style as { anchorName: string }).anchorName } as React.CSSProperties}`
  after spreading `props` (a control can be the anchor of its tooltip and of its popover at once: `anchor-name` takes a
  list).

  Inside `@layer components` in `reader.css`, add:

```css
  /* popovers (§6.7): under their button, 6 px below, kept inside the window; they grow from it */
  .pop { position: fixed; inset: auto; margin: 6px 0 0; position-area: bottom span-right; position-try-fallbacks: bottom span-left, bottom;
    min-width: 220px; max-height: calc(100vh - var(--bar) - 16px); overflow: auto; padding: 4px; border: 0; border-radius: 12px;
    background: var(--chrome); color: var(--ink); box-shadow: var(--pop-shadow); font-size: 13px; transform-origin: top left; }
  .pop:popover-open { animation: pop-in 150ms var(--ease); }
  .pop .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 34px; padding: 0 10px; }
  .pop .sep { height: 0.5px; margin: 4px 8px; background: var(--chrome-line); }
```

  and after the layer: `@keyframes pop-in { from { opacity: 0; scale: 0.97; translate: 0 -4px; } }` with
  `@media (prefers-reduced-motion: reduce) { @keyframes pop-in { from { opacity: 0; } } }`.

- [ ] **Step 5: Run the tests**

```bash
pnpm vitest run tests/ui tests/pdf-reader/ui tests/popup
```

Expected: PASS, the popup's own menu tests with them.

- [ ] **Step 6: The popup, by hand** — `pnpm build`, load `.output/chrome-mv3`, open the popup on an arXiv page:
  the service and language menus look as before; the arrows, Home, End and a letter move the highlight; Enter picks;
  Escape closes with the focus back on the row. Then `pnpm e2e` for the popup's own checks.

Expected: as described; `pnpm e2e` passes.

- [ ] **Step 7: The gate and the commit**

```bash
git add src/ui/menu-nav.ts src/ui/Menu.tsx src/pdf-reader/ui/Popover.tsx src/pdf-reader/ui/ToolbarButton.tsx src/entrypoints/pdf-reader/reader.css tests/ui/menu.test.ts tests/pdf-reader/ui/popover.test.tsx
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(ui): a menu's keyboard behaviour, shared and accessible

useMenuNav is the popup's Menu's behaviour and the reader's menus': the
active item announced through aria-activedescendant, Home and End, a letter
to jump to an item, the focus back on the trigger when a pick or Escape
closes it, a disabled item passed over unless it carries an action. The
popup's rows are options with no button inside; an action shows in its row
and runs when the row is picked. The reader's popovers are the browser's
light-dismiss popovers, anchored under their button.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 19: the menus — zoom, language, service, download

**Files:**
- Create: `src/ui/service-items.ts` (moved from `src/entrypoints/popup/view-model.ts`), `src/pdf-reader/ui/languages.ts`,
  `src/pdf-reader/ui/ReaderMenu.tsx`, `src/pdf-reader/ui/Menus.tsx`
- Modify: `src/entrypoints/popup/view-model.ts`, `src/pdf-reader/engine/session.mjs`, `session.d.mts`,
  `src/pdf-reader/controller.ts`, `src/pdf-reader/ui/Toolbar.tsx`
- Test: `tests/pdf-reader/ui/menus.test.tsx`, `tests/pdf-reader/ui/languages.test.ts`, `tests/pdf-reader/controller.test.ts`

**Interfaces:**
- Consumes: `useMenuNav`, `Popover`, `usePopover` (Task 18).
- Produces: `serviceItems(config, pack): MenuItem[]` and `MANAGE_SERVICES` from `src/ui/service-items.ts`;
  `READER_LANGUAGES: readonly LangCode[]` and `languageItems(current)`; the `settings` event
  `{ type: 'settings'; config: Config; pack: PackState | null }`; `ReaderState.pack`; `ReaderState.zoom:
  'page-width' | 'page-fit' | 'page-actual' | number | null` (the zoom last chosen from the menu, `null` after a step or
  a pinch); the session's `pdfBytes(which: 'translation' | 'original'): Promise<Uint8Array | null>`; the controller's
  `download(which): Promise<void>` saving `fileName(id, which, lang)` — `<id>.pdf` or `<id>.<lang>.pdf`, a slash in an
  old-style id made `_`.

- [ ] **Step 1: The failing tests** — create `tests/pdf-reader/ui/languages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LANG_CODES, toBcp47 } from '@/config/languages'
import { verified } from '@/pdf-reader/engine/scripts.mjs'
import { languageItems, READER_LANGUAGES } from '@/pdf-reader/ui/languages'

describe('the languages the reader typesets (the reader\'s design, §6.7)', () => {
  it('are the nine the typesetting gate verified, and every one of them', () => {
    expect(READER_LANGUAGES).toHaveLength(9)
    expect([...READER_LANGUAGES].sort()).toEqual(LANG_CODES.filter(c => verified(toBcp47(c))).sort())
  })

  it('are named each in its own language, in the design\'s order, the current one selected', () => {
    const items = languageItems('kor')
    expect(items.map(i => i.name)).toEqual(['日本語', '简体中文', '繁體中文', '한국어', 'Deutsch', 'Español', 'Français', 'Português', 'Русский'])
    expect(items.filter(i => i.selected).map(i => i.name)).toEqual(['한국어'])
  })
})
```

  Create `tests/pdf-reader/ui/menus.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileName } from '@/pdf-reader/controller'
import { DownloadMenu, LanguageMenu, ZoomMenu } from '@/pdf-reader/ui/Menus'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

async function openMenu(component: typeof ZoomMenu, over = {}) {
  const fake = fakeController(over)
  const mounted = await mountElement(createElement(component, { controller: fake.controller }))
  await act(async () => { mounted.container.querySelector<HTMLElement>('[popover]')!.showPopover() })
  return { ...mounted, ...fake }
}

describe('the reader\'s menus (the reader\'s design, §6.1, §6.7)', () => {
  it('zoom: the fits, then the scales, the current one checked; a pick zooms', async () => {
    const { container, controller } = await openMenu(ZoomMenu, { scale: 1.5, zoom: 1.5 })
    const items = [...container.querySelectorAll('[role="menuitemradio"]')]
    expect(items.map(i => i.textContent)).toEqual(['适合宽度', '适合页面', '实际大小', '50%', '75%', '100%', '125%', '150%', '200%'])
    expect(items.filter(i => i.getAttribute('aria-checked') === 'true').map(i => i.textContent)).toEqual(['150%'])
    ;(items[0] as HTMLElement).click()
    expect(controller.zoomTo).toHaveBeenCalledWith('page-width')
  })

  it('language: the search narrows the nine; a pick writes the target language', async () => {
    const { container, controller } = await openMenu(LanguageMenu)
    const search = container.querySelector<HTMLInputElement>('input')!
    await act(async () => { search.value = 'deu'; search.dispatchEvent(new Event('input', { bubbles: true })) })
    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map(o => o.textContent)).toEqual(['Deutsch'])
    ;(options[0] as HTMLElement).click()
    const change = controller.patchSettings.mock.calls[0]![0] as (c: { targetLanguage: string }) => { targetLanguage: string }
    expect(change({ targetLanguage: 'cmn' }).targetLanguage).toBe('deu')
  })

  it('download: the translation greyed until the final is on screen', async () => {
    const { container, controller } = await openMenu(DownloadMenu, { finalReady: false })
    const [translation, original] = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect([translation!.textContent, translation!.getAttribute('aria-disabled'), original!.textContent]).toEqual(['译文 PDF', 'true', '原文 PDF'])
    translation!.click()
    original!.click()
    expect(controller.download.mock.calls).toEqual([['original']])
  })

  it('names the files by the paper, an old-style id\'s slash made safe', () => {
    expect(fileName('2608.02163', 'original', 'zh')).toBe('2608.02163.pdf')
    expect(fileName('hep-th/9711200', 'translation', 'zh-Hant')).toBe('hep-th_9711200.zh-Hant.pdf')
  })
})
```

  Add `zoomTo`'s record and `download: vi.fn(async () => {})` to `fakeController`. In
  `tests/pdf-reader/controller.test.ts`, inside `describe('reduce: …')`:

```ts
  it('holds the language pack beside the settings', () => {
    expect(fold([{ type: 'settings', config: DEFAULT_CONFIG, pack: 'available' }]).pack).toBe('available')
  })
```

  and inside `describe('createController', …)`:

```ts
  it('remembers the zoom chosen from the menu, and forgets it on a step', async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, params: new URLSearchParams() })
    await controller.attach(panes())
    controller.zoomTo('page-fit')
    expect(controller.getState().zoom).toBe('page-fit')
    controller.zoomBy(1.1)
    expect(controller.getState().zoom).toBeNull()
  })
```

```bash
pnpm vitest run tests/pdf-reader
```

Expected: FAIL — `languages`, `Menus` and `fileName` do not resolve; `pack` and `zoom` are not in the state.

- [ ] **Step 2: The languages** — create `src/pdf-reader/ui/languages.ts`:

```ts
// The languages the reader typesets (the reader's design, §6.7): the nine the typesetting gate verified
// (engine/scripts.mjs VERIFIED), in the design's order, each named in its own language
import type { MenuItem } from '@/ui/Menu'
import { LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, type LangCode } from '@/config/languages'

export const READER_LANGUAGES: readonly LangCode[] = ['jpn', 'cmn', 'cmn-Hant', 'kor', 'deu', 'spa', 'fra', 'por', 'rus']

export function languageItems(current: string): MenuItem[] {
  return READER_LANGUAGES.map(code => ({
    id: code,
    name: LANG_CODE_TO_LOCALE_NAME[code],
    keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
    selected: code === current,
  }))
}
```

  (If the test finds a code of the nine spelt otherwise in `LANG_CODES`, the list takes the table's spelling.)

- [ ] **Step 3: The service list, shared** — move `serviceItems` and `MANAGE_SERVICES` from
  `src/entrypoints/popup/view-model.ts` into a new `src/ui/service-items.ts` as they are (with the imports they need:
  `Config`, `PackState`, `MenuItem`, `S`, `serviceRuns`, `supportsTarget`), export both, and import them back into the
  view model. No behaviour changes: the popup's tests are the check.

- [ ] **Step 4: The session's side** — in `session.d.mts`, the `settings` event becomes
  `{ type: 'settings'; config: Config; pack: PackState | null }` (import `PackState` from `@/shared/pack`), and add
  `export declare function pdfBytes(which: 'translation' | 'original'): Promise<Uint8Array | null>`. In `session.mjs`,
  `showSettings` emits `host.emit({ type: 'settings', config, pack: surface.state().pack ?? null })`, and after
  `goToPage` add:

```js
/** a side's PDF as it is shown, for the download (the reader's design, §6.1): the original, or the translation on screen */
export async function pdfBytes(which) {
  const side = which === 'original' ? left : right
  return side.doc ? side.doc.getData() : null
}
```

- [ ] **Step 5: The controller's side** — in `controller.ts`: `ReaderState` gains
  `/** the offline service's language pack, as the settings' surface knows it */ pack: PackState | null` and
  `/** the zoom last chosen from the menu; null after a step or a pinch */ zoom: 'page-width' | 'page-fit' | 'page-actual' | number | null`
  (`INITIAL`: `pack: null, zoom: 'page-width'`); `reduce`'s `settings` case keeps the pack
  (`return event.config === state.settings && event.pack === state.pack ? state : { ...state, settings: event.config, pack: event.pack }`);
  `Session` picks `'pdfBytes'`; and in `createController`, a local `const set = (patch: Partial<ReaderState>) => { state = { ...state, ...patch }; for (const l of listeners) l() }`,
  with `zoomBy: factor => { set({ zoom: null }); later(s => s.zoomBy(factor)) }`,
  `zoomTo: value => { set({ zoom: value }); later(s => s.zoomTo(value)) }`, and:

```ts
    async download(which) {
      const s = await session
      const bytes = await s?.pdfBytes(which)
      if (!bytes) return
      const lang = state.settings ? toBcp47(state.settings.targetLanguage) : ''
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), download: fileName(state.paper.id, which, lang) })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    },
```

  with `download(which: 'translation' | 'original'): Promise<void>` in `ReaderController`, and, exported beside
  `reduce`:

```ts
/** a download's file name (the reader's design, §6.1): the paper's id, the translation's with its language; the slash of
 *  an old-style id (hep-th/9711200) made safe */
export function fileName(id: string, which: 'translation' | 'original', lang: string): string {
  return `${id.replace(/\//g, '_')}${which === 'translation' ? `.${lang}` : ''}.pdf`
}
```

- [ ] **Step 6: The menus** — create `src/pdf-reader/ui/ReaderMenu.tsx`:

```tsx
// The reader's menu rows (the reader's design, §6.7): 30 px, an 8 px radius, the chosen one checked at its start, a hint
// at its end; the list's behaviour is the shared one (ui/menu-nav.ts). A listbox of options (a choice among values), or a
// menu of radios (the zoom) or of plain items (the download)
import { Check } from 'lucide'
import { useState } from 'react'
import { useMenuNav } from '@/ui/menu-nav'
import { Icon } from './icons'

export interface ReaderItem { id: string; name: string; hint?: string; checked?: boolean; disabled?: boolean; keywords?: string; separatorBefore?: boolean }

export function ReaderMenu({ items, kind, label, search, noMatch, onPick, onClose }: {
  items: ReaderItem[]
  kind: 'listbox' | 'radios' | 'items'
  label: string
  /** a search field's placeholder, when the list has one */
  search?: string
  noMatch?: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter(i => `${i.name} ${i.keywords ?? ''}`.toLowerCase().includes(q)) : items
  const nav = useMenuNav({ count: shown.length, initial: shown.findIndex(i => i.checked), isDisabled: i => !!shown[i]?.disabled, labelOf: i => shown[i]?.name ?? '', onPick: i => { const it = shown[i]; if (it && !it.disabled) onPick(it.id) }, onClose, typeahead: !search })
  const role = kind === 'listbox' ? 'option' : kind === 'radios' ? 'menuitemradio' : 'menuitem'
  return (
    <div role={kind === 'listbox' ? 'listbox' : 'menu'} aria-label={label} aria-activedescendant={nav.activeId} tabIndex={search ? -1 : 0} onKeyDown={nav.onKeyDown} className="outline-none"
      ref={el => { if (el && !search && document.activeElement !== el && !el.contains(document.activeElement)) el.focus() }}>
      {search && (
        // biome-ignore lint/a11y/noAutofocus: the menu opened from a press; the search is what it was opened for
        <input autoFocus value={query} placeholder={search} aria-label={search} onKeyDown={nav.onKeyDown} onChange={e => { setQuery(e.target.value); nav.setActive(0) }} onInput={e => { setQuery((e.target as HTMLInputElement).value); nav.setActive(0) }} className="search" />
      )}
      {shown.length === 0 && noMatch && <p className="px-2.5 py-2 text-[12px] text-ink-2">{noMatch}</p>}
      {shown.map((item, index) => (
        <div key={item.id}>
          {item.separatorBefore && <div className="sep" role="separator" />}
          <div id={nav.idOf(index)} role={role} aria-selected={kind === 'listbox' ? !!item.checked : undefined} aria-checked={kind === 'radios' ? !!item.checked : undefined} aria-disabled={item.disabled || undefined}
            data-active={index === nav.active || undefined} onMouseEnter={() => nav.setActive(index)} onClick={() => { if (!item.disabled) onPick(item.id) }} className="item">
            {kind !== 'items' && <Icon node={Check} size={14} className={item.checked ? 'check' : 'check invisible'} />}
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.hint && <span className="hint">{item.hint}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
```

  (`onChange` alone suffices in a browser; `onInput` is there because happy-dom fires `input`, which React maps to
  `onChange` too — drop `onInput` if the test passes without it.)

  Create `src/pdf-reader/ui/Menus.tsx`:

```tsx
// The toolbar's menus (the reader's design, §6.1, §6.7): zoom, the target language, the translation service, the
// download. Each is a toolbar control and its anchored popover; choosing closes it
import { ChevronDown, Download } from 'lucide'
import { browser } from 'wxt/browser'
import { MANAGE_SERVICES, serviceItems } from '@/ui/service-items'
import { R, S, languageName, serviceName } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { languageItems } from './languages'
import { Popover, usePopover } from './Popover'
import { ReaderMenu } from './ReaderMenu'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'

const FITS = [['page-width', () => R.zoom.width], ['page-fit', () => R.zoom.page], ['page-actual', () => R.zoom.actual]] as const
const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const openOptions = (section: string) => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)(`/options.html#${section}`) })
/** the popover shut, as a pick does */
const shut = (id: string) => document.getElementById(id)?.hidePopover()

export function ZoomMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller)
  const pop = usePopover('menu')
  const items = [
    ...FITS.map(([id, name]) => ({ id, name: name(), checked: state.zoom === id })),
    ...SCALES.map((s, i) => ({ id: String(s), name: `${Math.round(s * 100)}%`, checked: state.zoom === s, separatorBefore: i === 0 })),
  ]
  return (
    <>
      <ToolbarButton label={R.zoom.value} anchor={pop.anchor} {...pop.trigger} className="zoom-value">
        <span data-zoom-value className="tabular-nums">{Math.round(state.scale * 100)}%</span>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      <Popover {...pop.popover} role="menu" label={R.zoom.value}>
        <ReaderMenu kind="radios" label={R.zoom.value} items={items} onClose={() => shut(pop.popover.id)} onPick={id => { controller.zoomTo(FITS.some(([f]) => f === id) ? (id as 'page-width') : Number(id)); shut(pop.popover.id) }} />
      </Popover>
    </>
  )
}

export function LanguageMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller)
  const pop = usePopover('listbox')
  const current = state.settings?.targetLanguage ?? ''
  return (
    <>
      <ToolbarButton label={S.rows.language} anchor={pop.anchor} {...pop.trigger} className="menu-btn">
        <span>{current ? languageName(current) : ''}</span>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      <Popover {...pop.popover} role="listbox" label={S.rows.language}>
        <ReaderMenu kind="listbox" label={S.rows.language} search={S.menu.searchLanguages} noMatch={S.menu.noMatch} items={languageItems(current).map(i => ({ ...i, checked: i.selected }))} onClose={() => shut(pop.popover.id)}
          onPick={code => { controller.patchSettings(c => ({ ...c, targetLanguage: code })); shut(pop.popover.id) }} />
      </Popover>
    </>
  )
}

export function ServiceMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller)
  const pop = usePopover('listbox')
  const config = state.settings
  if (!config) return null
  const items = serviceItems(config, state.pack).map(i => ({ id: i.id, name: i.name, hint: i.hint, checked: i.selected, disabled: i.disabled && !i.action }))
  return (
    <>
      <ToolbarButton label={S.rows.service} anchor={pop.anchor} {...pop.trigger} className="menu-btn">
        <span>{serviceName(config.provider, config.services)}</span>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      <Popover {...pop.popover} role="listbox" label={S.rows.service}>
        <ReaderMenu kind="listbox" label={S.rows.service} items={items} onClose={() => shut(pop.popover.id)}
          onPick={id => {
            shut(pop.popover.id)
            // managing the services, or a pack to download: the settings page's (the reader downloads no pack itself)
            const item = serviceItems(config, state.pack).find(i => i.id === id)
            if (id === MANAGE_SERVICES || item?.action) return openOptions('services')
            controller.patchSettings(c => ({ ...c, provider: id }))
          }} />
      </Popover>
    </>
  )
}

export function DownloadMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller)
  const pop = usePopover('menu')
  const items = [{ id: 'translation', name: R.download.translation, disabled: !state.finalReady }, { id: 'original', name: R.download.original }]
  return (
    <>
      <ToolbarButton label={R.download.name} anchor={pop.anchor} {...pop.trigger}>
        <Icon node={Download} />
      </ToolbarButton>
      <Popover {...pop.popover} role="menu" label={R.download.name} className="!min-w-[160px]">
        <ReaderMenu kind="items" label={R.download.name} items={items} onClose={() => shut(pop.popover.id)} onPick={which => { shut(pop.popover.id); void controller.download(which as 'translation' | 'original') }} />
      </Popover>
    </>
  )
}
```

  Inside `@layer components` in `reader.css`, add:

```css
  .pop .search { display: block; width: 100%; height: 30px; margin: 0 0 4px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--fill); color: var(--ink); }
  .pop .search::placeholder { color: var(--ink-2); }
  .pop .item { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px 0 8px; border-radius: 8px; cursor: pointer; }
  .pop .item[data-active] { background: var(--fill); }
  .pop .item[aria-disabled="true"] { color: var(--ink-3); cursor: default; }
  .pop .item .hint { margin-inline-start: auto; color: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; }
  .pop .item .check { color: var(--ink); }
  .menu-btn { padding-inline: 8px 6px; color: var(--ink); font-size: 12.5px; font-weight: 500; }
  .zoom-value { min-width: 60px; padding-inline: 6px; color: var(--ink); font-size: 12.5px; }
```

- [ ] **Step 7: The toolbar takes them** — in `Toolbar.tsx`, replace the `<span data-zoom-value …>…</span>` between the
  two zoom buttons with `<ZoomMenu controller={controller} />`, and after the zoom group's divider insert
  `<LanguageMenu controller={controller} />`, `<ServiceMenu controller={controller} />`, then (Task 20's options will
  come here) `<span className="divider" />`, `<DownloadMenu controller={controller} />` before the settings button.
  Update `toolbar.test.tsx`'s zoom value selector to `button[aria-label="缩放比例"] [data-zoom-value]`.

- [ ] **Step 8: The browser check** — in `reader-ui.mjs`, above the summary line:

```js
// ---------------------------------------------------------------- Task 19: the menus
{
  const page = await open({ mode: 'bilingual' })
  await page.getByRole('button', { name: '缩放比例' }).click()
  await page.getByRole('menuitemradio', { name: '适合页面' }).click()
  await page.waitForTimeout(500)
  check('the zoom menu fits the page, and closes', (await state(page)).zoom === 'page-fit' && !(await page.evaluate(() => !!document.querySelector('.pop:popover-open'))))
  await page.getByRole('button', { name: '目标语言' }).click()
  await page.keyboard.type('fra')
  check('the language menu searches as it is typed', (await page.getByRole('option').count()) === 1)
  await page.keyboard.press('Escape')
  check('Escape closes it, the focus back on its button', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '目标语言'))
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await page.getByRole('button', { name: '下载' }).click(); await page.getByRole('menuitem', { name: '原文 PDF' }).click() })()])
  check('the original downloads, named by the paper', download.suggestedFilename() === `${paper}.pdf`, download.suggestedFilename())
  await page.getByRole('button', { name: '翻译服务' }).click()
  await shot(page, '19-service-menu')
  await page.keyboard.press('Escape')
  await page.close()
}
```

```bash
pnpm vitest run tests/pdf-reader tests/popup tests/ui && pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs
```

Expected: PASS; `all passed`.

- [ ] **Step 9: The gate and the commit**

```bash
git add src/ui/service-items.ts src/entrypoints/popup/view-model.ts src/pdf-reader/ui/languages.ts src/pdf-reader/ui/ReaderMenu.tsx src/pdf-reader/ui/Menus.tsx src/pdf-reader/ui/Toolbar.tsx src/pdf-reader/engine/session.mjs src/pdf-reader/engine/session.d.mts src/pdf-reader/controller.ts src/entrypoints/pdf-reader/reader.css tests/pdf-reader experiments/pdf-bilingual/spikes/reader-ui.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the zoom, language, service and download menus

Zoom's fits and scales with the chosen one checked; the nine languages the
reader typesets, each by its own name, with a search; the popup's own service
list, shared; the original PDF and, once the final is on screen, the
translation's, named by the paper. The session's settings event carries the
language pack's state the service list needs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 20: the reading options

**Files:**
- Create: `src/pdf-reader/ui/ReadingOptions.tsx`, `src/pdf-reader/ui/Switch.tsx`
- Modify: `src/pdf-reader/ui/Toolbar.tsx`, `reader.css`
- Test: `tests/pdf-reader/ui/reading-options.test.tsx`

**Interfaces:**
- Produces: `ReadingOptions({ controller })`: a dialog popover with 对照高亮, 高亮颜色, 图片翻译, 外观, 深色时调暗页面, each a
  setting written at once through `patchSettings`; `Switch({ label, checked, onChange })`, `role="switch"`.

- [ ] **Step 1: The failing test** — create `tests/pdf-reader/ui/reading-options.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { ReadingOptions } from '@/pdf-reader/ui/ReadingOptions'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

async function open() {
  const fake = fakeController()
  const mounted = await mountElement(createElement(ReadingOptions, { controller: fake.controller }))
  await act(async () => { mounted.container.querySelector<HTMLElement>('[popover]')!.showPopover() })
  /** what the last write would make of the defaults */
  const written = () => (fake.controller.patchSettings.mock.calls.at(-1)![0] as (c: Config) => Config)(DEFAULT_CONFIG)
  return { ...mounted, ...fake, written }
}

describe('the reading options (the reader\'s design, §6.1)', () => {
  it('is a dialog of the reading switches, the swatches and the appearance, as the settings have them', async () => {
    const { container } = await open()
    expect(container.querySelector('[popover]')!.getAttribute('role')).toBe('dialog')
    const switches = [...container.querySelectorAll('[role="switch"]')].map(s => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')])
    expect(switches).toEqual([['对照高亮', 'true'], ['图片翻译', 'true'], ['深色时调暗页面', 'true']])
    expect(container.querySelectorAll('[data-swatch]').length).toBe(DEFAULT_CONFIG.appearance.highlights.length)
    expect([...container.querySelectorAll('[role="radio"]')].map(r => [r.textContent, r.getAttribute('aria-checked')])).toEqual([['浅色', 'false'], ['深色', 'false'], ['跟随系统', 'true']])
  })

  it('writes each change at once', async () => {
    const { container, written } = await open()
    container.querySelector<HTMLElement>('[role="switch"][aria-label="对照高亮"]')!.click()
    expect(written().reading.sentenceHighlight).toBe(false)
    container.querySelector<HTMLElement>('[role="switch"][aria-label="图片翻译"]')!.click()
    expect(written().image.enabled).toBe(false)
    const swatches = [...container.querySelectorAll<HTMLElement>('[data-swatch]')]
    swatches[1]!.click()
    expect(written().appearance.activeHighlight).toBe(DEFAULT_CONFIG.appearance.highlights[1]!.id)
    ;[...container.querySelectorAll<HTMLElement>('[role="radio"]')][1]!.click()
    expect(written().pdfReader.appearance).toBe('dark')
    container.querySelector<HTMLElement>('[role="switch"][aria-label="深色时调暗页面"]')!.click()
    expect(written().pdfReader.dimPages).toBe(false)
  })
})
```

```bash
pnpm vitest run tests/pdf-reader/ui/reading-options.test.tsx
```

Expected: FAIL — `ReadingOptions` does not resolve.

- [ ] **Step 2: The switch** — create `src/pdf-reader/ui/Switch.tsx`:

```tsx
// The reader's switch (the reader's design, §4.1): 28 × 17, the track ink when on and ink-3 when off (the harness's n-5
// read 1.5:1 against the chrome); named by its row's words
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
}
```

- [ ] **Step 3: The options** — create `src/pdf-reader/ui/ReadingOptions.tsx`:

```tsx
// The reading options (the reader's design, §6.1): the highlight and its colour, figure text, the appearance and the
// dark pages — all settings, the same values the popup and the settings page change, each written at once
import { SlidersHorizontal } from 'lucide'
import { R, S, profileName } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { Popover, usePopover } from './Popover'
import { Switch } from './Switch'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'

const APPEARANCES = ['light', 'dark', 'system'] as const

export function ReadingOptions({ controller }: { controller: ReaderController }) {
  const state = useReader(controller)
  const pop = usePopover('dialog')
  const config = state.settings
  if (!config) return null
  const names = { light: R.options.light, dark: R.options.dark, system: R.options.system }
  const appearance = config.pdfReader.appearance
  return (
    <>
      <ToolbarButton label={R.options.name} anchor={pop.anchor} {...pop.trigger}>
        <Icon node={SlidersHorizontal} />
      </ToolbarButton>
      <Popover {...pop.popover} role="dialog" label={R.options.name}>
        <div className="row">
          {S.rows.highlight}
          <Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} onChange={on => controller.patchSettings(c => ({ ...c, reading: { ...c.reading, sentenceHighlight: on } }))} />
        </div>
        <div className="row">
          {R.options.color}
          <span className="flex gap-2">
            {config.appearance.highlights.map(h => (
              <button key={h.id} type="button" data-swatch aria-label={profileName(h)} aria-pressed={h.id === config.appearance.activeHighlight} className="swatch" style={{ background: h.color || 'var(--axt-green)' }}
                onClick={() => controller.patchSettings(c => ({ ...c, appearance: { ...c.appearance, activeHighlight: h.id } }))} />
            ))}
          </span>
        </div>
        <div className="sep" />
        <div className="row">
          {S.rows.images}
          <Switch label={S.rows.images} checked={config.image.enabled} onChange={on => controller.patchSettings(c => ({ ...c, image: { ...c.image, enabled: on } }))} />
        </div>
        <div className="sep" />
        <div className="row">
          {R.options.appearance}
          <div role="radiogroup" aria-label={R.options.appearance} className="seg small w-[180px]" style={{ '--i': APPEARANCES.indexOf(appearance) } as React.CSSProperties}>
            <span className="thumb" aria-hidden="true" />
            {APPEARANCES.map(a => (
              <button key={a} type="button" role="radio" aria-checked={a === appearance} tabIndex={a === appearance ? 0 : -1} onClick={() => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, appearance: a } }))}>
                {names[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          {R.options.dim}
          <Switch label={R.options.dim} checked={config.pdfReader.dimPages} onChange={on => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, dimPages: on } }))} />
        </div>
      </Popover>
    </>
  )
}
```

  (`profileName` names a highlight profile as the settings page does; if it takes style profiles only, the highlight
  menu's naming in `strings.ts` is the one to use — find it by `BUILT_IN_HIGHLIGHTS` there.)

  Inside `@layer components` in `reader.css`, add:

```css
  .switch { position: relative; width: 28px; height: 17px; flex: none; border-radius: 999px; background: var(--ink-3); transition: background-color 150ms; }
  .switch::after { content: ""; position: absolute; inset-block-start: 2px; inset-inline-start: 2px; width: 13px; height: 13px; border-radius: 999px; background: oklch(1 0 0); box-shadow: 0 1px 2px oklch(0 0 0 / 0.25); transition: translate 150ms ease-out; }
  .switch[aria-checked="true"] { background: var(--ink); }
  .switch[aria-checked="true"]::after { translate: 11px 0; background: var(--chrome); }
  .swatch { width: 16px; height: 16px; border-radius: 999px; box-shadow: inset 0 0 0 0.5px oklch(0 0 0 / 0.15); }
  .swatch[aria-pressed="true"] { outline: 1.5px solid var(--ink); outline-offset: 2px; }
```

- [ ] **Step 4: The toolbar takes them** — in `Toolbar.tsx`, where Task 19 left "Task 20's options will come here",
  put `<ReadingOptions controller={controller} />`.

- [ ] **Step 4b: Below 900 px** (§5) — the language and service menus leave the toolbar and become the options' first
  two rows. In `ReadingOptions`, before the 对照高亮 row, add
  `<div className="row narrow-only">{S.rows.language}<LanguageMenu controller={controller} /></div>` and the same for
  `ServiceMenu` with `S.rows.service`, then a `<div className="sep narrow-only" />` (a menu opened from inside the
  options is a popover nested in it; the options stay open behind it). In `reader.css`, add
  `.narrow-only { display: none; }` and
  `@media (width < 900px) { .narrow-only { display: flex; } .pop .sep.narrow-only { display: block; } [data-zone="trail"] > .menu-btn { display: none; } }`,
  the toolbar's own menu buttons carrying `menu-btn` (Task 19) and the rows' copies living inside `.pop`. The test adds
  a case: the options hold the two `.narrow-only` rows, each with its menu's button named 目标语言 and 翻译服务.

- [ ] **Step 5: Run the tests**

```bash
pnpm vitest run tests/pdf-reader/ui
```

Expected: PASS.

- [ ] **Step 6: The gate and the commit**

```bash
git add src/pdf-reader/ui/ReadingOptions.tsx src/pdf-reader/ui/Switch.tsx src/pdf-reader/ui/Toolbar.tsx src/entrypoints/pdf-reader/reader.css tests/pdf-reader/ui/reading-options.test.tsx
pnpm typecheck && pnpm lint && pnpm test
git commit -F - <<'EOF'
feat(pdf-reader): the reading options

The highlight and its colour, figure text, the appearance and the dark
pages in one popover: settings shared with the popup and the settings page,
each written at once.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 21: the contents, and a fit that follows the pane's width

**Files:**
- Modify: `src/pdf-reader/engine/latex-front.mjs` (a heading's depth), `cache.mjs` (kept in the copy),
  `session.mjs`, `session.d.mts`, `src/pdf-reader/controller.ts`
- Create: `src/pdf-reader/ui/Outline.tsx`
- Modify: `src/pdf-reader/ui/Toolbar.tsx`, `src/entrypoints/pdf-reader/App.tsx`, `reader.css`
- Test: `tests/pdf-reader/outline.test.ts`, `tests/pdf-reader/ui/outline.test.tsx`, `tests/pdf-reader/controller.test.ts`

**Interfaces:**
- Produces: a heading unit's `depth` (part −1, chapter 0, section 1, subsection 2, subsubsection 3; none for paragraph
  headings), kept in a stored copy's units; `outlineOf(headings, textOf, pageOf): OutlineEntry[]` in
  `src/pdf-reader/outline.ts` — `{ id, title, original, level: 1 | 2 | 3, page }`, levels ranked among the depths the
  paper uses (a thesis's chapters are 1 and its sections 2), a heading with no depth at 1; the session's event
  `{ type: 'outline'; entries: OutlineEntry[] }` and `goToUnit(id)`; `ReaderState.outline`; the controller's
  `goToHeading(id)`; `Outline({ controller, open })`. A side at a fit (`page-width`, `page-fit`, `page-actual`) keeps
  it as its pane's width changes — the contents opening, the window resized, a narrow window.

- [ ] **Step 1: The failing tests** — create `tests/pdf-reader/outline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { unitsOf } from '@/pdf-reader/engine/cache.mjs'
import { inMemory, loadProject } from '@/pdf-reader/engine/latex-front.mjs'
import { outlineOf } from '@/pdf-reader/outline'

const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', tex]])), 'main.tex')
const TEX = '\\documentclass{article}\\begin{document}\\title{The Paper}\\maketitle\n\\section{Introduction}Words here.\n\\subsection{Setting up}More words.\n\\subsubsection{Details}Yet more.\n\\paragraph{Aside}An aside.\n\\section{Results}The end.\\end{document}'

describe('the contents (the reader\'s design, §6.3, §10.4)', () => {
  it('a heading keeps the depth of its sectioning command; a paragraph heading has none', () => {
    const headings = project(TEX).units.filter((u: { kind: string }) => u.kind === 'heading')
    expect(headings.map((u: { depth?: number; title?: boolean }) => [u.title ?? false, u.depth])).toEqual([[true, undefined], [false, 1], [false, 2], [false, 3], [false, undefined], [false, 1]])
  })

  it('keeps the depth in the stored copy', () => {
    const units = project(TEX).units
    const stored = unitsOf(units, new Set(), units.map(() => 'h'), new Map())
    expect(stored.filter((u: { kind: string }) => u.kind === 'heading').map((u: { depth?: number }) => u.depth)).toEqual([undefined, 1, 2, 3, undefined, 1])
  })

  it('ranks the levels among the depths the paper uses, three at most, the title left out', () => {
    const h = (id: number, depth?: number, title = false) => ({ id, depth, title, src: `H${id}` })
    const entries = outlineOf([h(0, undefined, true), h(1, 0), h(2, 1), h(3, 2), h(4, 3), h(5, 0)], id => `T${id}`, id => id)
    expect(entries.map(e => [e.id, e.level, e.title, e.original, e.page])).toEqual([[1, 1, 'T1', 'H1', 1], [2, 2, 'T2', 'H2', 2], [3, 3, 'T3', 'H3', 3], [5, 1, 'T5', 'H5', 5]])
  })

  it('lists a copy stored before depths flat, not empty', () => {
    const entries = outlineOf([{ id: 2, src: 'Intro' }, { id: 5, src: 'Method' }], () => undefined, () => null)
    expect(entries.map(e => [e.level, e.title])).toEqual([[1, 'Intro'], [1, 'Method']])
  })
})
```

  Create `tests/pdf-reader/ui/outline.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Outline } from '@/pdf-reader/ui/Outline'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const outline = [
  { id: 2, title: '引言', original: 'Introduction', level: 1 as const, page: 1 },
  { id: 5, title: '方法', original: 'Method', level: 1 as const, page: 3 },
  { id: 6, title: '设置', original: 'Setup', level: 2 as const, page: 3 },
  { id: 9, title: '细节', original: 'Details', level: 3 as const, page: 4 },
  { id: 12, title: '结果', original: 'Results', level: 1 as const, page: 6 },
]
const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-entry]')].filter(r => !r.closest('[hidden]'))

describe('the contents (the reader\'s design, §6.3)', () => {
  it('folds: the first level shown, the section being read marked and its branch open', async () => {
    const fake = fakeController({ outline, sides: { left: { page: 4, pages: 9 }, right: { page: 4, pages: 9 } } })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    expect(rows(container).map(r => r.textContent?.replace(/\d+$/, ''))).toEqual(['引言', '方法', '设置', '细节', '结果'])
    expect(container.querySelector('[aria-current="true"]')!.textContent).toContain('细节')
    await act(async () => fake.set({ sides: { left: { page: 1, pages: 9 }, right: { page: 1, pages: 9 } } }))
    expect(container.querySelector('[aria-current="true"]')!.textContent).toContain('引言')
  })

  it('a fold closes a branch; a row jumps to its heading', async () => {
    const fake = fakeController({ outline, sides: { left: { page: 1, pages: 9 }, right: { page: 1, pages: 9 } } })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    const fold = container.querySelector<HTMLElement>('[data-entry="5"] [aria-expanded]')!
    await act(async () => fold.click())
    expect(rows(container).map(r => r.dataset.entry)).toEqual(['2', '5', '6', '12'])
    await act(async () => fold.click())
    expect(rows(container).map(r => r.dataset.entry)).toEqual(['2', '5', '12'])
    container.querySelector<HTMLElement>('[data-entry="12"] a')!.click()
    expect(fake.controller.goToHeading).toHaveBeenCalledWith(12)
  })
})
```

  (Add `goToHeading: vi.fn()` to `fakeController`.) In `tests/pdf-reader/controller.test.ts`, inside
  `describe('reduce: …')`:

```ts
  it('holds the contents', () => {
    const entries = [{ id: 2, title: '引言', original: 'Introduction', level: 1 as const, page: 1 }]
    expect(fold([{ type: 'outline', entries }]).outline).toEqual(entries)
  })
```

```bash
pnpm vitest run tests/pdf-reader
```

Expected: FAIL — no `depth`, no `outline.ts`, no `Outline`, no `outline` in the state.

- [ ] **Step 2: A heading's depth** — in `latex-front.mjs`, after `const HEADINGS = …`, add
  `/** a sectioning command's depth, as LaTeX's article and book classes count it; a paragraph heading is not in the contents */ const DEPTH = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3 }`;
  in the heading branch, where `b.kind = CAPTIONS.has(name) ? 'caption' : 'heading'; b.title = name === 'title'` is
  set, add `b.depth = DEPTH[name]` beside it and `b.depth = undefined` where `b.title = false` is reset; in the
  builder's `flush`, after `if (this.title) u.title = true`, add `if (this.depth !== undefined) u.depth = this.depth`.
  In `cache.mjs`'s `unitsOf`, the `base` gains `...(u.title ? { title: true } : {}), ...(u.depth !== undefined ? { depth: u.depth } : {})`.

- [ ] **Step 3: The outline's rule** — create `src/pdf-reader/outline.ts`:

```ts
// The contents (the reader's design, §6.3): the paper's own headings, the title left out, as a tree of three levels at
// most, ranked among the depths the paper uses — an article's sections are 1, a thesis's chapters 1 and its sections 2 —
// so that the same rule holds for any paper. A heading with no depth (a copy stored before depths were kept) is at 1
export interface OutlineEntry { id: number; title: string; original: string; level: 1 | 2 | 3; page: number | null }

export function outlineOf(
  headings: { id: number; src: string; depth?: number; title?: boolean }[],
  textOf: (id: number) => string | undefined,
  pageOf: (id: number) => number | null,
): OutlineEntry[] {
  const kept = headings.filter(h => !h.title)
  const depths = [...new Set(kept.map(h => h.depth).filter((d): d is number => d !== undefined))].sort((a, b) => a - b)
  return kept.flatMap(h => {
    const level = h.depth === undefined ? 1 : depths.indexOf(h.depth) + 1
    if (level > 3) return []
    return [{ id: h.id, title: textOf(h.id) ?? h.src, original: h.src, level: level as 1 | 2 | 3, page: pageOf(h.id) }]
  })
}
```

- [ ] **Step 4: The session reports it** — in `session.d.mts`, add `| { type: 'outline'; entries: OutlineEntry[] }`
  (import the type from `../outline`) and `export declare function goToUnit(id: number): void`. In `session.mjs`,
  import `outlineOf` from `'../outline'`, and after `let rightTexts = null` add:

```js
/** the paper's headings, as the source (or a stored copy, or a demo's levels) has them: { id, src, depth, title } */
let headings = []
/** the contents, each heading by its text on the translation's side and its page there; the original's while it alone is laid */
function reportOutline() {
  const texts = new Map((rightTexts ?? []).map(t => [t.id, t.text]))
  const side = right.anchors?.size ? right : left
  host.emit({ type: 'outline', entries: outlineOf(headings, id => texts.get(id), id => side.anchors?.get(id)?.rects?.[0]?.page ?? null) })
}
/** a heading, from the contents: every side shown put there, a line of room above it */
export function goToUnit(id) {
  for (const s of sides) {
    if (!s.doc || !shown(s)) continue
    invalidate()
    const top = unitDocTop(s, id)
    if (top != null) put(s.container, top - 28)
  }
}
```

  Then call it where the headings or the right side's texts change:
  - `live()`: after `const paperData = openPaper(files), units = paperData.units`, set
    `headings = units.map((u, i) => ({ id: i, src: plainSource(u), depth: u.depth, title: u.title, kind: u.kind })).filter(h => h.kind === 'heading')`;
    after `note('anchored')` add `rightTexts ??= src; reportOutline()`;
  - `showCached`: before its `await Promise.all([anchorSide(left …` set
    `headings = record.units.map((u, i) => ({ id: i, src: u.src, depth: u.depth, title: u.title, kind: u.kind })).filter(h => h.kind === 'heading')`
    and `rightTexts = record.units.map((u, i) => ({ id: i, text: u.tr ?? u.src }))`, and after that `Promise.all`,
    `reportOutline()`;
  - `replaceRight`: after `host.emit({ type: 'page', side: 'right', … })`, `reportOutline()`;
  - `demo()`: after the anchors are made, read `const levels = await fetch(`${base}levels.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))`,
    set `headings = units.filter(u => u.kind === 'heading' && (levels[u.i] || u.i === 0)).map(u => ({ id: u.i, src: u.src, depth: levels[u.i], title: u.i === 0 }))`
    (a demo's first heading is its title, its levels ranked as depths), `rightTexts = textsAt(stages ? stages[0].translated : Infinity)`,
    and `reportOutline()`.

- [ ] **Step 5: A fit that follows the pane** — in `session.mjs`: a side remembers the fit it was given
  (`side.fit`, set to `'page-width'` in `makeSide`); `zoomTo(value)` sets `s.fit = typeof value === 'string' ? value : null`
  for each side it scales, and `zoomBy` sets `s.fit = null`. After `for (const side of sides) attach(side)`, add:

```js
/** a side at a fit keeps it as its pane's width changes: the contents opening, the window resized, a narrow window */
const refit = new ResizeObserver(entries => {
  for (const { target } of entries) {
    const s = sides.find(x => x.container === target)
    if (!s?.doc || !s.fit || !shown(s)) continue
    invalidate()
    s.viewer.currentScaleValue = s.fit === 'page-width' ? fitWidth(s) : s.fit
  }
})
for (const s of sides) refit.observe(s.container)
```

  and in `replaceRight`, after `right = next; sides[1] = next`, `next.fit = old.fit; refit.unobserve(old.container); refit.observe(next.container)`.

- [ ] **Step 6: The controller** — `ReaderState` gains `/** the contents (outline.ts) */ outline: OutlineEntry[]`
  (`INITIAL`: `[]`); `reduce` gains `case 'outline': return { ...state, outline: event.entries }`; `Session` picks
  `'goToUnit'`; `ReaderController` gains `goToHeading(id: number): void`, and `createController` returns
  `goToHeading: id => later(s => s.goToUnit(id))`.

- [ ] **Step 7: The sidebar** — create `src/pdf-reader/ui/Outline.tsx`:

```tsx
// The contents (the reader's design, §6.3): the paper's headings as a folding tree, one 28 px row each, the translated
// title truncating, the original in its tooltip, the page at the end. The section being read — the last heading at or
// before the page shown — is marked and its branch opened as the reading moves; the rest folds as the reader leaves it
import { ChevronRight } from 'lucide'
import { useEffect, useMemo, useState } from 'react'
import { R } from '@/ui/strings'
import type { ReaderController } from '../controller'
import type { OutlineEntry } from '../outline'
import { Icon } from './icons'
import { useTip } from './tip'
import { useReader } from './use-reader'

export function Outline({ controller, open }: { controller: ReaderController; open: boolean }) {
  const state = useReader(controller)
  const entries = state.outline
  const parents = useMemo(() => entries.map((e, k) => { for (let p = k - 1; p >= 0; p--) if (entries[p]!.level < e.level) return p; return -1 }), [entries])
  const hasKids = (k: number) => parents.includes(k)
  const page = state.display === 'original' ? state.sides.left.page : state.sides.right.page
  const current = entries.reduce((cur, e, k) => (e.page != null && e.page <= page ? k : cur), -1)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  // the section being read has its branch opened; what the reader folded elsewhere stays folded
  useEffect(() => {
    if (current < 0) return
    setExpanded(old => {
      const next = new Set(old)
      for (let p = parents[current]!; p >= 0; p = parents[p]!) next.add(p)
      return next.size === old.size ? old : next
    })
  }, [current, parents])
  const shownRow = (k: number): boolean => parents[k]! < 0 || (expanded.has(parents[k]!) && shownRow(parents[k]!))
  return (
    <aside className="chrome contents" aria-label={R.contents} hidden={!open}>
      <div className="contents-h">{R.contents}</div>
      <ul className="contents-list">
        {entries.map((e, k) => (
          <Row key={e.id} entry={e} hidden={!shownRow(k)} current={k === current} folds={hasKids(k)} expanded={expanded.has(k)}
            onFold={() => setExpanded(old => { const next = new Set(old); if (next.has(k)) next.delete(k); else next.add(k); return next })}
            onGo={() => controller.goToHeading(e.id)} />
        ))}
      </ul>
    </aside>
  )
}

function Row({ entry, hidden, current, folds, expanded, onFold, onGo }: { entry: OutlineEntry; hidden: boolean; current: boolean; folds: boolean; expanded: boolean; onFold: () => void; onGo: () => void }) {
  const { props, tip } = useTip(entry.original, undefined, { side: 'right' })
  return (
    <li data-entry={entry.id} data-level={entry.level} hidden={hidden}>
      <div className="entry" aria-current={current || undefined}>
        <button type="button" className={`fold${folds ? '' : ' leaf'}`} aria-expanded={folds ? expanded : undefined} aria-label={entry.title} tabIndex={folds ? 0 : -1} aria-hidden={folds ? undefined : 'true'} onClick={onFold}>
          <Icon node={ChevronRight} size={12} />
        </button>
        <a href={`#h${entry.id}`} onClick={e => { e.preventDefault(); onGo() }} {...props}>
          <span className="t">{entry.title}</span>
          {entry.page != null && <span className="p">{entry.page}</span>}
        </a>
        {tip}
      </div>
    </li>
  )
}
```

  Inside `@layer components` in `reader.css`, add:

```css
  /* the contents (§6.3) */
  .contents { position: fixed; z-index: 15; inset: var(--bar) auto 0 0; width: var(--side); display: flex; flex-direction: column; background: var(--chrome); box-shadow: 0.5px 0 0 var(--chrome-line); translate: -100% 0; visibility: hidden; transition: translate 200ms var(--ease), visibility 0s linear 200ms; }
  html[data-axt-contents] .contents { translate: 0 0; visibility: visible; transition: translate 200ms var(--ease), visibility 0s; }
  .contents[hidden] { display: flex !important; }
  .contents-h { display: flex; align-items: center; height: 36px; padding: 0 12px 0 14px; flex: none; color: var(--ink-2); font-size: 11.5px; font-weight: 600; }
  .contents-list { flex: 1; margin: 0; padding: 0 6px 16px; overflow: auto; list-style: none; overscroll-behavior: contain; scrollbar-width: thin; }
  .contents-list li[hidden] { display: none; }
  .entry { display: flex; align-items: center; gap: 2px; height: 28px; padding-inline: 0 8px; border-radius: 6px; }
  .entry:hover, .entry[aria-current="true"] { background: var(--fill); }
  .entry a { display: flex; flex: 1; min-width: 0; align-items: baseline; gap: 8px; color: inherit; text-decoration: none; }
  .entry .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; font-weight: 500; }
  .entry[aria-current="true"] .t { font-weight: 600; }
  .entry .p { flex: none; color: var(--ink-2); font-size: 11px; font-variant-numeric: tabular-nums; }
  [data-level="2"] > .entry { padding-inline-start: 14px; }
  [data-level="3"] > .entry { padding-inline-start: 28px; }
  :is([data-level="2"], [data-level="3"]) .t { font-size: 12px; font-weight: 400; color: var(--ink-2); }
  .fold { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; color: var(--ink-3); }
  .fold svg { transition: rotate 150ms ease-out; }
  .fold[aria-expanded="true"] svg { rotate: 90deg; }
  .fold.leaf { visibility: hidden; }
```

  (The `aside` is always rendered and slides; `hidden` keeps it out of the accessibility tree while closed, and the
  `display: flex !important` over `[hidden]` keeps it laid out so that it can slide out.)

- [ ] **Step 8: The toggle and the page** — in `Toolbar.tsx`, the lead begins with
  `<ToolbarButton label={R.contents} pressed={contents} onClick={onContents}><Icon node={PanelLeft} /></ToolbarButton>`,
  with `contents: boolean` and `onContents: () => void` as `Toolbar`'s props. In `App.tsx`, hold
  `const [contents, setContents] = useState(false)`, toggle `data-axt-contents` on `<html>` in an effect on it, pass
  both to `Toolbar`, and render `<Outline controller={controller} open={contents} />` after the toolbar. The toolbar's
  test mounts it with `contents: false, onContents: () => {}` from now on, and gains a case: the 目录 button is pressed
  while the contents are open and calls `onContents` when pressed.

- [ ] **Step 9: The browser check** — in `reader-ui.mjs`, above the summary line:

```js
// ---------------------------------------------------------------- Task 21: the contents
{
  const page = await open({ mode: 'bilingual' })
  const widthBefore = await box(page, '#right .page')
  await page.getByRole('button', { name: '目录' }).click()
  await page.waitForTimeout(700)
  const entries = (await state(page)).outline
  check('the contents list the headings with levels', entries.length > 5 && entries.some(e => e.level === 2), `${entries.length} entries`)
  const widthAfter = await box(page, '#right .page')
  check('opening the contents refits the pages to the narrower panes', widthAfter.w < widthBefore.w, `${widthBefore.w} → ${widthAfter.w}`)
  const target = entries.find(e => e.page >= 3)
  await page.locator(`[data-entry="${target.id}"] a`).click()
  await page.waitForTimeout(800)
  check('a row jumps to its heading on the translation\'s side', (await state(page)).sides.right.page === target.page, `${JSON.stringify(target)} → ${(await state(page)).sides.right.page}`)
  check('the row is marked as the section being read', await page.evaluate(id => document.querySelector(`[data-entry="${id}"] .entry`)?.getAttribute('aria-current') === 'true', target.id))
  await shot(page, '21-contents')
  await page.close()
}
```

```bash
pnpm vitest run tests/pdf-reader && pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs
cd experiments/pdf-bilingual && for c in anchors-cases cache-cases lost-cases mt-cases sync-cases wire-cases; do pnpm exec tsx spikes/$c.mjs >/dev/null 2>&1 && echo "$c ok" || echo "$c FAILED"; done
```

Expected: PASS; `all passed`; six `ok` (the copy's units gained fields, nothing else changed).

- [ ] **Step 10: The gate and the commit**

```bash
git add src/pdf-reader/engine/latex-front.mjs src/pdf-reader/engine/cache.mjs src/pdf-reader/engine/session.mjs src/pdf-reader/engine/session.d.mts src/pdf-reader/outline.ts src/pdf-reader/controller.ts src/pdf-reader/ui/Outline.tsx src/pdf-reader/ui/Toolbar.tsx src/entrypoints/pdf-reader/App.tsx src/entrypoints/pdf-reader/reader.css tests/pdf-reader experiments/pdf-bilingual/spikes/reader-ui.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the contents

A heading keeps the depth of its sectioning command, in the stored copy too;
the contents rank the depths a paper uses into three levels (a copy stored
before is listed flat). A folding tree of the translated titles with the
originals in tooltips and the pages; the section being read is marked and
its branch opened; a row takes every side shown to the heading. A side at a
fit keeps it as its pane's width changes.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 22: the page pills and the scroll indicators

**Files:**
- Create: `src/pdf-reader/ui/PagePill.tsx`, `src/pdf-reader/ui/ScrollIndicator.tsx`, `src/pdf-reader/ui/scroll-show.ts`
- Modify: `src/pdf-reader/engine/session.mjs`, `session.d.mts` (`lead`), `src/pdf-reader/controller.ts`,
  `src/entrypoints/pdf-reader/App.tsx`, `reader.css`
- Test: `tests/pdf-reader/ui/pane-floats.test.tsx`

**Interfaces:**
- Produces: `PagePill({ controller, side })`; `ScrollIndicator({ controller, side })`; `thumbSize(track, client,
  scroll): number`; `useScrollShow(paneRef, [[elRef, ms], …])` — one passive scroll listener per pane (capture, since
  the engine swaps the right pane's scroller) that sets `data-live` on the pill and the indicator and clears it after
  their delays, React never rendering on a scroll; the session's `lead(which)` and the controller's `lead(side)`: a
  press on a side's indicator makes it the leading side, as a press in the pane does.

- [ ] **Step 1: The failing test** — create `tests/pdf-reader/ui/pane-floats.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PagePill } from '@/pdf-reader/ui/PagePill'
import { thumbSize } from '@/pdf-reader/ui/ScrollIndicator'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

describe('a pane\'s page pill (the reader\'s design, §6.4)', () => {
  async function mount() {
    const fake = fakeController({ sides: { left: { page: 3, pages: 25 }, right: { page: 4, pages: 26 } } })
    const m = await mountElement(createElement(PagePill, { controller: fake.controller, side: 'right' }))
    return { ...m, ...fake }
  }

  it('shows the side\'s page and its count, named for its side', async () => {
    const { container } = await mount()
    const input = container.querySelector('input')!
    expect([input.value, input.getAttribute('aria-label'), container.textContent]).toEqual(['4', '译文页码', '/ 26'])
  })

  it('goes to a page typed and entered, not to one out of range; the arrows step a page', async () => {
    const { container, controller } = await mount()
    const input = container.querySelector('input')!
    const type = (v: string) => act(async () => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    await type('12')
    await type('40')
    const [prev, next] = [...container.querySelectorAll<HTMLButtonElement>('button')]
    prev!.click()
    next!.click()
    expect(controller.goToPage.mock.calls).toEqual([['right', 12], ['right', 3], ['right', 5]])
  })
})

describe('a scroll indicator\'s thumb (§6.5)', () => {
  it('is the visible share of the track, at least 32 px', () => {
    expect(thumbSize(800, 800, 8000)).toBe(80)
    expect(thumbSize(800, 800, 80000)).toBe(32)
    expect(thumbSize(800, 800, 800)).toBe(800)
  })
})
```

  (Add `lead: vi.fn()` to `fakeController`.)

```bash
pnpm vitest run tests/pdf-reader/ui/pane-floats.test.tsx
```

Expected: FAIL — `PagePill` does not resolve.

- [ ] **Step 2: Showing on a scroll without rendering** — create `src/pdf-reader/ui/scroll-show.ts`:

```ts
// What floats over a pane shows while it scrolls and a while after (the reader's design, §6.4, §6.5, §12): one passive
// listener per pane, on the pane itself and capturing (the engine replaces the right pane's scroller as translations
// come), which sets data-live and clears it after each element's delay. Nothing renders on a scroll
import { type RefObject, useEffect } from 'react'

export function useScrollShow(pane: RefObject<HTMLElement | null>, targets: [RefObject<HTMLElement | null>, number][]) {
  useEffect(() => {
    const el = pane.current
    if (!el) return
    const timers = new Map<HTMLElement, number>()
    const on = () => {
      for (const [ref, ms] of targets) {
        const t = ref.current
        if (!t) continue
        t.toggleAttribute('data-live', true)
        clearTimeout(timers.get(t))
        timers.set(t, window.setTimeout(() => t.removeAttribute('data-live'), ms))
      }
    }
    el.addEventListener('scroll', on, { capture: true, passive: true })
    return () => { el.removeEventListener('scroll', on, { capture: true }); for (const t of timers.values()) clearTimeout(t) }
  }, [pane, targets])
}
```

- [ ] **Step 3: The pill** — create `src/pdf-reader/ui/PagePill.tsx`:

```tsx
// A pane's page pill (the reader's design, §6.4): at the pane's bottom centre, ‹ · the page (an input, all of it
// selected on focus) · / total · ›. Shown while its pane scrolls and 2.5 s after, and while hovered or focused
// (reader.css); the page is PDF.js's as it reports it, never read ahead of it
import { ChevronLeft, ChevronRight } from 'lucide'
import { forwardRef, useState } from 'react'
import { R } from '@/ui/strings'
import type { ReaderController, Side } from '../controller'
import { Icon } from './icons'
import { useReader } from './use-reader'

export const PagePill = forwardRef<HTMLDivElement, { controller: ReaderController; side: Side }>(function PagePill({ controller, side }, ref) {
  const { page, pages } = useReader(controller).sides[side]
  const [draft, setDraft] = useState<string | null>(null)
  const go = (n: number) => { if (Number.isInteger(n) && n >= 1 && n <= pages) controller.goToPage(side, n) }
  return (
    <div ref={ref} className="chrome pill">
      <button type="button" aria-label={R.pill.previous} onClick={() => go(page - 1)}>
        <Icon node={ChevronLeft} size={14} />
      </button>
      <input inputMode="numeric" aria-label={side === 'left' ? R.pill.original : R.pill.translation} value={draft ?? String(page)} onFocus={e => e.currentTarget.select()} onBlur={() => setDraft(null)}
        onChange={e => setDraft(e.target.value)} onInput={e => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={e => { if (e.key === 'Enter') { go(Number(draft ?? page)); setDraft(null) } else if (e.key === 'Escape') setDraft(null) }} />
      <span className="of">/ {pages}</span>
      <button type="button" aria-label={R.pill.next} onClick={() => go(page + 1)}>
        <Icon node={ChevronRight} size={14} />
      </button>
    </div>
  )
})
```

  (The test reads `container.textContent` as `/ 26`: the buttons' icons and the input carry no text. If the Enter
  handler reads a stale `draft`, the test fails on `['right', 12]`: then read the input's own value,
  `e.currentTarget.value`, instead.)

- [ ] **Step 4: The indicator** — create `src/pdf-reader/ui/ScrollIndicator.tsx`:

```tsx
// A pane's scroll indicator (the reader's design, §6.5): the native scrollbar is off; on the pane's right edge a 14 px
// track and a 4 px thumb whose place follows the scroll on the compositor (a scroll-driven animation, reader.css) and
// whose length is set here, when the pane's size or its pages change — never on a scroll. Hidden at rest; the thumb
// drags, a press on the track turns a screen towards it, and a press makes its pane the leading side
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { ReaderController, Side } from '../controller'
import { useReader } from './use-reader'

/** the thumb: the pane's visible share of the track, 32 px at least */
export const thumbSize = (track: number, client: number, scroll: number) => Math.min(track, Math.max(32, Math.round((track * client) / Math.max(scroll, 1))))

export const ScrollIndicator = forwardRef<HTMLDivElement, { controller: ReaderController; side: Side }>(function ScrollIndicator({ controller, side }, ref) {
  const state = useReader(controller)
  const track = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => track.current as HTMLDivElement)
  const scroller = () => track.current?.parentElement?.querySelector<HTMLElement>('.viewerContainer:not(.axt-incoming)') ?? null
  const size = () => {
    const t = track.current, c = scroller()
    if (!t || !c) return
    t.hidden = c.scrollHeight <= c.clientHeight + 1
    t.style.setProperty('--track', `${t.clientHeight}px`)
    t.style.setProperty('--thumb', `${thumbSize(t.clientHeight, c.clientHeight, c.scrollHeight)}px`)
  }
  // the length follows the pane's size, the scale and the page count; a frame after, once PDF.js has laid the pages
  useEffect(() => { const id = requestAnimationFrame(size); return () => cancelAnimationFrame(id) }, [state.scale, state.sides[side].pages, state.display, state.narrow])
  useEffect(() => {
    const pane = track.current?.parentElement
    if (!pane) return
    const observer = new ResizeObserver(() => size())
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = track.current, c = scroller()
    if (!t || !c) return
    e.preventDefault()
    controller.lead(side)
    const thumb = t.querySelector('i')!
    if (e.target !== thumb) {
      const r = thumb.getBoundingClientRect()
      c.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * c.clientHeight * 0.9, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      return
    }
    t.setPointerCapture(e.pointerId)
    t.toggleAttribute('data-drag', true)
    const y0 = e.clientY, top0 = c.scrollTop, per = (c.scrollHeight - c.clientHeight) / Math.max(1, t.clientHeight - thumb.offsetHeight)
    const move = (ev: PointerEvent) => { c.scrollTop = top0 + (ev.clientY - y0) * per }
    const up = () => { t.removeAttribute('data-drag'); t.removeEventListener('pointermove', move); t.removeEventListener('pointerup', up) }
    t.addEventListener('pointermove', move)
    t.addEventListener('pointerup', up)
  }
  return (
    <div ref={track} className="chrome indicator" aria-hidden="true" onPointerDown={onDown}>
      <i />
    </div>
  )
})
```

- [ ] **Step 5: The session and the controller** — in `session.mjs`, after `goToUnit`, add:

```js
/** a side made the leading one, as a press in its pane makes it: a press on its scroll indicator (the reader's design, §6.5) */
export function lead(which) { const s = which === 'left' ? left : right; take(s); arm() }
```

  `session.d.mts` declares `export declare function lead(which: 'left' | 'right'): void`; the controller's `Session`
  picks `'lead'`, `ReaderController` gains `lead(side: Side): void` and `createController` returns
  `lead: side => later(s => s.lead(side))`.

- [ ] **Step 6: The panes take them** — in `App.tsx`, the two `section`s become a `Pane` component that holds the
  section's ref, the pill's and the indicator's, calls `useScrollShow(section, [[pill, 2500], [indicator, 900]])`, and
  renders, after its `.viewerContainer`, `<PagePill ref={pill} controller={controller} side={side} />` and
  `<ScrollIndicator ref={indicator} controller={controller} side={side} />`. The `targets` array is memoised
  (`useMemo(() => [[pill, 2500], [indicator, 900]], [])`) so that the effect does not run again on every render.

  Inside `@layer components` in `reader.css`, add:

```css
  /* a pane's page pill (§6.4): its bottom centre, 16 px up; shown while the pane scrolls, hovered or focused */
  .pill { position: absolute; z-index: 5; inset-block-end: 16px; inset-inline-start: 50%; translate: -50% 0; display: flex; align-items: center; height: 30px; padding: 0 3px; border-radius: 999px;
    background: var(--float-bg); backdrop-filter: blur(16px) saturate(1.5); box-shadow: var(--float-shadow); color: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums;
    opacity: 0; pointer-events: none; transition: opacity 200ms ease-out; }
  .pill[data-live], .pill:hover, .pill:focus-within { opacity: 1; pointer-events: auto; }
  .pill button { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 999px; color: var(--ink-3); transition: background-color 150ms, color 150ms; }
  .pill button:hover { background: var(--fill); color: var(--ink); }
  .pill input { width: 3.2ch; height: 22px; border: 0; border-radius: 6px; background: none; color: var(--ink); font-weight: 500; text-align: end; }
  .pill input:hover { background: var(--fill); }
  .pill .of { padding-inline: 3px 5px; }
  /* a pane's scroll indicator (§6.5): its right edge; the thumb's place a scroll-driven animation on the pane's timeline */
  .indicator { position: absolute; z-index: 4; inset-block: 6px; inset-inline-end: 0; width: 14px; display: flex; justify-content: center; opacity: 0; transition: opacity 300ms ease-out; }
  .indicator[data-live], .indicator:hover, .indicator[data-drag] { opacity: 1; transition-duration: 120ms; }
  .indicator i { position: absolute; top: 0; width: 4px; height: var(--thumb, 40px); border-radius: 999px; background: color-mix(in oklab, var(--ink) 30%, transparent); transition: width 150ms ease-out, background-color 150ms; animation: thumb linear both; animation-timeline: --pane-y; }
  .indicator:hover i, .indicator[data-drag] i { width: 7px; background: color-mix(in oklab, var(--ink) 45%, transparent); cursor: grab; }
  .indicator[data-drag] i { cursor: grabbing; }
```

  and after the layer: `@keyframes thumb { from { translate: 0 0; } to { translate: 0 calc(var(--track, 100px) - var(--thumb, 40px)); } }`
  and `@media (prefers-reduced-motion: reduce) { .pill, .indicator { transition: none; } }`.

- [ ] **Step 7: The browser check** — in `reader-ui.mjs`, above the summary line:

```js
// ---------------------------------------------------------------- Task 22: the pills and the indicators
{
  const page = await open({ mode: 'bilingual' })
  const opacity = s => page.evaluate(sel => getComputedStyle(document.querySelector(sel)).opacity, s)
  check('the pill and the indicator are hidden at rest', (await opacity('.pane[data-side="left"] .pill')) === '0' && (await opacity('.pane[data-side="left"] .indicator')) === '0')
  await page.mouse.move(300, 500)
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(250)
  check('scrolling shows the pane\'s pill and indicator', (await opacity('.pane[data-side="left"] .pill')) === '1' && (await opacity('.pane[data-side="left"] .indicator')) === '1')
  await page.waitForTimeout(2800)
  check('both fade after their delays', (await opacity('.pane[data-side="left"] .pill')) === '0')
  const pill = page.getByRole('textbox', { name: '原文页码' })
  await pill.focus()
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check('a page typed in the pill is gone to', (await state(page)).sides.left.page === 5, JSON.stringify((await state(page)).sides))
  // a drag of the right indicator's thumb moves the right side, and the left follows through the sync
  const leftTop = await page.evaluate(() => window.__reader.debug.left.container.scrollTop)
  const thumb = await page.evaluate(() => { const r = document.querySelector('.pane[data-side="right"] .indicator i').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 10 } })
  await page.mouse.move(thumb.x, thumb.y)
  await page.mouse.down()
  await page.mouse.move(thumb.x, thumb.y + 120, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => ({ left: window.__reader.debug.left.container.scrollTop, right: window.__reader.debug.right.container.scrollTop }))
  check('dragging an indicator moves its side, the other following', after.right > 0 && after.left !== leftTop, JSON.stringify({ leftTop, after }))
  await shot(page, '22-pills')
  await page.close()
}
```

```bash
pnpm vitest run tests/pdf-reader && pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs
```

Expected: PASS; `all passed`.

- [ ] **Step 8: The gate and the commit**

```bash
git add src/pdf-reader/ui/PagePill.tsx src/pdf-reader/ui/ScrollIndicator.tsx src/pdf-reader/ui/scroll-show.ts src/pdf-reader/engine/session.mjs src/pdf-reader/engine/session.d.mts src/pdf-reader/controller.ts src/entrypoints/pdf-reader/App.tsx src/entrypoints/pdf-reader/reader.css tests/pdf-reader experiments/pdf-bilingual/spikes/reader-ui.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the page pills and the scroll indicators

A pill per pane at its bottom centre, a page typed and entered gone to, the
arrows a page each; an indicator on each pane's right edge whose thumb
follows the scroll on the compositor and whose length changes only with the
pane's size or pages. Both show while their pane scrolls through one passive
listener, React rendering nothing on a scroll; a press on an indicator makes
its side the leading one.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 23: the states — the capsule, the card, the narrow window

**Files:**
- Create: `src/pdf-reader/ui/status.ts`, `src/pdf-reader/ui/StatusCapsule.tsx`, `src/pdf-reader/ui/FailureCard.tsx`
- Modify: `src/pdf-reader/engine/session.mjs`, `session.d.mts` (`retry`, `setNarrow`; a failure stays in its display),
  `src/pdf-reader/controller.ts`, `src/entrypoints/pdf-reader/App.tsx`, `reader.css`,
  `experiments/pdf-bilingual/spikes/viewer-faults.mjs`
- Test: `tests/pdf-reader/ui/status.test.ts`, `tests/pdf-reader/ui/status-views.test.tsx`, `tests/pdf-reader/controller.test.ts`

**Interfaces:**
- Produces: `capsuleOf(state, seen): Capsule | null` and `cardOf(state): Card | null` (§8's table), with
  `seen: { closed: boolean; narrowShown: boolean }`; `StatusCapsule({ controller, onChooseLanguage })`, a
  `role="status"` region present from the first paint; `FailureCard({ controller })`, in the translation's pane; the
  controller's `retry()` and `setNarrow(on)`, `ReaderState.narrow`; the session's `retry()` (Part 3: a reload, Part 4 in
  place) and `setNarrow(on)`.

- [ ] **Step 1: The failing tests** — create `tests/pdf-reader/ui/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { INITIAL, type ReaderState } from '@/pdf-reader/controller'
import { capsuleOf, cardOf } from '@/pdf-reader/ui/status'

const at = (over: Partial<ReaderState>): ReaderState => ({ ...INITIAL, settings: DEFAULT_CONFIG, display: 'bilingual', ...over })
const none = { closed: false, narrowShown: false }

describe('the states (the reader\'s design, §8)', () => {
  it('reading shows nothing', () => {
    expect(capsuleOf(at({ phase: 'ready' }), none)).toBeNull()
    expect(cardOf(at({ phase: 'ready', failure: 'network', shown: 'copy' }))).toBeNull()
  })

  it('loading and translating fill the capsule by their progress', () => {
    expect(capsuleOf(at({ phase: 'loading' }), none)).toEqual({ kind: 'progress', text: '正在加载', progress: 0 })
    expect(capsuleOf(at({ phase: 'translating', progress: 0.4 }), none)).toEqual({ kind: 'progress', text: '正在翻译', progress: 0.4 })
    expect(capsuleOf(at({ phase: 'retranslating', progress: 0.1 }), none)).toMatchObject({ text: '正在按当前设置重新翻译' })
  })

  it('counts the paragraphs that failed, with 重试, until closed', () => {
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3 }), none)).toEqual({ kind: 'notice', text: '3 处翻译失败', action: 'retry' })
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3 }), { ...none, closed: true })).toBeNull()
  })

  it('names a language the reader cannot typeset, and offers the menu', () => {
    const state = at({ phase: 'ready', languageSupported: false, settings: { ...DEFAULT_CONFIG, targetLanguage: 'ara' } })
    expect(capsuleOf(state, none)).toMatchObject({ kind: 'unsupported', action: 'language' })
    expect(capsuleOf(state, none)!.text).toMatch(/^PDF 对照暂不支持/)
  })

  it('says once that a narrow window shows the translation alone', () => {
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), none)).toEqual({ kind: 'narrow', text: '窗口较窄，暂只显示译文' })
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), { ...none, narrowShown: true })).toBeNull()
    expect(capsuleOf(at({ phase: 'ready', narrow: true, display: 'translation' }), none)).toBeNull()
  })

  it('nothing translated: the card, with the reason; 设置 for a key, 重试 otherwise; no capsule', () => {
    expect(cardOf(at({ phase: 'failed', failure: 'network' }))).toEqual({ reason: '网络连接失败', action: 'retry' })
    expect(cardOf(at({ phase: 'failed', failure: 'no-key' }))).toEqual({ reason: '尚未配置 API Key', action: 'settings' })
    expect(cardOf(at({ phase: 'failed', failure: 'auth' }))!.action).toBe('settings')
    expect(capsuleOf(at({ phase: 'failed', failure: 'network' }), none)).toBeNull()
  })
})
```

  Create `tests/pdf-reader/ui/status-views.test.tsx`:

```tsx
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FailureCard } from '@/pdf-reader/ui/FailureCard'
import { StatusCapsule } from '@/pdf-reader/ui/StatusCapsule'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

describe('the capsule and the card (the reader\'s design, §6.6)', () => {
  it('the capsule is a status region from the first paint, its words changing in it', async () => {
    const fake = fakeController({ phase: 'ready' })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    const region = container.querySelector('[role="status"]')!
    expect(region.textContent).toBe('')
    await act(async () => fake.set({ phase: 'translating', progress: 0.5 }))
    expect(region.textContent).toContain('正在翻译')
  })

  it('a notice\'s 重试 retries, and its close is remembered for the visit', async () => {
    const fake = fakeController({ phase: 'ready', failedUnits: 2 })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    container.querySelector<HTMLElement>('button[data-action]')!.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
    await act(async () => container.querySelector<HTMLElement>('button[aria-label="关闭"]')!.click())
    await act(async () => fake.set({ failedUnits: 3 }))
    expect(container.querySelector('[role="status"]')!.textContent).not.toContain('翻译失败')
  })

  it('the card says the reason and offers what can be done, never taking the focus', async () => {
    const fake = fakeController({ phase: 'failed', failure: 'network' })
    const before = document.activeElement
    const { container } = await mountElement(createElement(FailureCard, { controller: fake.controller }))
    expect(container.textContent).toContain('网络连接失败')
    container.querySelector<HTMLElement>('button')!.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(before)
  })
})
```

  (Add `retry: vi.fn()` and `setNarrow: vi.fn()` to `fakeController`.) In `tests/pdf-reader/controller.test.ts`,
  inside `describe('createController', …)`:

```ts
  it('knows the window is narrow once told, and tells the session once', async () => {
    const session = { ...fakeSession(), setNarrow: vi.fn() }
    const controller = createController({ open: async () => session, params: new URLSearchParams() })
    await controller.attach(panes())
    controller.setNarrow(true)
    controller.setNarrow(true)
    await Promise.resolve()
    expect(controller.getState().narrow).toBe(true)
    expect(session.setNarrow).toHaveBeenCalledOnce()
  })
```

```bash
pnpm vitest run tests/pdf-reader
```

Expected: FAIL — `status`, `StatusCapsule`, `FailureCard` do not resolve; `setNarrow` is not a function.

- [ ] **Step 2: §8 as a function** — create `src/pdf-reader/ui/status.ts`:

```ts
// The reader's states (the reader's design, §8) as what the capsule and the card show: one anatomy, an icon, one
// sentence, at most one action. Reading shows nothing; a translation on screen is never covered by a failure's card
import type { ProviderErrorKind } from '@/providers/types'
import { R, S, languageName, reasonText } from '@/ui/strings'
import type { ReaderState } from '../controller'

export type Capsule =
  | { kind: 'progress'; text: string; progress: number }
  | { kind: 'notice'; text: string; action: 'retry' }
  | { kind: 'unsupported'; text: string; action: 'language' }
  | { kind: 'narrow'; text: string }
export interface Card { reason: string; action: 'retry' | 'settings' }

/** the reasons a key settles: the settings are where it is fixed (the popup's rule) */
const KEYS: ReadonlySet<ProviderErrorKind> = new Set(['no-key', 'auth'])

export function capsuleOf(state: ReaderState, seen: { closed: boolean; narrowShown: boolean }): Capsule | null {
  if (state.phase === 'failed') return null
  if (state.phase === 'loading') return { kind: 'progress', text: R.status.loading, progress: state.progress }
  if (state.phase === 'translating') return { kind: 'progress', text: R.status.translating, progress: state.progress }
  if (state.phase === 'retranslating') return { kind: 'progress', text: R.status.again, progress: state.progress }
  if (!state.languageSupported && state.settings) return { kind: 'unsupported', text: R.status.unsupported(languageName(state.settings.targetLanguage)), action: 'language' }
  if (state.failedUnits > 0 && !seen.closed) return { kind: 'notice', text: S.failed.text(state.failedUnits), action: 'retry' }
  if (state.narrow && state.display === 'bilingual' && !seen.narrowShown) return { kind: 'narrow', text: R.status.narrow }
  return null
}

export function cardOf(state: ReaderState): Card | null {
  if (state.phase !== 'failed' || state.failure === 'aborted') return null
  const kind = state.failure ?? 'unknown'
  return { reason: reasonText(kind), action: KEYS.has(kind) ? 'settings' : 'retry' }
}
```

- [ ] **Step 3: The capsule** — create `src/pdf-reader/ui/StatusCapsule.tsx`:

```tsx
// The status capsule (the reader's design, §6.6): the document area's bottom centre, 58 px up, above the pills. A status
// region present from the first paint, so that what it says later is announced; it rises in (240 ms) and leaves lighter
// (160 ms); a new state of the same kind changes its words in place. Progress is its own background filling from the
// left. A notice has a chip and a close, the close remembered for the visit; the narrow window's words leave by
// themselves after 4 s. A failure never takes the focus
import { Info, X } from 'lucide'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { R, S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { type Capsule, capsuleOf } from './status'
import { useReader } from './use-reader'

export function StatusCapsule({ controller, onChooseLanguage }: { controller: ReaderController; onChooseLanguage: () => void }) {
  const state = useReader(controller)
  const [closed, setClosed] = useState(false)
  const [narrowShown, setNarrowShown] = useState(false)
  const now = capsuleOf(state, { closed, narrowShown })
  // a capsule that goes is kept 160 ms, leaving (reader.css .capsule[data-out]); one that comes replaces it at once
  const [leaving, setLeaving] = useState<Capsule | null>(null)
  const last = useRef<Capsule | null>(null)
  useEffect(() => {
    if (!now && last.current) {
      setLeaving(last.current)
      const t = setTimeout(() => setLeaving(null), 160)
      last.current = null
      return () => clearTimeout(t)
    }
    last.current = now
    setLeaving(null)
  }, [now?.kind, now?.text])
  useEffect(() => {
    if (now?.kind !== 'narrow') return
    const t = setTimeout(() => setNarrowShown(true), 4000)
    return () => clearTimeout(t)
  }, [now?.kind])
  // the same kind with other words: the words fade in and the capsule's width eases to theirs (200 ms); one read of its
  // width when its words change, which is rare (progress changes the fill, not the words)
  const box = useRef<HTMLDivElement>(null)
  const width = useRef<{ kind: string; w: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !now) { width.current = null; return }
    const w = el.offsetWidth, before = width.current
    if (before && before.kind === now.kind && before.w !== w && !matchMedia('(prefers-reduced-motion: reduce)').matches) el.animate([{ width: `${before.w}px` }, { width: `${w}px` }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    width.current = { kind: now.kind, w }
  }, [now?.kind, now?.text])
  const capsule = now ?? leaving
  return (
    <div role="status" className="capsule-slot">
      {capsule && (
        <div ref={box} key={capsule.kind} className="chrome capsule" data-kind={capsule.kind} data-out={now ? undefined : ''}>
          {capsule.kind === 'progress' && <span className="fill" aria-hidden="true" style={{ scale: `${Math.max(0.04, capsule.progress)} 1` }} />}
          {capsule.kind !== 'progress' && <Icon node={Info} size={15} />}
          <span key={capsule.text} className="words">{capsule.text}</span>
          {capsule.kind === 'notice' && (
            <>
              <button type="button" data-action className="chip" onClick={controller.retry}>{S.failed.retry}</button>
              <button type="button" aria-label={R.status.close} className="close" onClick={() => setClosed(true)}>
                <Icon node={X} size={13} />
              </button>
            </>
          )}
          {capsule.kind === 'unsupported' && <button type="button" data-action className="chip" onClick={onChooseLanguage}>{R.status.chooseLanguage}</button>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: The card** — create `src/pdf-reader/ui/FailureCard.tsx`:

```tsx
// Nothing translated (the reader's design, §6.6, §8): the capsule's anatomy as a card centred in the translation's pane,
// with a filled action — 设置 when a key is the reason (the settings page at its services), 重试 otherwise
import { CircleAlert } from 'lucide'
import { browser } from 'wxt/browser'
import { S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { cardOf } from './status'
import { useReader } from './use-reader'

export function FailureCard({ controller }: { controller: ReaderController }) {
  const card = cardOf(useReader(controller))
  if (!card) return null
  const act = card.action === 'settings'
    ? () => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)('/options.html#services') })
    : controller.retry
  return (
    <div className="chrome card" data-card>
      <Icon node={CircleAlert} size={20} />
      <p>{card.reason}</p>
      <button type="button" onClick={act}>{card.action === 'settings' ? S.settings : S.failed.retry}</button>
    </div>
  )
}
```

  Inside `@layer components` in `reader.css`, add:

```css
  /* the status capsule (§6.6): fixed over the document area, above the pills, moved with it by the contents */
  .capsule-slot { position: fixed; z-index: 7; inset: auto 0 58px 0; display: flex; justify-content: center; pointer-events: none; transition: left 200ms var(--ease); }
  html[data-axt-contents] .capsule-slot { left: var(--side); }
  .capsule { position: relative; isolation: isolate; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 6px 0 12px; overflow: hidden; border-radius: 999px; white-space: nowrap; pointer-events: auto;
    background: var(--float-bg); backdrop-filter: blur(16px) saturate(1.5); box-shadow: var(--float-shadow); color: var(--ink); font-size: 12.5px; animation: capsule-in 240ms var(--ease); }
  .capsule[data-kind="progress"], .capsule[data-kind="narrow"] { padding-inline-end: 14px; }
  .capsule[data-out] { animation: capsule-out 160ms ease-out forwards; pointer-events: none; }
  .capsule svg { color: var(--ink-2); }
  .capsule .fill { position: absolute; inset: 0; z-index: -1; background: color-mix(in oklab, var(--ink) 8%, transparent); transform-origin: 0 50%; transition: scale 600ms var(--ease); }
  .capsule .words { animation: words-in 180ms ease-out; }
  .capsule .chip { height: 24px; padding: 0 10px; border-radius: 999px; background: var(--fill); font-size: 12px; font-weight: 500; transition: scale 150ms; }
  .capsule .chip:active { scale: 0.96; }
  .capsule .close { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 999px; color: var(--ink-3); }
  .capsule .close:hover { background: var(--fill); color: var(--ink); }
  /* the card (§6.6): centred in the translation's pane, which it covers (the pane marks itself: no relational selector in the sheet, §12) */
  .pane[data-card] .viewerContainer { visibility: hidden; }
  .card { position: absolute; z-index: 6; inset-block-start: 42%; inset-inline-start: 50%; translate: -50% -50%; width: min(300px, calc(100% - 48px)); padding: 22px 20px 18px; border-radius: 14px;
    display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; background: var(--chrome); color: var(--ink); box-shadow: var(--pop-shadow); }
  .card svg { color: var(--danger); }
  .card p { margin: 0; font-size: 13px; font-weight: 500; text-wrap: balance; }
  .card button { height: 30px; padding: 0 16px; border-radius: 8px; background: var(--ink); color: var(--chrome); font-weight: 500; transition: scale 150ms ease-out; }
  .card button:active { scale: 0.96; }
```

  and after the layer: `@keyframes capsule-in { from { opacity: 0; translate: 0 10px; scale: 0.96; } }`,
  `@keyframes capsule-out { to { opacity: 0; translate: 0 6px; } }`,
  `@keyframes words-in { from { opacity: 0; translate: 0 3px; } }`, and under reduced motion both as fades. The right
  `Pane` sets `data-card` on its section while `cardOf(state)` is not null (Step 7).

- [ ] **Step 5: A failure stays in its display** — in `session.mjs`'s `live()` `fail`, delete the line
  `if (mode === 'translation' && !right.doc) { held = 'original'; mode = 'original'; showMode(); relayout('translation') }`
  and its comment; delete `held` (its declaration and doc comment, `held = null` in `setDisplay`, and `!held &&` in
  `followSettings`) — it existed for that switch alone, and the card now fills the pane it left blank (the reader's
  design, §8). In Part 2's Review Focus of this plan, strike the item "A display this visit holds" with a line saying
  Task 23 removed it and why. In `viewer-faults.mjs`, replace the last check with:

```js
const card = await page.evaluate(() => ({ card: document.querySelector('.pane[data-side="right"] .card')?.textContent ?? null, display: window.__reader.controller.getState().display }))
check('Translation with no service: the card in the translation\'s pane, the display kept', !!card.card && card.display === 'translation', JSON.stringify(card))
```

- [ ] **Step 6: Retry and the narrow window** — in `session.mjs`, after `lead`, add:

```js
/** again (the reader's design, §8): the translations made come back from the cache and the missing are asked again. A
 *  reload in Part 3 of plans/2026-09-25-reader-interface.md; Part 4 retries in place, with stopping early (§10.3) */
export function retry() { location.reload() }
/** a window too narrow for two sides (§5): 对照 shows the translation alone, the sync idle while it does */
export function setNarrow(on) {
  if (narrow === on) return
  const place = on ? null : readingPlace(right)
  bake()
  narrow = on
  document.documentElement.toggleAttribute('data-axt-narrow', on)
  if (mode === 'bilingual') relayout(on ? 'bilingual' : 'translation', place)
}
```

  and wherever the session tests `mode === 'bilingual'` or `mode !== 'bilingual'` to mean "both sides are shown"
  (`syncFrom`, `onCompositor`, `fitWidth`, and any other the grep finds), test `bothShown()` instead, defined beside
  `shown` as `const bothShown = () => mode === 'bilingual' && !narrow`:

```bash
grep -n "mode === 'bilingual'\|mode !== 'bilingual'" src/pdf-reader/engine/session.mjs
```

  `session.d.mts` declares `retry(): void` and `setNarrow(on: boolean): void`. In the controller: `ReaderState.narrow`
  (added in Task 17) is set by `setNarrow(on) { if (state.narrow === on) return; set({ narrow: on }); later(s => s.setNarrow(on)) }`;
  `retry: () => later(s => s.retry())`; `Session` picks `'retry' | 'setNarrow'`.

- [ ] **Step 7: The page takes them** — in `App.tsx`: render `<StatusCapsule controller={controller} onChooseLanguage={…} />`
  after the document area, where `onChooseLanguage` opens the language menu (give `LanguageMenu` an `id` for its
  popover through a prop, `popoverId`, and call `document.getElementById(popoverId)?.showPopover()`); the right `Pane`
  renders `<FailureCard controller={controller} />` and sets `data-card` while `cardOf(state)` is not null; and a
  `ResizeObserver` on the document area tells the controller whether it is narrower than 840 px:
  `controller.setNarrow(entry.contentRect.width < 840)`.

- [ ] **Step 8: The browser check** — in `reader-ui.mjs`, above the summary line:

```js
// ---------------------------------------------------------------- Task 23: the states
{
  const page = await open({ mode: 'bilingual' }, { width: 800, height: 900 })
  const s = await state(page)
  const leftShown = () => page.evaluate(() => getComputedStyle(document.querySelector('.pane[data-side="left"]')).display !== 'none')
  check('a narrow window: 对照 kept, the translation alone', s.display === 'bilingual' && s.narrow && !(await leftShown()), JSON.stringify({ display: s.display, narrow: s.narrow }))
  check('…and the capsule says so', (await page.getByRole('status').textContent()).includes('窗口较窄'))
  await shot(page, '23-narrow')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(600)
  check('wide again: both sides', !(await state(page)).narrow && (await leftShown()))
  await page.close()
}
```

```bash
pnpm vitest run tests/pdf-reader && pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs && node experiments/pdf-bilingual/spikes/viewer-faults.mjs && node experiments/pdf-bilingual/spikes/reader-settings.mjs
```

Expected: PASS; `all passed` for each (the settings check's held-display case is gone with `held`; if it has one, it
goes too).

- [ ] **Step 9: The gate and the commit**

```bash
git add src/pdf-reader/ui/status.ts src/pdf-reader/ui/StatusCapsule.tsx src/pdf-reader/ui/FailureCard.tsx src/pdf-reader/engine/session.mjs src/pdf-reader/engine/session.d.mts src/pdf-reader/controller.ts src/entrypoints/pdf-reader/App.tsx src/entrypoints/pdf-reader/reader.css experiments/pdf-bilingual/spikes/viewer-faults.mjs experiments/pdf-bilingual/plans/2026-09-25-reader-interface.md tests/pdf-reader experiments/pdf-bilingual/spikes/reader-ui.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): the states — the capsule, the card, the narrow window

§8 as one function: loading and translating fill the capsule by their
progress, a count of failed paragraphs with 重试 until closed, a language the
reader cannot typeset with the way to choose another, the narrow window said
once. Nothing translated is a card in the translation's pane with the
reason and 设置 or 重试: a failure no longer leaves the display for the
original, the card fills the pane instead. A narrow window shows the
translation alone, the sync idle.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 24: pinch zoom and the zoom keys

**Files:**
- Create: `src/pdf-reader/ui/pinch.ts`
- Modify: `src/pdf-reader/engine/session.mjs`, `session.d.mts` (`pinch`), `src/pdf-reader/controller.ts`, `App.tsx`
- Test: `tests/pdf-reader/ui/pinch.test.ts`

**Interfaces:**
- Produces: `wheelStep(deltaY): number`; `usePinch(controller, docRef)` — a trackpad pinch or Ctrl/⌘ with the wheel over
  the pages zooms both sides about the pointer, one call per frame; ⌘± (Ctrl± elsewhere) zoom by a tenth; the browser's
  own zoom is taken only over the pages. The session's `pinch(which, factor, origin)`; the controller's
  `pinch(side, factor, origin)`, which forgets the menu's zoom.

- [ ] **Step 1: The failing test** — create `tests/pdf-reader/ui/pinch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { wheelStep } from '@/pdf-reader/ui/pinch'

describe('a pinch (the reader\'s design, §6.8)', () => {
  it('zooms continuously on a trackpad\'s small deltas, a tenth for a mouse notch', () => {
    expect(wheelStep(-3)).toBeCloseTo(-0.03)
    expect(wheelStep(100)).toBe(0.1)
    expect(wheelStep(-120)).toBe(-0.1)
  })
})
```

```bash
pnpm vitest run tests/pdf-reader/ui/pinch.test.ts
```

Expected: FAIL — `pinch` does not resolve.

- [ ] **Step 2: The pinch** — create `src/pdf-reader/ui/pinch.ts`:

```ts
// Pinch zoom (the reader's design, §6.8): a trackpad pinch arrives as a wheel event with Ctrl held; over the pages it
// zooms both sides together about the pointer — PDF.js scales them by CSS while the fingers move and draws them once,
// 400 ms after they stop. A trackpad's small deltas zoom continuously, a mouse notch a tenth. One call per frame. ⌘ and
// Ctrl with − and + zoom by a tenth; the browser's own zoom is taken only over the pages
import { type RefObject, useEffect } from 'react'
import type { ReaderController, Side } from '../controller'

export const wheelStep = (deltaY: number) => (Math.abs(deltaY) >= 40 ? Math.sign(deltaY) * 0.1 : deltaY * 0.01)

export function usePinch(controller: ReaderController, doc: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = doc.current
    if (!el) return
    let factor = 1, origin: [number, number] = [0, 0], side: Side = 'left', frame = 0
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const pane = (e.target as Element).closest<HTMLElement>('.pane')
      if (!pane) return
      e.preventDefault()
      factor *= Math.exp(-wheelStep(e.deltaY))
      origin = [e.clientX, e.clientY]
      side = pane.dataset.side as Side
      frame ||= requestAnimationFrame(() => {
        frame = 0
        const f = factor
        factor = 1
        if (Math.abs(f - 1) >= 0.005) controller.pinch(side, f, origin)
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); controller.zoomBy(1.1) }
      else if (e.key === '-') { e.preventDefault(); controller.zoomBy(1 / 1.1) }
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    document.addEventListener('keydown', onKey)
    return () => { el.removeEventListener('wheel', onWheel, { capture: true }); document.removeEventListener('keydown', onKey); cancelAnimationFrame(frame) }
  }, [controller, doc])
}
```

- [ ] **Step 3: The session and the controller** — in `session.mjs`, after `zoomTo`, add:

```js
/** a pinch over a side (the reader's design, §6.8): that side about the pointer, the other about its top quarter, both
 *  by CSS until PDF.js draws them 400 ms after the last step; a fit given up */
export function pinch(which, factor, origin) {
  const s = which === 'left' ? left : right
  if (!s.doc || !shown(s)) return
  for (const side of sides) {
    if (!side.doc || !shown(side)) continue
    side.fit = null
    const b = side.container.getBoundingClientRect()
    side.viewer.updateScale({ scaleFactor: factor, origin: side === s ? origin : [b.left + b.width / 2, b.top + b.height / 4], drawingDelay: 400 })
  }
}
```

  `session.d.mts` declares `pinch(which: 'left' | 'right', factor: number, origin: [number, number]): void`; the
  controller's `Session` picks `'pinch'`, `ReaderController` gains `pinch(side: Side, factor: number, origin: [number, number]): void`,
  and `createController` returns `pinch: (side, factor, origin) => { set({ zoom: null }); later(s => s.pinch(side, factor, origin)) }`.
  In `App.tsx`, give the document area a ref and call `usePinch(controller, doc)`.

- [ ] **Step 4: The browser check** — in `reader-ui.mjs`, above the summary line:

```js
// ---------------------------------------------------------------- Task 24: pinch zoom
{
  const page = await open({ mode: 'bilingual' })
  const before = (await state(page)).scale
  await page.mouse.move(400, 500)
  await page.keyboard.down('Control')
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -8)
  await page.keyboard.up('Control')
  await page.waitForTimeout(900)
  const after = await state(page)
  const widths = await page.evaluate(() => [...document.querySelectorAll('.pane .page')].slice(0, 1).map(p => p.getBoundingClientRect().width))
  check('a pinch zooms both sides together', after.scale > before * 1.05 && after.zoom === null, `${before} → ${after.scale}`)
  check('…the page drawn at the new scale', widths[0] > 0)
  const s0 = after.scale
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+=' : 'Control+=')
  await page.waitForTimeout(400)
  check('⌘+ (or Ctrl+) zooms in by a tenth', (await state(page)).scale > s0 * 1.05)
  await page.close()
}
```

```bash
pnpm vitest run tests/pdf-reader && pnpm build >/dev/null && node experiments/pdf-bilingual/spikes/reader-ui.mjs
```

Expected: PASS; `all passed`. (The overlays lag a pinch until Part 4's transform; not checked here.)

- [ ] **Step 5: The gate and the commit**

```bash
git add src/pdf-reader/ui/pinch.ts src/pdf-reader/engine/session.mjs src/pdf-reader/engine/session.d.mts src/pdf-reader/controller.ts src/entrypoints/pdf-reader/App.tsx tests/pdf-reader experiments/pdf-bilingual/spikes/reader-ui.mjs
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -F - <<'EOF'
feat(pdf-reader): pinch zoom and the zoom keys

A trackpad pinch, or Ctrl or ⌘ with the wheel, over the pages zooms both
sides together about the pointer through PDF.js's own updateScale, one call
per frame; ⌘± and Ctrl± zoom by a tenth. The browser's zoom stays its own
outside the pages.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 25: the interface checked whole; the harness goes

**Files:**
- Modify: `experiments/pdf-bilingual/spikes/reader-ui.mjs` (the live states and the screenshots for the maintainer)
- Delete (untracked, local): `experiments/pdf-bilingual/poc-reader/variants.{html,css,js}`, `variants-icons.js`

- [ ] **Step 1: The states only a live run reaches** — in `reader-ui.mjs`, above the summary line, a section that
  opens the reader live on the local corpus (as `viewer-faults.mjs` does: its `serveSite`, its corpus server, the
  extension copy with its grants) and checks, taking a screenshot of each:
  - a target language the reader cannot typeset (`targetLanguage: 'ara'`, written through `patchSettings` before the
    visit): 对照 and 译文 greyed in the switch, the capsule naming the language with 选择语言, which opens the language
    menu;
  - no service (the settings page's keyless service, as `viewer-faults.mjs` adds it): the card in the translation's
    pane, 尚未配置 API Key and 设置;
  - a translation under way: the capsule filling, its words 正在翻译.

  Screenshots go to `out/reader-ui/25-*.png`; copy the whole `out/reader-ui/` to
  `~/Downloads/readarxiv-test/design/pdf-reader-part3/` for the maintainer.

- [ ] **Step 2: The engine's checks, all of them** — the interface must not have moved the engine:

```bash
pnpm build >/dev/null
node experiments/pdf-bilingual/spikes/reader-ui.mjs
node experiments/pdf-bilingual/spikes/reader-settings.mjs
node experiments/pdf-bilingual/spikes/viewer-faults.mjs
node experiments/pdf-bilingual/spikes/cache-revisit.mjs
node experiments/pdf-bilingual/spikes/sync-frames.mjs
node tests/e2e/pdf-entry.mjs
cd experiments/pdf-bilingual && for c in anchors-cases cache-cases lost-cases mt-cases sync-cases wire-cases; do pnpm exec tsx spikes/$c.mjs >/dev/null 2>&1 && echo "$c ok" || echo "$c FAILED"; done
```

Expected: `all passed` for each probe; `e2e:pdf` 19/19; the follower on the compositor 0 frames off; six `ok`; and the
demo paper's anchoring as Part 1 measured it (350 units, 172 linked, left 209, right 236, pages 25 / 26 — read them
with the equivalence snippet of Task 6).

- [ ] **Step 3: The harness goes** — `rm experiments/pdf-bilingual/poc-reader/variants.html experiments/pdf-bilingual/poc-reader/variants.css experiments/pdf-bilingual/poc-reader/variants.js experiments/pdf-bilingual/poc-reader/variants-icons.js`
  (untracked; excluded in `.git/info/exclude`, whose lines for them go too). Its screenshots stay in
  `~/Downloads/readarxiv-test/design/pdf-reader-variants/`.

- [ ] **Step 4: The commit and a package** — commit `reader-ui.mjs`
  (`test(pdf-reader): the interface's live states in a real browser`), then copy `.output/chrome-mv3` to
  `~/Downloads/readarxiv-test/readarxiv-0.4.1dev-pdf-reader-<sha>/` with its zip for the maintainer.

### Task 26: Part 3's record, and Part 4's plan

- [ ] **Step 1:** `REPORT.md`, a twenty-third addendum: the interface as built, what differs from the harness and why,
  the browser checks' output, and what the maintainer saw at the checkpoint and said.
- [ ] **Step 2:** Part 4's plan (the engine's measured changes, §10), written against the code as Part 3 left it,
  appended here, and reviewed with the maintainer before it is executed. It includes the in-place 重试 that replaces
  Task 23's reload.
- [ ] **Step 3:** Commit both.
