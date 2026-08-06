import { NextResponse } from "next/server";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, createRetryRun, QuotaExceededError } from "@oncall-ai/db";
import { HttpProblem, problemResponse, readLimitedJson } from "@/lib/http";
import { z } from "zod";

export async function POST(request: Request, context: { params: Promise<{ incidentId: string }> }) {
	try {
		const tenant = await requireTenant();
		const { incidentId } = await context.params;
		const body = z
			.object({ runId: z.string().uuid() })
			.strict()
			.parse(await readLimitedJson(request, 4_096));
		const run = await createRetryRun(
			createDatabase(),
			tenant.organizationId,
			incidentId,
			body.runId,
		);
		return NextResponse.json({ runId: run.id, status: "queued" }, { status: 202 });
	} catch (error) {
		if (error instanceof QuotaExceededError)
			return problemResponse(new HttpProblem(429, "Quota Exceeded", error.message));
		return problemResponse(error);
	}
}
