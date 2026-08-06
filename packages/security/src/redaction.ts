const SECRET_PATTERNS: Array<[RegExp, string]> = [
	[/\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]"],
	[/\b(?:sk|pk)-(?:live|test)-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_API_KEY]"],
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
