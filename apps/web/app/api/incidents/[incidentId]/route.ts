import { NextResponse } from "next/server";
import { requireTenant } from "@oncall-ai/auth";
import { problemResponse } from "@/lib/http";
import { loadIncident } from "@/lib/incidents";

export async function GET(_request: Request, context: { params: Promise<{ incidentId: string }> }) {
	try {
		const tenant = await requireTenant();
		const { incidentId } = await context.params;
		const incident = await loadIncident(tenant.organizationId, incidentId);
		if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });
		return NextResponse.json(incident);
	} catch (error) {
		return problemResponse(error);
	}
}
