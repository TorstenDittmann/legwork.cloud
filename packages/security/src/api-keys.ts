import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface GeneratedApiKey {
	plaintext: string;
	prefix: string;
	hash: string;
}

export function hashApiKey(key: string): string {
	return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
	const secret = randomBytes(32).toString("base64url");
	const plaintext = `ocai_live_${secret}`;
	return { plaintext, prefix: plaintext.slice(0, 18), hash: hashApiKey(plaintext) };
}

export function verifyApiKey(candidate: string, expectedHash: string): boolean {
	if (!candidate.startsWith("ocai_live_")) return false;
	const actual = Buffer.from(hashApiKey(candidate), "hex");
	const expected = Buffer.from(expectedHash, "hex");
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
