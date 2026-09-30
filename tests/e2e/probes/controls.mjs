// The shared controls in a real browser (the redesign's Part 3): the controls sheet (src/entrypoints/controls, a dev
// page) in both interface languages, light and dark side by side. Each specimen is shot at rest per language and theme
// into experiments/pdf-bilingual/out/controls/ (at twice the pixels: the 200 % look), every row's items are held to the
// row's centre line (align.mjs), and each control is measured against the values the prototypes agreed. The popup's and
// the settings page's own documents are checked for the pointer's and the keyboard's turns. Exits 1 on a failure or a
// page error. The sheet is in development builds only (wxt.config.ts DEV_PAGES):
//   pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { edges, offCentre, shootEach } from './align.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/controls', import.meta.url))
const PROFILE = `${E2E}.profile-controls`
const SHEET = join(EXT, 'controls.html')
// a dev server's build loads its scripts from localhost, and is no use without the server
if (!existsSync(SHEET) || readFileSync(SHEET, 'utf8').includes('localhost')) throw new Error('no controls sheet: pnpm exec wxt build --mode development first')
rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const THEMES = ['light', 'dark']
let failed = 0
const check = (what, ok, detail = '') => {
  console.log(ok ? `ok   ${what}` : `FAIL ${what} — ${detail}`)
  if (!ok) failed++
}
const near = (a, b, tolerance = 0.5) => typeof a === 'number' && Math.abs(a - b) <= tolerance

/** what the first element matching `selector` draws (or its `pseudo`): its box and the styles the checks read; null when there is none */
const look = (page, selector, pseudo) => page.evaluate(([selector, pseudo]) => {
  const el = document.querySelector(selector)
  if (!el) return null
  const c = getComputedStyle(el, pseudo), r = el.getBoundingClientRect()
  return {
    tag: el.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
    radius: c.borderTopLeftRadius, pad: c.paddingInlineStart, padBlock: c.paddingTop, size: c.fontSize, lineHeight: c.lineHeight, weight: c.fontWeight,
    bg: c.backgroundColor, color: c.color, shadow: c.boxShadow, scale: c.scale, opacity: c.opacity, visibility: c.visibility, align: c.textAlign, animation: c.animationName,
    ring: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineOffset}`, ringColor: c.outlineColor,
  }
}, [selector, pseudo ?? null])

/** `value` as a half's tokens resolve it for `property` (a probe element in the half, read and removed): what a check compares with */
const token = (page, theme, property, value) => page.evaluate(([theme, property, value]) => {
  const probe = document.createElement('i')
  probe.style.setProperty(property, value)
  document.querySelector(`[data-theme="${theme}"]`).append(probe)
  const out = getComputedStyle(probe).getPropertyValue(property)
  probe.remove()
  return out
}, [theme, property, value])

/** Task 15: the pages' base — ink on the chrome in the extension's font, the keyboard's ring and not the pointer's */
async function base(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"]`, tag = `${lang} ${theme}`
    const half = await look(page, at)
    const want = { bg: await token(page, theme, 'background-color', 'var(--chrome)'), color: await token(page, theme, 'color', 'var(--ink)') }
    check(`${tag}: ink on the chrome, 13 / 1.4`, half?.bg === want.bg && half.color === want.color && half.size === '13px' && half.lineHeight === '18.2px', JSON.stringify({ half, want }))
    const focus = await token(page, theme, 'outline-color', 'var(--focus)')
    // the keyboard from the specimen's heading: the link, then the field; then the pointer on the field
    await page.click(`${at} [data-specimen="base"] > h2`)
    await page.keyboard.press('Tab')
    const link = await look(page, ':focus')
    await page.keyboard.press('Tab')
    const field = await look(page, ':focus')
    await page.click(`${at} [data-specimen="base"] input`)
    const pressed = await look(page, ':focus')
    check(`${tag}: the keyboard's ring, 2 px of the focus ink 2 px off, hugging a field; none for the pointer's field`,
      link?.tag === 'A' && link.ring === 'solid 2px 2px' && link.ringColor === focus && field?.tag === 'INPUT' && field.ring === 'solid 2px 0px' && pressed?.ring.startsWith('none'),
      JSON.stringify({ link, field, pressed }))
  }
}

/** Task 16: buttons and shortcut labels (Part 3's interfaces; round 6, round 4, settings-2) */
async function buttons(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="buttons"]`, tag = `${lang} ${theme}`
    for (const [selector, height, radius, pad, size, weight] of [
      ['.btn.brand.lg', 36, '9px', '0px', '13px', '500'],
      ['.btn.brand.md', 32, '8px', '16px', '13px', '500'],
      ['.btn.text.md', 32, '7px', '10px', '13px', '400'],
      ['.btn.neutral.sm', 28, '7px', '12px', '12.5px', '500'],
      ['.btn.text.sm', 28, '7px', '10px', '12.5px', '400'],
      ['.btn.raised', 26, '7px', '10px', '12.5px', '500'],
    ]) {
      const m = await look(page, `${at} ${selector}:not([aria-disabled])`)
      check(`${tag}: ${selector} ${height} px, radius ${radius}, ${pad} in, ${size} / ${weight}`, near(m?.height, height) && m.radius === radius && m.pad === pad && m.size === size && m.weight === weight, JSON.stringify(m))
    }
    for (const [selector, ground, words] of [
      ['.btn.brand.lg:not([aria-disabled])', 'var(--brand)', 'var(--on-brand)'],
      ['.btn.neutral.lg', 'var(--fill)', 'var(--ink)'],
      ['.btn.neutral.sm:not([aria-disabled])', 'var(--button)', 'var(--ink)'],
      ['.btn.raised', 'var(--button-raised)', 'var(--ink)'],
      ['.btn.brand[aria-disabled="true"]', 'var(--fill)', 'var(--ink-3)'],
      ['.btn.neutral.sm[aria-disabled="true"]', 'var(--button)', 'var(--ink-3)'],
      ['.btn.brand .kbd', 'var(--brand-chip)', 'var(--on-brand)'],
      ['.btn.neutral .kbd', 'color-mix(in oklab, var(--ink) 9%, transparent)', 'var(--ink)'],
      ['[data-row] > .kbd', 'color-mix(in oklab, var(--ink) 9%, transparent)', 'var(--ink-2)'],
      ['.btn[aria-busy="true"]', 'var(--brand)', 'var(--on-brand)'],
    ]) {
      const m = await look(page, `${at} ${selector}`)
      const want = { bg: await token(page, theme, 'background-color', ground), color: await token(page, theme, 'color', words) }
      check(`${tag}: ${selector} on ${ground}, in ${words}`, m?.bg === want.bg && m.color === want.color, JSON.stringify({ m, want }))
    }
    const raised = await look(page, `${at} .btn.raised`)
    check(`${tag}: a note's button raised by the raised shadow`, raised?.shadow === await token(page, theme, 'box-shadow', 'var(--raised-shadow)'), raised?.shadow)
    const kbd = await look(page, `${at} .btn.brand .kbd`)
    check(`${tag}: the shortcut label 11 px / 500, 3 by 5 in, radius 5`, kbd?.size === '11px' && kbd.weight === '500' && kbd.padBlock === '3px' && kbd.pad === '5px' && kbd.radius === '5px', JSON.stringify(kbd))
    const gaps = await page.evaluate(at => {
      const icon = document.querySelector(`${at} .btn.lg svg`), words = icon.nextElementSibling
      const label = document.querySelector(`${at} .btn.brand.lg .kbd`), before = label.previousElementSibling
      return { icon: words.getBoundingClientRect().left - icon.getBoundingClientRect().right, kbd: label.getBoundingClientRect().left - before.getBoundingClientRect().right, disabledKbd: document.querySelectorAll(`${at} .btn[aria-disabled="true"] .kbd`).length, neutralKbd: document.querySelectorAll(`${at} .btn.neutral .kbd`).length }
    }, at)
    check(`${tag}: an icon 7 px before its words, the shortcut 8 px after them, on a neutral one where it is given, none on a disabled one`, near(gaps.icon, 7) && near(gaps.kbd, 8) && gaps.disabledKbd === 0 && gaps.neutralKbd === 1, JSON.stringify(gaps))
    const busy = await page.evaluate(at => { const b = document.querySelector(`${at} .btn[aria-busy="true"]`), first = b.firstElementChild; return { spin: first.getAttribute('class'), turning: getComputedStyle(first).animationName, words: !!b.querySelector('span')?.textContent, kbd: b.querySelectorAll('.kbd').length } }, at)
    check(`${tag}: a busy button keeps its look and words, a loader turning in its icon's place`, busy.spin === 'spin' && busy.turning === 'turn' && busy.words && busy.kbd === 0, JSON.stringify(busy))
    const inside = await offCentre(page, { rows: `${at} .btn` })
    check(`${tag}: a button's icon, words and shortcut on its centre line`, inside.length === 0, JSON.stringify(inside))
    // the English words at the popup's width: nothing runs over its button (Review Focus)
    const over = await page.evaluate(at => [...document.querySelectorAll(`${at} .popup-width .btn`)].map(b => b.scrollWidth - b.clientWidth), at)
    check(`${tag}: the primary, the pair and the entries hold their words at the popup's width`, over.every(d => d <= 0), JSON.stringify(over))
    // the press: 0.96 while held, a disabled one not at all (§8); a text button lit on hover
    const press = async selector => {
      await page.hover(`${at} ${selector}`)
      await page.mouse.down()
      await page.waitForTimeout(200)
      const scale = (await look(page, `${at} ${selector}`))?.scale
      await page.mouse.up()
      return scale
    }
    const pressed = [await press('.btn.brand.md'), await press('.btn.brand[aria-disabled="true"]'), await press('.btn[aria-busy="true"]')]
    check(`${tag}: a press scales a button to 0.96, and not a disabled or a busy one`, pressed[0] === '0.96' && pressed[1] === 'none' && pressed[2] === 'none', JSON.stringify(pressed))
    await page.hover(`${at} .btn.text.md`)
    await page.waitForTimeout(200)
    const lit = await look(page, `${at} .btn.text.md`)
    check(`${tag}: a text button lit on hover, the fill behind ink`, lit?.bg === await token(page, theme, 'background-color', 'var(--fill)') && lit.color === await token(page, theme, 'color', 'var(--ink)'), JSON.stringify(lit))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const still = await press('.btn.brand.md')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(`${tag}: no press under reduced motion`, still === 'none', still)
  }
}

/** Task 17: fields, radios and a reveal — the settings page's form pieces (settings-2) */
async function forms(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="forms"]`, tag = `${lang} ${theme}`
    const first = `${at} .field:first-child .input`
    const field = await look(page, first), label = await look(page, `${at} .field:first-child > label`), placeholder = await look(page, first, '::placeholder')
    const want = { ground: await token(page, theme, 'background-color', 'var(--field)'), edge: await token(page, theme, 'box-shadow', 'inset 0 0 0 0.5px var(--field-edge)'), ink2: await token(page, theme, 'color', 'var(--ink-2)') }
    check(`${tag}: a field 34 px, radius 8, on its ground with its 0.5 px edge; placeholder and label in ink-2, the label 12 px and 6 px above`,
      near(field?.height, 34) && field.radius === '8px' && field.bg === want.ground && field.shadow === want.edge && placeholder?.color === want.ink2 && label?.color === want.ink2 && label.size === '12px' && near(field.top - label.bottom, 6),
      JSON.stringify({ field, label, placeholder, want }))
    // the pointer's focus shows the field's edge, the keyboard's the ring hugging it (the edge moves in 150 ms: read it after)
    await page.click(first)
    await page.waitForTimeout(200)
    const pressed = await look(page, first)
    await page.click(`${at} > h2`)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    const keyed = await look(page, first)
    const edge = await token(page, theme, 'box-shadow', 'inset 0 0 0 1px var(--ink-3)'), focus = await token(page, theme, 'outline-color', 'var(--focus)')
    check(`${tag}: a field pressed shows its 1 px ink-3 edge and no ring; reached by Tab, the 2 px ring hugging it`, pressed?.shadow === edge && pressed.ring.startsWith('none') && keyed?.ring === 'solid 2px 0px' && keyed.ringColor === focus, JSON.stringify({ pressed, keyed }))
    // a field at fault
    const fault = await page.evaluate(at => {
      const input = document.querySelector(`${at} .input[aria-invalid="true"]`)
      const reason = document.getElementById(input.getAttribute('aria-describedby').split(' ')[0])
      const icon = reason.querySelector('svg'), p = reason.getBoundingClientRect(), i = icon.getBoundingClientRect()
      const line = Number.parseFloat(getComputedStyle(reason).lineHeight)
      return { edge: getComputedStyle(input).boxShadow, ink: getComputedStyle(reason).color, size: getComputedStyle(reason).fontSize, icon: getComputedStyle(icon).color, off: i.top + i.height / 2 - (p.top + line / 2) }
    }, at)
    const danger = { edge: await token(page, theme, 'box-shadow', 'inset 0 0 0 1px var(--danger)'), icon: await token(page, theme, 'color', 'var(--danger)'), ink: await token(page, theme, 'color', 'var(--ink)') }
    check(`${tag}: a field at fault: the danger's edge, its reason under it in ink, 12 px, after a danger icon centred on the first line`, fault.edge === danger.edge && fault.ink === danger.ink && fault.size === '12px' && fault.icon === danger.icon && near(fault.off, 0), JSON.stringify({ fault, danger }))
    // radios
    const marks = () => page.evaluate(at => [...document.querySelectorAll(`${at} [role="radio"]`)].map(r => {
      const m = r.querySelector('.radio'), b = m.getBoundingClientRect()
      return { checked: r.getAttribute('aria-checked'), focused: document.activeElement === r, width: b.width, height: b.height, ring: getComputedStyle(m).boxShadow, dot: getComputedStyle(m, '::after').scale }
    }), at)
    const rings = { on: await token(page, theme, 'box-shadow', 'inset 0 0 0 1.5px var(--ink)'), off: await token(page, theme, 'box-shadow', 'inset 0 0 0 1.5px var(--ink-3)') }
    const rest = await marks()
    check(`${tag}: radios 16 px, the chosen one's ring ink and its dot grown, the others' ink-3`, rest.every(m => near(m.width, 16) && near(m.height, 16) && (m.checked === 'true' ? m.ring === rings.on && m.dot === '1' : m.ring === rings.off && m.dot === '0')), JSON.stringify(rest))
    await page.click(`${at} [role="radio"][aria-checked="true"]`)
    await page.keyboard.press('ArrowDown')
    const once = await marks()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    const twice = await marks()
    check(`${tag}: the arrows move the choice, past the service that cannot be had, the focus going with it`, once[1].checked === 'true' && once[1].focused && twice[0].checked === 'true' && twice[0].focused && twice[0].dot === '1', JSON.stringify({ once, twice }))
    const lead = await edges(page, { items: `${at} .card-demo .radio, ${at} .card-demo .words`, frame: '.card-demo' })
    check(`${tag}: the radios on the controls' edge, 14 px from the card, their words on the words' edge, 42`, JSON.stringify(lead) === '[14,42]', JSON.stringify(lead))
    // the reveal: from nothing to its height in its time, and back; inert while closed; a fade alone under reduced motion
    const toggle = `${at} [aria-controls]`
    const state = () => page.evaluate(sel => { const r = document.querySelector(sel); return { height: r.getBoundingClientRect().height, inert: r.firstElementChild.inert, opacity: getComputedStyle(r).opacity } }, `${at} .reveal`)
    const closed = await state()
    await page.click(toggle)
    await page.waitForTimeout(60)
    const opening = await state()
    await page.waitForTimeout(300)
    const open = await state()
    // the click that opened it leaves the pointer on the toggle, showing its hover fill in the shot (Task 17, parked): move away first
    await page.mouse.move(0, 0)
    await page.locator(at).screenshot({ path: join(OUT, `${lang}-${theme}-forms-open.png`), animations: 'disabled', caret: 'hide' })
    await page.click(toggle)
    await page.waitForTimeout(300)
    const shut = await state()
    check(`${tag}: a reveal grows from nothing to its height and back, inert while closed (§8, §9)`, near(closed.height, 0) && closed.inert && opening.height > 0.5 && opening.height < open.height - 0.5 && !open.inert && open.opacity === '1' && near(shut.height, 0) && shut.inert, JSON.stringify({ closed, opening, open, shut }))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.click(toggle)
    await page.waitForTimeout(30)
    const quick = await state()
    await page.click(toggle)
    await page.waitForTimeout(250)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(`${tag}: under reduced motion a reveal takes its height at once, and only fades`, near(quick.height, open.height) && Number(quick.opacity) < 1, JSON.stringify(quick))
  }
}

/** Task 18: segmented controls — equal ones slide by translate, fit ones follow their chosen segment by anchoring (§8) */
async function segmented(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="segmented"]`, tag = `${lang} ${theme}`
    const seg = kind => `${at} [data-seg="${kind}"] .seg`
    /** a control's thumb against its chosen segment: the offsets of its start and its width, and where it is */
    const onChosen = kind => page.evaluate(sel => {
      const s = document.querySelector(sel), t = s.querySelector('.thumb').getBoundingClientRect(), c = s.querySelector('[aria-checked="true"]').getBoundingClientRect()
      return { start: t.left - c.left, width: t.width - c.width, left: t.left }
    }, seg(kind))
    const heights = [(await look(page, seg('equal')))?.height, (await look(page, seg('small')))?.height, (await look(page, seg('fit')))?.height]
    check(`${tag}: 30 px, 26 small, 30 fit`, near(heights[0], 30) && near(heights[1], 26) && near(heights[2], 30), JSON.stringify(heights))
    const icons = await page.evaluate(sel => [...document.querySelectorAll(`${sel} > button`)].map(b => b.getBoundingClientRect().width), seg('icons'))
    check(`${tag}: segments of icons 36 px each`, icons.every(w => near(w, 36)), JSON.stringify(icons))
    for (const kind of ['equal', 'small', 'icons', 'fit', 'fit-disabled']) {
      const o = await onChosen(kind)
      check(`${tag}: ${kind}: the thumb on the chosen segment`, near(o.start, 0) && near(o.width, 0), JSON.stringify(o))
    }
    const inside = await offCentre(page, { rows: `${at} .seg > button` })
    check(`${tag}: a segment's icon and words on its centre line`, inside.length === 0, JSON.stringify(inside))
    // fit: the segments as wide as their words, and the words fit at the popup's width, in English too (Review Focus)
    const fit = await page.evaluate(sel => {
      const s = document.querySelector(sel), buttons = [...s.querySelectorAll(':scope > button')]
      return { widths: buttons.map(b => Math.round(b.getBoundingClientRect().width)), over: [s, ...buttons].map(e => e.scrollWidth - e.clientWidth) }
    }, seg('fit'))
    check(`${tag}: fit segments as wide as their words, none running over at the popup's width`, new Set(fit.widths).size > 1 && fit.over.every(d => d <= 0), JSON.stringify(fit))
    // the slide: 60 ms after a choice the thumb is on its way, 300 ms after on the new segment
    const from = (await onChosen('fit')).left
    await page.click(`${seg('fit')} > button:last-of-type`)
    await page.waitForTimeout(60)
    const mid = await page.evaluate(sel => document.querySelector(`${sel} .thumb`).getBoundingClientRect().left, seg('fit'))
    await page.waitForTimeout(300)
    const to = await onChosen('fit')
    check(`${tag}: fit: the thumb slides to the chosen segment`, mid > from + 1 && mid < to.left - 1 && near(to.start, 0) && near(to.width, 0), JSON.stringify({ from, mid, to }))
    // the arrows move the choice past the segment that cannot be had, the focus going with it
    await page.focus(`${seg('fit-disabled')} > button[aria-checked="true"]`)
    await page.keyboard.press('ArrowLeft')
    const moved = await page.evaluate(sel => { const b = [...document.querySelectorAll(`${sel} > button`)]; return { checked: b.findIndex(x => x.getAttribute('aria-checked') === 'true'), focused: b.indexOf(document.activeElement) } }, seg('fit-disabled'))
    check(`${tag}: the arrows pass over the disabled segment, the focus going with the choice`, moved.checked === 0 && moved.focused === 0, JSON.stringify(moved))
    // a disabled segment: greyed, never chosen, and its reason in its tooltip and to a screen reader
    const disabled = `${seg('fit-disabled')} > button[aria-disabled="true"]`
    await page.click(disabled, { force: true })
    // the pointer leaves and comes back: a tooltip waits for the pointer's arrival, which the press did not make
    await page.mouse.move(0, 0)
    await page.hover(disabled)
    await page.waitForTimeout(650)
    const why = await page.evaluate(sel => { const b = document.querySelector(sel); return { checked: b.getAttribute('aria-checked'), opacity: getComputedStyle(b).opacity, reason: document.getElementById(b.getAttribute('aria-describedby'))?.textContent, tip: document.querySelector('.tip:popover-open')?.textContent } }, disabled)
    check(`${tag}: a disabled segment greyed and not chosen, its reason in its tooltip and its description`, why.checked === 'false' && why.opacity === '0.55' && !!why.reason && why.tip === why.reason, JSON.stringify(why))
    await page.mouse.move(0, 0)
    // under reduced motion the thumb goes at once
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.click(`${seg('fit')} > button:first-of-type`)
    await page.waitForTimeout(40)
    const quick = await onChosen('fit')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(`${tag}: fit, under reduced motion: the thumb goes at once`, near(quick.start, 0) && near(quick.width, 0), JSON.stringify(quick))
  }
}

/** Task 19: the menus' rows — two lines, a button in a row, a sample in a style, the way to manage the list (round 4) */
async function menus(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="menus"]`, tag = `${lang} ${theme}`, pop = `${at} .pop:popover-open`
    const ink2 = await token(page, theme, 'color', 'var(--ink-2)'), button = await token(page, theme, 'background-color', 'var(--button)')
    // the services, on two lines
    await page.click(`${at} [data-menu="services"]`)
    await page.waitForSelector(pop)
    // the menu grows in over 150 ms (pop-in): measured and shot at rest
    await page.waitForTimeout(250)
    const rows = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .item`)].map(i => {
      const style = s => i.querySelector(s) && getComputedStyle(i.querySelector(s))
      const act = i.querySelector('.act')
      return {
        cls: i.className, height: i.getBoundingClientRect().height, color: getComputedStyle(i).color, selected: i.getAttribute('aria-selected'),
        sub: style('.sub') && [style('.sub').fontSize, style('.sub').color], check: style('.check')?.visibility, spin: style('svg.spin')?.animationName ?? null,
        act: act && [act.getBoundingClientRect().height, style('.act').paddingInlineStart, style('.act').borderTopLeftRadius, style('.act').fontSize, style('.act').fontWeight, style('.act').backgroundColor],
        separated: !!i.previousElementSibling?.matches('hr.sep'),
      }
    }), pop)
    // a row disabled but with an action (the pack's download) carries `unavailable` beside `two` (finding 2): still
    // a two-line row, just greyed differently
    const two = rows.filter(r => r.cls === 'item two' || r.cls === 'item two unavailable')
    check(`${tag}: the services on two lines, each at least 40 px, the hint 11.5 px in ink-2`, two.length === 4 && two.every(r => r.height >= 39.5 && r.sub?.[0] === '11.5px' && r.sub?.[1] === ink2), JSON.stringify(two))
    const act = rows.find(r => r.act)?.act
    check(`${tag}: the pack's download, a neutral button in its row: 24 px, 9 in, radius 6, 12 px / 500`, !!act && near(act[0], 24) && act[1] === '9px' && act[2] === '6px' && act[3] === '12px' && act[4] === '500' && act[5] === button, JSON.stringify(act))
    check(`${tag}: a download under way turns a loader instead`, rows.some(r => r.spin === 'turn'), JSON.stringify(rows.map(r => r.spin)))
    const manage = rows.at(-1)
    check(`${tag}: the last row manages the list: after a separator, in ink-2, never chosen`, manage?.cls === 'item manage' && manage.separated && manage.color === ink2 && manage.selected === 'false' && manage.check === 'hidden', JSON.stringify(manage))
    const off = await offCentre(page, { rows: `${pop} .item` })
    check(`${tag}: each menu row's parts on its centre line`, off.length === 0, JSON.stringify(off))
    await page.locator(pop).screenshot({ path: join(OUT, `${lang}-${theme}-menu-services.png`), animations: 'disabled', caret: 'hide' })
    // the keys reach the pack's row though it cannot be chosen, its button on the lift there; Enter runs its action,
    // and on the busy one nothing
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    const lifted = await look(page, `${pop} .item[data-active] .act`)
    check(`${tag}: the active row's button on the lift's ground (ruling 5)`, lifted?.bg === await token(page, theme, 'background-color', 'var(--lift)'), JSON.stringify(lifted))
    await page.keyboard.press('Enter')
    const ran = await page.textContent(`${at} output`)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    const again = await page.textContent(`${at} output`)
    check(`${tag}: Enter on the pack's row runs its action, and on the busy one does nothing`, ran === 'action:chrome' && again === 'action:chrome', JSON.stringify({ ran, again }))
    await page.keyboard.press('Escape')
    // the styles, each sample at its row's end in its style
    await page.click(`${at} [data-menu="styles"]`)
    await page.waitForSelector(pop)
    // the menu grows in over 150 ms (pop-in): measured and shot at rest
    await page.waitForTimeout(250)
    const samples = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .preview`)].map(p => ({ align: getComputedStyle(p).textAlign, size: getComputedStyle(p).fontSize, hidden: p.getAttribute('aria-hidden'), styled: !!p.getAttribute('style'), lang: p.getAttribute('lang'), end: Math.round(p.closest('.item').getBoundingClientRect().right - p.getBoundingClientRect().right) })), pop)
    check(`${tag}: each style's sample at its row's end, 12.5 px, drawn in its style and its language, hidden from a screen reader`, samples.length > 0 && samples.every(s => s.align === 'end' && s.size === '12.5px' && s.hidden === 'true' && s.styled && s.lang === 'zh-CN' && s.end === 10), JSON.stringify(samples))
    await page.locator(pop).screenshot({ path: join(OUT, `${lang}-${theme}-menu-styles.png`), animations: 'disabled', caret: 'hide' })
    await page.keyboard.press('Escape')
    // the languages: the reader's rows, and the search
    await page.click(`${at} [data-menu="languages"]`)
    await page.waitForSelector(pop)
    // the menu grows in over 150 ms (pop-in): measured and shot at rest
    await page.waitForTimeout(250)
    const heights = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .item`)].map(i => i.getBoundingClientRect().height), pop)
    const langs = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .item`)].map(i => i.querySelector('[lang]')?.getAttribute('lang') ?? null), pop)
    await page.keyboard.type('deu')
    const found = await page.evaluate(pop => document.querySelectorAll(`${pop} .item`).length, pop)
    check(`${tag}: the language menu keeps the reader's 30 px rows, each name marked as its language, and its search narrows them`, heights.length === 9 && heights.every(h => near(h, 30)) && langs.every(l => !!l) && found === 1, JSON.stringify({ heights, langs, found }))
    await page.keyboard.press('Escape')
  }
}

// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----
const CHECKS = [base, buttons, forms, segmented, menus]

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  // tall enough for the whole sheet and its menus: a popover past the window's foot is cut short in its shot
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host

// the popup's and the settings page's documents mark the pointer's turn and the keyboard's from their first paint
for (const path of ['popup.html', 'options.html']) {
  const page = await context.newPage()
  page.on('pageerror', e => check(`${path}: no page error`, false, e.message))
  await page.goto(`chrome-extension://${id}/${path}`)
  await page.waitForTimeout(800)
  await page.mouse.click(4, 4)
  const pointer = await page.evaluate(() => document.documentElement.hasAttribute('data-axt-pointer'))
  await page.keyboard.press('Tab')
  const keyboard = await page.evaluate(() => !document.documentElement.hasAttribute('data-axt-pointer'))
  check(`${path}: a press marks the pointer's turn, Tab the keyboard's (trackModality)`, pointer && keyboard)
  await page.close()
}

for (const lang of ['zh-CN', 'en']) {
  const page = await context.newPage()
  page.on('pageerror', e => check(`${lang}: no page error`, false, e.message))
  await page.goto(`chrome-extension://${id}/controls.html?lang=${lang}`)
  await page.waitForSelector('[data-specimen]')
  await page.waitForTimeout(300)
  // at rest: each specimen shot, every row's items on the row's centre line
  for (const theme of THEMES) await shootEach(page, `[data-theme="${theme}"] [data-specimen]`, OUT, name => `${lang}-${theme}-${name}`, 'specimen')
  const off = await offCentre(page, { rows: '[data-row]' })
  check(`${lang}: every row's items on its centre line, within 0.5 px`, off.length === 0, JSON.stringify(off))
  for (const run of CHECKS) {
    await run(page, lang)
    await page.mouse.move(0, 0)
    await page.evaluate(() => document.activeElement?.blur())
  }
  await page.close()
}
await context.close()
process.exit(failed ? 1 : 0)
