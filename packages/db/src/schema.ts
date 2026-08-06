import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { CreateIncidentRequest, Diagnosis, RunStatus } from "@oncall-ai/contracts";

const id = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
	integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date());
const updatedAt = () =>
	integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date());
const expiresAt = () => integer("expires_at", { mode: "timestamp" }).notNull();
const runStatuses = [
	"queued",
	"provisioning",
	"analyzing",
	"completed",
	"inconclusive",
	"failed",
	"cancelled",
] as const satisfies readonly [RunStatus, ...RunStatus[]];

export const organizations = sqliteTable("organizations", {
	id: id(),
	workosOrganizationId: text("workos_organization_id").notNull().unique(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	betaAllowlisted: integer("beta_allowlisted", { mode: "boolean" }).notNull().default(false),
	monthlyAnalysisQuota: integer("monthly_analysis_quota").notNull().default(50),
	monthlyTokenQuota: integer("monthly_token_quota").notNull().default(5_000_000),
	maxConcurrentRuns: integer("max_concurrent_runs").notNull().default(2),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

const tenantId = () =>
	text("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" });

export const githubInstallations = sqliteTable(
	"github_installations",
	{
		id: id(),
		organizationId: tenantId(),
		installationId: integer("installation_id").notNull().unique(),
		accountLogin: text("account_login").notNull(),
		accountId: integer("account_id").notNull(),
		suspendedAt: integer("suspended_at", { mode: "timestamp" }),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index("github_installations_org_idx").on(table.organizationId)],
);

export const repositories = sqliteTable(
	"repositories",
	{
		id: id(),
		organizationId: tenantId(),
		githubInstallationId: text("github_installation_id")
			.notNull()
			.references(() => githubInstallations.id, { onDelete: "cascade" }),
		githubRepositoryId: integer("github_repository_id").notNull().unique(),
		owner: text("owner").notNull(),
		name: text("name").notNull(),
		fullName: text("full_name").notNull(),
		defaultBranch: text("default_branch").notNull(),
		selected: integer("selected", { mode: "boolean" }).notNull().default(false),
		archived: integer("archived", { mode: "boolean" }).notNull().default(false),
		removedAt: integer("removed_at", { mode: "timestamp" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("repositories_org_idx").on(table.organizationId),
		uniqueIndex("repositories_installation_repo_idx").on(
			table.githubInstallationId,
			table.githubRepositoryId,
		),
	],
);

export const services = sqliteTable(
	"services",
	{
		id: id(),
		organizationId: tenantId(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		callbackUrl: text("callback_url"),
		callbackSecretCiphertext: text("callback_secret_ciphertext"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [uniqueIndex("services_org_slug_idx").on(table.organizationId, table.slug)],
);

export const serviceRepositories = sqliteTable(
	"service_repositories",
	{
		organizationId: tenantId(),
		serviceId: text("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "cascade" }),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "restrict" }),
		role: text("role", { enum: ["primary", "related"] }).notNull(),
		position: integer("position").notNull().default(0),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({ columns: [table.serviceId, table.repositoryId] }),
		uniqueIndex("service_primary_repository_idx")
			.on(table.serviceId)
			.where(sql`${table.role} = 'primary'`),
		uniqueIndex("service_repository_position_idx").on(table.serviceId, table.role, table.position),
	],
);

export const serviceApiKeys = sqliteTable(
	"service_api_keys",
	{
		id: id(),
		organizationId: tenantId(),
		serviceId: text("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "cascade" }),
		prefix: text("prefix").notNull(),
		keyHash: text("key_hash").notNull().unique(),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
		createdAt: createdAt(),
		revokedAt: integer("revoked_at", { mode: "timestamp" }),
	},
	(table) => [
		index("service_api_keys_prefix_idx").on(table.prefix),
		uniqueIndex("one_active_service_key_idx")
			.on(table.serviceId)
			.where(sql`${table.active} = 1`),
	],
);

export const serviceRateLimits = sqliteTable(
	"service_rate_limits",
	{
		organizationId: tenantId(),
		serviceId: text("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "cascade" }),
		windowStartedAt: integer("window_started_at", { mode: "timestamp" }).notNull(),
		requests: integer("requests").notNull().default(1),
	},
	(table) => [
		primaryKey({ columns: [table.serviceId, table.windowStartedAt] }),
		index("service_rate_limits_expiry_idx").on(table.windowStartedAt),
	],
);

export const incidents = sqliteTable(
	"incidents",
	{
		id: id(),
		organizationId: tenantId(),
		serviceId: text("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "restrict" }),
		externalId: text("external_id").notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		title: text("title").notNull(),
		severity: text("severity", {
			enum: ["critical", "high", "medium", "low", "unknown"],
		}).notNull(),
		occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
		payload: text("payload", { mode: "json" }).$type<CreateIncidentRequest>().notNull(),
		expiresAt: expiresAt(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("incidents_service_idempotency_idx").on(table.serviceId, table.idempotencyKey),
		index("incidents_org_date_idx").on(table.organizationId, table.createdAt),
		index("incidents_expiry_idx").on(table.expiresAt),
	],
);

export interface ResolvedRevision {
	repositoryId: string;
	githubRepositoryId: number;
	sha: string;
	role: "primary" | "related";
}
export const analysisRuns = sqliteTable(
	"analysis_runs",
	{
		id: id(),
		organizationId: tenantId(),
		incidentId: text("incident_id")
			.notNull()
			.references(() => incidents.id, { onDelete: "cascade" }),
		retryOfRunId: text("retry_of_run_id"),
		status: text("status", { enum: runStatuses }).notNull().default("queued"),
		attempt: integer("attempt").notNull().default(0),
		resolvedRevisions: text("resolved_revisions", { mode: "json" }).$type<ResolvedRevision[]>(),
		sandboxId: text("sandbox_id"),
		failureCode: text("failure_code"),
		failureMessage: text("failure_message"),
		inputTokens: integer("input_tokens").notNull().default(0),
		outputTokens: integer("output_tokens").notNull().default(0),
		startedAt: integer("started_at", { mode: "timestamp" }),
		completedAt: integer("completed_at", { mode: "timestamp" }),
		expiresAt: expiresAt(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("analysis_runs_org_status_idx").on(table.organizationId, table.status),
		index("analysis_runs_expiry_idx").on(table.expiresAt),
	],
);

export const agentSteps = sqliteTable(
	"agent_steps",
	{
		id: id(),
		organizationId: tenantId(),
		runId: text("run_id")
			.notNull()
			.references(() => analysisRuns.id, { onDelete: "cascade" }),
		sequence: integer("sequence").notNull(),
		kind: text("kind").notNull(),
		summary: text("summary").notNull(),
		toolName: text("tool_name"),
		durationMs: integer("duration_ms"),
		createdAt: createdAt(),
		expiresAt: expiresAt(),
	},
	(table) => [uniqueIndex("agent_steps_run_sequence_idx").on(table.runId, table.sequence)],
);

export const diagnoses = sqliteTable("diagnoses", {
	id: id(),
	organizationId: tenantId(),
	runId: text("run_id")
		.notNull()
		.references(() => analysisRuns.id, { onDelete: "cascade" })
		.unique(),
	diagnosis: text("diagnosis", { mode: "json" }).$type<Diagnosis>().notNull(),
	createdAt: createdAt(),
	expiresAt: expiresAt(),
});

export const usageEvents = sqliteTable(
	"usage_events",
	{
		id: id(),
		organizationId: tenantId(),
		runId: text("run_id").references(() => analysisRuns.id, { onDelete: "set null" }),
		kind: text("kind").notNull(),
		analyses: integer("analyses").notNull().default(0),
		reservedTokens: integer("reserved_tokens").notNull().default(0),
		actualInputTokens: integer("actual_input_tokens").notNull().default(0),
		actualOutputTokens: integer("actual_output_tokens").notNull().default(0),
		periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
		createdAt: createdAt(),
	},
	(table) => [index("usage_events_org_period_idx").on(table.organizationId, table.periodStart)],
);

export const callbackDeliveries = sqliteTable(
	"callback_deliveries",
	{
		id: id(),
		organizationId: tenantId(),
		runId: text("run_id")
			.notNull()
			.references(() => analysisRuns.id, { onDelete: "cascade" }),
		event: text("event").notNull(),
		status: text("status", { enum: ["pending", "delivered", "retrying", "permanently_failed"] })
			.notNull()
			.default("pending"),
		attempt: integer("attempt").notNull().default(0),
		responseStatus: integer("response_status"),
		error: text("error"),
		nextAttemptAt: integer("next_attempt_at", { mode: "timestamp" }),
		deliveredAt: integer("delivered_at", { mode: "timestamp" }),
		expiresAt: expiresAt(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [index("callback_deliveries_pending_idx").on(table.status, table.nextAttemptAt)],
);

export const auditEvents = sqliteTable(
	"audit_events",
	{
		id: id(),
		organizationId: tenantId(),
		actorId: text("actor_id"),
		action: text("action").notNull(),
		targetType: text("target_type").notNull(),
		targetId: text("target_id"),
		metadata: text("metadata", { mode: "json" })
			.$type<Record<string, string | number | boolean | null>>()
			.notNull()
			.$defaultFn(() => ({})),
		createdAt: createdAt(),
	},
	(table) => [index("audit_events_org_date_idx").on(table.organizationId, table.createdAt)],
);

export const durableJobs = sqliteTable(
	"durable_jobs",
	{
		id: id(),
		name: text("name").notNull(),
		data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
		status: text("status", { enum: ["queued", "active", "completed", "failed"] })
			.notNull()
			.default("queued"),
		singletonKey: text("singleton_key"),
		attempts: integer("attempts").notNull().default(0),
		maxAttempts: integer("max_attempts").notNull().default(1),
		availableAt: integer("available_at", { mode: "timestamp" }).notNull(),
		leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp" }),
		leaseOwner: text("lease_owner"),
		lastError: text("last_error"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("durable_jobs_singleton_idx")
			.on(table.name, table.singletonKey)
			.where(sql`${table.status} in ('queued', 'active')`),
		index("durable_jobs_claim_idx").on(table.name, table.status, table.availableAt),
	],
);

export const incidentRelations = relations(incidents, ({ one, many }) => ({
	service: one(services, { fields: [incidents.serviceId], references: [services.id] }),
	runs: many(analysisRuns),
}));
export const runRelations = relations(analysisRuns, ({ one, many }) => ({
	incident: one(incidents, { fields: [analysisRuns.incidentId], references: [incidents.id] }),
	steps: many(agentSteps),
	diagnosis: one(diagnoses),
}));
