import { describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { answerMessages, decodeReply, failure, isAxtMessage, isFailure, onMessages, replyWith } from '@/shared/messages'

// A handler's failure travels back as a typed reply and becomes the sender's rejection (local review):
// a request whose work failed must settle, not wait for the worker to die

describe('failure replies', () => {
  it('replyWith answers with the value, or with a typed failure carrying the error\'s message and name', async () => {
    const replies: unknown[] = []
    replyWith(Promise.resolve({ ok: 1 }), reply => replies.push(reply))
    replyWith(Promise.reject(new Error('the chain\'s status did not settle')), reply => replies.push(reply))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(replies).toEqual([{ ok: 1 }, { axtError: 'the chain\'s status did not settle', name: 'Error' }])
  })

  it('the error\'s name survives the boundary: the sender tells a failure it has a sentence for from one it can only quote', () => {
    class Refused extends Error {
      constructor() { super('refused'); this.name = 'ConfigUnreadableError' }
    }
    let caught: unknown
    try { decodeReply(failure(new Refused())) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).name).toBe('ConfigUnreadableError')
    expect((caught as Error).message).toBe('refused')
    // Something that was not an Error has no name to carry
    expect(failure('plain')).toEqual({ axtError: 'plain' })
  })

  it('decodeReply hands a value through and turns a failure reply into a rejection', () => {
    expect(decodeReply({ ok: 1 })).toEqual({ ok: 1 })
    expect(() => decodeReply(failure(new Error('boom')))).toThrow('boom')
    expect(isFailure({ axtError: 'x' })).toBe(true)
    expect(isFailure({ ok: false, error: { kind: 'network', message: 'x' } })).toBe(false)
    expect(isFailure(null)).toBe(false)
  })
})

describe('isAxtMessage', () => {
  it('knows our messages by their prefix and lets everything else pass the listener by', () => {
    expect(isAxtMessage({ type: 'axt:page-status' })).toBe(true)
    expect(isAxtMessage({ type: 'other' })).toBe(false)
    expect(isAxtMessage(null)).toBe(false)
  })
})

// One listener for a table of handlers: what each `runtime.onMessage` listener had to get right by hand — which
// messages to leave alone, when to keep the channel open, how a failure reaches the sender
describe('answerMessages', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))

  it('a message that is not ours, or that has no handler here, passes by unanswered: another listener may take it', () => {
    const reply = vi.fn()
    const listen = answerMessages({ 'axt:cancel-scope': async () => ({ cancelled: 0 }) })
    expect(listen({ type: 'someone-else' }, {}, reply)).toBeUndefined()
    expect(listen(null, {}, reply)).toBeUndefined()
    expect(listen({ type: 'axt:page-status' }, {}, reply)).toBeUndefined()
    expect(reply).not.toHaveBeenCalled()
  })

  it('a handler gets the message and the sender\'s tab, its promise is the answer, and the channel stays open for it', async () => {
    const reply = vi.fn()
    const handler = vi.fn(async () => ({ cancelled: 2 }))
    const listen = answerMessages({ 'axt:cancel-scope': handler })
    expect(listen({ type: 'axt:cancel-scope', scope: 's1' }, { tab: { id: 7 } }, reply)).toBe(true)
    await settle()
    expect(handler).toHaveBeenCalledWith({ type: 'axt:cancel-scope', scope: 's1' }, { tabId: 7 })
    expect(reply).toHaveBeenCalledWith({ cancelled: 2 })
    // An extension page has no tab
    listen({ type: 'axt:cancel-scope', scope: 's2' }, {}, reply)
    expect(handler).toHaveBeenLastCalledWith({ type: 'axt:cancel-scope', scope: 's2' }, { tabId: undefined })
  })

  it('a rejection settles the sender\'s request as a failure, and so does a handler that throws before it has a promise', async () => {
    const reply = vi.fn()
    const listen = answerMessages({
      'axt:cancel-scope': () => Promise.reject(new Error('the router is gone')),
      'axt:open-settings': () => { throw new TypeError('no such page') },
    })
    expect(listen({ type: 'axt:cancel-scope', scope: 's1' }, {}, reply)).toBe(true)
    expect(listen({ type: 'axt:open-settings' }, {}, reply)).toBe(true)
    await settle()
    expect(reply.mock.calls.map(c => c[0])).toEqual([{ axtError: 'the router is gone', name: 'Error' }, { axtError: 'no such page', name: 'TypeError' }])
  })

  it('a handler that answers nothing closes the channel: nobody waits on that message', async () => {
    const reply = vi.fn()
    const seen: string[] = []
    const listen = answerMessages({ 'axt:diag': message => { seen.push(message.line); return undefined } })
    expect(listen({ type: 'axt:diag', src: 'content', line: 'a line' }, {}, reply)).toBeUndefined()
    await settle()
    expect(seen).toEqual(['a line'])
    expect(reply).not.toHaveBeenCalled()
  })
})

describe('onMessages', () => {
  it('answers in this context until it is stopped', async () => {
    const deliver = (message: unknown) => (fakeBrowser.runtime.onMessage.trigger as unknown as (...args: unknown[]) => Promise<unknown>)(message, {}, () => undefined)
    const seen: number[] = []
    const stop = onMessages({ 'axt:zoom-changed': message => { seen.push(message.zoom); return undefined } })
    await deliver({ type: 'axt:zoom-changed', zoom: 2 })
    stop()
    await deliver({ type: 'axt:zoom-changed', zoom: 3 })
    expect(seen).toEqual([2])
  })
})

