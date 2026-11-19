/** the shell line of a one-pass compile of `engine` over `main`, run in the compile's folder; for `latex` its driver, quiet,
 *  only where the pass wrote a DVI, its output in a file of its own */
export declare function onePassTex(engine: string, main: string): string
/** the log the host gives of a one-pass compile made by onePassTex in `build`: TeX's, then for `latex` the line `mark` alone and
 *  the driver's output; TeX's alone where no mark is named or no driver ran; null where TeX wrote no log */
export declare function onePassLog(build: string, main: string, engine: string, mark: string | null | undefined): string | null
