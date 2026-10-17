export declare function compileImageRef(env?: Record<string, string | undefined>, pin?: URL | string): string
export declare function platformArgs(env?: Record<string, string | undefined>): string[]
export declare function identityOf(ref: string, platform?: readonly string[]): string
export declare const COMPILE_IMAGE: string
export declare const PLATFORM: string[]
export declare const COMPILE_IDENTITY: string
export interface ImageInfo { RepoDigests?: string[]; Architecture?: string }
export declare function checkCompileImage(ref?: string, platform?: readonly string[], ask?: (args: string[]) => Promise<{ stdout: string }>): Promise<ImageInfo>
