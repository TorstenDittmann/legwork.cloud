import type { NotificationChannelKind } from "@legwork/contracts";

export class NotificationDestinationError extends Error {}

export interface ParsedDestination {
	destination: string;
	hint: string;
}

/**
 * Exact hosts, never suffixes: `hooks.slack.com.evil.com` ends with the Slack host but is
 * controlled by someone else.
 */
const webhookRules = {
	slack: { hosts: ["hooks.slack.com"], pathPrefix: "/services/" },
	discord: { hosts: ["discord.com", "discordapp.com"], pathPrefix: "/api/webhooks/" },
} as const;

function parseWebhook(kind: "slack" | "discord", raw: string): ParsedDestination {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new NotificationDestinationError(`A ${kind} webhook URL is required`);
	}
	const rule = webhookRules[kind];
	if (url.protocol !== "https:")
		throw new NotificationDestinationError(`A ${kind} webhook URL must use https`);
	if (!(rule.hosts as readonly string[]).includes(url.hostname.toLowerCase()))
		throw new NotificationDestinationError(
			`Unexpected host for a ${kind} webhook URL; expected ${rule.hosts.join(" or ")}`,
		);
	if (!url.pathname.startsWith(rule.pathPrefix))
		throw new NotificationDestinationError(
			`Unexpected path for a ${kind} webhook URL; expected it to start with ${rule.pathPrefix}`,
		);
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments.length < 2)
		throw new NotificationDestinationError(`Unexpected path for a ${kind} webhook URL`);
	// Drop the trailing secret segment so the stored hint is safe to render.
	return {
		destination: `${url.origin}${url.pathname}`,
		hint: `${url.hostname}/${segments.slice(0, -1).join("/")}/…`,
	};
}

const addressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Control characters would let a recipient smuggle additional mail headers.
const controlCharacters = /[\u0000-\u001f\u007f]/;

function parseEmail(raw: string): ParsedDestination {
	const address = raw.trim();
	if (controlCharacters.test(address) || !addressPattern.test(address))
		throw new NotificationDestinationError("A valid email address is required");
	const [local = "", domain = ""] = address.split("@");
	return { destination: address, hint: `${local.slice(0, 1)}•••@${domain}` };
}

export function parseDestination(kind: NotificationChannelKind, raw: string): ParsedDestination {
	return kind === "email" ? parseEmail(raw) : parseWebhook(kind, raw);
}
