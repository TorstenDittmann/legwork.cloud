import { and, count, eq, inArray, sql } from "drizzle-orm";
import { runDiagnosisAgent, OpenRouterProvider, type SnapshotIndex } from "@oncall-ai/agent";
import type { SandboxHandle, SourceFile } from "@oncall-ai/contracts";
import {
  agentSteps, analysisRuns, createDatabase, diagnoses, githubInstallations, incidents, organizations,
  reconcileUsage, repositories, serviceRepositories, services,
} from "@oncall-ai/db";
import { GitHubSourceProvider, type RepositoryDescriptor } from "@oncall-ai/github";
import { activeSandboxes, analysisDuration, destroyedSandboxes, logger } from "@oncall-ai/observability";
import { RailwaySandboxProvider } from "@oncall-ai/sandbox";
import { createArchiveBudget, extractValidatedTarGz, redactSecrets } from "@oncall-ai/security";

export interface AnalyzeDependencies {
  githubAppId: string; githubPrivateKey: string; openRouterApiKey: string; model: string;
  commandExecutionEnabled: boolean; capabilityProbePassed: boolean;
}

const terminalStatuses = ["completed", "inconclusive", "failed", "cancelled"] as const;
export class OrganizationConcurrencyDeferredError extends Error {}

export async function analyzeIncident(runId: string, dependencies: AnalyzeDependencies): Promise<void> {
  const db = createDatabase();
  const started = Date.now();
  const [record] = await db.select({ run: analysisRuns, incident: incidents, service: services })
    .from(analysisRuns)
    .innerJoin(incidents, and(eq(incidents.id, analysisRuns.incidentId), eq(incidents.organizationId, analysisRuns.organizationId)))
    .innerJoin(services, and(eq(services.id, incidents.serviceId), eq(services.organizationId, analysisRuns.organizationId)))
    .where(eq(analysisRuns.id, runId)).limit(1);
  if (!record || terminalStatuses.includes(record.run.status as typeof terminalStatuses[number])) return;
  const tenantRecord = record;
  const sandboxProvider = new RailwaySandboxProvider({
    commandExecutionEnabled: dependencies.commandExecutionEnabled,
    capabilityProbePassed: dependencies.capabilityProbePassed,
  });
  if (tenantRecord.run.sandboxId) {
    await sandboxProvider.destroy({ id: tenantRecord.run.sandboxId, createdAt: tenantRecord.run.createdAt });
    await db.update(analysisRuns).set({ sandboxId: null, updatedAt: new Date() }).where(eq(analysisRuns.id, runId));
  }

  await db.transaction(async (tx) => {
    const [organization] = await tx.select().from(organizations).where(eq(organizations.id, tenantRecord.run.organizationId)).limit(1);
    if (!organization) throw new Error("Organization no longer exists");
    const [active] = await tx.select({ value: count() }).from(analysisRuns).where(and(
      eq(analysisRuns.organizationId, organization.id), inArray(analysisRuns.status, ["provisioning", "analyzing"]),
    ));
    if ((active?.value ?? 0) >= organization.maxConcurrentRuns) throw new OrganizationConcurrencyDeferredError("ORGANIZATION_CONCURRENCY_LIMIT");
    await tx.update(analysisRuns).set({ status: "provisioning", attempt: sql`${analysisRuns.attempt} + 1`, startedAt: new Date(), updatedAt: new Date() }).where(eq(analysisRuns.id, runId));
  }, { behavior: "immediate" });

  const connected = await db.select({
    repositoryId: repositories.id, githubRepositoryId: repositories.githubRepositoryId,
    installationId: githubInstallations.installationId, owner: repositories.owner, name: repositories.name,
    defaultBranch: repositories.defaultBranch, role: serviceRepositories.role,
  }).from(serviceRepositories)
    .innerJoin(repositories, and(eq(repositories.id, serviceRepositories.repositoryId), eq(repositories.organizationId, tenantRecord.run.organizationId)))
    .innerJoin(githubInstallations, and(eq(githubInstallations.id, repositories.githubInstallationId), eq(githubInstallations.organizationId, tenantRecord.run.organizationId)))
    .where(and(eq(serviceRepositories.serviceId, tenantRecord.service.id), eq(serviceRepositories.organizationId, tenantRecord.run.organizationId)));
  const primary = connected.find((repository) => repository.role === "primary");
  if (!primary || connected.length > 3) throw new Error("INVALID_SERVICE_REPOSITORY_MAPPING");
  if (connected.some((repository) => repository.installationId <= 0)) throw new Error("GITHUB_INSTALLATION_UNAVAILABLE");

  const descriptors: RepositoryDescriptor[] = connected.map((repository) => ({
    repositoryId: repository.repositoryId, githubRepositoryId: repository.githubRepositoryId,
    installationId: repository.installationId, owner: repository.owner, name: repository.name, defaultBranch: repository.defaultBranch,
  }));
  const source = new GitHubSourceProvider({ appId: dependencies.githubAppId, privateKey: dependencies.githubPrivateKey }, descriptors);
  const resolved = await Promise.all(connected.map(async (repository) => ({
    repositoryId: repository.repositoryId, githubRepositoryId: repository.githubRepositoryId, role: repository.role,
    sha: await source.resolveRevision(repository.repositoryId, repository.role === "primary" ? tenantRecord.incident.payload.primaryCommitSha : undefined),
  })));
  await db.update(analysisRuns).set({ resolvedRevisions: resolved, updatedAt: new Date() }).where(eq(analysisRuns.id, runId));

  let sandbox: SandboxHandle | undefined;
  let finalStatus: "completed" | "inconclusive" | "failed" = "failed";
  try {
    sandbox = await sandboxProvider.create({ runId, organizationId: tenantRecord.run.organizationId, repositories: resolved });
    activeSandboxes.inc();
    await db.update(analysisRuns).set({ sandboxId: sandbox.id, updatedAt: new Date() }).where(eq(analysisRuns.id, runId));
    const archiveBudget = createArchiveBudget();
    async function* files(): AsyncGenerator<SourceFile> {
      for (const revision of resolved) {
        const archive = await source.streamArchive(revision.repositoryId, revision.sha);
        yield* extractValidatedTarGz(archive, `repositories/${revision.repositoryId}`, undefined, archiveBudget);
      }
      yield { path: "incident.json", content: Buffer.from(JSON.stringify(redactSecrets(tenantRecord.incident.payload), null, 2)) };
    }
    await sandboxProvider.upload(sandbox, files());
    await db.update(analysisRuns).set({ status: "analyzing", updatedAt: new Date() }).where(eq(analysisRuns.id, runId));

    const snapshot: SnapshotIndex = {
      hasRepository: (repositoryId) => resolved.some((revision) => revision.repositoryId === repositoryId),
      readLines: async (repositoryId, path, startLine, endLine) => {
        if (!sandbox) return null;
        const result = await sandboxProvider.inspect(sandbox, { name: "read_file", repositoryId, path, start: startLine, end: endLine });
        return result.status === "ok" ? result.output : null;
      },
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("ANALYSIS_TIMEOUT")), 10 * 60_000);
    const model = new OpenRouterProvider(dependencies.openRouterApiKey, dependencies.model);
    let result;
    try {
      result = await runDiagnosisAgent(model, {
        incident: redactSecrets(tenantRecord.incident.payload), repositories: resolved, sandbox,
        sandboxProvider, snapshot, signal: controller.signal,
        onActivity: async (activity) => {
          await db.insert(agentSteps).values({
            organizationId: tenantRecord.run.organizationId, runId, sequence: activity.sequence, kind: activity.kind,
            summary: activity.summary, toolName: activity.toolName, durationMs: activity.durationMs, expiresAt: tenantRecord.run.expiresAt,
          });
        },
      });
    } finally { clearTimeout(timeout); }
    finalStatus = result.diagnosis.status === "diagnosed" ? "completed" : "inconclusive";
    await db.transaction(async (tx) => {
      await tx.insert(diagnoses).values({ organizationId: tenantRecord.run.organizationId, runId, diagnosis: result.diagnosis, expiresAt: tenantRecord.run.expiresAt });
      await tx.update(analysisRuns).set({ status: finalStatus, completedAt: new Date(), updatedAt: new Date() }).where(eq(analysisRuns.id, runId));
    });
    await reconcileUsage(db, tenantRecord.run.organizationId, runId, result.inputTokens, result.outputTokens);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "ANALYSIS_FAILED";
    await db.update(analysisRuns).set({ status: "failed", failureCode: code, failureMessage: error instanceof Error ? error.message.slice(0, 2_000) : "Analysis failed", completedAt: new Date(), updatedAt: new Date() }).where(eq(analysisRuns.id, runId));
    logger.error({ runId, organizationId: tenantRecord.run.organizationId, err: error }, "analysis failed");
    throw error;
  } finally {
    if (sandbox) {
      try { await sandboxProvider.destroy(sandbox); await db.update(analysisRuns).set({ sandboxId: null, updatedAt: new Date() }).where(eq(analysisRuns.id, runId)); destroyedSandboxes.inc({ reason: "analysis_finally" }); }
      catch (error) { logger.error({ runId, sandboxId: sandbox.id, err: error }, "sandbox destruction failed; janitor will retry"); }
      finally { activeSandboxes.dec(); }
    }
    analysisDuration.observe({ status: finalStatus }, (Date.now() - started) / 1_000);
  }
}
