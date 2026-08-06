import type { Diagnosis } from "@oncall-ai/contracts";
import { assertRelativeRepositoryPath } from "@oncall-ai/security";

export interface SnapshotIndex {
  hasRepository(repositoryId: string): boolean;
  readLines(repositoryId: string, path: string, start: number, end: number): Promise<string | null>;
}

const normalize = (value: string) => value.replaceAll(/\s+/g, " ").trim();

export async function validateDiagnosisEvidence(diagnosis: Diagnosis, snapshot: SnapshotIndex): Promise<string[]> {
  const errors: string[] = [];
  for (const [index, evidence] of diagnosis.evidence.entries()) {
    if (!snapshot.hasRepository(evidence.repositoryId)) { errors.push(`evidence[${index}] repository is not connected`); continue; }
    if (!evidence.path) continue;
    try { assertRelativeRepositoryPath(evidence.path); } catch { errors.push(`evidence[${index}] path escapes repository`); continue; }
    if (!evidence.lineStart || !evidence.lineEnd || evidence.lineEnd - evidence.lineStart > 500) { errors.push(`evidence[${index}] line range is invalid`); continue; }
    const actual = await snapshot.readLines(evidence.repositoryId, evidence.path, evidence.lineStart, evidence.lineEnd);
    if (actual === null) { errors.push(`evidence[${index}] path or line range does not exist`); continue; }
    const claimed = normalize(evidence.excerpt);
    const source = normalize(actual);
    if (claimed.length > 0 && !source.includes(claimed) && !claimed.includes(source)) errors.push(`evidence[${index}] excerpt does not match cited lines`);
  }
  return errors;
}
