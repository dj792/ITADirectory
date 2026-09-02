/**
 * Module resolver for the *.check.ts fixtures.
 *
 * The fixtures run under bare Node (`--experimental-strip-types`) so they need
 * no test framework, but the app's modules are written for Next: they import
 * without a file extension and use the `@/…` path alias. Node's ESM resolver
 * does neither. This hook teaches it both, for the fixtures only — nothing here
 * affects the app build, which goes through Next's own resolver.
 *
 * Ported from the Aligned KPIs app (lib/scorecard/check-resolver.mjs).
 */
import { register } from "node:module";

/** Project root — this file sits at lib/directory/. */
const ROOT = new URL("../../", import.meta.url);

export async function resolve(specifier, context, next) {
  const spec = specifier.startsWith("@/") ? new URL(specifier.slice(2), ROOT).href : specifier;

  try {
    return await next(spec, context);
  } catch (err) {
    // Extensionless import: try the TypeScript endings Next would have tried.
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try {
        return await next(spec + ext, context);
      } catch {
        /* keep trying */
      }
    }
    throw err;
  }
}

export { register };
