import type { Diagnosis } from "@legwork/contracts";
import { assertRelativeRepositoryPath } from "@legwork/security";

export interface SnapshotIndex {
	hasRepository(repositoryId: string): boolean;
	readLines(repositoryId: string, path: string, start: number, end: number): Promise<string | null>;
	readProvider?(evidence: {
		provider: string;
		operation: string;
		locator: Record<string, string | number | boolean>;
		query?: string | undefined;
		windowStart?: string | undefined;
		windowEnd?: string | undefined;
	}): string | null;
}

const normalize = (value: string) => value.replaceAll(/\s+/g, " ").trim();
const normalizeLocator = (value: Record<string, string | number | boolean>) =>
	JSON.stringify(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));

export function providerLocatorsMatch(
	left: Record<string, string | number | boolean>,
	right: Record<string, string | number | boolean>,
) {
	return normalizeLocator(left) === normalizeLocator(right);
}

function stripLineNumbers(value: string): string {
	return value
		.split("\n")
		.map((line) => line.replace(/^\d+:\s?/, ""))
		.join("\n");
}

export async function hydrateDiagnosisEvidence(
	diagnosis: Diagnosis,
	snapshot: SnapshotIndex,
): Promise<Diagnosis> {
	const evidence = await Promise.all(
		diagnosis.evidence.map(async (item) => {
			if (!("path" in item) || !snapshot.hasRepository(item.repositoryId)) return item;
			try {
				assertRelativeRepositoryPath(item.path);
			} catch {
				return item;
			}
			const actual = await snapshot.readLines(
				item.repositoryId,
				item.path,
				item.lineStart,
				item.lineEnd,
			);
			return actual === null ? item : { ...item, excerpt: stripLineNumbers(actual) };
		}),
	);
	return { ...diagnosis, evidence };
}

export async function validateDiagnosisEvidence(
	diagnosis: Diagnosis,
	snapshot: SnapshotIndex,
): Promise<string[]> {
	const errors: string[] = [];
	if (diagnosis.status === "diagnosed" && diagnosis.evidence.length === 0)
		errors.push("diagnosed results require at least one evidence citation");
	for (const [index, evidence] of diagnosis.evidence.entries()) {
		if ("provider" in evidence) {
			const actual = snapshot.readProvider?.(evidence);
			if (actual === null || actual === undefined)
				errors.push(`evidence[${index}] does not match a successful provider call`);
			else if (evidence.excerpt && !normalize(actual).includes(normalize(evidence.excerpt)))
				errors.push(`evidence[${index}] excerpt does not match normalized provider output`);
			continue;
		}
		if (!snapshot.hasRepository(evidence.repositoryId)) {
			errors.push(`evidence[${index}] repository is not connected`);
			continue;
		}
		if (!("path" in evidence)) continue;
		try {
			assertRelativeRepositoryPath(evidence.path);
		} catch {
			errors.push(`evidence[${index}] path escapes repository`);
			continue;
		}
		if (evidence.lineEnd - evidence.lineStart > 500) {
			errors.push(`evidence[${index}] line range is invalid`);
			continue;
		}
		const actual = await snapshot.readLines(
			evidence.repositoryId,
			evidence.path,
			evidence.lineStart,
			evidence.lineEnd,
		);
		if (actual === null) {
			errors.push(`evidence[${index}] path or line range does not exist`);
			continue;
		}
		const claimed = normalize(evidence.excerpt);
		const source = normalize(stripLineNumbers(actual));
		// The claimed excerpt must appear inside the cited lines; accepting the
		// reverse (claimed contains source) would let a fabricated excerpt pass by
		// padding the real source text.
		if (claimed.length > 0 && !source.includes(claimed))
			errors.push(`evidence[${index}] excerpt does not match cited lines`);
	}
	return errors;
}
