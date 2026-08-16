import { fail } from '@sveltejs/kit';
import { WorkOS } from '@workos-inc/node';
import { and, desc, eq, gte, sql, sum } from 'drizzle-orm';
import {
	auditEvents,
	createDatabase,
	organizations,
	serviceApiKeys,
	services,
	usageEvents
} from '@oncall-ai/db';
import { env } from '$env/dynamic/private';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

function client() {
	if (!env.WORKOS_API_KEY) throw new Error('WORKOS_API_KEY is required');
	return new WorkOS(env.WORKOS_API_KEY);
}

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals);
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
			.where(
				and(
					eq(auditEvents.organizationId, tenant.organizationId),
					gte(auditEvents.createdAt, month)
				)
			)
			.orderBy(desc(auditEvents.createdAt))
			.limit(50)
	]);
	let memberships: Awaited<
		ReturnType<WorkOS['userManagement']['listOrganizationMemberships']>
	>['data'] = [];
	let invitations: Awaited<ReturnType<WorkOS['userManagement']['listInvitations']>>['data'] = [];
	if (tenant.role === 'admin' && env.WORKOS_API_KEY) {
		const workos = new WorkOS(env.WORKOS_API_KEY);
		[memberships, invitations] = await Promise.all([
			workos.userManagement
				.listOrganizationMemberships({ organizationId: tenant.workosOrganizationId })
				.then((result) => result.data),
			workos.userManagement
				.listInvitations({ organizationId: tenant.workosOrganizationId })
				.then((result) => result.data)
		]);
	}
	return {
		role: tenant.role,
		monthlyAnalysisQuota: organization?.monthlyAnalysisQuota ?? 50,
		monthlyTokenQuota: organization?.monthlyTokenQuota ?? 5_000_000,
		usage: { analyses: usage?.analyses ?? 0, tokens: usage?.tokens ?? 0 },
		keys,
		audits: audits.map((event) => ({
			id: event.id,
			action: event.action,
			createdAt: event.createdAt
		})),
		memberships: memberships.map((membership) => ({
			id: membership.id,
			userId: membership.userId,
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
		await client().userManagement.sendInvitation({
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
		const workos = client();
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
		const workos = client();
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
