// src/pdf-reader/engine/layer-proto/warm.mjs
// The faces a page's units will be drawn in, asked of the host's served slices at once, before the page is laid
// (docs/PDF-READER.md §11.8, "The faces, in one wave"). v0 checks and loads the faces of each unit as it lays it, one unit
// after another (run.mjs layOnce: FS.check, E2), so a page whose units bring new characters waited for one round trip a unit:
// 2602.23285v2 in Chinese asked 38 font files in 12 waves before its first page, 4.3 to 9.2 s of a cold visit (2026-10-24,
// production). Here the slices the rows of a page's units need are asked together, as soon as the rows and the parts are in
// (before the composed document has opened), so that v0's own checks find them loaded or loading, and its lay waits on no
// further round trip. Nothing here decides what a unit is drawn in, nor whether it can be: v0's check does, unchanged; a
// character this asks for in a face v0 does not draw it in costs its slice's bytes and nothing else.
//
// What it reads of a unit: its row's translated text and its kind. A heading's text is asked in the bold face, any other's in
// the body face: the original's style of each run (the layout's sourceScopes) is v0's to read once the page is drawn, and a
// bold run inside a paragraph, a caption's label or a name asks its slices then, as before. The paper's family, which decides
// a CJK target's weights (the rules' `light` designs) and its Latin runs' faces, is read from the parts' layouts: each font
// weighted by the lines set in it (familyOfParts), where v0 weights page 1's characters. The two agree on the seven papers of
// the gate pack (2026-10-24: times, palatino, cm and charter, against page 1's lines by width); where they do not, the slices
// of the other weight were asked for nothing and v0 asks its own.
//
// An original module (no port statement).
import { familyOfFonts, rolesFor } from '../rules/font-roles.mjs'
import { BUILTIN_RULES, resolveRules } from '../rules/layout.mjs'
import { faceOfRoles, fontString, roleFaceSet } from './fonts.mjs'
import { cjkClassRe } from './layer2.mjs'

/**
 * The paper's English family as its parts' layouts set it: each font name of a part's layout weighted by the lines set in it
 * (a line row's eighth number is its font's index), through the role table's familyOfFonts. `parts`: read parts (readPart's),
 * a part with no layout (`layout: null`) counting nothing; 'other' with none
 */
export function familyOfParts(parts) {
  const weights = new Map()
  for (const p of parts ?? []) {
    const L = p?.layout
    if (!L || !Array.isArray(L.fonts) || !Array.isArray(L.lines)) continue
    for (const [, rows] of L.lines) {
      if (!rows) continue
      for (let i = 7; i < rows.length; i += 8) {
        const name = L.fonts[rows[i]]
        if (typeof name === 'string') weights.set(name, (weights.get(name) ?? 0) + 1)
      }
    }
  }
  return familyOfFonts([...weights.keys()], [...weights.values()])
}

/**
 * A warmer of one target's faces over the host's served slices (`faceSources`, the reader's): `warm(units, family)` asks, at
 * once and together, the slices that hold the characters of `units` ({ heading, text } each: a heading's in the bold face of
 * the body, the rest in the body) in the faces of the target's roles for the paper's English `family` (CJK characters by the
 * rules' class, cjkClassRe, in the CJK face; every other in the family's serif), and resolves once each has loaded or failed;
 * it never rejects. A character asked once is not asked again. Its face set lets nothing go that failed (keepFailed): a slice
 * that fails here fails v0's check of the units that need it, as if v0 had asked it itself; a run's open forgets it, and asks
 * again
 */
export function faceWarmer({ faceSources, target, rules = BUILTIN_RULES }) {
  const R = resolveRules(rules, target)
  const cjkRe = cjkClassRe(R.params.cjkQuotes)
  const FS = roleFaceSet({ faceSources, keepFailed: true })
  const rolesOf = new Map()
  return {
    async warm(units, family) {
      let roles = rolesOf.get(family)
      if (!roles) rolesOf.set(family, (roles = rolesFor(target, family, R.cjkFaces)))
      const design = family === 'other' ? 'times' : family
      /** the characters each face is asked for, by its font string */
      const runs = new Map()
      for (const u of units) {
        if (typeof u?.text !== 'string' || !u.text) continue
        const st = { fam: 'serif', bold: !!u.heading, italic: false, caps: false, design }
        for (const ch of u.text) {
          if (/\s/u.test(ch)) continue
          const face = faceOfRoles(roles, st, cjkRe.test(ch) ? 'cjk' : 'latin')
          const key = fontString(face, 100)
          const r = runs.get(key) ?? runs.set(key, { face, chars: new Set() }).get(key)
          r.chars.add(ch)
        }
      }
      await Promise.all([...runs.values()].map(r => FS.ready(r.face, [...r.chars].join(''))))
    },
  }
}
