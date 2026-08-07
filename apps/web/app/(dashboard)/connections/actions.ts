"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, providerConnections } from "@oncall-ai/db";
import { assertSafeProviderUrl, investigationContextProviders } from "@oncall-ai/integrations";
import { decryptSecret, encryptSecret } from "@oncall-ai/security";

function key() {
	const value = process.env.DATA_ENCRYPTION_KEY;
	if (!value) throw new Error("DATA_ENCRYPTION_KEY is required");
	return value;
}
async function admin() {
	const tenant = await requireTenant();
	if (tenant.role !== "admin") throw new Error("Administrator access required");
	return tenant;
}
const inputSchema = z
	.object({
		provider: z.enum(["grafana", "sentry"]),
		mode: z.enum(["grafana_cloud", "grafana_http", "sentry_cloud", "sentry_http"]),
		name: z.string().trim().min(1).max(128),
		baseUrl: z.string().url(),
		token: z.string().min(1).max(16_384),
		organizationSlug: z.string().max(128).optional(),
		projectSlug: z.string().max(128).optional(),
		logsUid: z.string().max(128).optional(),
		metricsUid: z.string().max(128).optional(),
		tracesUid: z.string().max(128).optional(),
	})
	.refine((value) => value.mode.startsWith(value.provider), {
		message: "Provider and mode must match",
		path: ["mode"],
	})
	.refine(
		(value) => value.provider !== "sentry" || Boolean(value.organizationSlug && value.projectSlug),
		{ message: "Sentry organization and project slugs are required", path: ["organizationSlug"] },
	);
export async function createConnection(formData: FormData) {
	const tenant = await admin();
	const data = inputSchema.parse(Object.fromEntries(formData));
	await assertSafeProviderUrl(data.baseUrl);
	const id = crypto.randomUUID();
	const config =
		data.provider === "grafana"
			? {
					provider: "grafana" as const,
					mode:
						data.mode === "grafana_cloud" ? ("grafana_cloud" as const) : ("grafana_http" as const),
					grafanaUrl: data.baseUrl,
					...(data.logsUid ? { logs: { uid: data.logsUid, type: "loki" as const } } : {}),
					...(data.metricsUid
						? { metrics: { uid: data.metricsUid, type: "prometheus" as const } }
						: {}),
					...(data.tracesUid ? { traces: { uid: data.tracesUid, type: "tempo" as const } } : {}),
				}
			: {
					provider: "sentry" as const,
					mode: data.mode === "sentry_cloud" ? ("sentry_cloud" as const) : ("sentry_http" as const),
					sentryUrl: data.baseUrl,
					organizationSlug: data.organizationSlug ?? "",
					projectSlug: data.projectSlug ?? "",
				};
	const credential =
		data.provider === "sentry"
			? { provider: "sentry" as const, apiToken: data.token }
			: data.mode === "grafana_cloud"
				? {
						provider: "grafana" as const,
						mode: "grafana_cloud" as const,
						accessPolicyToken: data.token,
					}
				: {
						provider: "grafana" as const,
						mode: "grafana_http" as const,
						serviceAccountToken: data.token,
					};
	const capabilities =
		data.provider === "sentry"
			? (["issues", "events", "releases"] as const)
			: ([data.logsUid && "logs", data.metricsUid && "metrics", data.tracesUid && "traces"].filter(
					Boolean,
				) as Array<"logs" | "metrics" | "traces">);
	await createDatabase()
		.insert(providerConnections)
		.values({
			id,
			organizationId: tenant.organizationId,
			provider: data.provider,
			name: data.name,
			mode: data.mode,
			baseUrl: data.baseUrl,
			config,
			credentialsCiphertext: encryptSecret(
				JSON.stringify(credential),
				key(),
				`provider-connection:${id}:credentials`,
			),
			capabilities: [...capabilities],
		});
	revalidatePath("/connections");
}
export async function testConnection(formData: FormData) {
	const tenant = await admin();
	const id = String(formData.get("id"));
	const db = createDatabase();
	const [record] = await db
		.select()
		.from(providerConnections)
		.where(
			and(
				eq(providerConnections.id, id),
				eq(providerConnections.organizationId, tenant.organizationId),
			),
		)
		.limit(1);
	if (!record) throw new Error("Connection not found");
	const result = await investigationContextProviders[record.provider].testConnection({
		id: record.id,
		organizationId: record.organizationId,
		config: record.config,
		credential: JSON.parse(
			decryptSecret(
				record.credentialsCiphertext,
				key(),
				`provider-connection:${record.id}:credentials`,
			),
		),
		capabilities: record.capabilities,
	});
	await db
		.update(providerConnections)
		.set({
			lastVerifiedAt: result.ok ? new Date() : null,
			lastVerificationError: result.errorCode ?? null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(providerConnections.id, id),
				eq(providerConnections.organizationId, tenant.organizationId),
			),
		);
	revalidatePath("/connections");
}
export async function toggleConnection(formData: FormData) {
	const tenant = await admin();
	const id = String(formData.get("id"));
	const enabled = formData.get("enabled") === "true";
	await createDatabase()
		.update(providerConnections)
		.set({ enabled, updatedAt: new Date() })
		.where(
			and(
				eq(providerConnections.id, id),
				eq(providerConnections.organizationId, tenant.organizationId),
			),
		);
	revalidatePath("/connections");
}
