import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./apps/web/e2e",
	use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
	webServer: {
		command: "bun run --filter @legwork/web dev",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		env: {
			NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3000/auth/callback",
			WORKOS_API_KEY: "sk_test_playwright",
			WORKOS_CLIENT_ID: "client_test_playwright",
			WORKOS_COOKIE_PASSWORD: "playwright-cookie-secret-32-chars",
			DATABASE_URL: "file:playwright.db",
		},
	},
});
