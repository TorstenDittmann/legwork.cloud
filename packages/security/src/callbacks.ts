import { createHmac, timingSafeEqual } from "node:crypto";
import { promises as dns } from "node:dns";
import ipaddr from "ipaddr.js";

export function signCallback(timestamp: number, rawBody: string, secret: string): string {
	return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export function verifyCallbackSignature(
	timestamp: number,
	rawBody: string,
	secret: string,
	signature: string,
): boolean {
	const expected = Buffer.from(signCallback(timestamp, rawBody, secret));
	const actual = Buffer.from(signature);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface ResolvedCallbackUrl {
	url: URL;
	addresses: string[];
}

export function isPublicAddress(address: string): boolean {
	try {
		const parsed = ipaddr.process(address);
		return parsed.range() === "unicast";
	} catch {
		return false;
	}
}

export async function resolveSafeCallbackUrl(rawUrl: string): Promise<ResolvedCallbackUrl> {
	const url = new URL(rawUrl);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		(url.port && url.port !== "443")
	) {
		throw new Error("Callback URL must be credential-free HTTPS on port 443");
	}
	const answers = await dns.lookup(url.hostname, { all: true, verbatim: true });
	if (answers.length === 0 || answers.some((answer) => !isPublicAddress(answer.address))) {
		throw new Error("Callback host resolves to a forbidden network");
	}
	return { url, addresses: [...new Set(answers.map((answer) => answer.address))] };
}
