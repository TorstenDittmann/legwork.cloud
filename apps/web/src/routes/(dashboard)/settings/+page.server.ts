import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, gte, sql, sum } from 'drizzle-orm';
import {
	auditEvents,
	billingSubscriptions,
	createDatabase,
	organizations,
	serviceApiKeys,
	services,
	usageEvents
} from '@legwork/db';
import { env } from '$env/dynamic/private';
import { FREE_ENTITLEMENTS } from '$lib/pricing';
import { createWorkOS } from '$lib/server/config';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

const AUDIT_PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	const tenant = await requireTenant(locals);
	const db = createDatabase();
	const month = new Date();
	month.setUTCDate(1);
	month.setUTCHours(0, 0, 0, 0);
	const auditPage = Math.max(1, Math.trunc(Number(url.searchParams.get('auditPage'))) || 1);
	const workos = tenant.role === 'admin' && env.WORKOS_API_KEY ? createWorkOS() : null;
	const [
		[organization],
		[billing],
		[usage],
		keys,
		audits,
		[auditTotal],
		memberships,
		users,
		invitations
	] = await Promise.all([
		db.select().from(organizations).where(eq(organizations.id, tenant.organizationId)).limit(1),
		db
			.select({
				plan: billingSubscriptions.plan,
				status: billingSubscriptions.status,
				billingInterval: billingSubscriptions.billingInterval,
				cancelAtPeriodEnd: billingSubscriptions.cancelAtPeriodEnd,
				currentPeriodEnd: billingSubscriptions.currentPeriodEnd
			})
			.from(billingSubscriptions)
			.where(eq(billingSubscriptions.organizationId, tenant.organizationId))
			.limit(1),
		db
			.select({
				analyses: sum(usageEvents.analyses).mapWith(Number),
				tokens: sum(
					sql<number>`${usageEvents.actualInputTokens}+${usageEvents.actualOutputTokens}+${usageEvents.reservedTokens}`
				).mapWith(Number)
			})
			.from(usageEvents)
			.where(
				and(
					eq(usageEvents.organizationId, tenant.organizationId),
					gte(usageEvents.createdAt, month)
				)
			),
		db
			.select({
				serviceName: services.name,
				prefix: serviceApiKeys.prefix,
				lastUsedAt: serviceApiKeys.lastUsedAt
			})
			.from(serviceApiKeys)
			.innerJoin(services, eq(services.id, serviceApiKeys.serviceId))
			.where(
				and(
					eq(serviceApiKeys.organizationId, tenant.organizationId),
					eq(serviceApiKeys.active, true)
				)
			),
		db
			.select()
			.from(auditEvents)
			.where(eq(auditEvents.organizationId, tenant.organizationId))
			.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
			.limit(AUDIT_PAGE_SIZE)
			.offset((auditPage - 1) * AUDIT_PAGE_SIZE),
		db
			.select({ value: count() })
			.from(auditEvents)
			.where(eq(auditEvents.organizationId, tenant.organizationId)),
		workos
			? workos.userManagement
					.listOrganizationMemberships({ organizationId: tenant.workosOrganizationId })
					.then((result) => result.data)
			: [],
		workos
			? workos.userManagement
					.listUsers({ organizationId: tenant.workosOrganizationId })
					.then((result) => result.autoPagination())
			: [],
		workos
			? workos.userManagement
					.listInvitations({ organizationId: tenant.workosOrganizationId })
					.then((result) => result.data)
			: []
	]);
	const emailByUserId = new Map(users.map((user) => [user.id, user.email]));
	return {
		title: 'Settings',
		role: tenant.role,
		monthlyAnalysisQuota:
			organization?.monthlyAnalysisQuota ?? FREE_ENTITLEMENTS.monthlyAnalysisQuota,
		monthlyTokenQuota: organization?.monthlyTokenQuota ?? FREE_ENTITLEMENTS.monthlyTokenQuota,
		usage: { analyses: usage?.analyses ?? 0, tokens: usage?.tokens ?? 0 },
		billing: billing ?? null,
		keys,
		audits: {
			rows: audits.map((event) => ({
				id: event.id,
				action: event.action,
				actorId: event.actorId,
				actorEmail: event.actorId ? (emailByUserId.get(event.actorId) ?? null) : null,
				targetType: event.targetType,
				targetId: event.targetId,
				metadata: event.metadata,
				createdAt: event.createdAt
			})),
			total: auditTotal?.value ?? 0,
			page: auditPage,
			pageCount: Math.max(1, Math.ceil((auditTotal?.value ?? 0) / AUDIT_PAGE_SIZE))
		},
		memberships: memberships.map((membership) => ({
			id: membership.id,
			userId: membership.userId,
			email: emailByUserId.get(membership.userId) ?? 'Email unavailable',
			role: membership.role.slug
		})),
		invitations: invitations.map((invitation) => ({
			id: invitation.id,
			email: invitation.email,
			state: invitation.state,
			roleSlug: invitation.roleSlug
		}))
	};
};

export const actions: Actions = {
	inviteMember: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();
		const roleSlug = String(formData.get('role') ?? 'member');
		if (!/^\S+@\S+\.\S+$/.test(email) || !['admin', 'member'].includes(roleSlug))
			return fail(400, { message: 'A valid email and role are required' });
		await createWorkOS().userManagement.sendInvitation({
			email,
			organizationId: tenant.workosOrganizationId,
			roleSlug,
			inviterUserId: tenant.userId
		});
		await createDatabase()
			.insert(auditEvents)
			.values({
				organizationId: tenant.organizationId,
				actorId: tenant.userId,
				action: 'member.invited',
				targetType: 'invitation',
				metadata: { email, role: roleSlug }
			});
	},
	changeMemberRole: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const membershipId = String(formData.get('membershipId'));
		const roleSlug = String(formData.get('role'));
		if (!membershipId.startsWith('om_') || !['admin', 'member'].includes(roleSlug))
			return fail(400, { message: 'Invalid membership update' });
		const workos = createWorkOS();
		const membership = await workos.userManagement.getOrganizationMembership(membershipId);
		if (membership.organizationId !== tenant.workosOrganizationId)
			return fail(400, { message: 'Membership does not belong to the active organization' });
		await workos.userManagement.updateOrganizationMembership(membershipId, { roleSlug });
		await createDatabase()
			.insert(auditEvents)
			.values({
				organizationId: tenant.organizationId,
				actorId: tenant.userId,
				action: 'member.role_changed',
				targetType: 'membership',
				targetId: membershipId,
				metadata: { role: roleSlug }
			});
	},
	removeMember: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const membershipId = String(formData.get('membershipId'));
		const userId = String(formData.get('userId'));
		if (userId === tenant.userId)
			return fail(400, { message: 'You cannot remove your own active membership' });
		const workos = createWorkOS();
		const membership = await workos.userManagement.getOrganizationMembership(membershipId);
		if (membership.organizationId !== tenant.workosOrganizationId || membership.userId !== userId)
			return fail(400, { message: 'Membership does not belong to the active organization' });
		await workos.userManagement.deleteOrganizationMembership(membershipId);
		await createDatabase().insert(auditEvents).values({
			organizationId: tenant.organizationId,
			actorId: tenant.userId,
			action: 'member.removed',
			targetType: 'membership',
			targetId: membershipId,
			metadata: { userId }
		});
	}
};
