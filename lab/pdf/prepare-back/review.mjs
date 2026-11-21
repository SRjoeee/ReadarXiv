// lab/pdf/prepare-back/review.mjs: the corpus counts of pull request #605's review findings, one paper (run.mjs --review). Not
// shipped. (1) members of turned glyphs alone: located, with pages, drawn; (2) the instrument's units that own boxes and no
// glyph: their boxes' partners, kinds and content; (3) the groups the wrap lost an image of (planOf's `lost`) and their members;
// (4) links whose owner the majority rule (locate's) gives otherwise than the first-overlap rule it replaced.
import { stateOf } from '@readarxiv/engine'

export function reviewOf(ins, tally) {
  const L = tally.locatedAll
  const m = tally.mapping
  const addOn = tally.addOn
  const wrapped = !('refused' in addOn)
  const out = {}
  // (1)
  const turnedOnly = L.members.filter(x => x.unit >= 0 && x.located && !x.text.length && !x.label.length && !x.els.size && x.turned.length)
  out.turnedOnly = { n: turnedOnly.length, withPages: turnedOnly.filter(x => x.pages.length).length, drawn: wrapped ? turnedOnly.filter(x => stateOf(x, addOn).drawn).length : 0 }
  // (2)
  const glyphsOf = new Map(), boxesOf = new Map(), turnedOf = new Map()
  ins.glyphs.forEach(ow => { for (const u of ow.unit) if (u >= 0) glyphsOf.set(u, (glyphsOf.get(u) ?? 0) + 1) })
  ;(ins.turned ?? []).forEach(ow => { for (const u of ow.unit) if (u >= 0) turnedOf.set(u, (turnedOf.get(u) ?? 0) + 1) })
  ins.boxes.forEach((ow, p) => { for (let x = 0; x < ow.unit.length; x++) { const u = ow.unit[x]; if (u >= 0) (boxesOf.get(u) ?? boxesOf.set(u, []).get(u)).push([p, x]) } })
  const boxOnly = []
  for (const [u, bx] of boxesOf) {
    if (glyphsOf.has(u) || turnedOf.has(u)) continue
    const unit = ins.units[u]
    const kinds = bx.map(([p, x]) => ins.ink.pages[p].kinds[x])
    const text = JSON.stringify(unit.content).match(/"s":"([^"]*)"/g)?.join('').replace(/"s":|"/g, '').replace(/\s/g, '') ?? ''
    boxOnly.push({ u, id: unit.id, kind: unit.kind, why: unit.why ?? null, boxes: bx.length, images: kinds.filter(k => k === -3).length, paths: kinds.filter(k => k >= 0).length, partnered: bx.filter(([p, x]) => (m.boxPage[p]?.[x] ?? 0) > 0).length, text: text.slice(0, 60), els: unit.content.filter(p => p.t === 'el').map(p => p.kind) })
  }
  out.boxOnly = boxOnly
  // (3)
  const lost = wrapped ? [...(addOn.lost ?? [])] : []
  out.lost = { groups: lost, members: [...new Set(lost.map(g => Number(g.split('.')[0])))].map(o => ({ ord: o, kind: L.members[o]?.kind, located: !!L.members[o]?.located })) }
  // (4) the first-overlap rule (the code before the review), against locate's
  const changed = []
  let links = 0
  const owners = new Int32Array(m.offA[tally.pagesA.length]).fill(-1)
  for (const mem of L.members) for (const g of [...mem.text, ...mem.label, ...[...mem.els.values()].flat()]) owners[g] = mem.ord
  for (const [p, list] of L.links) {
    const anns = (tally.pagesA[p - 1]?.annotations ?? []).filter(an => an.annotationType === 2 && Array.isArray(an.rect) && an.rect.length === 4 && ((an.url ?? an.unsafeUrl) || an.dest !== undefined))
    list.forEach((lk, i) => {
      links++
      const an = anns[i]
      if (!an) return
      const [x0, y0, x1, y1] = an.rect.map(v => Math.round(v * 100) / 100)
      const area = (a, b, c, d) => Math.max(0, Math.min(c, x1) - Math.max(a, x0)) * Math.max(0, Math.min(d, y1) - Math.max(b, y0))
      let owner, best = 0
      for (const mem of L.members) {
        if (!mem.pages.includes(p)) continue
        for (const [id, el] of mem.elements) for (const k of el.ink) { if (k[0] !== p) continue; const s = area(k[1], k[2], k[3], k[4]); if (s > best) { best = s; owner = [mem.ord, id] } }
        if (owner) continue
        for (const l of mem.lines) { if (l[0] !== p) continue; const s = area(l[2], l[6], l[3], l[5]); if (s > best) { best = s; owner = [mem.ord, ''] } }
      }
      const a = JSON.stringify(owner ?? null), b = JSON.stringify(lk.owner ?? null)
      if (a === b) return
      // (the glyphs under it, each with its owner: member, and its element or text)
      const pg = tally.pagesA[p - 1].page, off = m.offA[p - 1]
      const elOf = new Map()
      for (const mem of L.members) for (const [id, l] of mem.els) for (const g of l) elOf.set(g, id)
      const under = []
      pg.glyphs.forEach((g, j) => { const x = (g.x0 + g.x1) / 2; if (/\S/.test(g.u) && x > Math.min(x0, x1) && x < Math.max(x0, x1) && g.y > Math.min(y0, y1) && g.y < Math.max(y0, y1)) { const o = owners[off + j]; under.push(`${g.u}${o >= 0 ? `:${o}${elOf.has(off + j) ? `e${elOf.get(off + j)}` : ''}` : ':-'}`) } })
      changed.push({ page: p, rect: [x0, y0, x1, y1], to: lk.to, before: owner ?? null, now: lk.owner ?? null, kinds: [owner ? L.members[owner[0]]?.kind : null, lk.owner ? L.members[lk.owner[0]]?.kind : null], under: under.slice(0, 40).join(' ') })
    })
  }
  out.links = { n: links, changed: changed.length, examples: changed }
  return out
}
