import { and, eq, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireTenant } from "@oncall-ai/auth";
import {
	createDatabase,
	repositories,
	serviceApiKeys,
	serviceRepositories,
	services,
	providerConnections,
	alertIntegrations,
	serviceProviderBindings,
} from "@oncall-ai/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceEditor } from "./service-editor";
import { PageHeader } from "@/components/ui/journal";
import { StatusMark } from "@/components/ui/status";
import { ProviderSetup } from "./provider-setup";

export default async function ServiceDetail({
	params,
}: {
	params: Promise<{ serviceId: string }>;
}) {
	const tenant = await requireTenant();
	const { serviceId } = await params;
	const db = createDatabase();
	const [[row], mappings, repositoryOptions, connections, alertRows, bindingRows] =
		await Promise.all([
			db
				.select({ service: services, keyPrefix: serviceApiKeys.prefix })
				.from(services)
				.leftJoin(
					serviceApiKeys,
					and(eq(serviceApiKeys.serviceId, services.id), eq(serviceApiKeys.active, true)),
				)
				.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
				.limit(1),
			db
				.select({
					repositoryId: serviceRepositories.repositoryId,
					role: serviceRepositories.role,
					fullName: repositories.fullName,
				})
				.from(serviceRepositories)
				.innerJoin(
					repositories,
					and(
						eq(repositories.id, serviceRepositories.repositoryId),
						eq(repositories.organizationId, tenant.organizationId),
					),
				)
				.where(
					and(
						eq(serviceRepositories.serviceId, serviceId),
						eq(serviceRepositories.organizationId, tenant.organizationId),
					),
				),
			db
				.select({ id: repositories.id, fullName: repositories.fullName })
				.from(repositories)
				.where(
					and(
						eq(repositories.organizationId, tenant.organizationId),
						eq(repositories.selected, true),
					),
				),
			db
				.select({
					id: providerConnections.id,
					name: providerConnections.name,
					provider: providerConnections.provider,
				})
				.from(providerConnections)
				.where(
					and(
						eq(providerConnections.organizationId, tenant.organizationId),
						eq(providerConnections.enabled, true),
						isNotNull(providerConnections.lastVerifiedAt),
					),
				),
			db
				.select()
				.from(alertIntegrations)
				.where(
					and(
						eq(alertIntegrations.organizationId, tenant.organizationId),
						eq(alertIntegrations.serviceId, serviceId),
					),
				),
			db
				.select({
					id: serviceProviderBindings.id,
					enabled: serviceProviderBindings.enabled,
					name: providerConnections.name,
					provider: providerConnections.provider,
				})
				.from(serviceProviderBindings)
				.innerJoin(
					providerConnections,
					eq(providerConnections.id, serviceProviderBindings.connectionId),
				)
				.where(
					and(
						eq(serviceProviderBindings.organizationId, tenant.organizationId),
						eq(serviceProviderBindings.serviceId, serviceId),
					),
				),
		]);
	if (!row) notFound();
	return (
		<>
			<PageHeader
				eyebrow="Service specification"
				title={row.service.name}
				description={`Stable endpoint /api/v1/services/${row.service.slug}/incidents`}
				actions={<StatusMark status={row.service.enabled ? "enabled" : "disabled"} />}
			/>
			<div className="mt-8 grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Ingestion</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm text-ink-muted">
						<p>
							Slug:{" "}
							<code translate="no" className="text-ink">
								{row.service.slug}
							</code>
						</p>
						<p>
							Active key:{" "}
							<code translate="no" className="text-ink">
								{row.keyPrefix}…
							</code>
						</p>
						<p>
							The stable slug cannot be edited. The full key is only revealed on creation or
							rotation.
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Repositories</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm text-ink-muted">
						{mappings.map((mapping) => (
							<p key={mapping.repositoryId}>
								<Badge>{mapping.role}</Badge> <span className="ml-2">{mapping.fullName}</span>
							</p>
						))}
					</CardContent>
				</Card>
			</div>
			{tenant.role === "admin" && (
				<Card className="mt-6">
					<CardHeader>
						<CardTitle>Provider integrations</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="mb-5 grid gap-2 text-sm text-ink-muted">
							{alertRows.map((integration) => (
								<p key={integration.id}>
									{integration.name} · {integration.provider} webhook ·{" "}
									{integration.lastReceivedAt
										? `last received ${integration.lastReceivedAt.toLocaleString()}`
										: "waiting for first delivery"}
								</p>
							))}
							{bindingRows.map((binding) => (
								<p key={binding.id}>
									{binding.name} · {binding.provider} context ·{" "}
									{binding.enabled ? "enabled" : "disabled"}
								</p>
							))}
						</div>
						<ProviderSetup serviceId={serviceId} connections={connections} />
					</CardContent>
				</Card>
			)}
			{tenant.role === "admin" && (
				<Card className="mt-6">
					<CardHeader>
						<CardTitle>Edit service</CardTitle>
					</CardHeader>
					<CardContent>
						<ServiceEditor
							serviceId={serviceId}
							name={row.service.name}
							callbackUrl={row.service.callbackUrl}
							enabled={row.service.enabled}
							repositories={repositoryOptions}
							mappings={mappings}
						/>
					</CardContent>
				</Card>
			)}
		</>
	);
}
