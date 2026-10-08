// lab/pdf/layer-lab/rules-panel.mjs
// The layer lab's rules panel (the rules-as-data plan §7): the layout rule set, edited where its effect is seen. It holds the
// set the quick view draws with (the working set), the set it was loaded or saved as (the base, which "unsaved" is measured
// against) and the worktree's file. For the target shown, every field RULES_FIELDS describes is a row: its name, its value, a
// control by the field's kind, its words, where the value comes from (the script, the language, the set, or an unsaved
// edit), a reset, and, for a script's field, the switch that moves an edit from the language to the whole script. Beside the
// rows: where the set came from and the ways to load another (the worktree's file, a file picked, the published current set,
// a git ref), what differs from the file and from a published set, and the save (a note, then POST /api/rules).
// An edit is checked with the engine's own parseRules before it is taken: a value the schema refuses is not applied, and the
// panel says which field and why. What the model does with an edit is rules-model.mjs's, which the tests hold.
import { diffRules, edit, isEdited, reset, same, sourceOf, fieldValue } from './rules-model.mjs'

const GROUPS = ['fit', 'breaking', 'cells', 'faces', 'labels', 'hyphenation']
const ENVS = ['staging', 'production']
/** a group opens with the fit; the rest are closed until opened */
const OPEN_BY_DEFAULT = new Set(['fit'])
/** how long an edit rests before the quick view is drawn again (a slider's key presses, one drawing) */
const REST_MS = 350
/** the differences a compare lists before "and n more" */
const LISTED = 40
const decimals = step => (String(step).split('.')[1] ?? '').length
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
/** a note as one line of text: each run of white space, controls and bidirectional controls (which a set refuses in a string,
 *  and a textarea lets through as a newline or a tab) becomes one space */
const oneLine = text => text.replace(/[\s\p{Cc}\p{Bidi_Control}]+/gu, ' ').trim()
/** a value on one line, cut at `max` characters */
const flat = (v, max = 72) => {
  const s = v === undefined ? '-' : JSON.stringify(v)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * @param o.root       the element the panel is drawn into
 * @param o.h, o.icon  the page's element and icon builders
 * @param o.t          the page's words (strings.mjs, by key)
 * @param o.R          the engine's rules module (RULES_FIELDS, readRules, parseRules, resolveRules, BUILTIN_RULES, RULES_CAP)
 * @param o.names      a target's own name by tag
 * @param o.catalog    { groups, faces, families }: the face catalog's CJK groups, its faces and the English designs
 * @param o.onChange   told, once an edit has rested or a set was loaded, to draw the quick view again
 */
export function createRulesPanel({ root, h, icon, t, R, names, catalog, onChange }) {
  const S = {
    target: null, script: null,
    /** the worktree's file, as last read or saved: { set, sha256 } */
    file: null,
    /** the set last loaded or saved, which an edit is measured against, and the set the quick view draws with */
    base: null, working: null,
    /** where the set came from: { kind: 'file' | 'picked' | 'ref' | 'staging' | 'production' | 'builtin', label, version, sha256 } */
    from: null,
    /** a published set fetched to compare with: { env, set, version } */
    published: null,
    /** a script's field -> where its edits go ('language' by default) */
    scope: {},
    note: '', msg: null, saved: null, ref: '',
  }
  const open = new Set(OPEN_BY_DEFAULT)
  /** which loaded set the working set is: counted up each time one is loaded, so that an answer that comes late (a save sent
   *  before another set was loaded) can tell whether it still belongs to the set shown */
  let generation = 0
  /** the newest load begun (a file, a picked file, a ref, a published set to load), and the newest published set fetched to compare
   *  with: a load answers only if no later one has begun, so that the slower of two overlapping requests cannot replace the
   *  set the reader chose last, nor say how it went */
  let loading = 0
  let comparing = 0
  let ui = null
  let rest = null
  const fields = R.RULES_FIELDS

  const dirty = () => !!S.working && !same(S.working, S.base)
  const fixed = () => ({ script: S.script, tag: S.target })

  // ---- the set: loading it, editing it, taking edits back
  /** the set the quick view draws with: a copy, which a run may keep */
  const set = () => (S.working ? structuredClone(S.working) : null)
  function tell(now) {
    clearTimeout(rest)
    if (now) onChange(); else rest = setTimeout(onChange, REST_MS)
  }
  /** a message under the loads, with an action beside it where there is one: { label, run } */
  function say(kind, text, action = null) { S.msg = text ? { kind, text, action } : null; showMsg() }
  function adopt(loaded, from) {
    generation++
    S.base = structuredClone(loaded.set)
    S.working = structuredClone(loaded.set)
    S.from = { ...from, version: loaded.set.version, sha256: loaded.sha256 }
    S.saved = null
    S.script = scriptOf(S.target)
    refreshAll()
    tell(true)
  }
  function scriptOf(target) { try { return target ? R.resolveRules(S.working, target).script : null } catch { return null } }
  /** a refusal or a failure, in the panel's words */
  function said(e, what) {
    if (e?.name === 'RulesRefusal') return t('rules.refused', e.field, e.why)
    return t('rules.failed', what, String(e?.message ?? e).slice(0, 200))
  }
  /** the bytes at a URL of the lab's server, read as a reader reads a set; an answer that is not one throws what it said */
  async function fetchSet(url) {
    let r
    try { r = await fetch(url, { cache: 'no-store' }) } catch (e) { throw Object.assign(new Error(String(e?.message ?? e)), { unreachable: true }) }
    if (!r.ok) {
      let why = `${r.status}`
      try { why = (await r.json()).why ?? why } catch {}
      throw Object.assign(new Error(why), { status: r.status })
    }
    const bytes = new Uint8Array(await r.arrayBuffer())
    return { ...(await R.readRules(bytes, { etag: r.headers.get('etag') })), commit: r.headers.get('x-rules-commit') }
  }
  const proceed = () => !dirty() || confirm(t('rules.discardAsk'))

  async function loadFile({ quiet = false } = {}) {
    if (!quiet && !proceed()) return
    const mine = ++loading
    try {
      const loaded = await fetchSet('/api/rules')
      if (mine !== loading) return
      S.file = { set: loaded.set, sha256: loaded.sha256 }
      adopt(loaded, { kind: 'file', label: t('rules.from.file') })
      if (!quiet) say('ok', t('rules.loaded', t('rules.from.file'), loaded.set.version))
    } catch (e) {
      if (mine !== loading) return
      // (no file to read: the engine's built-in set, so that the quick view still draws)
      if (!S.working) { S.file = null; adopt({ set: structuredClone(R.BUILTIN_RULES), sha256: null }, { kind: 'builtin', label: t('rules.from.builtin') }) }
      say('warn', said(e, t('rules.from.file')))
    }
  }
  async function loadPicked(picked) {
    if (!picked || !proceed()) return
    const mine = ++loading
    try {
      if (picked.size > R.RULES_CAP) throw Object.assign(new Error('too large'), { name: 'RulesRefusal', field: 'bytes', why: `${picked.size} bytes, more than ${R.RULES_CAP}` })
      const loaded = await R.readRules(new Uint8Array(await picked.arrayBuffer()))
      if (mine !== loading) return
      adopt(loaded, { kind: 'picked', label: picked.name })
      say('ok', t('rules.loaded', picked.name, loaded.set.version))
    } catch (e) { if (mine === loading) say('warn', said(e, picked.name)) }
  }
  async function loadRef(ref, { quiet = false } = {}) {
    ref = ref.trim()
    if (!ref || (!quiet && !proceed())) return false
    const mine = ++loading
    try {
      const loaded = await fetchSet(`/api/rules?ref=${encodeURIComponent(ref)}`)
      if (mine !== loading) return false
      const label = loaded.commit ? `${ref} (${loaded.commit.slice(0, 8)})` : ref
      adopt(loaded, { kind: 'ref', label, ref })
      say('ok', t('rules.loaded', label, loaded.set.version))
      return true
    } catch (e) {
      if (mine === loading) say('warn', e?.status ? t('rules.refFailed', ref, e.message) : said(e, ref))
      return false
    }
  }
  /** the published current set of an environment, or why it is not there. `live` says whether the request is still the newest
   *  of its kind: a set that comes after it is not is let go, and a failure then is not told */
  async function publishedSet(env, live) {
    try {
      const loaded = await fetchSet(`/api/rules/published?env=${env}`)
      return live() ? loaded : null
    } catch (e) {
      if (!live()) return null
      if (e?.unreachable || e?.status === 404 || e?.status === 502 || e?.status === 504) say('warn', t('rules.unavailable', t(`rules.env.${env}`), e.message))
      else say('warn', said(e, t(`rules.env.${env}`)))
      return null
    }
  }
  async function loadPublished(env) {
    if (!proceed()) return
    const mine = ++loading
    const loaded = await publishedSet(env, () => mine === loading)
    if (!loaded) return
    S.published = { env, set: loaded.set, version: loaded.set.version }
    adopt(loaded, { kind: env, label: t(`rules.env.${env}`) })
    say('ok', t('rules.loaded', t(`rules.env.${env}`), loaded.set.version))
  }
  async function fetchPublished(env) {
    const mine = ++comparing
    const loaded = await publishedSet(env, () => mine === comparing)
    if (!loaded) return
    S.published = { env, set: loaded.set, version: loaded.set.version }
    say('ok', t('rules.fetched', t(`rules.env.${env}`), loaded.set.version))
    refreshAll()
  }

  /** an edit of a field for the target shown, taken if the schema takes it */
  function commit(field, value) {
    const scope = field.scope === 'script' ? (S.scope[field.path] ?? 'language') : 'language'
    const next = edit(S.working, field, S.script, S.target, value, scope)
    // (a language's own value that only repeats its script's, where the base had none, is no override: it is dropped)
    if (scope === 'language' && field.scope === 'script' && same(value, next.scripts[S.script][field.path]) && !Object.hasOwn(S.base.languages[S.target] ?? {}, field.path)) delete next.languages[S.target][field.path]
    try { R.parseRules(next) } catch (e) { say('warn', said(e, field.path)); refreshAll(); return }
    S.working = next
    S.saved = null
    say('', '')
    refreshAll()
    tell(false)
  }
  function undo(field) {
    S.working = reset(S.working, S.base, field, S.script, S.target)
    say('', '')
    refreshAll()
    tell(false)
  }
  function discard() {
    if (!dirty()) return
    S.working = structuredClone(S.base)
    say('', '')
    refreshAll()
    tell(true)
  }

  async function save() {
    const note = oneLine(S.note)
    // the set as it is sent, copied before the answer is waited for: the file then holds this, whatever is edited meanwhile.
    // Its version is the file's as this page last read it (not the loaded set's own, which a ref or a published set has
    // from elsewhere): the server writes it only where the file is still that version
    const sent = { ...structuredClone(S.working), version: S.file.set.version, note }
    const mine = generation
    ui.save.disabled = true
    let r, body
    try {
      r = await fetch('/api/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sent) })
      body = await r.json()
    } catch (e) { say('warn', t('rules.failed', t('rules.save'), String(e?.message ?? e).slice(0, 200))); refreshAll(); return }
    if (!r.ok) {
      // (the file has moved on since this page read it: nothing was written, and nothing is merged; the reader loads the file
      // again, or goes on from the set shown and is refused again)
      if (r.status === 409 && body?.error === 'stale') say('warn', t('rules.stale', sent.version, body.version), { label: t('rules.staleLoad'), run: () => loadFile() })
      else say('warn', body?.field ? t('rules.refused', body.field, body.why) : t('rules.failed', t('rules.save'), body?.why ?? r.status))
      refreshAll()
      return
    }
    // (the file now holds what was sent, whichever set is shown by now)
    const written = { ...sent, version: body.version }
    S.file = { set: structuredClone(written), sha256: body.sha256 }
    if (oneLine(S.note) === note) S.note = ''
    if (generation !== mine) {
      // (another set was loaded while the save was in flight: that set stays as it was loaded, with its own base and where it
      // came from; only what the file is, and so what it is compared with, has changed)
      S.saved = { version: body.version, changed: body.changed }
      refreshAll()
      return
    }
    S.base = structuredClone(written)
    // (an edit made while the save was in flight is not in the file: it stays an unsaved edit, over the version and note now there)
    S.working = { ...S.working, version: body.version, note }
    S.from = { kind: 'file', label: t('rules.from.file'), version: body.version, sha256: body.sha256 }
    S.saved = { version: body.version, changed: body.changed }
    say('', '')
    refreshAll()
  }

  // ---- controls: one by the field's kind. Each is built once and told its value; a change the reader makes is `emit`ted
  let ids = 0
  const switchEl = label => h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': label })
  const setSwitch = (b, on) => b.setAttribute('aria-checked', String(on))

  /** a range with its value beside it. `live` is told the shown value as the thumb moves; `emit` the value once it rests */
  function slider(spec, labelledBy, live, emit) {
    const { min, max, step } = spec
    const dp = decimals(step)
    const input = h('input', { type: 'range', min, max, step, 'aria-labelledby': labelledBy })
    const norm = v => Number(clamp(Number(v), min, max).toFixed(dp))
    const place = (v, base) => {
      input.value = String(v)
      input.style.setProperty('--p', `calc(8px + (100% - 16px) * ${(v - min) / (max - min)})`)
      input.style.setProperty('--d', `calc(8px + (100% - 16px) * ${(clamp(base ?? v, min, max) - min) / (max - min)})`)
      input.setAttribute('aria-valuetext', v.toFixed(dp))
    }
    let base = null
    input.addEventListener('input', () => { const v = norm(input.value); place(v, base); live(v.toFixed(dp)) })
    input.addEventListener('change', () => emit(norm(input.value)))
    return { input, text: v => v.toFixed(dp), set(v, b) { base = b; place(v, b) } }
  }

  /** a number (or an integer): a range, with a switch before it where the field may be empty */
  function numberControl(field, id, live, emit) {
    const s = slider(field, `${id}-n`, live, emit)
    const sw = field.nullable ? switchEl(t('rules.hasValue')) : null
    if (sw) sw.addEventListener('click', () => emit(sw.getAttribute('aria-checked') === 'true' ? null : clamp(0, field.min, field.max)))
    return {
      el: h('div', { class: 'ctl' }, ...(sw ? [sw] : []), s.input),
      text: v => (v === null ? t('rules.empty') : s.text(v)),
      set(v, b) {
        const on = v !== null
        if (sw) setSwitch(sw, on)
        s.input.disabled = !on
        s.set(on ? v : clamp(0, field.min, field.max), b ?? undefined)
      },
    }
  }

  function booleanControl(field, id, live, emit) {
    const sw = switchEl(field.path)
    sw.setAttribute('aria-labelledby', `${id}-n`)
    sw.removeAttribute('aria-label')
    sw.addEventListener('click', () => emit(sw.getAttribute('aria-checked') !== 'true'))
    return { el: h('div', { class: 'ctl' }, sw), text: v => t(v ? 'rules.on' : 'rules.off'), set: v => setSwitch(sw, v) }
  }

  /** a few values, one chosen: a segment of radios */
  function enumControl(field, id, live, emit) {
    const radios = field.values.map(v => h('input', { type: 'radio', name: id, value: String(v) }))
    const group = h('div', { class: 'segment wide', role: 'radiogroup', 'aria-labelledby': `${id}-n` }, ...field.values.map((v, i) => h('label', {}, radios[i], h('span', {}, String(v)))))
    radios.forEach((r, i) => r.addEventListener('change', () => { if (r.checked) emit(field.values[i]) }))
    return { el: h('div', { class: 'ctl' }, group), text: v => String(v), set(v) { radios.forEach((r, i) => { r.checked = field.values[i] === v }) } }
  }

  /** the four knobs in the order they are tried: each chip moves one place earlier */
  function orderControl(field, id, live, emit) {
    const list = h('div', { class: 'chips', role: 'group', 'aria-labelledby': `${id}-n` })
    let order = []
    return {
      el: h('div', { class: 'ctl' }, list),
      text: v => v.join(' › '),
      set(v) {
        order = v
        list.replaceChildren(...v.map((knob, i) => {
          const b = h('button', { class: 'chip', type: 'button', title: t('rules.earlier', knob), 'aria-label': `${i + 1}. ${knob}. ${t('rules.earlier', knob)}` }, ...(i ? [icon('left')] : []), h('span', { class: 'mono' }, knob))
          b.disabled = i === 0
          b.addEventListener('click', () => { const next = order.slice(); [next[i - 1], next[i]] = [next[i], next[i - 1]]; emit(next) })
          return b
        }))
      },
    }
  }

  /** members of a list that stay in the field's order, each in or out */
  function subsetControl(field, id, live, emit, all = field.values) {
    const boxes = all.map(v => h('input', { type: 'checkbox', value: v }))
    const list = h('div', { class: 'chips', role: 'group', 'aria-labelledby': `${id}-n` }, ...all.map((v, i) => h('label', { class: 'chip' }, boxes[i], h('span', { class: 'mono' }, v))))
    boxes.forEach(b => b.addEventListener('change', () => emit(all.filter((_, i) => boxes[i].checked))))
    return { el: h('div', { class: 'ctl' }, list), text: v => (v.length ? v.join(' › ') : t('rules.empty')), set(v) { boxes.forEach((b, i) => { b.checked = v.includes(all[i]) }) } }
  }

  /** a text: committed when the reader leaves the field or presses Enter */
  function textControl(field, id, live, emit, { mono = true, suggest = null, nullable = false } = {}) {
    const input = h('input', { class: `input${mono ? ' mono' : ''}`, type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-labelledby': `${id}-n` })
    const list = suggest ? h('datalist', { id: `${id}-l` }, ...suggest.map(v => h('option', { value: v }))) : null
    if (list) input.setAttribute('list', list.id)
    input.addEventListener('change', () => emit(nullable && input.value === '' ? null : input.value))
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.dispatchEvent(new Event('change')) } })
    return { el: h('div', { class: 'ctl' }, input, ...(list ? [list] : [])), text: v => (v === null ? t('rules.empty') : t('rules.chars', [...v].length)), set(v) { input.value = v ?? '' } }
  }

  /** an object that may be empty (adaptiveFill, cjkFaces, labels): a switch, and its members while it is set. A member is a
   *  number (a range), a text (a field, with the catalog's names to suggest) or a list (a few of the English designs) */
  function objectControl(field, id, live, emit) {
    const sw = switchEl(t('rules.hasValue'))
    const body = h('div', { class: 'members' })
    const parts = field.members.map(m => {
      const mid = `${id}-${m.key}`
      const out = h('output', { for: mid, class: 'rule-value' })
      const head = h('div', { class: 'member-head' }, h('span', { class: 'mono', id: `${mid}-n` }, m.key), out)
      const change = v => emit({ ...fieldValue(S.working, field, S.script, S.target), [m.key]: v })
      let c
      if (m.min !== undefined) c = numberControl(m, mid, v => { out.textContent = v }, change)
      else if (m.kind === 'list') c = subsetControl(m, mid, () => {}, change, catalog.families)
      else c = textControl(m, mid, () => {}, change, { suggest: m.key === 'group' ? catalog.groups : m.key === 'kai' ? catalog.faces : null, nullable: !!m.nullable, mono: field.path !== 'labels' })
      const words = h('p', { class: 'hint' }, m.words)
      body.append(h('div', { class: 'member' }, head, c.el, words))
      // (a text says nothing beside its name: what it says is in the field)
      return { key: m.key, out, c, shows: m.min !== undefined || m.kind === 'list' }
    })
    sw.addEventListener('click', () => emit(sw.getAttribute('aria-checked') === 'true' ? null : starter(field)))
    return {
      el: h('div', { class: 'ctl obj' }, sw, body),
      text: v => (v === null ? t('rules.empty') : t('rules.on')),
      set(v, b) {
        setSwitch(sw, v !== null)
        body.hidden = v === null
        if (v === null) return
        for (const p of parts) { p.c.set(v[p.key], b?.[p.key]); p.out.textContent = p.shows ? p.c.text(v[p.key]) : '' }
      },
    }
  }
  /** an object field's value when it is set from empty: the first the built-in set holds, to be edited from */
  function starter(field) {
    const pool = field.scope === 'language' ? Object.values(R.BUILTIN_RULES.languages) : Object.values(R.BUILTIN_RULES.scripts)
    const found = pool.map(x => x[field.path]).find(v => v != null)
    return structuredClone(found ?? Object.fromEntries(field.members.map(m => [m.key, m.min ?? ''])))
  }

  const CONTROL = { number: numberControl, integer: numberControl, boolean: booleanControl, enum: enumControl, order: orderControl, subset: subsetControl, chars: textControl, object: objectControl }

  // ---- a row
  function fieldRow(field) {
    const id = `rule-${field.path.replaceAll('.', '-')}-${++ids}`
    const out = h('output', { class: 'rule-value', for: id })
    const undoBtn = h('button', { class: 'tbtn rule-undo', type: 'button', title: t('rules.reset'), 'aria-label': `${t('rules.reset')}: ${field.path}` }, icon('undo'))
    undoBtn.addEventListener('click', () => undo(field))
    const control = CONTROL[field.kind](field, id, text => { out.textContent = text }, v => commit(field, v))
    const source = h('span', { class: 'rule-source' })
    const scoped = field.scope === 'script'
    const scopeSwitch = scoped ? switchEl(t('rules.scopeAria', S.script, names[S.target] ?? S.target)) : null
    const scope = scoped ? h('label', { class: 'rule-scope' }, h('span', {}, t('rules.scope', S.script)), scopeSwitch) : null
    if (scopeSwitch) scopeSwitch.addEventListener('click', () => { S.scope[field.path] = S.scope[field.path] === 'script' ? 'language' : 'script'; refreshAll() })
    const el = h('div', { class: 'rule', 'data-rule': field.path, role: 'group', 'aria-labelledby': `${id}-n` },
      h('div', { class: 'rule-head' }, h('span', { class: 'rule-name mono', id: `${id}-n` }, field.path), out, undoBtn),
      control.el,
      h('p', { class: 'hint' }, field.words),
      h('div', { class: 'rule-meta' }, source, ...(scope ? [scope] : [])))
    return {
      el, field,
      refresh() {
        const { script, tag } = fixed()
        const v = fieldValue(S.working, field, script, tag)
        const b = fieldValue(S.base, field, script, tag)
        control.set(v, b)
        out.textContent = control.text(v)
        const src = sourceOf(S.working, S.base, field, script, tag)
        el.dataset.source = src
        source.textContent = t(`rules.src.${src}`, src === 'script' ? script : names[tag] ?? tag)
        undoBtn.disabled = src !== 'edit'
        if (scopeSwitch) setSwitch(scopeSwitch, S.scope[field.path] === 'script')
      },
      edited: () => isEdited(S.working, S.base, field, S.script, S.target),
    }
  }

  // ---- the panel
  function showMsg() {
    if (!ui) return
    ui.msg.hidden = !S.msg
    ui.msg.dataset.kind = S.msg?.kind ?? ''
    const action = S.msg?.action
    const button = action ? h('button', { class: 'btn text sm', type: 'button' }, action.label) : null
    button?.addEventListener('click', action.run)
    ui.msg.replaceChildren(...(S.msg ? [h('span', {}, S.msg.text)] : []), ...(button ? [button] : []))
  }
  function loadsRow() {
    const btn = (key, run) => { const b = h('button', { class: 'btn text sm', type: 'button' }, t(key)); b.addEventListener('click', run); return b }
    const picker = h('input', { type: 'file', accept: '.json,application/json', hidden: '' })
    picker.addEventListener('change', () => { loadPicked(picker.files?.[0]); picker.value = '' })
    const ref = h('input', { class: 'input', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: t('rules.refPlaceholder'), 'aria-label': t('rules.refLabel') })
    ref.value = S.ref
    const go = h('button', { class: 'btn neutral sm', type: 'button' }, t('rules.refLoad'))
    ref.addEventListener('input', () => { S.ref = ref.value; go.disabled = !ref.value.trim() })
    ref.addEventListener('keydown', e => { if (e.key === 'Enter' && ref.value.trim()) loadRef(ref.value) })
    go.disabled = !ref.value.trim()
    go.addEventListener('click', () => loadRef(ref.value))
    return h('div', { class: 'loads' },
      h('span', { class: 'label' }, t('rules.load')),
      h('div', { class: 'load-buttons', role: 'group', 'aria-label': t('rules.load') }, btn('rules.loadFile', () => loadFile()), btn('rules.loadPick', () => picker.click()), picker, ...ENVS.map(env => btn(`rules.env.${env}`, () => loadPublished(env)))),
      h('div', { class: 'ref-row' }, ref, go))
  }
  function build() {
    const target = names[S.target] ?? S.target
    ui = { rows: [], badges: new Map() }
    ui.facts = h('dl', { class: 'facts' })
    ui.msg = h('p', { class: 'note', role: 'status', hidden: '' })
    ui.edits = h('span', { class: 'hint' })
    ui.discard = h('button', { class: 'btn text sm', type: 'button' }, t('rules.discard'))
    ui.discard.addEventListener('click', discard)
    const head = h('div', { class: 'rules-head' }, ui.facts, h('div', { class: 'row tight' }, ui.edits, ui.discard), loadsRow(), ui.msg)
    if (!S.script) {
      root.replaceChildren(head, h('p', { class: 'hint' }, t('rules.noTarget', target)))
      return refreshAll()
    }
    const groups = GROUPS.map(g => {
      const rows = fields.filter(f => f.group === g).map(fieldRow)
      ui.rows.push(...rows)
      const badge = h('span', { class: 'badge' })
      ui.badges.set(g, { badge, rows })
      const d = h('details', { class: 'rgroup', 'data-group': g }, h('summary', {}, icon('right'), h('span', {}, t(`rules.groups.${g}`)), badge), ...rows.map(r => r.el))
      d.open = open.has(g)
      d.addEventListener('toggle', () => { d.open ? open.add(g) : open.delete(g) })
      return d
    })
    ui.compare = h('div', { class: 'compare' })
    const compare = h('details', { class: 'tech', id: 'rules-compare' }, h('summary', {}, icon('right'), h('span', {}, t('rules.compare'))), ui.compare)
    compare.open = open.has('compare')
    compare.addEventListener('toggle', () => { compare.open ? open.add('compare') : open.delete('compare') })
    ui.noteBox = h('textarea', { id: 'rules-note', rows: 2, placeholder: t('rules.notePlaceholder'), maxlength: 1000, 'aria-describedby': 'rules-save-hint' })
    ui.noteBox.value = S.note
    ui.noteBox.addEventListener('input', () => { S.note = ui.noteBox.value; refreshSave() })
    ui.save = h('button', { class: 'btn brand sm', type: 'button', id: 'rules-save' }, t('rules.save'))
    ui.save.addEventListener('click', save)
    ui.saveHint = h('p', { class: 'hint', id: 'rules-save-hint' })
    ui.saved = h('p', { class: 'note', hidden: '' })
    const saveBox = h('div', { class: 'rules-save' }, h('label', { for: 'rules-note', class: 'label' }, t('rules.note')), ui.noteBox, h('div', { class: 'row' }, ui.save, ui.saveHint), ui.saved)
    root.replaceChildren(head, h('p', { class: 'hint rules-scope-hint' }, t('rules.scopeHint', names[S.target] ?? S.target, S.script)), ...groups, compare, saveBox)
    refreshAll()
  }

  function refreshAll() {
    if (!ui) return
    for (const r of ui.rows) r.refresh()
    for (const { badge, rows } of ui.badges.values()) {
      const n = rows.filter(r => r.edited()).length
      badge.textContent = n ? String(n) : ''
      badge.hidden = !n
    }
    const from = S.from
    ui.facts.replaceChildren(...[
      [t('rules.target'), `${names[S.target] ?? S.target}${S.script ? ` · ${S.script}` : ''}`, null],
      [t('rules.current'), from ? t('rules.setFrom', from.label, from.version) : '-', null],
      from?.sha256 ? [t('rules.digest'), from.sha256.slice(0, 12), 'mono'] : null,
    ].filter(Boolean).flatMap(([k, v, cls]) => [h('dt', {}, k), h('dd', cls ? { class: cls } : {}, v)]))
    const n = S.working && S.base ? diffRules(S.base, S.working).length : 0
    ui.edits.textContent = t('rules.edits', n)
    ui.discard.disabled = !dirty()
    showMsg()
    refreshCompare()
    refreshSave()
  }
  function diffList(title, against, empty) {
    const changes = diffRules(against, S.working)
    return h('section', { class: 'diff' }, h('h3', {}, title),
      changes.length
        ? h('ul', { class: 'diff-list' }, ...changes.slice(0, LISTED).map(c => h('li', {}, h('span', { class: 'mono path' }, c.path), h('span', { class: 'mono change' }, `${flat(c.from, 32)} → ${flat(c.to, 32)}`))), ...(changes.length > LISTED ? [h('li', { class: 'hint' }, t('rules.more', changes.length - LISTED))] : []))
        : h('p', { class: 'hint' }, empty))
  }
  function refreshCompare() {
    if (!ui.compare) return
    const pub = S.published
    const fetchBtn = env => { const b = h('button', { class: 'btn text sm', type: 'button' }, t('rules.compareWith', t(`rules.env.${env}`))); b.addEventListener('click', () => fetchPublished(env)); return b }
    ui.compare.replaceChildren(
      S.file ? diffList(t('rules.vsFile', S.file.set.version), S.file.set, t('rules.noDiff')) : h('p', { class: 'hint' }, t('rules.noFile')),
      pub ? diffList(t('rules.vsPublished', t(`rules.env.${pub.env}`), pub.version), pub.set, t('rules.noDiff')) : h('p', { class: 'hint' }, t('rules.noPublished')),
      h('div', { class: 'row tight' }, ...ENVS.map(fetchBtn)))
  }
  function refreshSave() {
    if (!ui.save) return
    const changes = S.file && S.working ? diffRules(S.file.set, S.working).length : 0
    const noted = oneLine(S.note) !== ''
    ui.save.disabled = !(S.file && changes && noted)
    ui.saveHint.textContent = !S.file ? t('rules.saveNoFile') : !changes ? t('rules.saveNoChange') : !noted ? t('rules.saveNeedsNote') : t('rules.saveHint', S.file.set.version + 1, changes)
    ui.noteBox.value = S.note
    const done = S.saved
    ui.saved.hidden = !done
    ui.saved.dataset.kind = 'ok'
    ui.saved.textContent = done ? `${t('rules.saved', done.version, done.changed.length)} ${t('rules.savedNext')}` : ''
  }

  window.addEventListener('beforeunload', e => { if (dirty()) e.preventDefault() })

  return {
    /** the set the quick view draws with (a copy), null before one is loaded */
    set,
    /** whether the working set differs from the one last loaded or saved */
    dirty,
    /** where the set came from: { kind, label, ref? } */
    from: () => S.from,
    /** the working set's rules for the target shown */
    resolved: () => { try { return S.working && S.target ? R.resolveRules(S.working, S.target) : null } catch { return null } },
    /** the target a fixture shows */
    setTarget(target) { S.target = target; S.scope = {}; S.script = scriptOf(target); build() },
    /** drawn again, in the interface's language */
    render: build,
    /** the set at start: the git ref the address names, else the worktree's file */
    async start(ref) {
      await loadFile({ quiet: true })
      if (ref) await loadRef(ref, { quiet: true })
    },
  }
}
