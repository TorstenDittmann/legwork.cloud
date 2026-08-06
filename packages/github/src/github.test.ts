import { describe, expect, it } from "vitest";
import { createInstallationState, verifyGitHubWebhook, verifyInstallationState } from "./index";

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
