import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	normalizeApiUrl,
	readStoredConfig,
	resolveConfig,
	writeConfig,
	type LegworkConfig,
} from "./config";

const apiKey = `ocai_live_${"a".repeat(43)}`;
const paths: string[] = [];

afterEach(async () => {
	await Promise.all(paths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("CLI config", () => {
	it("allows HTTPS origins and localhost HTTP only", () => {
		expect(normalizeApiUrl("https://legwork.example/")).toBe("https://legwork.example");
		expect(normalizeApiUrl("http://localhost:5173")).toBe("http://localhost:5173");
		expect(normalizeApiUrl("http://[::1]:5173")).toBe("http://[::1]:5173");
		expect(() => normalizeApiUrl("http://legwork.example")).toThrow("must use HTTPS");
		expect(() => normalizeApiUrl("https://legwork.example/prefix")).toThrow("without a path");
	});

	it("writes owner-only config and reads it back", async () => {
		const root = await mkdtemp(join(tmpdir(), "legwork-cli-"));
		paths.push(root);
		const configPath = join(root, "nested", "config.json");
		const environment = { LEGWORK_CONFIG: configPath };
		const config: LegworkConfig = {
			apiUrl: "https://legwork.example",
			service: "payments-api",
			apiKey,
		};

		expect(await writeConfig(config, environment)).toBe(configPath);
		expect(await readStoredConfig(environment)).toEqual(config);
		expect((await stat(configPath)).mode & 0o777).toBe(0o600);
		expect(await readFile(configPath, "utf8")).toContain('"service": "payments-api"');
	});

	it("applies flags before environment and stored values", async () => {
		const root = await mkdtemp(join(tmpdir(), "legwork-cli-"));
		paths.push(root);
		const environment = {
			LEGWORK_CONFIG: join(root, "config.json"),
			LEGWORK_SERVICE: "environment-service",
			LEGWORK_API_KEY: `ocai_live_${"b".repeat(43)}`,
		};
		await writeConfig(
			{ apiUrl: "https://stored.example", service: "stored-service", apiKey },
			environment,
		);

		expect(
			await resolveConfig(
				{ apiUrl: "https://flag.example", service: "flag-service", apiKey },
				environment,
			),
		).toEqual({ apiUrl: "https://flag.example", service: "flag-service", apiKey });
	});
});
