import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireTenant } from "@oncall-ai/auth";
import { auditEvents, createDatabase, repositories } from "@oncall-ai/db";
import { HttpProblem, problemResponse, readLimitedJson } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ repositoryId: string }> }) {
  try {
    const tenant = await requireTenant("admin"); const { repositoryId } = await context.params; const body = z.object({ selected: z.boolean() }).strict().parse(await readLimitedJson(request, 2_048)); const db = createDatabase();
    const [repository] = await db.update(repositories).set({ selected: body.selected, updatedAt: new Date() }).where(and(eq(repositories.id, repositoryId), eq(repositories.organizationId, tenant.organizationId), isNull(repositories.removedAt))).returning();
    if (!repository) throw new HttpProblem(404, "Not Found", "Repository not found");
    await db.insert(auditEvents).values({ organizationId: tenant.organizationId, actorId: tenant.userId, action: body.selected ? "repository.selected" : "repository.unselected", targetType: "repository", targetId: repositoryId });
    return NextResponse.json(repository);
  } catch (error) { return problemResponse(error); }
}
