// @vitest-environment node
// The lab's measurer of the served faces (lab/typeset/served-metrics.mjs), which lays what the tap's tables lack for the display
// gate's v2 side: a text in a canvas font string measured as the reader's canvas measures it (packages/reader/src/compose/
// served.ts, `ctx.font = font`). Held to Chrome's own numbers, the tap's tables (each first measure of a font and a text in
// the browser), where the lab's data and the served faces are at hand (AXT_LAB_DATA, AXT_FACE_TABLES, AXT_FACE_SLICES: none in
// hosted CI, which skips). M12 (round c4, lane c4-gate): a small-caps font string was measured at its lower-case width, so
// 2610.40394v1 p33's "LongForm" was laid 3.78 pt short of what Chrome draws.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { hasServed, parse, servedMetrics } from '../../lab/typeset/served-metrics.mjs'

const LAB = process.env.AXT_LAB_DATA ?? '/dev/null/AXT_LAB_DATA-unset'
const TABLE = join(LAB, 'refactor-2026-11', 'baseline', 'tap', 'metrics', '2610.40394v1-zh.metrics.json.gz')
const here = hasServed && existsSync(TABLE)

describe('the lab measurer measures a font string as the reader\'s canvas does', () => {
  it('reads small capitals in a font string', () => {
    expect(parse('small-caps 700 100px "axt-xcharter", "axt-lm-math"')).toMatchObject({ caps: true, weight: 700, px: 100, families: ['axt-xcharter', 'axt-lm-math'] })
    expect(parse('700 100px "axt-xcharter"').caps).toBe(false)
  })
  it.skipIf(!here)("a small-caps word with lower case measures Chrome's width for the same font string, the tap's (M12)", () => {
    const t = JSON.parse(gunzipSync(readFileSync(TABLE)).toString()) as { widths: [string, string, number][] }
    const m = servedMetrics()
    const caps = t.widths.filter(([font, text]) => font.startsWith('small-caps ') && /\p{Ll}/u.test(text))
    expect(caps.length).toBeGreaterThan(0)
    // ("Gap" in small-caps 700: Chrome 176.0, its lower case at the capitals' small size; read without them, 182.7)
    for (const [font, text, w] of caps) expect(m.advance(font, 100, text)).toBeCloseTo(w, 1)
    // (a string with no small capitals keeps its own widths, those of the same table)
    const plain = t.widths.filter(([font, text]) => font.startsWith('700 100px "axt-xcharter"') && /\p{Ll}/u.test(text)).slice(0, 20)
    expect(plain.length).toBeGreaterThan(0)
    for (const [font, text, w] of plain) expect(m.advance(font, 100, text)).toBeCloseTo(w, 1)
  })
})
