import { describe, expect, it } from "vitest";
import {
	createSandboxProvider,
	discoverCheckCommand,
	LocalSandboxProvider,
	RailwaySandboxProvider,
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
	it("honors an explicit provider kind", () => {
		expect(resolveSandboxProviderKind("local", "token")).toBe("local");
		expect(resolveSandboxProviderKind("railway", undefined)).toBe("railway");
	});

	it("defaults to local without a Railway token", () => {
		expect(resolveSandboxProviderKind(undefined, undefined)).toBe("local");
		expect(resolveSandboxProviderKind(undefined, "token")).toBe("railway");
	});

	it("constructs the matching provider implementation", () => {
		const options = { commandExecutionEnabled: false, capabilityProbePassed: false };
		expect(createSandboxProvider({ ...options, kind: "local" })).toBeInstanceOf(
			LocalSandboxProvider,
		);
		expect(createSandboxProvider({ ...options, kind: "railway" })).toBeInstanceOf(
			RailwaySandboxProvider,
		);
	});
});
