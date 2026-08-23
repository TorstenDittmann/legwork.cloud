import { describe, expect, it } from "vitest";
import { TailBuffer } from "./tail-buffer";

describe("TailBuffer", () => {
	it("keeps complete output below its limit", () => {
		const buffer = new TailBuffer(32);
		buffer.append("hello ");
		buffer.append("world");
		expect(buffer.toString()).toBe("hello world");
		expect(buffer.truncated).toBe(false);
	});

	it("retains the tail and marks truncated output", () => {
		const buffer = new TailBuffer(64);
		buffer.append("start-".repeat(20));
		buffer.append("the-useful-ending");
		const output = buffer.toString();
		expect(output).toContain("[earlier command output truncated]");
		expect(output.endsWith("the-useful-ending")).toBe(true);
		expect(new TextEncoder().encode(output).byteLength).toBeLessThanOrEqual(64);
	});

	it("marks prior output as truncated when a full-size chunk replaces it", () => {
		const buffer = new TailBuffer(40);
		buffer.append("old");
		buffer.append("x".repeat(40));
		expect(buffer.truncated).toBe(true);
	});

	it("stays within the byte budget for multibyte output", () => {
		const buffer = new TailBuffer(80);
		buffer.append("🔥".repeat(100));
		expect(new TextEncoder().encode(buffer.toString()).byteLength).toBeLessThanOrEqual(80);
	});
});
