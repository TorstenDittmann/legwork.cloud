import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import tar from "tar-stream";
import {
	createArchiveBudget,
	decryptSecret,
	encryptSecret,
	extractValidatedTarGz,
	generateApiKey,
	hashApiKey,
	isPublicAddress,
	redactSecrets,
	resolveBeneath,
	signCallback,
	validateArchiveHeader,
	verifyApiKey,
	verifyCallbackSignature,
} from "./index";

async function archive(entries: Array<[string, string]>): Promise<ReadableStream<Uint8Array>> {
	const pack = tar.pack();
	const chunks: Buffer[] = [];
	pack.on("data", (chunk: Buffer) => chunks.push(chunk));
	for (const [name, contents] of entries) pack.entry({ name: `root/${name}` }, contents);
	pack.finalize();
	await new Promise<void>((resolve, reject) => {
		pack.once("end", resolve);
		pack.once("error", reject);
	});
	return Readable.toWeb(
		Readable.from(gzipSync(Buffer.concat(chunks))),
	) as ReadableStream<Uint8Array>;
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const value of values) result.push(value);
	return result;
}

describe("API keys", () => {
	it("hashes and verifies without retaining plaintext", () => {
		const key = generateApiKey();
		expect(key.plaintext.startsWith("ocai_live_")).toBe(true);
		expect(key.hash).toBe(hashApiKey(key.plaintext));
		expect(verifyApiKey(key.plaintext, key.hash)).toBe(true);
		expect(verifyApiKey(`${key.plaintext}x`, key.hash)).toBe(false);
	});
});

describe("containment", () => {
	it("rejects traversal", () => expect(() => resolveBeneath("/work/repo", "../secret")).toThrow());
	it("accepts normal paths", () =>
		expect(resolveBeneath("/work/repo", "src/app.ts")).toBe("/work/repo/src/app.ts"));
});

describe("archive policy", () => {
	it("rejects traversal and links", () => {
		expect(() => validateArchiveHeader({ name: "../secret", type: "file" })).toThrow();
		expect(() =>
			validateArchiveHeader({ name: "root/link", type: "symlink", linkname: "/etc/passwd" }),
		).toThrow();
	});
	it("shares limits across repository archives", async () => {
		const budget = createArchiveBudget();
		const limits = {
			maxFiles: 1,
			maxCompressedBytes: 1024 * 1024,
			maxExtractedBytes: 1024,
			maxFileBytes: 1024,
		};
		const first = extractValidatedTarGz(
			await archive([["one.ts", "one"]]),
			"repositories/one",
			limits,
			budget,
		);
		expect((await collect(first)).map((file) => file.path)).toEqual(["repositories/one/one.ts"]);
		const second = extractValidatedTarGz(
			await archive([["two.ts", "two"]]),
			"repositories/two",
			limits,
			budget,
		);
		await expect(collect(second)).rejects.toThrow("file count limit");
	});
});

describe("authenticated encryption", () => {
	it("binds ciphertext to its service context", () => {
		const key = Buffer.alloc(32, 7).toString("base64");
		const encrypted = encryptSecret("callback-secret", key, "service:a");
		expect(decryptSecret(encrypted, key, "service:a")).toBe("callback-secret");
		expect(() => decryptSecret(encrypted, key, "service:b")).toThrow();
	});
});

describe("callbacks", () => {
	it("signs timestamp dot body", () => {
		const signature = signCallback(123, "{}", "secret");
		expect(verifyCallbackSignature(123, "{}", "secret", signature)).toBe(true);
	});
	it("rejects non-public addresses", () => {
		expect(isPublicAddress("127.0.0.1")).toBe(false);
		expect(isPublicAddress("10.0.0.1")).toBe(false);
		expect(isPublicAddress("169.254.169.254")).toBe(false);
		expect(isPublicAddress("8.8.8.8")).toBe(true);
	});
});

describe("redaction", () => {
	it("redacts common credentials recursively", () => {
		const value = redactSecrets({
			log: "Authorization: Bearer abc.def.ghi",
			nested: ["password=hunter2"],
		});
		expect(JSON.stringify(value)).not.toContain("hunter2");
		expect(JSON.stringify(value)).not.toContain("abc.def.ghi");
	});
	it("redacts the key formats this system actually stores and handles", () => {
		const secrets = [
			// OpenRouter / OpenAI-style dashes
			"sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			"sk-proj-Tj8mK2lQ9wXyZ01234abcd",
			// Stripe-style underscores
			"sk_live_4eC39HqLyjWDarjtT1zdp7dc",
			// Resend
			"re_AbCdEfGh123456789012",
			// Legwork's own service API keys
			"ocai_live_3q28fT0kJ9YxWvUuTtSsRrQqPpOoNnMmLlKkJjIiHh",
			// Slack tokens
			"xoxb-1234567890-abcdefghijklmnop",
			// AWS access key ids
			"AKIAIOSFODNN7EXAMPLE",
			// Bare JWTs (libSQL DATABASE_AUTH_TOKEN style, no Bearer prefix)
			"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsZWd3b3JrIn0.abc123DEF456ghi789JKL",
		];
		for (const secret of secrets) {
			const output = JSON.stringify(
				redactSecrets({ text: `deploy log mentions ${secret} in passing` }),
			);
			expect(output, `should redact ${secret}`).not.toContain(secret);
		}
	});
	it("redacts incoming webhook URLs, which are unscoped bearer credentials", () => {
		const output = JSON.stringify(
			redactSecrets({
				slack: "posted to https://hooks.slack.com/services/T0001/B0001/XXXXXXXXXXXXXXXXXXXXXXXX",
				discord: "https://discord.com/api/webhooks/1234567890/AbCdEf-GhIjKl_MnOpQr today",
			}),
		);
		expect(output).not.toContain("XXXXXXXXXXXXXXXXXXXXXXXX");
		expect(output).not.toContain("AbCdEf-GhIjKl_MnOpQr");
	});
});
