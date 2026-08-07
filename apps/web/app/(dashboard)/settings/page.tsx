import { WorkOS } from "@workos-inc/node";
import { and, desc, eq, gte, sql, sum } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import {
	auditEvents,
	createDatabase,
	organizations,
	serviceApiKeys,
	services,
	usageEvents,
} from "@oncall-ai/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeMemberRole, inviteMember, removeMember } from "./actions";
import { PageHeader, SectionHeader, EmptyState } from "@/components/ui/journal";
import { Field, Select } from "@/components/ui/form";
import { ConfirmSubmit } from "@/components/confirm-submit";

export default async function SettingsPage() {
	const tenant = await requireTenant();
	const db = createDatabase();
	const month = new Date();
	month.setUTCDate(1);
	month.setUTCHours(0, 0, 0, 0);
	const [[organization], [usage], keys, audits] = await Promise.all([
		db.select().from(organizations).where(eq(organizations.id, tenant.organizationId)).limit(1),
		db
			.select({
				analyses: sum(usageEvents.analyses).mapWith(Number),
				tokens: sum(
					sql<number>`${usageEvents.actualInputTokens}+${usageEvents.actualOutputTokens}+${usageEvents.reservedTokens}`,
				).mapWith(Number),
			})
			.from(usageEvents)
			.where(
				and(
					eq(usageEvents.organizationId, tenant.organizationId),
					gte(usageEvents.createdAt, month),
				),
			),
		db
			.select({
				serviceName: services.name,
				prefix: serviceApiKeys.prefix,
				lastUsedAt: serviceApiKeys.lastUsedAt,
			})
			.from(serviceApiKeys)
			.innerJoin(services, eq(services.id, serviceApiKeys.serviceId))
			.where(
				and(
					eq(serviceApiKeys.organizationId, tenant.organizationId),
					eq(serviceApiKeys.active, true),
				),
			),
		db
			.select()
			.from(auditEvents)
			.where(
				and(
					eq(auditEvents.organizationId, tenant.organizationId),
					gte(auditEvents.createdAt, month),
				),
			)
			.orderBy(desc(auditEvents.createdAt))
			.limit(50),
	]);
	let memberships: Awaited<
		ReturnType<WorkOS["userManagement"]["listOrganizationMemberships"]>
	>["data"] = [];
	let invitations: Awaited<ReturnType<WorkOS["userManagement"]["listInvitations"]>>["data"] = [];
	if (tenant.role === "admin" && process.env.WORKOS_API_KEY) {
		const workos = new WorkOS(process.env.WORKOS_API_KEY);
		[memberships, invitations] = await Promise.all([
			workos.userManagement
				.listOrganizationMemberships({ organizationId: tenant.workosOrganizationId })
				.then((result) => result.data),
			workos.userManagement
				.listInvitations({ organizationId: tenant.workosOrganizationId })
				.then((result) => result.data),
		]);
	}
	return (
		<>
			<PageHeader
				eyebrow="Organization"
				title="Settings"
				description="Manage usage, access, credentials, and the organization audit record."
			/>
			<div className="mt-8 grid gap-5 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Monthly usage</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm tabular-nums text-[var(--ink-muted)]">
							{usage?.analyses ?? 0} / {organization?.monthlyAnalysisQuota ?? 50} analyses
						</p>
						<div
							role="progressbar"
							aria-label="Monthly analyses used"
							aria-valuemin={0}
							aria-valuemax={organization?.monthlyAnalysisQuota ?? 50}
							aria-valuenow={usage?.analyses ?? 0}
							className="mt-2 h-1 bg-[var(--rule)]"
						>
							<div
								className="h-1 bg-[var(--accent)]"
								style={{
									width: `${Math.min(100, ((usage?.analyses ?? 0) / (organization?.monthlyAnalysisQuota ?? 50)) * 100)}%`,
								}}
							/>
						</div>
						<p className="mt-4 text-sm tabular-nums text-[var(--ink-muted)]">
							{new Intl.NumberFormat("en").format(usage?.tokens ?? 0)} /{" "}
							{new Intl.NumberFormat("en").format(organization?.monthlyTokenQuota ?? 5_000_000)}{" "}
							model tokens
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Active API keys</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{keys.map((key) => (
							<div key={`${key.serviceName}:${key.prefix}`} className="text-sm">
								<span className="text-[var(--ink-muted)]">{key.serviceName}</span>
								<code translate="no" className="ml-3 text-xs text-[var(--ink-faint)]">
									{key.prefix}…
								</code>
							</div>
						))}
					</CardContent>
				</Card>
			</div>
			{tenant.role === "admin" && (
				<section className="mt-10">
					<SectionHeader>Members & Invitations</SectionHeader>
					<form action={inviteMember} className="mb-4 flex max-w-xl gap-2">
						<Field label="Email" htmlFor="invite-email" className="flex-1">
							<Input
								id="invite-email"
								name="email"
								type="email"
								autoComplete="email"
								spellCheck={false}
								required
								placeholder="teammate@example.com…"
							/>
						</Field>
						<Field label="Role" htmlFor="invite-role">
							<Select id="invite-role" name="role">
								<option value="member">Member</option>
								<option value="admin">Admin</option>
							</Select>
						</Field>
						<Button type="submit" className="mt-6">
							Invite Member
						</Button>
					</form>
					<Card>
						<CardContent className="divide-y divide-[var(--rule)] pt-6">
							{memberships.map((membership) => (
								<div
									key={membership.id}
									className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
								>
									<span translate="no" className="font-mono text-xs text-[var(--ink-muted)]">
										{membership.userId}
									</span>
									<div className="flex gap-2">
										<form action={changeMemberRole}>
											<input type="hidden" name="membershipId" value={membership.id} />
											<select
												name="role"
												defaultValue={membership.role.slug}
												className="h-8 rounded-[3px] border border-[var(--rule-strong)] bg-[var(--canvas)] px-2 text-xs"
											>
												<option value="member">Member</option>
												<option value="admin">Admin</option>
											</select>
											<Button type="submit" size="sm" variant="ghost">
												Update
											</Button>
										</form>
										<form action={removeMember}>
											<input type="hidden" name="membershipId" value={membership.id} />
											<input type="hidden" name="userId" value={membership.userId} />
											<ConfirmSubmit message="Remove this member from the organization? They will immediately lose access.">
												Remove Member
											</ConfirmSubmit>
										</form>
									</div>
								</div>
							))}
							{invitations
								.filter((invitation) => invitation.state === "pending")
								.map((invitation) => (
									<div
										key={invitation.id}
										className="flex justify-between py-3 text-sm text-[var(--ink-muted)]"
									>
										<span>{invitation.email}</span>
										<span>invited · {invitation.roleSlug}</span>
									</div>
								))}
						</CardContent>
					</Card>
				</section>
			)}
			<section className="mt-10">
				<SectionHeader>Audit Events</SectionHeader>
				<Card>
					<CardContent className="divide-y divide-[var(--rule)] pt-6">
						{audits.map((event) => (
							<div key={event.id} className="flex justify-between py-3 text-sm">
								<span className="text-[var(--ink-muted)]">{event.action}</span>
								<time className="font-mono text-[10px] text-[var(--ink-faint)]">
									{new Intl.DateTimeFormat("en", {
										dateStyle: "medium",
										timeStyle: "short",
									}).format(event.createdAt)}
								</time>
							</div>
						))}
					</CardContent>
				</Card>
				{audits.length === 0 && (
					<EmptyState title="No Audit Events">Organization changes will appear here.</EmptyState>
				)}
			</section>
			<p className="mt-10 max-w-3xl border-t border-[var(--rule)] pt-6 text-xs leading-5 text-[var(--ink-faint)]">
				Selected incident context and requested code excerpts are processed through OpenRouter and
				its routed model provider. Provider privacy filtering is deferred for the MVP. Active
				incident data expires after 30 days. Operational state is stored in the organization-scoped
				Bun SQLite database.
			</p>
		</>
	);
}
