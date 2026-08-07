"use server";
import { and, eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import {
	alertIntegrations,
	createDatabase,
	providerConnections,
	serviceProviderBindings,
	services,
} from "@oncall-ai/db";
import { encryptSecret } from "@oncall-ai/security";

export interface IntegrationSetupState {
	secret?: string;
	webhookUrl?: string;
	error?: string;
}
function encryptionKey() {
	const value = process.env.DATA_ENCRYPTION_KEY;
	if (!value) throw new Error("DATA_ENCRYPTION_KEY is required");
	return value;
}
export async function createAlertIntegration(
	_state: IntegrationSetupState,
	formData: FormData,
): Promise<IntegrationSetupState> {
	try {
		const tenant = await requireTenant();
		if (tenant.role !== "admin") throw new Error("Administrator access required");
		const serviceId = String(formData.get("serviceId"));
		const provider = formData.get("provider");
		if (provider !== "grafana" && provider !== "sentry") throw new Error("Invalid provider");
		const db = createDatabase();
		const [service] = await db
			.select({ id: services.id })
			.from(services)
			.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
			.limit(1);
		if (!service) throw new Error("Service not found");
		const id = crypto.randomUUID();
		const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
		await db.insert(alertIntegrations).values({
			id,
			organizationId: tenant.organizationId,
			serviceId,
			provider,
			name: String(formData.get("name") || `${provider} alerts`).slice(0, 128),
			webhookSecretCiphertext: encryptSecret(
				secret,
				encryptionKey(),
				`alert-integration:${id}:webhook-secret`,
			),
		});
		const appUrl = process.env.APP_URL;
		if (!appUrl) throw new Error("APP_URL is required");
		return { secret, webhookUrl: `${appUrl}/api/v1/integrations/${id}/webhook` };
	} catch (error) {
		return { error: error instanceof Error ? error.message : "Could not create integration" };
	}
}
export async function bindProviderConnection(formData: FormData) {
	const tenant = await requireTenant();
	if (tenant.role !== "admin") throw new Error("Administrator access required");
	const serviceId = String(formData.get("serviceId"));
	const connectionId = String(formData.get("connectionId"));
	const db = createDatabase();
	const [connection] = await db
		.select()
		.from(providerConnections)
		.where(
			and(
				eq(providerConnections.id, connectionId),
				eq(providerConnections.organizationId, tenant.organizationId),
				eq(providerConnections.enabled, true),
			),
		)
		.limit(1);
	const [service] = await db
		.select()
		.from(services)
		.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
		.limit(1);
	if (!connection || !service) throw new Error("Connection or service not found");
	const existing = await db
		.select({ binding: serviceProviderBindings, connection: providerConnections })
		.from(serviceProviderBindings)
		.innerJoin(
			providerConnections,
			eq(providerConnections.id, serviceProviderBindings.connectionId),
		)
		.where(
			and(
				eq(serviceProviderBindings.serviceId, serviceId),
				eq(serviceProviderBindings.organizationId, tenant.organizationId),
				eq(providerConnections.provider, connection.provider),
				eq(serviceProviderBindings.enabled, true),
			),
		);
	for (const row of existing)
		await db
			.update(serviceProviderBindings)
			.set({ enabled: false, updatedAt: new Date() })
			.where(eq(serviceProviderBindings.id, row.binding.id));
	const policy =
		connection.provider === "grafana"
			? {
					enabledSignals: connection.capabilities,
					defaultWindowMinutes: 30,
					maxWindowMinutes: 120,
					logsLimit: 200,
					tracesLimit: 20,
					metricSeriesLimit: 20,
					metricPointLimit: 1000,
				}
			: {
					eventSelections: ["latest", "recommended", "oldest"],
					eventListLimit: 20,
					releaseCommits: connection.capabilities.includes("releases"),
					allowedEnvironments: [],
				};
	await db
		.insert(serviceProviderBindings)
		.values({
			organizationId: tenant.organizationId,
			serviceId,
			connectionId,
			enabled: true,
			queryPolicy: policy,
		})
		.onConflictDoUpdate({
			target: [serviceProviderBindings.serviceId, serviceProviderBindings.connectionId],
			set: { enabled: true, queryPolicy: policy, updatedAt: new Date() },
		});
}
