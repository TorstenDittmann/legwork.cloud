import { describe, expect, it } from "vitest";
import { parseDestination } from "./destinations";

describe("slack destinations", () => {
	it("accepts a Slack incoming webhook and hides the token in the hint", () => {
		const parsed = parseDestination("slack", "https://hooks.slack.com/services/T01/B02/abc123xyz");
		expect(parsed.destination).toBe("https://hooks.slack.com/services/T01/B02/abc123xyz");
		expect(parsed.hint).toBe("hooks.slack.com/services/T01/B02/…");
		expect(parsed.hint).not.toContain("abc123xyz");
	});
	it("rejects a host that merely ends with the Slack host", () => {
		expect(() =>
			parseDestination("slack", "https://hooks.slack.com.evil.com/services/T01/B02/c"),
		).toThrow(/host/i);
	});
	it("rejects a Slack URL that is not a webhook path", () => {
		expect(() => parseDestination("slack", "https://hooks.slack.com/api/chat.postMessage")).toThrow(
			/path/i,
		);
	});
	it("rejects plaintext http", () => {
		expect(() => parseDestination("slack", "http://hooks.slack.com/services/T01/B02/c")).toThrow(
			/https/i,
		);
	});
});

describe("discord destinations", () => {
	it("accepts a Discord webhook on either host", () => {
		expect(
			parseDestination("discord", "https://discord.com/api/webhooks/123/tok").destination,
		).toBe("https://discord.com/api/webhooks/123/tok");
		expect(
			parseDestination("discord", "https://discordapp.com/api/webhooks/123/tok").destination,
		).toBe("https://discordapp.com/api/webhooks/123/tok");
	});
	it("rejects a Discord URL that is not a webhook path", () => {
		expect(() => parseDestination("discord", "https://discord.com/api/guilds/1")).toThrow(/path/i);
	});
});

describe("email destinations", () => {
	it("accepts an address and masks the local part in the hint", () => {
		const parsed = parseDestination("email", "oncall@acme.com");
		expect(parsed.destination).toBe("oncall@acme.com");
		expect(parsed.hint).toBe("o•••@acme.com");
	});
	it("rejects header injection through a newline", () => {
		expect(() => parseDestination("email", "a@b.com\nBcc: evil@x.com")).toThrow(/address/i);
	});
	it("rejects a URL supplied where an address belongs", () => {
		expect(() => parseDestination("email", "https://hooks.slack.com/services/T/B/c")).toThrow(
			/address/i,
		);
	});
});
