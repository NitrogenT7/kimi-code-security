import { register } from 'node:module';

/**
 * Registers the `#/` subpath-import resolver. Pass to Node via `--import`
 * (alongside tsx) so source-executed v2 code resolves directory-style `#/`
 * imports (array fallback) that tsx's resolver mishandles.
 */
register('./hash-imports-loader.mjs', import.meta.url);
