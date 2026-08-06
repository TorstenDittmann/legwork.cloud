import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import {
	agentSteps,
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	diagnoses,
	incidents,
	services,
} from "@oncall-ai/db";
import { problemResponse } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ incidentId: string }> }) {
	try {
		const tenant = await requireTenant();
		const { incidentId } = await context.params;
		const db = createDatabase();
		const [incident] = await db
			.select({ incident: incidents, serviceName: services.name })
			.from(incidents)
			.innerJoin(
				services,
				and(
					eq(services.id, incidents.serviceId),
					eq(services.organizationId, tenant.organizationId),
				),
			)
			.where(and(eq(incidents.id, incidentId), eq(incidents.organizationId, tenant.organizationId)))
			.limit(1);
		if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });
		const runs = await db
			.select()
			.from(analysisRuns)
			.where(
				and(
					eq(analysisRuns.incidentId, incidentId),
					eq(analysisRuns.organizationId, tenant.organizationId),
				),
			)
			.orderBy(desc(analysisRuns.createdAt));
		const current = runs[0];
		const [steps, diagnosis, callbacks] = current
			? await Promise.all([
					db
						.select()
						.from(agentSteps)
						.where(
							and(
								eq(agentSteps.runId, current.id),
								eq(agentSteps.organizationId, tenant.organizationId),
							),
						)
						.orderBy(asc(agentSteps.sequence)),
					db
						.select()
						.from(diagnoses)
						.where(
							and(
								eq(diagnoses.runId, current.id),
								eq(diagnoses.organizationId, tenant.organizationId),
							),
						)
						.limit(1),
					db
						.select()
						.from(callbackDeliveries)
						.where(
							and(
								eq(callbackDeliveries.runId, current.id),
								eq(callbackDeliveries.organizationId, tenant.organizationId),
							),
						)
						.orderBy(desc(callbackDeliveries.createdAt)),
				])
			: [[], [], []];
		return NextResponse.json({
			...incident,
			runs,
			currentRun: current ?? null,
			steps,
			diagnosis: diagnosis[0]?.diagnosis ?? null,
			callbacks,
		});
	} catch (error) {
		return problemResponse(error);
	}
}
