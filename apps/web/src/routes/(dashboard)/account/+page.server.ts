import {
	BadRequestException,
	ConflictException,
	NotFoundException,
	RateLimitExceededException,
	UnprocessableEntityException
} from '@workos-inc/node';
import { fail, redirect } from '@sveltejs/kit';
import { createWorkOS } from '$lib/server/config';
import type { Actions, PageServerLoad } from './$types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const verificationCodePattern = /^\d{6}$/;

function hasControlCharacters(value: string) {
	return [...value].some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 31 || codePoint === 127;
	});
}

function requireUser(locals: App.Locals) {
	const userId = locals.auth.user?.id;
	if (!userId) redirect(303, '/sign-in');
	return { userId, sessionId: locals.auth.sessionId };
}

function expectedWorkOSErrorStatus(error: unknown): number | null {
	if (error instanceof RateLimitExceededException) return 429;
	if (
		error instanceof BadRequestException ||
		error instanceof ConflictException ||
		error instanceof NotFoundException ||
		error instanceof UnprocessableEntityException
	)
		return 400;
	return null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const { userId, sessionId: currentSessionId } = requireUser(locals);
	const workos = createWorkOS();
	const [user, sessions] = await Promise.all([
		workos.userManagement.getUser(userId),
		workos.userManagement.listSessions(userId).then((result) => result.autoPagination())
	]);

	return {
		title: 'Account',
		profile: {
			email: user.email,
			emailVerified: user.emailVerified,
			firstName: user.firstName,
			lastName: user.lastName,
			name: user.name,
			profilePictureUrl: user.profilePictureUrl
		},
		sessions: sessions
			.map((session) => ({
				id: session.id,
				ipAddress: session.ipAddress,
				userAgent: session.userAgent,
				authMethod: session.authMethod,
				createdAt: session.createdAt,
				expiresAt: session.expiresAt,
				current: session.id === currentSessionId
			}))
			.sort((left, right) => {
				if (left.current !== right.current) return left.current ? -1 : 1;
				return right.createdAt.localeCompare(left.createdAt);
			})
	};
};

export const actions: Actions = {
	updateProfile: async ({ locals, request }) => {
		const { userId } = requireUser(locals);
		const formData = await request.formData();
		const firstName = String(formData.get('firstName') ?? '').trim();
		const lastName = String(formData.get('lastName') ?? '').trim();

		if (!firstName && !lastName) {
			return fail(400, {
				action: 'updateProfile' as const,
				success: false,
				message: 'Enter at least a first or last name.',
				firstName,
				lastName
			});
		}
		if (
			firstName.length > 100 ||
			lastName.length > 100 ||
			hasControlCharacters(firstName) ||
			hasControlCharacters(lastName)
		) {
			return fail(400, {
				action: 'updateProfile' as const,
				success: false,
				message: 'Names must be 100 characters or fewer and cannot contain control characters.',
				firstName,
				lastName
			});
		}

		try {
			await createWorkOS().userManagement.updateUser({
				userId,
				firstName,
				lastName,
				name: [firstName, lastName].filter(Boolean).join(' ')
			});
		} catch (error) {
			const status = expectedWorkOSErrorStatus(error);
			if (status) {
				return fail(status, {
					action: 'updateProfile' as const,
					success: false,
					message: "We couldn't update your profile. Please try again.",
					firstName,
					lastName
				});
			}
			throw error;
		}

		return {
			action: 'updateProfile' as const,
			success: true,
			message: 'Profile updated.',
			firstName,
			lastName
		};
	},

	requestEmailChange: async ({ locals, request }) => {
		const { userId } = requireUser(locals);
		const formData = await request.formData();
		const pendingEmail = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();

		if (pendingEmail.length > 254 || !emailPattern.test(pendingEmail)) {
			return fail(400, {
				action: 'requestEmailChange' as const,
				success: false,
				message: 'Enter a valid email address.',
				pendingEmail
			});
		}

		const workos = createWorkOS();
		const user = await workos.userManagement.getUser(userId);
		if (user.email.toLowerCase() === pendingEmail) {
			return fail(400, {
				action: 'requestEmailChange' as const,
				success: false,
				message: 'That is already your account email.',
				pendingEmail
			});
		}

		try {
			await workos.post(`/user_management/users/${encodeURIComponent(userId)}/email_change/send`, {
				new_email: pendingEmail
			});
		} catch (error) {
			const status = expectedWorkOSErrorStatus(error);
			if (status) {
				return fail(status, {
					action: 'requestEmailChange' as const,
					success: false,
					message:
						status === 429
							? 'Too many codes were requested. Please wait a moment and try again.'
							: 'This email cannot be changed here. If your account is managed by your employer, update it in your identity provider.',
					pendingEmail
				});
			}
			throw error;
		}

		return {
			action: 'requestEmailChange' as const,
			success: true,
			message: `We sent a six-digit verification code to ${pendingEmail}.`,
			pendingEmail
		};
	},

	confirmEmailChange: async ({ locals, request }) => {
		const { userId } = requireUser(locals);
		const formData = await request.formData();
		const code = String(formData.get('code') ?? '').trim();
		const pendingEmail = String(formData.get('pendingEmail') ?? '')
			.trim()
			.toLowerCase();

		if (!verificationCodePattern.test(code)) {
			return fail(400, {
				action: 'confirmEmailChange' as const,
				success: false,
				message: 'Enter the six-digit code from the email.',
				pendingEmail
			});
		}

		try {
			await createWorkOS().post(
				`/user_management/users/${encodeURIComponent(userId)}/email_change/confirm`,
				{ code }
			);
		} catch (error) {
			const status = expectedWorkOSErrorStatus(error);
			if (status) {
				return fail(status, {
					action: 'confirmEmailChange' as const,
					success: false,
					message:
						status === 429
							? 'Too many attempts. Please wait a moment and try again.'
							: 'That code is invalid or expired. Request a new code and try again.',
					pendingEmail
				});
			}
			throw error;
		}

		return {
			action: 'confirmEmailChange' as const,
			success: true,
			message: 'Email address updated.',
			pendingEmail: ''
		};
	},

	sendPasswordReset: async ({ locals }) => {
		const { userId } = requireUser(locals);
		const workos = createWorkOS();

		try {
			const user = await workos.userManagement.getUser(userId);
			await workos.userManagement.createPasswordReset({ email: user.email });
		} catch (error) {
			const status = expectedWorkOSErrorStatus(error);
			if (status) {
				return fail(status, {
					action: 'sendPasswordReset' as const,
					success: false,
					message:
						status === 429
							? 'Too many reset emails were requested. Please wait a moment and try again.'
							: 'A password reset email could not be sent for this account.'
				});
			}
			throw error;
		}

		return {
			action: 'sendPasswordReset' as const,
			success: true,
			message: 'Password reset email sent. Check your inbox for the secure link.'
		};
	},

	revokeSession: async ({ locals, request }) => {
		const { userId, sessionId: currentSessionId } = requireUser(locals);
		const formData = await request.formData();
		const sessionId = String(formData.get('sessionId') ?? '');

		if (!sessionId.startsWith('session_')) {
			return fail(400, {
				action: 'revokeSession' as const,
				success: false,
				message: 'Invalid session.',
				sessionId
			});
		}
		if (sessionId === currentSessionId) {
			return fail(400, {
				action: 'revokeSession' as const,
				success: false,
				message: 'Use Sign out to end your current session.',
				sessionId
			});
		}

		const workos = createWorkOS();
		const sessions = await workos.userManagement
			.listSessions(userId)
			.then((result) => result.autoPagination());
		if (!sessions.some((session) => session.id === sessionId && session.userId === userId)) {
			return fail(404, {
				action: 'revokeSession' as const,
				success: false,
				message: 'That session is no longer active.',
				sessionId
			});
		}

		try {
			await workos.userManagement.revokeSession({ sessionId });
		} catch (error) {
			const status = expectedWorkOSErrorStatus(error);
			if (status) {
				return fail(status, {
					action: 'revokeSession' as const,
					success: false,
					message: 'That session could not be revoked. Please try again.',
					sessionId
				});
			}
			throw error;
		}

		return {
			action: 'revokeSession' as const,
			success: true,
			message: 'Session revoked.',
			sessionId
		};
	}
};
