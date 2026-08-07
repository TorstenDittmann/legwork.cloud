import path from "node:path";

export function assertRelativeRepositoryPath(value: string): string {
	if (value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value))
		throw new Error("Invalid repository path");
	const normalized = path.posix.normalize(value);
	if (normalized === ".." || normalized.startsWith("../"))
		throw new Error("Path escapes repository");
	return normalized.replace(/^\.\//, "");
}

export function resolveBeneath(root: string, value: string): string {
	const safe = assertRelativeRepositoryPath(value);
	const resolvedRoot = path.resolve(root);
	const resolved = path.resolve(resolvedRoot, safe);
	if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`))
		throw new Error("Path escapes repository");
	return resolved;
}
