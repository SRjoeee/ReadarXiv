// A document that holds our optional-content groups (docs/route/ocg-erasure.md §3: `axt:u<id>`, `axt:u<id>.p`, `axt:u<id>.l`,
// `axt:n<occ>`), as our wrapped page does: the layer draws a unit only where its groups can hide its ink (visibility.mjs), so a test's
// document, a fake or a PDF of no optional content, is given a configuration that names every group its units may have. Its renders
// hide nothing (no content of the test's PDFs is marked): a test of what is hidden reads the visibility asked (`asked`), and the pixel
// gates use wrapped PDFs (layer-ocg-pixels.test.ts).

/** the groups a test's configuration names: units 0 to `units` - 1, names 0 to `names` - 1, less `missing` */
export interface GroupsOptions { units?: number; names?: number; missing?: readonly string[] }

/** a fake configuration as PDF.js's OptionalContentConfig is read by visibility.mjs and by a render: iterable [id, { name }], each
 *  group's visibility set by setVisibility and read by isVisible; `hidden()` the names hidden now */
export function fakeConfig({ units = 2000, names = 200, missing = [] }: GroupsOptions = {}) {
  const gone = new Set(missing)
  const groups = new Map<string, { name: string; visible: boolean }>()
  const add = (g: string) => { if (!gone.has(g)) groups.set(`${groups.size}R`, { name: `axt:${g}`, visible: true }) }
  for (let id = 0; id < units; id++) for (const g of [`u${id}`, `u${id}.p`, `u${id}.l`]) add(g)
  for (let n = 0; n < names; n++) add(`n${n}`)
  return {
    // (every intent PDF.js may check a render's against)
    renderingIntent: 0xff,
    [Symbol.iterator]: () => groups.entries(),
    setVisibility(id: string, visible = true) { const g = groups.get(id); if (g) g.visible = !!visible },
    isVisible: (group: { id?: string } | null) => (group?.id ? groups.get(group.id)?.visible ?? true : true),
    hidden: () => [...groups.values()].filter(g => !g.visible).map(g => g.name.slice(4)),
  }
}

/** `doc` given a configuration of our groups where it has none (its own kept where it has one: a wrapped PDF's) */
export function withGroups<T extends object>(doc: T, o: GroupsOptions = {}): T {
  const d = doc as T & { getOptionalContentConfig?: unknown }
  if (typeof d.getOptionalContentConfig === 'function') return doc
  const config = fakeConfig(o)
  Object.defineProperty(d, 'getOptionalContentConfig', { configurable: true, value: async () => config })
  return doc
}
