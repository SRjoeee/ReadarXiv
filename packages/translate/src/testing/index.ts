// @readarxiv/translate/testing: the test adapters (a memory store, a fake clock, a counting gate, fake translators, a
// scripted fetch) and the conformance suite any translator passes (translatorSuite)
export {
  type Behaviour,
  echo,
  FAKE_LIMITS,
  type FakeOptions,
  type FakeTranslator,
  fakeTranslator,
  type Mangling,
  mangle,
  mangler,
  NEVER,
  type Scripted,
  type ScriptedFetch,
  scriptedFetch,
} from './fakes.ts'
export { type CountingGate, countingGate, type FakeClock, fakeClock, type MemoryStore, memoryStore } from './ports.ts'
