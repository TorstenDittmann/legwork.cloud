import { describe, expect, it } from "vitest";
import {
	createInstallationState,
	validateArchiveDownloadUrl,
	verifyGitHubWebhook,
	verifyInstallationState,
} from "./index";

describe("installation state", () => {
	it("is signed and expiring", () => {
		const state = createInstallationState("org", "secret", 1_000);
		expect(verifyInstallationState(state, "secret", 1_001).organizationId).toBe("org");
		expect(() => verifyInstallationState(state, "secret", 1_000_000)).toThrow();
	});
});

describe("webhooks", () => {
	it("rejects invalid signatures", () =>
		expect(verifyGitHubWebhook("{}", "sha256=no", "secret")).toBe(false));
});

describe("archive downloads", () => {
	it("accepts only credential-free GitHub codeload URLs", () => {
		expect(validateArchiveDownloadUrl("https://codeload.github.com/acme/repo/tar.gz/abc")).toBe(
			"https://codeload.github.com/acme/repo/tar.gz/abc",
		);
		for (const url of [
			"http://codeload.github.com/acme/repo",
			"https://github.com/acme/repo",
			"https://token@codeload.github.com/acme/repo",
			"not a url",
		])
			expect(() => validateArchiveDownloadUrl(url)).toThrow();
	});
});
