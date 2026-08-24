import { and, eq, gte, sql, sum } from "drizzle-orm";
import type { CreateIncidentRequest } from "@legwork/contracts";
import type { Database } from "./client";
import {
	analysisRuns,
	auditEvents,
	diagnoses,
	diagnosisFeedback,
	durableJobs,
	incidents,
	organizations,
	serviceRateLimits,
	usageEvents,
} from "./schema";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_TOKEN_RESERVATION = 100_000;

export class QuotaExceededError extends Error {}

const diagnosisFeedbackVerdicts = [
	"confirmed",
	"helpful",
	"incorrect",
	"still_investigating",
] as const;
export type DiagnosisFeedbackVerdict = (typeof diagnosisFeedbackVerdicts)[number];

function monthStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface CreateIncidentParams {
	organizationId: string;
	serviceId: string;
	idempotencyKey: string;
	payload: CreateIncidentRequest;
	now?: Date;
}

export async function createIncidentIdempotently(db: Database, params: CreateIncidentParams) {
	const now = params.now ?? new Date();
	const expiresAt = new Date(now.getTime() + RETENTION_MS);
	return db.transaction(
		async (tx) => {
			const [duplicate] = await tx
				.select({ incidentId: incidents.id, runId: analysisRuns.id })
				.from(incidents)
				.innerJoin(analysisRuns, eq(analysisRuns.incidentId, incidents.id))
				.where(
					and(
						eq(incidents.serviceId, params.serviceId),
						eq(incidents.idempotencyKey, params.idempotencyKey),
					),
				)
				.orderBy(analysisRuns.createdAt)
				.limit(1);
			if (duplicate) return { ...duplicate, duplicate: true as const };

			const [organization] = await tx
				.select()
				.from(organizations)
				.where(eq(organizations.id, params.organizationId))
				.limit(1);
			if (!organization) throw new Error("Organization not found");

			const [usage] = await tx
				.select({
					analyses: sum(usageEvents.analyses).mapWith(Number),
					tokens: sum(
						sql<number>`${usageEvents.reservedTokens} + ${usageEvents.actualInputTokens} + ${usageEvents.actualOutputTokens}`,
					).mapWith(Number),
				})
				.from(usageEvents)
				.where(
					and(
						eq(usageEvents.organizationId, params.organizationId),
						gte(usageEvents.createdAt, monthStart(now)),
					),
				);
			if ((usage?.analyses ?? 0) >= organization.monthlyAnalysisQuota)
				throw new QuotaExceededError("Monthly analysis quota exceeded");
			if ((usage?.tokens ?? 0) + DEFAULT_TOKEN_RESERVATION > organization.monthlyTokenQuota)
				throw new QuotaExceededError("Monthly model token quota exceeded");

			const [incident] = await tx
				.insert(incidents)
				.values({
					organizationId: params.organizationId,
					serviceId: params.serviceId,
					externalId: params.payload.externalId,
					idempotencyKey: params.idempotencyKey,
					title: params.payload.title,
					severity: params.payload.severity,
					occurredAt: new Date(params.payload.occurredAt),
					payload: params.payload,
					expiresAt,
				})
				.returning({ id: incidents.id });
			if (!incident) throw new Error("Failed to create incident");
			const [run] = await tx
				.insert(analysisRuns)
				.values({
					organizationId: params.organizationId,
					incidentId: incident.id,
					status: "queued",
					expiresAt,
				})
				.returning({ id: analysisRuns.id });
			if (!run) throw new Error("Failed to create run");
			await tx.insert(usageEvents).values({
				organizationId: params.organizationId,
				runId: run.id,
				kind: "reservation",
				analyses: 1,
				reservedTokens: DEFAULT_TOKEN_RESERVATION,
				periodStart: monthStart(now),
			});
			await tx.insert(durableJobs).values({
				name: "analyze-incident",
				data: { runId: run.id },
				singletonKey: run.id,
				maxAttempts: 3,
				availableAt: now,
			});
			return { incidentId: incident.id, runId: run.id, duplicate: false as const };
		},
		{ behavior: "immediate" },
	);
}

export async function consumeServiceRateLimit(
	db: Database,
	organizationId: string,
	serviceId: string,
	now = new Date(),
): Promise<boolean> {
	const windowStartedAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
	const [row] = await db
		.insert(serviceRateLimits)
		.values({ organizationId, serviceId, windowStartedAt, requests: 1 })
		.onConflictDoUpdate({
			target: [serviceRateLimits.serviceId, serviceRateLimits.windowStartedAt],
			set: { requests: sql`${serviceRateLimits.requests} + 1` },
		})
		.returning({ requests: serviceRateLimits.requests });
	return (row?.requests ?? 61) <= 60;
}

export async function reconcileUsage(
	db: Database,
	organizationId: string,
	runId: string,
	inputTokens: number,
	outputTokens: number,
) {
	await db.transaction(async (tx) => {
		await tx
			.update(usageEvents)
			.set({
				reservedTokens: 0,
				actualInputTokens: inputTokens,
				actualOutputTokens: outputTokens,
				kind: "actual",
			})
			.where(and(eq(usageEvents.organizationId, organizationId), eq(usageEvents.runId, runId)));
		await tx
			.update(analysisRuns)
			.set({ inputTokens, outputTokens, updatedAt: new Date() })
			.where(and(eq(analysisRuns.organizationId, organizationId), eq(analysisRuns.id, runId)));
	});
}

export async function createRetryRun(
	db: Database,
	organizationId: string,
	incidentId: string,
	retryOfRunId: string,
	now = new Date(),
) {
	return db.transaction(
		async (tx) => {
			const [organization] = await tx
				.select()
				.from(organizations)
				.where(eq(organizations.id, organizationId))
				.limit(1);
			if (!organization) throw new Error("Organization not found");
			const [original] = await tx
				.select({ status: analysisRuns.status, expiresAt: incidents.expiresAt })
				.from(analysisRuns)
				.innerJoin(
					incidents,
					and(
						eq(incidents.id, analysisRuns.incidentId),
						eq(incidents.organizationId, organizationId),
					),
				)
				.where(
					and(
						eq(analysisRuns.id, retryOfRunId),
						eq(analysisRuns.organizationId, organizationId),
						eq(incidents.id, incidentId),
					),
				)
				.limit(1);
			if (!original || !["completed", "failed", "inconclusive"].includes(original.status))
				throw new Error("Only terminal runs may be retried");
			const [usage] = await tx
				.select({
					analyses: sum(usageEvents.analyses).mapWith(Number),
					tokens: sum(
						sql<number>`${usageEvents.reservedTokens} + ${usageEvents.actualInputTokens} + ${usageEvents.actualOutputTokens}`,
					).mapWith(Number),
				})
				.from(usageEvents)
				.where(
					and(
						eq(usageEvents.organizationId, organizationId),
						gte(usageEvents.createdAt, monthStart(now)),
					),
				);
			if (
				(usage?.analyses ?? 0) >= organization.monthlyAnalysisQuota ||
				(usage?.tokens ?? 0) + DEFAULT_TOKEN_RESERVATION > organization.monthlyTokenQuota
			)
				throw new QuotaExceededError("Monthly quota exceeded");
			const [run] = await tx
				.insert(analysisRuns)
				.values({
					organizationId,
					incidentId,
					retryOfRunId,
					status: "queued",
					expiresAt: original.expiresAt,
				})
				.returning({ id: analysisRuns.id });
			if (!run) throw new Error("Failed to create retry run");
			await tx.insert(usageEvents).values({
				organizationId,
				runId: run.id,
				kind: "reservation",
				analyses: 1,
				reservedTokens: DEFAULT_TOKEN_RESERVATION,
				periodStart: monthStart(now),
			});
			await tx.insert(durableJobs).values({
				name: "analyze-incident",
				data: { runId: run.id },
				singletonKey: run.id,
				maxAttempts: 3,
				availableAt: now,
			});
			return run;
		},
		{ behavior: "immediate" },
	);
}

export interface SaveDiagnosisFeedbackParams {
	organizationId: string;
	incidentId: string;
	runId: string;
	verdict: DiagnosisFeedbackVerdict;
	note?: string;
	actorId: string;
}

export async function saveDiagnosisFeedback(db: Database, params: SaveDiagnosisFeedbackParams) {
	return db.transaction(async (tx) => {
		const [run] = await tx
			.select({ expiresAt: analysisRuns.expiresAt })
			.from(analysisRuns)
			.innerJoin(
				diagnoses,
				and(
					eq(diagnoses.runId, analysisRuns.id),
					eq(diagnoses.organizationId, params.organizationId),
				),
			)
			.where(
				and(
					eq(analysisRuns.id, params.runId),
					eq(analysisRuns.incidentId, params.incidentId),
					eq(analysisRuns.organizationId, params.organizationId),
				),
			)
			.limit(1);
		if (!run) throw new Error("Diagnosis not found");

		const note = params.note?.trim() || null;
		const [feedback] = await tx
			.insert(diagnosisFeedback)
			.values({
				organizationId: params.organizationId,
				runId: params.runId,
				verdict: params.verdict,
				note,
				submittedBy: params.actorId,
				expiresAt: run.expiresAt,
			})
			.onConflictDoUpdate({
				target: diagnosisFeedback.runId,
				set: {
					verdict: params.verdict,
					note,
					submittedBy: params.actorId,
					updatedAt: new Date(),
				},
			})
			.returning();
		if (!feedback) throw new Error("Failed to save diagnosis feedback");

		await tx.insert(auditEvents).values({
			organizationId: params.organizationId,
			actorId: params.actorId,
			action: "diagnosis.feedback_saved",
			targetType: "analysis_run",
			targetId: params.runId,
			metadata: { verdict: params.verdict, hasNote: Boolean(note) },
		});
		return feedback;
	});
}

export async function setIncidentResolution(
	db: Database,
	organizationId: string,
	incidentId: string,
	actorId: string,
	resolved: boolean,
) {
	return db.transaction(async (tx) => {
		const resolvedAt = resolved ? new Date() : null;
		const [incident] = await tx
			.update(incidents)
			.set({ resolvedAt, resolvedBy: resolved ? actorId : null, updatedAt: new Date() })
			.where(and(eq(incidents.id, incidentId), eq(incidents.organizationId, organizationId)))
			.returning({ id: incidents.id, resolvedAt: incidents.resolvedAt });
		if (!incident) throw new Error("Incident not found");

		await tx.insert(auditEvents).values({
			organizationId,
			actorId,
			action: resolved ? "incident.resolved" : "incident.reopened",
			targetType: "incident",
			targetId: incidentId,
		});
		return incident;
	});
}
