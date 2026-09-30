// Renders the brand marks into the PNG sizes Chrome asks for.
//
// There are two shapes because the two places are different surfaces:
//   - public/icon/tile.svg — the book on a white rounded tile, the app-icon shape. It goes to
//     public/icon/<size>.png, the naming WXT looks for, and fills the manifest's `icons`: the
//     extensions page, the install dialog and the store, where an icon sits on a card of its own.
//   - public/icon/mark.svg — the book on its white ground, 2 units round it, no tile: the identity itself. It
//     goes to public/icon/mark-<size>.png, declared as `action.default_icon` in wxt.config.ts, and
//     is what the toolbar, the page tabs and our own pages' brand rows draw. A white tile in those
//     places would read as a sticker; the outline is what keeps the mark legible on a light and a
//     dark surface alike. At 16 px both marks are pixel drawings (docs/brand/mark-16.svg,
//     mark-off-16.svg: one <rect> a pixel), since a scaled vector blurs the letters there (logo round 7,
//     2026-09-26); from 32 px up the vectors are rendered.
//   - public/icon/mark-off.svg — the same book in grey: the toolbar button everywhere the extension
//     has nothing to do. It is the manifest's `default_icon`, as mark-off-<size>.png, and a page the
//     extension works on lights its own tab with mark-<size>.png (UI.md §5.1).
// Both are committed, so a normal build needs neither this script nor a browser; run it again
// whenever a mark changes.
//
// Playwright's Chromium does the rasterising — the same engine that renders the extension, and
// already a dev dependency. `sharp`, `rsvg-convert` and ImageMagick would each be a new one.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIZES = [16, 32, 48, 96, 128]
/** The sizes the action and the page tabs ask for */
const MARK_SIZES = [16, 32, 48]
/**
 * The store listing wants the art inset in its canvas rather than bleeding to the edge, so it is a
 * separate file: 96 of artwork centred in 128. It is uploaded by hand and must not ship inside the
 * extension, which is why it lands in docs/ and not public/
 */
const STORE = { size: 128, art: 96, out: 'docs/brand/store-icon-128.png' }
/** The README's header draws the bare mark; it lives beside the README's other images, not in the package */
const README = { size: 256, out: 'docs/images/mark-256.png' }

const shot = async (page, svg, size, art = size) => {
  const pad = (size - art) / 2
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><style>
       html,body { margin: 0; background: transparent }
       .box { width: ${size}px; height: ${size}px; padding: ${pad}px; box-sizing: border-box }
       svg { display: block; width: ${art}px; height: ${art}px }
     </style><div class="box">${svg}</div>`,
  )
  return page.locator('.box').screenshot({ omitBackground: true })
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
// The vectors ship too: the extension's own pages draw the tile from it at whatever size they need,
// and it stays the one file its PNGs are derived from
const tile = await readFile(resolve(root, 'public/icon/tile.svg'), 'utf8')
const mark = await readFile(resolve(root, 'public/icon/mark.svg'), 'utf8')
const markOff = await readFile(resolve(root, 'public/icon/mark-off.svg'), 'utf8')
// the 16 px toolbar icons are drawn pixel by pixel (docs/brand/mark-16.svg); a scaled vector blurs the letters at 16
const mark16 = await readFile(resolve(root, 'docs/brand/mark-16.svg'), 'utf8')
const markOff16 = await readFile(resolve(root, 'docs/brand/mark-off-16.svg'), 'utf8')

await mkdir(resolve(root, 'public/icon'), { recursive: true })
for (const size of SIZES) {
  await writeFile(resolve(root, `public/icon/${size}.png`), await shot(page, tile, size))
  console.log(`public/icon/${size}.png`)
}
for (const size of MARK_SIZES) {
  await writeFile(resolve(root, `public/icon/mark-${size}.png`), await shot(page, size === 16 ? mark16 : mark, size))
  console.log(`public/icon/mark-${size}.png`)
  await writeFile(resolve(root, `public/icon/mark-off-${size}.png`), await shot(page, size === 16 ? markOff16 : markOff, size))
  console.log(`public/icon/mark-off-${size}.png`)
}

await mkdir(resolve(root, dirname(STORE.out)), { recursive: true })
await writeFile(resolve(root, STORE.out), await shot(page, tile, STORE.size, STORE.art))
console.log(STORE.out)
await writeFile(resolve(root, README.out), await shot(page, mark, README.size))
console.log(README.out)

await browser.close()
