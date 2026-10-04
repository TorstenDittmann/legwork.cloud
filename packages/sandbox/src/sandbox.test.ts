import { describe, expect, it } from "vitest";
import {
	checkArgv,
	createSandboxProvider,
	discoverCheckCommand,
	DockerSandboxProvider,
	dockerSandboxConfig,
	sandboxProviderKind,
	shellQuote,
	stagedArchivePath,
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

describe("staged archives", () => {
	it("derives the only path the bootstrap accepts", () => {
		expect(stagedArchivePath("bc294d1f-5aeb-4862-8ffe-2a3355fb451f")).toBe(
			"/tmp/ocai-archive-bc294d1f-5aeb-4862-8ffe-2a3355fb451f.tar.gz",
		);
		expect(() => stagedArchivePath("../../etc/passwd")).toThrow();
	});
});

describe("provider selection", () => {
	it("defaults to Railway and accepts Docker", () => {
		expect(sandboxProviderKind({})).toBe("railway");
		expect(sandboxProviderKind({ SANDBOX_PROVIDER: "docker" })).toBe("docker");
		expect(() => sandboxProviderKind({ SANDBOX_PROVIDER: "local" })).toThrow();
	});

	it("runs Docker sandboxes under gVisor unless overridden", () => {
		expect(dockerSandboxConfig({})).toEqual({
			image: "legwork-sandbox:local",
			runtime: "runsc",
		});
		expect(createSandboxProvider(disabled, { SANDBOX_PROVIDER: "docker" })).toBeInstanceOf(
			DockerSandboxProvider,
		);
	});

	it("refuses repository commands outside gVisor even when enabled", async () => {
		const provider = new DockerSandboxProvider({
			image: "legwork-sandbox:local",
			runtime: "runc",
			commandExecutionEnabled: true,
			capabilityProbePassed: true,
		});
		const result = await provider.runCheck(
			{ id: "0".repeat(64), createdAt: new Date() },
			{ name: "run_check", repositoryId: "bc294d1f-5aeb-4862-8ffe-2a3355fb451f", check: "test" },
		);
		expect(result.status).toBe("unavailable");
	});
});
