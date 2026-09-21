import { describe, expect, it } from "vitest";
import {
	createSandboxProvider,
	discoverCheckCommand,
	LocalSandboxProvider,
	MicrosandboxProvider,
	resolveSandboxProviderKind,
	shellQuote,
	validateRepositoryManifest,
} from "./index";

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

describe("sandbox provider selection", () => {
	it("defaults to microsandbox", () => {
		expect(resolveSandboxProviderKind(undefined)).toBe("microsandbox");
		expect(resolveSandboxProviderKind("microsandbox")).toBe("microsandbox");
	});

	it("maps legacy aliases", () => {
		expect(resolveSandboxProviderKind("local")).toBe("docker");
		expect(resolveSandboxProviderKind("docker")).toBe("docker");
		expect(resolveSandboxProviderKind("railway")).toBe("microsandbox");
	});

	it("constructs the matching provider implementation", () => {
		const options = { commandExecutionEnabled: false, capabilityProbePassed: false };
		expect(createSandboxProvider({ ...options, kind: "microsandbox" })).toBeInstanceOf(
			MicrosandboxProvider,
		);
		expect(createSandboxProvider({ ...options, kind: "docker" })).toBeInstanceOf(
			LocalSandboxProvider,
		);
	});
});
