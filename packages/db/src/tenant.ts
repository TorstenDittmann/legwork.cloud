import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import { analysisRuns, incidents, organizations, repositories, services } from "./schema";

export class TenantNotFoundError extends Error {}

export async function findOrganizationByWorkosId(db: Database, workosOrganizationId: string) {
	const [organization] = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.workosOrganizationId, workosOrganizationId))
		.limit(1);
	return organization;
}

export function tenantQueries(db: Database, organizationId: string) {
	return {
		async serviceBySlug(slug: string) {
			const [service] = await db
				.select()
				.from(services)
				.where(and(eq(services.organizationId, organizationId), eq(services.slug, slug)))
				.limit(1);
			if (!service) throw new TenantNotFoundError("Service not found");
			return service;
		},
		async incidentById(id: string) {
			const [incident] = await db
				.select()
				.from(incidents)
				.where(and(eq(incidents.organizationId, organizationId), eq(incidents.id, id)))
				.limit(1);
			if (!incident) throw new TenantNotFoundError("Incident not found");
			return incident;
		},
		async runById(id: string) {
			const [run] = await db
				.select()
				.from(analysisRuns)
				.where(and(eq(analysisRuns.organizationId, organizationId), eq(analysisRuns.id, id)))
				.limit(1);
			if (!run) throw new TenantNotFoundError("Run not found");
			return run;
		},
		async repositoryById(id: string) {
			const [repository] = await db
				.select()
				.from(repositories)
				.where(and(eq(repositories.organizationId, organizationId), eq(repositories.id, id)))
				.limit(1);
			if (!repository) throw new TenantNotFoundError("Repository not found");
			return repository;
		},
	};
}
