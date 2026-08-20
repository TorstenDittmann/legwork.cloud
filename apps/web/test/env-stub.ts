// Test stand-in for SvelteKit's `$env/dynamic/private` virtual module, wired
// up via the resolve.alias entry in the root vitest.config.ts.
export const env = process.env as Record<string, string | undefined>;
