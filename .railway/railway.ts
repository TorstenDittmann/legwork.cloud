import { defineRailway, github, image, preserve, project, service, volume } from "railway/iac";

export default defineRailway((ctx) => {
	const legworkRepo = github("TorstenDittmann/on-call-ai", { checkSuites: false });

	const libsqlVolume = volume("libsql-volume", {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region: "europe-west4-drams3a",
		sizeMB: 5000,
	});
	const web = service("web", {
		source: legworkRepo,
		build: "bun run --filter @legwork/web build",
		start: "bun run --filter @legwork/web start",
		preDeploy: "bun run db:migrate",
		healthcheck: "/api/health",
		healthcheckTimeout: 30,
		deploy: {
			sleepApplication: true,
			restartPolicyType: "ON_FAILURE",
			restartPolicyMaxRetries: 3,
		},
		replicas: { "europe-west4-drams3a": 1 },
		env: {
			APP_URL: preserve(),
			DATABASE_AUTH_TOKEN: ctx.shared.DATABASE_AUTH_TOKEN,
			DATABASE_URL: preserve(),
			DATA_ENCRYPTION_KEY: preserve(),
			DODO_PAYMENTS_API_KEY: preserve(),
			DODO_PAYMENTS_ENVIRONMENT: preserve(),
			DODO_PAYMENTS_RETURN_URL: preserve(),
			DODO_PAYMENTS_SCALE_ANNUAL_PRODUCT_ID: preserve(),
			DODO_PAYMENTS_SCALE_MONTHLY_PRODUCT_ID: preserve(),
			DODO_PAYMENTS_TEAM_ANNUAL_PRODUCT_ID: preserve(),
			DODO_PAYMENTS_TEAM_MONTHLY_PRODUCT_ID: preserve(),
			DODO_PAYMENTS_WEBHOOK_KEY: preserve(),
			GITHUB_APP_SLUG: preserve(),
			GITHUB_INSTALLATION_STATE_SECRET: preserve(),
			GITHUB_WEBHOOK_SECRET: preserve(),
			LOG_LEVEL: preserve(),
			METRICS_TOKEN: preserve(),
			WORKOS_REDIRECT_URI: preserve(),
			WORKOS_API_KEY: preserve(),
			WORKOS_CLIENT_ID: preserve(),
			WORKOS_COOKIE_PASSWORD: preserve(),
		},
	});
	const libsql = service("libsql", {
		source: image(
			"ghcr.io/tursodatabase/libsql-server@sha256:07d5da358f37f7f327cc33c1cb5278e7892e04225f011a65a76049372a308982",
		),
		replicas: { "europe-west4-drams3a": 1 },
		volumeMounts: {
			"/var/lib/sqld": libsqlVolume,
		},
		deploy: {
			sleepApplication: true,
			restartPolicyType: "ON_FAILURE",
			restartPolicyMaxRetries: 10,
		},
		domains: [{ domain: "libsql-production-f752.up.railway.app", port: 8080 }],
		env: {
			SQLD_AUTH_JWT_KEY: preserve(),
			SQLD_DB_PATH: preserve(),
			SQLD_NODE: preserve(),
		},
	});
	const worker = service("worker", {
		source: legworkRepo,
		build: "bun run --filter @legwork/worker build",
		start: "bun run --filter @legwork/worker start",
		deploy: {
			restartPolicyType: "ON_FAILURE",
			restartPolicyMaxRetries: 5,
		},
		replicas: { "europe-west4-drams3a": 1 },
		env: {
			APP_URL: preserve(),
			DATABASE_AUTH_TOKEN: ctx.shared.DATABASE_AUTH_TOKEN,
			DATABASE_URL: preserve(),
			DATA_ENCRYPTION_KEY: preserve(),
			GITHUB_APP_ID: preserve(),
			GITHUB_APP_PRIVATE_KEY: preserve(),
			LOG_LEVEL: preserve(),
			OPENROUTER_API_KEY: preserve(),
			OPENROUTER_MODEL: preserve(),
			RAILWAY_TOKEN: preserve(),
			RAILWAY_ENVIRONMENT_ID: preserve(),
			RESEND_API_KEY: preserve(),
			RESEND_FROM_ADDRESS: preserve(),
			SANDBOX_PROVIDER: preserve(),
			SANDBOX_CAPABILITY_PROBE_PASSED: preserve(),
			SANDBOX_COMMAND_EXECUTION: preserve(),
			SHUTDOWN_GRACE_MS: preserve(),
			WORKER_CONCURRENCY: preserve(),
		},
	});

	return project("legwork.dev", {
		resources: [web, libsql, worker, libsqlVolume],
	});
});
