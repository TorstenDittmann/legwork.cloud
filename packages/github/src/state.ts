import { createHmac, timingSafeEqual } from "node:crypto";

interface InstallationState {
	organizationId: string;
	expiresAt: number;
	nonce: string;
}

function signature(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createInstallationState(
	organizationId: string,
	secret: string,
	now = Date.now(),
): string {
	const value: InstallationState = {
		organizationId,
		expiresAt: now + 10 * 60_000,
		nonce: crypto.randomUUID(),
	};
	const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${payload}.${signature(payload, secret)}`;
}

export function verifyInstallationState(
	state: string,
	secret: string,
	now = Date.now(),
): InstallationState {
	const [payload, supplied] = state.split(".");
	if (!payload || !supplied) throw new Error("Invalid GitHub installation state");
	const expected = Buffer.from(signature(payload, secret));
	const actual = Buffer.from(supplied);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
		throw new Error("Invalid GitHub installation state");
	const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as InstallationState;
	if (!value.organizationId || value.expiresAt < now)
		throw new Error("Expired GitHub installation state");
	return value;
}
