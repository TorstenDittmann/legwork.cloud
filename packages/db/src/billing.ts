import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { auditEvents, billingSubscriptions, billingWebhookEvents, organizations } from "./schema";

export type PaidBillingPlan = "team" | "scale";
export type BillingInterval = "month" | "year";
export type BillingSubscriptionStatus =
	| "pending"
	| "active"
	| "on_hold"
	| "paused"
	| "cancelled"
	| "failed"
	| "expired";

export interface BillingEntitlements {
	monthlyAnalysisQuota: number;
	monthlyTokenQuota: number;
	maxConcurrentRuns: number;
}

export interface BillingSubscriptionState {
	organizationId: string;
	plan: PaidBillingPlan;
	billingInterval: BillingInterval;
	status: BillingSubscriptionStatus;
	customerId: string;
	subscriptionId: string;
	productId: string;
	cancelAtPeriodEnd: boolean;
	currentPeriodEnd: Date | null;
	eventAt: Date;
	paidEntitlements: BillingEntitlements;
	freeEntitlements: BillingEntitlements;
}

export async function beginBillingWebhook(
	db: Database,
	input: { id: string; eventType: string; eventTimestamp: Date },
): Promise<"process" | "duplicate"> {
	const [created] = await db
		.insert(billingWebhookEvents)
		.values({
			id: input.id,
			eventType: input.eventType,
			eventTimestamp: input.eventTimestamp,
		})
		.onConflictDoNothing()
		.returning({ id: billingWebhookEvents.id });
	if (created) return "process";

	const [existing] = await db
		.select({ status: billingWebhookEvents.status })
		.from(billingWebhookEvents)
		.where(eq(billingWebhookEvents.id, input.id))
		.limit(1);
	if (existing?.status === "processed" || existing?.status === "ignored") return "duplicate";

	await db
		.update(billingWebhookEvents)
		.set({ status: "processing", error: null, updatedAt: new Date() })
		.where(eq(billingWebhookEvents.id, input.id));
	return "process";
}

export async function finishBillingWebhook(
	db: Database,
	id: string,
	result: { status: "processed" | "ignored"; organizationId?: string },
): Promise<void> {
	await db
		.update(billingWebhookEvents)
		.set({
			status: result.status,
			organizationId: result.organizationId,
			processedAt: new Date(),
			error: null,
			updatedAt: new Date(),
		})
		.where(eq(billingWebhookEvents.id, id));
}

export async function failBillingWebhook(db: Database, id: string, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : "Unknown billing webhook error";
	await db
		.update(billingWebhookEvents)
		.set({ status: "failed", error: message.slice(0, 2_000), updatedAt: new Date() })
		.where(eq(billingWebhookEvents.id, id));
}

export async function syncBillingSubscription(
	db: Database,
	input: BillingSubscriptionState,
): Promise<"applied" | "stale"> {
	return db.transaction(
		async (tx) => {
			const [current] = await tx
				.select({ lastEventAt: billingSubscriptions.lastEventAt })
				.from(billingSubscriptions)
				.where(eq(billingSubscriptions.organizationId, input.organizationId))
				.limit(1);
			if (current && current.lastEventAt > input.eventAt) return "stale";

			const now = new Date();
			await tx
				.insert(billingSubscriptions)
				.values({
					organizationId: input.organizationId,
					plan: input.plan,
					billingInterval: input.billingInterval,
					status: input.status,
					customerId: input.customerId,
					subscriptionId: input.subscriptionId,
					productId: input.productId,
					cancelAtPeriodEnd: input.cancelAtPeriodEnd,
					currentPeriodEnd: input.currentPeriodEnd,
					lastEventAt: input.eventAt,
				})
				.onConflictDoUpdate({
					target: billingSubscriptions.organizationId,
					set: {
						plan: input.plan,
						billingInterval: input.billingInterval,
						status: input.status,
						customerId: input.customerId,
						subscriptionId: input.subscriptionId,
						productId: input.productId,
						cancelAtPeriodEnd: input.cancelAtPeriodEnd,
						currentPeriodEnd: input.currentPeriodEnd,
						lastEventAt: input.eventAt,
						updatedAt: now,
					},
				});

			const entitlements =
				input.status === "active" ? input.paidEntitlements : input.freeEntitlements;
			await tx
				.update(organizations)
				.set({ ...entitlements, updatedAt: now })
				.where(eq(organizations.id, input.organizationId));
			await tx.insert(auditEvents).values({
				organizationId: input.organizationId,
				action: "billing.subscription_synced",
				targetType: "subscription",
				targetId: input.subscriptionId,
				metadata: {
					plan: input.plan,
					interval: input.billingInterval,
					status: input.status,
				},
			});
			return "applied";
		},
		{ behavior: "immediate" },
	);
}
