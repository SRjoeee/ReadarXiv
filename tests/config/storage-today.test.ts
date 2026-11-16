import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_PDF_CLASSES, configSchema } from '@/config/schema'
import { TOGGLE_DEFAULTS, TOGGLES } from '@/pdf-reader/engine/rules/content-classes.mjs'

describe('provider selection', () => {

  // DESIGN §9 asks for a test from every previous version's stored shape. v8, v9 and v12 were only ever passed through
  // by the tests that start lower; each starts here from the shape that version really stored

  it('the reader\'s "What to translate" defaults are the engine\'s, under the engine\'s toggles (rules/content-classes.mjs)', () => {
    expect(DEFAULT_PDF_CLASSES).toEqual(TOGGLE_DEFAULTS)
    expect(Object.keys(DEFAULT_CONFIG.pdfReader.classes).sort()).toEqual(TOGGLES.filter(t => t !== 'always' && t !== 'never').sort())
    // a toggle the schema lacks would be stripped from what the reader saves, and one it has that the engine lacks refused by the layer's open
    expect(Object.keys(configSchema.shape.pdfReader.shape.classes.shape).sort()).toEqual(Object.keys(TOGGLE_DEFAULTS).sort())
  })

})

// A new reader's first target language (config/first-target.ts): written once, and only into an empty store
