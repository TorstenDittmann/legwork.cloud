import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireTenant } from "@oncall-ai/auth";
import {
	auditEvents,
	createDatabase,
	repositories,
	serviceRepositories,
	services,
} from "@oncall-ai/db";
import { resolveSafeCallbackUrl } from "@oncall-ai/security";
import { HttpProblem, problemResponse, readLimitedJson } from "@/lib/http";

const updateServiceSchema = z
	.object({
		name: z.string().trim().min(1).max(255),
		primaryRepositoryId: z.string().uuid(),
		relatedRepositoryIds: z.array(z.string().uuid()).max(2).default([]),
		callbackUrl: z.union([z.string().url(), z.null()]),
		enabled: z.boolean(),
	})
	.strict()
	.refine(
		(value) =>
			!value.relatedRepositoryIds.includes(value.primaryRepositoryId) &&
			new Set(value.relatedRepositoryIds).size === value.relatedRepositoryIds.length,
		"Repositories must be unique",
	);

export async function PATCH(request: Request, context: { params: Promise<{ serviceId: string }> }) {
	try {
		const tenant = await requireTenant("admin");
		const { serviceId } = await context.params;
		const input = updateServiceSchema.parse(await readLimitedJson(request, 32_000));
		if (input.callbackUrl) await resolveSafeCallbackUrl(input.callbackUrl);
		const db = createDatabase();
		const repositoryIds = [input.primaryRepositoryId, ...input.relatedRepositoryIds];
		const approved = await db
			.select({ id: repositories.id })
			.from(repositories)
			.where(
				and(
					eq(repositories.organizationId, tenant.organizationId),
					eq(repositories.selected, true),
					inArray(repositories.id, repositoryIds),
				),
			);
		if (approved.length !== repositoryIds.length) {
			throw new HttpProblem(
				422,
				"Invalid Repository",
				"Every service repository must be selected and owned by the active organization",
			);
		}
		await db.transaction(
			async (tx) => {
				const [service] = await tx
					.select({ id: services.id })
					.from(services)
					.where(
						and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)),
					)
					.limit(1);
				if (!service) throw new HttpProblem(404, "Not Found", "Service not found");
				await tx
					.update(services)
					.set({
						name: input.name,
						enabled: input.enabled,
						callbackUrl: input.callbackUrl,
						updatedAt: new Date(),
					})
					.where(
						and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)),
					);
				await tx
					.delete(serviceRepositories)
					.where(
						and(
							eq(serviceRepositories.serviceId, serviceId),
							eq(serviceRepositories.organizationId, tenant.organizationId),
						),
					);
				await tx.insert(serviceRepositories).values([
					{
						organizationId: tenant.organizationId,
						serviceId,
						repositoryId: input.primaryRepositoryId,
						role: "primary",
						position: 0,
					},
					...input.relatedRepositoryIds.map((repositoryId, position) => ({
						organizationId: tenant.organizationId,
						serviceId,
						repositoryId,
						role: "related" as const,
						position,
					})),
				]);
				await tx.insert(auditEvents).values({
					organizationId: tenant.organizationId,
					actorId: tenant.userId,
					action: "service.updated",
					targetType: "service",
					targetId: serviceId,
					metadata: { enabled: input.enabled, callbackConfigured: Boolean(input.callbackUrl) },
				});
			},
			{ behavior: "immediate" },
		);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return problemResponse(error);
	}
}
