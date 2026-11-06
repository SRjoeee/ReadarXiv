import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as ui from '../src/index.ts'

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  exports: Record<string, string>
  sideEffects: string[]
}

/** what the entry hands out, by name */
const surface: Record<string, unknown> = ui

describe('@readarxiv/ui', () => {
  it('hands out the control kit', () => {
    const kit = [
      'Button',
      'Field',
      'TextInput',
      'Icon',
      'Kbd',
      'MenuList',
      'Popover',
      'Radio',
      'Reveal',
      'Segmented',
    ] as const
    const helpers = [
      'Switch',
      'useField',
      'useMenuNav',
      'usePopover',
      'useTip',
      'shut',
      'radioKeys',
      'trackModality',
    ] as const
    for (const name of [...kit, ...helpers, 'withoutTransitions'] as const)
      expect(typeof surface[name], name).toBe('function')
  })

  it('hands out the tokens, and their sheets by the exports beside the entry', () => {
    expect(ui.tokenSheet('host')).toContain('--axt-')
    expect(ui.resolve('brand', 'light')).toMatch(/^oklch\(/)
    expect(manifest.exports).toEqual({
      '.': './src/index.ts',
      './tokens.css': './src/tokens.css',
      './controls.css': './src/controls.css',
    })
    for (const sheet of ['tokens.css', 'controls.css']) {
      expect(readFileSync(join(import.meta.dirname, '../src', sheet), 'utf8').length, sheet).toBeGreaterThan(1000)
    }
    // a sheet is imported for what it does, and a bundler that trusted `sideEffects: false` would drop it
    expect(manifest.sideEffects).toEqual(['*.css'])
  })

  it('hands out the catalogue: the packs, the lookup and the live bindings a switch swaps', () => {
    expect(ui.LOCALE_CODES).toEqual(Object.keys(ui.LOCALES))
    expect(ui.localeInUse()).toBe(ui.FALLBACK_LOCALE)
    const heard: string[] = []
    const stop = ui.onLocale((code) => heard.push(`${code}:${ui.S.brand}:${ui.R === ui.LOCALES[code].R}`))
    try {
      ui.setLocale('zh-CN')
      expect([ui.localeInUse(), ui.O, ui.R]).toEqual(['zh-CN', ui.LOCALES['zh-CN'].O, ui.LOCALES['zh-CN'].R])
      ui.setLocale('en')
      stop()
      ui.setLocale('ja')
      expect(heard).toEqual([`zh-CN:${ui.LOCALES['zh-CN'].S.brand}:true`, `en:${ui.LOCALES.en.S.brand}:true`])
    } finally {
      stop()
      ui.setLocale(ui.FALLBACK_LOCALE)
    }
  })

  it('runs in the DOM environment its code needs', () => {
    expect('document' in globalThis).toBe(true)
  })
})
