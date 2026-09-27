// Helpers for driving the rebuilt settings page (2026-09-10). Everything on it takes effect as it
// changes — there is no save button — so these helpers click and return; a caller that needs the
// page under test to see the change reloads that page or waits for its own signal.
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * The sidebar's sections (the redesign's design, §6.1), and the names the suites used before it: the services and the
 * prompts are the translation section's now
 */
export const SECTIONS = { translate: '翻译', appearance: '外观', reading: '阅读', data: '数据', services: '翻译', prompts: '翻译' }

export async function openOptions(context, extId) {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extId}/options.html`)
  await options.getByRole('button', { name: SECTIONS.translate, exact: true }).waitFor({ timeout: 10_000 })
  return options
}

export async function openSection(options, section) {
  await options.getByRole('button', { name: SECTIONS[section], exact: true }).click()
  await sleep(150)
}

/**
 * Click a radio and wait for it to stay checked. The controls are driven by the stored config, and
 * the write is a round trip through storage, so React repaints the old value once before the new
 * one arrives — `check()` sees that as "clicking did not change its state".
 */
export async function pick(locator) {
  for (let i = 0; i < 20; i++) {
    if (await locator.isChecked()) return
    await locator.click()
    await sleep(150)
  }
  throw new Error('radio never stayed checked')
}

/** The three built-in services are cards with a radio each; the name is the accessible name */
export async function chooseBuiltIn(options, name) {
  await openSection(options, 'services')
  await pick(options.getByRole('radio', { name, exact: true }))
}

/**
 * Add one of the reader's services in place (the redesign's design, §6.3). It is added only once it connects, so this
 * returns what the page said: the new row's connected status, or the form's failure line, the form then cancelled
 */
export async function addService(options, { name, baseURL, model, apiKey = '' }) {
  await openSection(options, 'translate')
  await options.getByRole('button', { name: '添加服务…', exact: true }).click()
  const form = options.locator('form[data-form="service"]')
  await form.waitFor({ timeout: 5_000 })
  // getByLabel also matches the address chips' fieldset, labelled the same; the textbox role is the field alone
  await form.getByRole('textbox', { name: '接口地址', exact: true }).fill(baseURL)
  if (apiKey) await form.getByLabel('API Key').fill(apiKey)
  const field = form.getByRole('combobox')
  await field.fill(model)
  await field.press('Escape')
  if (name) await form.getByLabel('名称（选填）').fill(name)
  await form.getByRole('button', { name: '连接', exact: true }).click()
  // the request's own budget: the form closes on a success, and says why beside the button on a failure
  for (let i = 0; i < 90; i++) {
    if (await form.count() === 0) break
    if (/连接失败/.test((await form.locator('.o-note').textContent().catch(() => '')) ?? '')) break
    // the form's own check refused it (a remote address without a key): it says so at the field, not beside the button
    if (await form.locator('[aria-invalid="true"]').count()) break
    await sleep(500)
  }
  if (await form.count() > 0) {
    const failed = (await form.locator('.o-note').textContent()) ?? ''
    await form.getByRole('button', { name: '取消', exact: true }).click()
    await sleep(300)
    return failed
  }
  return (await options.locator('[data-srow]', { hasText: name || model }).locator('.o-status').textContent().catch(() => '')) ?? ''
}

/**
 * Edit one of the reader's services, let its saved key go (the Clear button under the key field), connect again. A remote endpoint cannot be asked
 * without a key, so the form says one is needed and nothing is saved: the stored key is neither written back nor lost
 * (the defect this guards: a form that reads the key it opened with writes it back). Returns the form's words
 */
export async function clearKeyAndReconnect(options, name = 'bogus key') {
  await openSection(options, 'translate')
  const row = options.locator('[data-srow]', { has: options.getByRole('radio', { name, exact: true }) })
  await row.hover()
  await row.getByRole('button', { name: `「${name}」的更多操作`, exact: true }).click()
  await options.getByRole('menuitem', { name: '编辑…', exact: true }).click()
  const form = options.locator('form[data-form="service"]')
  await form.waitFor({ timeout: 5_000 })
  // named for a screen reader with the field it clears (ServiceForm.tsx): its accessible name carries the field's label too
  await form.getByRole('button', { name: '清除 API Key', exact: true }).click()
  await form.getByRole('button', { name: '连接', exact: true }).click()
  await sleep(300)
  const said = ((await form.innerText()) ?? '').replace(/\n+/g, ' ')
  await form.getByRole('button', { name: '取消', exact: true }).click()
  await sleep(300)
  return said
}

/**
 * A service written into the stored configuration through the extension's worker: one the settings page would not
 * add, since it does not connect (§6.3) — a suite testing what the chain does with a refused or a silent endpoint
 * seeds it, as an earlier version would have left it. The id must be `svc-` and eight of [a-z0-9]
 */
export async function seedService(worker, service, { choose = true } = {}) {
  const full = { kind: 'openai-compat', thinking: 'disabled', apiKey: '', ...service }
  await worker.evaluate(async ({ full, choose }) => {
    const { config } = await chrome.storage.local.get('config')
    await chrome.storage.local.set({ config: { ...config, services: [...config.services.filter(s => s.id !== full.id), full], ...(choose ? { provider: full.id } : {}) } })
  }, { full, choose })
  await sleep(300)
  return full.id
}

/** Where each switch lives since the redesign (its design, §6): a switch not in the section on screen is looked for there */
const SWITCH_SECTIONS = {
  '图片翻译': 'reading', '显示悬浮按钮': 'reading', '在 arXiv 的 PDF 上使用对照阅读器': 'reading', '同步滚动': 'reading',
  '对照高亮': 'appearance', '深色时调暗 PDF 页面': 'appearance', '出问题时自动改用免费服务': 'translate',
}

/** A switch by its accessible name, in its section */
export async function setSwitch(options, name, on) {
  const control = options.getByRole('switch', { name, exact: true })
  if (!(await control.isVisible().catch(() => false)) && SWITCH_SECTIONS[name]) await openSection(options, SWITCH_SECTIONS[name])
  for (let i = 0; i < 20; i++) {
    if (await control.getAttribute('aria-checked') === String(on)) return
    await control.click()
    await sleep(150)
  }
  throw new Error(`switch ${name} never became ${on}`)
}

/** Choose a translation style by its name: a radio row of the appearance section's styles (the redesign's design, §6.4) */
export async function chooseStyle(options, name) {
  await openSection(options, 'appearance')
  await pick(options.getByRole('radio', { name, exact: true }))
  await sleep(200)
}

/** The target language lives behind the searchable menu of the services section */
export async function chooseLanguage(options, search, name) {
  await openSection(options, 'services')
  // by its place: its label is also a variable's, which the prompts row's description reads (O.prompts.tokens)
  await options.locator('[data-row="translate/language"]').click()
  await options.getByPlaceholder('搜索语言').fill(search)
  await options.getByRole('option', { name: new RegExp(name) }).first().click()
  await sleep(200)
}

/** The way to translate is a named choice of a segmented control (as you read / whole paper), not a number */
export async function setPreload(options, { range }) {
  await openSection(options, 'reading')
  if (range) await options.getByRole('radio', { name: range, exact: true }).click()
  await sleep(150)
}

/**
 * Switch the interface's language and wait for the page it reloads (UI.md §6). `name` is the
 * language's own name, which is how the menu lists it
 */
export async function chooseUiLanguage(options, label, name) {
  await options.getByRole('button', { name: new RegExp(label) }).click()
  await sleep(200)
  await options.getByRole('option', { name, exact: true }).click()
  await options.waitForLoadState('domcontentloaded')
  await sleep(600)
}
