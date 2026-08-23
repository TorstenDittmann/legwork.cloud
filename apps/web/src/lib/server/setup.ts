import { and, count, desc, eq, isNull } from 'drizzle-orm';
import {
	createDatabase,
	diagnoses,
	githubInstallations,
	incidents,
	organizations,
	repositories,
	services
} from '@legwork/db';
import { deriveSetupProgress } from '$lib/setup';

export async function loadSetupProgress(organizationId: string) {
	const db = createDatabase();
	const [
		[installation],
		[repository],
		[selectedRepository],
		[service],
		[firstService],
		[incident],
		[latestIncident],
		[diagnosis],
		[organization]
	] = await Promise.all([
		db
			.select({ value: count() })
			.from(githubInstallations)
			.where(
				and(
					eq(githubInstallations.organizationId, organizationId),
					isNull(githubInstallations.suspendedAt),
					isNull(githubInstallations.deletedAt)
				)
			),
		db
			.select({ value: count() })
			.from(repositories)
			.where(and(eq(repositories.organizationId, organizationId), isNull(repositories.removedAt))),
		db
			.select({ value: count() })
			.from(repositories)
			.where(
				and(
					eq(repositories.organizationId, organizationId),
					eq(repositories.selected, true),
					isNull(repositories.removedAt)
				)
			),
		db
			.select({ value: count() })
			.from(services)
			.where(and(eq(services.organizationId, organizationId), eq(services.enabled, true))),
		db
			.select({ id: services.id })
			.from(services)
			.where(and(eq(services.organizationId, organizationId), eq(services.enabled, true)))
			.orderBy(services.createdAt)
			.limit(1),
		db
			.select({ value: count() })
			.from(incidents)
			.where(eq(incidents.organizationId, organizationId)),
		db
			.select({ id: incidents.id })
			.from(incidents)
			.where(eq(incidents.organizationId, organizationId))
			.orderBy(desc(incidents.createdAt), desc(incidents.id))
			.limit(1),
		db
			.select({ value: count() })
			.from(diagnoses)
			.where(eq(diagnoses.organizationId, organizationId)),
		db
			.select({ activatedAt: organizations.activatedAt })
			.from(organizations)
			.where(eq(organizations.id, organizationId))
			.limit(1)
	]);

	return deriveSetupProgress({
		installationCount: installation?.value ?? 0,
		repositoryCount: repository?.value ?? 0,
		selectedRepositoryCount: selectedRepository?.value ?? 0,
		serviceCount: service?.value ?? 0,
		firstServiceId: firstService?.id ?? null,
		incidentCount: incident?.value ?? 0,
		latestIncidentId: latestIncident?.id ?? null,
		diagnosisCount: diagnosis?.value ?? 0,
		activationRecorded: Boolean(organization?.activatedAt)
	});
}
