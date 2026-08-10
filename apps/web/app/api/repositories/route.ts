import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, repositories } from "@oncall-ai/db";
import { problemResponse } from "@/lib/http";

export async function GET() {
	try {
		const tenant = await requireTenant();
		const rows = await createDatabase()
			.select({
				id: repositories.id,
				fullName: repositories.fullName,
				defaultBranch: repositories.defaultBranch,
				selected: repositories.selected,
				archived: repositories.archived,
				removedAt: repositories.removedAt,
			})
			.from(repositories)
			.where(eq(repositories.organizationId, tenant.organizationId));
		return NextResponse.json(
			rows.map((row) => ({
				...row,
				removedAt: row.removedAt?.toISOString() ?? null,
			})),
		);
	} catch (error) {
		return problemResponse(error);
	}
}
