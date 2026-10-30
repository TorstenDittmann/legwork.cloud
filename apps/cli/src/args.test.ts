import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./args";
import { UsageError } from "./errors";

describe("parseCliArgs", () => {
	it("parses a non-interactive configuration", () => {
		expect(
			parseCliArgs([
				"configure",
				"--url=https://legwork.example",
				"--service",
				"payments-api",
				"--api-key-stdin",
				"--json",
			]),
		).toMatchObject({
			kind: "configure",
			apiUrl: "https://legwork.example",
			service: "payments-api",
			apiKeyStdin: true,
			json: true,
		});
	});

	it("parses incident metadata and repeated context", () => {
		expect(
			parseCliArgs([
				"incident",
				"-t",
				"Checkout failed",
				"-s",
				"critical",
				"--context",
				"region=iad",
				"--context=release=42",
			]),
		).toMatchObject({
			kind: "incident",
			title: "Checkout failed",
			severity: "critical",
			context: ["region=iad", "release=42"],
		});
	});

	it("preserves every child argument after the run delimiter", () => {
		expect(
			parseCliArgs(["run", "--environment", "ci", "--", "bun", "test", "--watch"]),
		).toMatchObject({
			kind: "run",
			environment: "ci",
			command: ["bun", "test", "--watch"],
		});
	});

	it("parses status with a positional incident id and wait options", () => {
		expect(parseCliArgs(["status", "abc", "--wait", "--timeout", "30", "--json"])).toMatchObject({
			kind: "status",
			incidentId: "abc",
			wait: true,
			timeoutSeconds: 30,
			json: true,
		});
		expect(() => parseCliArgs(["status", "--wait"])).toThrow("status requires an incident id");
	});

	it("requires a delimiter before a wrapped command", () => {
		expect(() => parseCliArgs(["run", "bun", "test"])).toThrow(UsageError);
	});

	it("rejects unsupported options and trailing delimiters", () => {
		expect(() => parseCliArgs(["doctor", "--wat"])).toThrow("Unknown option: --wat");
		expect(() => parseCliArgs(["doctor", "--", "anything"])).toThrow("Unexpected --");
		expect(() => parseCliArgs(["doctor", "--service="])).toThrow("requires a value");
		expect(() => parseCliArgs(["doctor", "--service", "--json"])).toThrow("requires a value");
	});
});
