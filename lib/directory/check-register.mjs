/**
 * Registers the fixture module resolver. Loaded via `--import` so the hook is
 * in place before the fixture's own imports resolve.
 */
import { register } from "node:module";

register("./check-resolver.mjs", import.meta.url);
