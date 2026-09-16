// What the build stamped into the bundle. `__AXT_BUILD_REF__` is written by wxt.config.ts (`define`): the commit the
// extension was built from when the tree was clean and that commit is on the remote, `main` otherwise — a
// development build, a dirty tree, or a test run, where the constant is not defined at all (issue #158)
declare const __AXT_BUILD_REF__: string | undefined

/** A commit hash, or `main` */
export const BUILD_REF: string = typeof __AXT_BUILD_REF__ === 'string' && __AXT_BUILD_REF__ !== '' ? __AXT_BUILD_REF__ : 'main'
