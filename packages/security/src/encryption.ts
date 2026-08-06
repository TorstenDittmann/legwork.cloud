import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function parseKey(encodedKey: string): Buffer {
	const key = Buffer.from(encodedKey, "base64");
	if (key.length !== 32)
		throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
	return key;
}

export function encryptSecret(plaintext: string, encodedKey: string, context: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", parseKey(encodedKey), iv);
	cipher.setAAD(Buffer.from(context));
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		VERSION,
		iv.toString("base64url"),
		tag.toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

export function decryptSecret(value: string, encodedKey: string, context: string): string {
	const [version, iv, tag, ciphertext] = value.split(".");
	if (version !== VERSION || !iv || !tag || !ciphertext)
		throw new Error("Invalid encrypted secret");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		parseKey(encodedKey),
		Buffer.from(iv, "base64url"),
	);
	decipher.setAAD(Buffer.from(context));
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
