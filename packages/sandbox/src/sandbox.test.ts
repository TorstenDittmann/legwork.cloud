import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
	checkArgv,
	createSandboxProvider,
	discoverCheckCommand,
	RailwaySandboxProvider,
	sandboxProviderFor,
	sandboxProviderKind,
	SbxSandboxProvider,
	sbxAnalysisTemplate,
	shellQuote,
	singleFileTar,
	validateRepositoryManifest,
} from "./index";

const disabled = { commandExecutionEnabled: false, capabilityProbePassed: false };

describe("check mapping", () => {
	it("maps only declared package scripts", () => {
		expect(
			discoverCheckCommand(new Set(["package.json"]), { scripts: { test: "vitest" } }, "test")
				?.args,
		).toEqual(["run", "test"]);
		expect(
			discoverCheckCommand(new Set(["package.json"]), { scripts: { test: "vitest" } }, "build"),
		).toBeNull();
	});
	it("quotes model-controlled arguments", () =>
		expect(shellQuote("'; touch /tmp/x; '")).toContain("\\''"));
});

describe("repository bootstrap manifest", () => {
	const repository = {
		repositoryId: "bc294d1f-5aeb-4862-8ffe-2a3355fb451f",
		sha: "a".repeat(40),
		downloadUrl: "https://codeload.github.com/acme/repository/tar.gz/revision",
	};

	it("accepts exact revisions on the GitHub archive host", () => {
		expect(validateRepositoryManifest({ repositories: [repository] }).repositories).toHaveLength(1);
	});

	it("rejects malformed, duplicated, or credential-bearing entries", () => {
		expect(() => validateRepositoryManifest({ repositories: [] })).toThrow();
		expect(() => validateRepositoryManifest({ repositories: [repository, repository] })).toThrow();
		expect(() =>
			validateRepositoryManifest({
				repositories: [
					{ ...repository, downloadUrl: "https://token@codeload.github.com/acme/repository" },
				],
			}),
		).toThrow();
	});
});

describe("check arguments", () => {
	it("passes environment overrides as assignments to env", () => {
		const argv = checkArgv("/workspace/repositories/repo", {
			executable: "bun",
			args: ["run", "test"],
			environment: { CI: "true", BUN_INSTALL_CACHE_DIR: "/tmp/bun-cache" },
		});
		expect(argv).toEqual([
			"/usr/local/bin/ocai-run-check",
			"/workspace/repositories/repo",
			"env",
			"CI=true",
			"BUN_INSTALL_CACHE_DIR=/tmp/bun-cache",
			"bun",
			"run",
			"test",
		]);
	});

	it("rejects environment names that env would treat as a command", () => {
		expect(() =>
			checkArgv("/workspace/repositories/repo", {
				executable: "bun",
				args: [],
				environment: { "X=1 sh": "" },
			}),
		).toThrow();
	});
});

describe("provider selection", () => {
	it("defaults to Railway and accepts sbx", () => {
		expect(sandboxProviderKind({})).toBe("railway");
		expect(sandboxProviderKind({ SANDBOX_PROVIDER: "sbx" })).toBe("sbx");
		expect(() => sandboxProviderKind({ SANDBOX_PROVIDER: "docker" })).toThrow();
	});
});

describe("sbx provider", () => {
	const sbxEnv = { SANDBOX_PROVIDER: "sbx", SBX_URL: "http://sbx.test", SBX_API_KEY: "sbx_test" };

	it("is selected by SANDBOX_PROVIDER and by sandbox ID", () => {
		expect(sandboxProviderKind(sbxEnv)).toBe("sbx");
		expect(createSandboxProvider(disabled, sbxEnv)).toBeInstanceOf(SbxSandboxProvider);
		expect(sandboxProviderFor("sbx_0123456789abcdef", disabled, sbxEnv)).toBeInstanceOf(
			SbxSandboxProvider,
		);
		expect(
			sandboxProviderFor("123e4567-e89b-42d3-a456-426614174000", disabled, sbxEnv),
		).toBeInstanceOf(RailwaySandboxProvider);
	});

	it("needs a server URL and key", () => {
		expect(() => createSandboxProvider(disabled, { SANDBOX_PROVIDER: "sbx" })).toThrow(/SBX_URL/);
	});

	it("reports a non-sbx sandbox ID as missing without calling the server", async () => {
		const provider = createSandboxProvider(disabled, sbxEnv);
		await expect(provider.health({ id: "a".repeat(64), createdAt: new Date() })).resolves.toBe(
			"missing",
		);
	});

	it("keeps run_check off until the probe passes", async () => {
		const provider = createSandboxProvider(
			{ commandExecutionEnabled: true, capabilityProbePassed: false },
			sbxEnv,
		);
		const result = await provider.runCheck(
			{ id: "sbx_0123456789abcdef", createdAt: new Date() },
			{ name: "run_check", repositoryId: "bc294d1f-5aeb-4862-8ffe-2a3355fb451f", check: "test" },
		);
		expect(result.status).toBe("unavailable");
	});

	it("names the template after its image and steps, on gVisor with no network", () => {
		const template = sbxAnalysisTemplate();
		expect(template.name).toMatch(/^legwork-analysis-[0-9a-f]{12}$/);
		expect(sbxAnalysisTemplate().name).toBe(template.name);
		expect(template.backend).toBe("gvisor");
		expect(template.network).toBe("none");
	});

	it("wraps an archive in a tar that extracts to the same bytes", () => {
		const content = Buffer.from("x".repeat(1500));
		const tar = singleFileTar("ocai-archive-test.tar.gz", content);
		expect(tar.byteLength % 512).toBe(0);
		const listing = spawnSync("tar", ["-tvf", "-"], { input: tar });
		expect(listing.status).toBe(0);
		expect(listing.stdout.toString()).toContain("ocai-archive-test.tar.gz");
		const extracted = spawnSync("tar", ["-xOf", "-"], { input: tar });
		expect(extracted.status).toBe(0);
		expect(Buffer.compare(extracted.stdout, content)).toBe(0);
	});
});
