// notes.mjs's types: the lab's note saver
export interface NoteSaver {
  /** a note typed for a fixture (a note waiting for another fixture is kept first) */
  type(fixture: string, text: string): void
  /** the note waiting, if any, kept now */
  flush(): void
}
export declare function createNoteSaver(o: { save: (fixture: string, text: string) => void; delay?: number }): NoteSaver
