// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The lab's v0 run (lab/pdf/layer-lab/proto.mjs): the PDF document it opens is its own until a ProtoRun holds it, so a start
// that fails after the document opened must destroy it, or each retry (a setting changed again) leaves a document and its
// worker behind.

interface Task { destroyed: number; destroy: ReturnType<typeof vi.fn>; promise: Promise<{ loadingTask: Task }> }
const tasks: Task[] = []
vi.mock('pdfjs-dist', () => ({
  OPS: {},
  getDocument: () => {
    const task: Task = { destroyed: 0, destroy: vi.fn(async () => { task.destroyed++ }), promise: Promise.resolve(null as never) }
    task.promise = Promise.resolve({ loadingTask: task })
    tasks.push(task)
    return task
  },
}))

beforeEach(() => {
  tasks.length = 0
  vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('fetch', async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => (url.includes('record.json') ? { units: [] } : {}),
    arrayBuffer: async () => new ArrayBuffer(4),
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

const options = (openProto: () => Promise<unknown>) => ({ V: { PDF_OPTIONS: {}, openProto }, name: 'fx', target: 'zh', faces: 'roles', removal: false, tex: false })

describe('ProtoRun.open', () => {
  it('destroys the document it opened when the engine refuses the paper, and passes the failure on', async () => {
    const { ProtoRun } = await import('../../lab/pdf/layer-lab/proto.mjs')
    await expect(ProtoRun.open(options(async () => { throw new Error('geometry does not fit') }))).rejects.toThrow('geometry does not fit')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys the document each time a start is tried again and fails again', async () => {
    const { ProtoRun } = await import('../../lab/pdf/layer-lab/proto.mjs')
    for (let i = 0; i < 3; i++) await expect(ProtoRun.open(options(async () => { throw new Error('a face did not load') }))).rejects.toThrow('a face did not load')
    expect(tasks.map(t => t.destroyed)).toEqual([1, 1, 1])
  })

  it('gives the document to the run it returns, and does not destroy it', async () => {
    const { ProtoRun } = await import('../../lab/pdf/layer-lab/proto.mjs')
    const engineRun = { rules: {}, dispose: vi.fn() }
    const run = await ProtoRun.open(options(async () => engineRun))
    expect(tasks[0]!.destroy).not.toHaveBeenCalled()
    // (and closing the run lets the engine's run go, then destroys the document, done when that is)
    await run.close()
    expect(engineRun.dispose).toHaveBeenCalledTimes(1)
    expect(tasks[0]!.destroy).toHaveBeenCalledTimes(1)
  })
})
