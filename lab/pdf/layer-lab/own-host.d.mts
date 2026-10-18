// own-host.mjs's types: the lab's guard against DNS rebinding

/** whether a request's `Host` header is exactly `127.0.0.1:<port>` */
export declare function isOwnHost(host: string | undefined, port: number): boolean
