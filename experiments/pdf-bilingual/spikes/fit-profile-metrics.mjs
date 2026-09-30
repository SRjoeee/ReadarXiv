// Additional geometric evidence; page counts alone cannot establish Original alignment.
export function profilePositions(target, candidate) {
  const ids = [...target.marks.keys()].filter(k => k.endsWith('s')), pairs = ids.filter(k => candidate.marks.has(k))
  const same = pairs.filter(k => target.marks.get(k).page === candidate.marks.get(k).page)
  const column = m => target.twoColumn && m.x >= target.width / 2 ? 1 : 0
  const sameColumn = same.filter(k => column(target.marks.get(k)) === column(candidate.marks.get(k)))
  const dy = sameColumn.map(k => Math.abs(target.marks.get(k).y - candidate.marks.get(k).y)).sort((a, b) => a - b)
  const xy = sameColumn.map(k => Math.hypot(target.marks.get(k).y - candidate.marks.get(k).y, target.marks.get(k).x - candidate.marks.get(k).x))
  const median = xs => xs.length ? xs[Math.floor(xs.length / 2)] : null
  const heights = [], allPairIds = []
  for (const k of pairs) {
    const end = k.replace(/s$/, 'e'), a = target.marks.get(k), ae = target.marks.get(end), b = candidate.marks.get(k), be = candidate.marks.get(end)
    if (!ae || !be) continue
    allPairIds.push(k)
    if (a.page === ae.page && b.page === be.page && column(a) === column(ae) && column(b) === column(be) && a.y >= ae.y && b.y >= be.y) heights.push(Math.abs((a.y - ae.y) - (b.y - be.y)))
  }
  heights.sort((a, b) => a - b)
  return { targetPages: target.pages, pages: candidate.pages, targetUnits: ids.length, matched: pairs.length, missing: ids.length - pairs.length,
    samePage: same.length, samePageRate: same.length / ids.length, samePageAndColumn: sameColumn.length,
    within10ptY: dy.filter(x => x <= 10).length, within10ptXY: xy.filter(x => x <= 10).length,
    medianDy: median(dy), pairedEnds: allPairIds.length, sameColumnHeights: heights.length, medianHeightError: median(heights),
    offPageIds: pairs.filter(k => !same.includes(k)) }
}
