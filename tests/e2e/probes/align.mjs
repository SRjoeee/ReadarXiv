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

/**
 * A menu's rows against the trailing check (UI.md §4; the maintainer, 2026-10-25), the menu open as `pop` names it: each
 * row's words `inset` px from the row's start, on the search field's words where there is one; in a choice, a 14 px check
 * on every row, ending `inset` px from the row's end, after everything else the row holds (a hint, a sample, a button, a
 * spinner), 7.5 px or more before it; the words and the checks `edge` px from the menu's edges, in every menu alike.
 * What is off, as lines; throws when no row is drawn
 */
export async function menuRows(page, pop, { inset = 10, edge = 14 } = {}) {
  const { off, rows } = await page.evaluate(({ pop, inset, edge }) => {
    const off = [], menu = document.querySelector(pop)
    if (!menu) return { off: [`no menu at ${pop}`], rows: 0 }
    const m = menu.getBoundingClientRect(), near = (a, b) => Math.abs(a - b) <= 0.5, ends = new Set(), starts = new Set()
    const search = menu.querySelector('.search')
    const field = search && search.getBoundingClientRect().left + parseFloat(getComputedStyle(search).paddingInlineStart)
    const items = [...menu.querySelectorAll('.item')].filter(i => i.getBoundingClientRect().height)
    const choice = !!menu.querySelector('[role="option"], [role="menuitemradio"]')
    for (const row of items) {
      const r = row.getBoundingClientRect(), what = (row.textContent ?? '').trim().slice(0, 20)
      // (its words where they are drawn, a range over the label's text, not the label's box, which the row may stretch or pad)
      const words = row.firstElementChild ? (r => (r.selectNodeContents(row.firstElementChild), r.getBoundingClientRect()))(document.createRange()) : null
      if (!words || !near(words.left - r.left, inset)) off.push(`${what}: its words ${words ? (words.left - r.left).toFixed(1) : '?'} px from the row's start, not ${inset}`)
      if (words) starts.add(Math.round((words.left - m.left) * 2) / 2)
      if (field !== null && words && !near(words.left, field)) off.push(`${what}: its words ${(words.left - field).toFixed(1)} px off the search field's`)
      const check = row.querySelector(':scope > svg.check')
      if (!choice) {
        if (check) off.push(`${what}: a check in a menu of plain items`)
        continue
      }
      if (!check || row.lastElementChild !== check) { off.push(`${what}: the check is not the row's last part`); continue }
      const c = check.getBoundingClientRect()
      if (!near(c.width, 14)) off.push(`${what}: the check's slot ${c.width.toFixed(1)} px wide, not 14`)
      if (!near(r.right - c.right, inset)) off.push(`${what}: the check ${(r.right - c.right).toFixed(1)} px from the row's end, not ${inset}`)
      ends.add(Math.round((m.right - c.right) * 2) / 2)
      for (const part of row.children) {
        if (part === check || !part.getBoundingClientRect().width) continue
        const gap = c.left - part.getBoundingClientRect().right
        if (gap < 7.5) off.push(`${what}: its ${part.getAttribute('class') ?? part.tagName} ${gap.toFixed(1)} px before the check, under 8`)
      }
    }
    if ([...starts].some(e => e !== edge)) off.push(`the rows' words at ${[...starts].join(', ')} px from the menu's start, not ${edge}`)
    if ([...ends].some(e => e !== edge)) off.push(`the checks at ${[...ends].join(', ')} px from the menu's end, not ${edge}`)
    return { off, rows: items.length }
  }, { pop, inset, edge })
  if (!rows) throw new Error(`menuRows: no row drawn in ${pop}`)
  return off
}

