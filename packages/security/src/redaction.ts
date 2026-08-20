const SECRET_PATTERNS: Array<[RegExp, string]> = [
	// Incoming webhook URLs are unscoped bearer credentials; match before the
	// generic patterns so the whole URL is replaced.
	[/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g, "[REDACTED_WEBHOOK_URL]"],
	[
		/https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
		"[REDACTED_WEBHOOK_URL]",
	],
	[/\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]"],
	// Dash-delimited provider keys: OpenAI (sk-..., sk-proj-...), OpenRouter
	// (sk-or-v1-...), Anthropic (sk-ant-...), and the older sk-live-/pk-live- shapes.
	[/\b(?:sk|pk)-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_API_KEY]"],
	// Underscore-delimited provider keys: Stripe-style sk_live_/pk_test_/rk_live_.
	[/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b/g, "[REDACTED_API_KEY]"],
	// Resend API keys.
	[/\bre_[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_API_KEY]"],
	// Legwork's own service API keys.
	[/\bocai_live_[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_API_KEY]"],
	// Slack workspace/bot/user/app tokens.
	[/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED_SLACK_TOKEN]"],
	// AWS access key ids.
	[/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY_ID]"],
	// Bare JWTs (for example libSQL auth tokens pasted into logs).
	[/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
	[/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]"],
	[
		/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
		"[REDACTED_PRIVATE_KEY]",
	],
	[
		/(["']?(?:password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
		"$1[REDACTED]",
	],
];

export function redactSecrets<T>(input: T): T {
	const visit = (value: unknown): unknown => {
		if (typeof value === "string")
			return SECRET_PATTERNS.reduce(
				(text, [pattern, replacement]) => text.replace(pattern, replacement),
				value,
			);
		if (Array.isArray(value)) return value.map(visit);
		if (value && typeof value === "object")
			return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
		return value;
	};
	return visit(input) as T;
}
