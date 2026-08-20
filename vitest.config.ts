import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// SvelteKit virtual modules for unit tests that import server code
			// from apps/web outside the SvelteKit build.
			"$env/dynamic/private": fileURLToPath(
				new URL("./apps/web/test/env-stub.ts", import.meta.url),
			),
			$lib: fileURLToPath(new URL("./apps/web/src/lib", import.meta.url)),
		},
	},
	test: {
		include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "fixtures/**/*.test.ts"],
		environment: "node",
		coverage: { provider: "v8", reporter: ["text", "html"] },
	},
});
