/** a frame's pitch: the median of its consecutive text lines' gaps, its breaks' aside; null where there is none */
export declare function pitchOf(gaps: readonly number[]): number | null
/** two lines' distance with no break between them, TeX's: the pitch, or its \lineskip rule's for a tall line */
export declare function naturalOf(pitch: number, depth: number, height: number, lineskip: readonly number[] | null | undefined): number
/** the room a forced break leaves, in pitches, never under 0 */
export declare function roomOf(gap: number, pitch: number, natural: number): number
