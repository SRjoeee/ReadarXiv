// proto.mjs's types: the lab's v0 run
export interface ProtoRunOptions {
  /** v0's driver (the engine's layer-proto/run.mjs) */
  V: { PDF_OPTIONS?: object; openProto: (o: never) => Promise<unknown> } & Record<string, unknown>
  rules?: object | null
  name: string
  target: string
  faces: string
  removal?: boolean
  tex?: boolean
  status?: (key: string) => void
}
export declare class ProtoRun {
  /** a fixture's run; a failure after its document opened destroys the document before it is passed on */
  static open(o: ProtoRunOptions): Promise<ProtoRun>
  doc: { loadingTask: { destroy(): unknown } }
  /** the run let go, then its document destroyed: done when that is */
  close(): Promise<void>
}
export declare function loadProto(): Promise<{ ready: boolean; V?: unknown; R?: unknown; why?: string }>
