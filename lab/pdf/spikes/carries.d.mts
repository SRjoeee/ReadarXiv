// carries.mjs's types, for the tests
type Carry = (pieces: unknown[], unit?: { pieces: unknown[] } | null) => boolean
/** the pipelines 7 to 29 whose translations carry over, each with the test a unit's translation must pass */
export declare const PIPELINE_CARRIES: Record<string, Carry>
/** the test a translation made under `pipeline` passes to be carried into this cut, or null where it carries nothing */
export declare const carriesOf: (pipeline: string) => Carry | null
