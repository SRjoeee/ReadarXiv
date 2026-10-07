// Measuring a surface as the maintainer's standard asks (the redesign's design, §12): every item of a row on the row's
// centre line within 0.5 px, only the agreed leading and trailing edges, and a screenshot of each part. Ported from the
// prototypes' settings-2/tools/align-probe.mjs (the measures) and round-6/tools/shoot.mjs (the shots), taken from their
// pages' class names to selectors, for the controls sheet's probe (Part 3) and the popup's and the settings page's
// (Parts 4 and 5). The pages are left to right in every language they have
import { join } from 'node:path'

/**
 * The items of each row whose vertical centre lies more than `tolerance` px from the row's, as `{ row, item, off }`. A
 * row with no height, or inside an `inert` (a closed reveal), is passed over, and so is an item with no height. Throws
 * when nothing drawn matches: a state that drew nothing is not aligned
 */
export async function offCentre(page, { rows, items = ':scope > *', tolerance = 0.5 }) {
  const { out, measured } = await page.evaluate(({ rows, items, tolerance }) => {
    const out = []
    let measured = 0
    for (const row of document.querySelectorAll(rows)) {
      const r = row.getBoundingClientRect()
      if (!r.height || row.closest('[inert]')) continue
      measured++
      const mid = r.top + r.height / 2
      for (const item of row.querySelectorAll(items)) {
        const b = item.getBoundingClientRect()
        if (!b.height) continue
        const off = b.top + b.height / 2 - mid
        if (Math.abs(off) > tolerance) out.push({ row: (row.dataset.row || row.textContent || '').trim().slice(0, 24), item: String(item.getAttribute('class') ?? item.tagName), off: Math.round(off * 10) / 10 })
      }
    }
    return { out, measured }
  }, { rows, items, tolerance })
  if (!measured) throw new Error(`offCentre: nothing drawn matches ${rows}`)
  return out
}

/**
 * The distinct edges of `items` from the closest ancestor matching `frame`: `start` from its left, `end` from its right;
 * rounded to 0.5 px, sorted. A surface keeps a few agreed ones (the popup's 12 and 24; 14, 42 and 70 from a settings
 * card's start, 14 from its end). Throws when nothing drawn matches: a state that drew nothing is not aligned
 */
export async function edges(page, { items, frame, side = 'start' }) {
  const { found, measured } = await page.evaluate(({ items, frame, side }) => {
    const found = new Set()
    for (const item of document.querySelectorAll(items)) {
      const b = item.getBoundingClientRect(), f = item.closest(frame)?.getBoundingClientRect()
      if (!b.width || !f || item.closest('[inert]')) continue
      found.add(Math.round((side === 'start' ? b.left - f.left : f.right - b.right) * 2) / 2)
    }
    return { found: [...found].sort((a, b) => a - b), measured: found.size }
  }, { items, frame, side })
  if (!measured) throw new Error(`edges: nothing drawn matches ${items}`)
  return found
}

/** A screenshot of each element matching `selector` into `dir`, named `name(<its data-<key> attribute>)` */
export async function shootEach(page, selector, dir, name, key) {
  const elements = page.locator(selector)
  const count = await elements.count()
  for (let i = 0; i < count; i++) {
    const element = elements.nth(i)
    const id = (await element.getAttribute(`data-${key}`)) ?? String(i)
    await element.screenshot({ path: join(dir, `${name(id)}.png`), animations: 'disabled', caret: 'hide' })
  }
}
