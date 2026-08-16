import { authKit } from '@workos/authkit-sveltekit';
import { problemResponse, HttpProblem } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const formData = await event.request.formData();
	const organizationId = formData.get('organizationId');
	if (typeof organizationId !== 'string' || !organizationId)
		return problemResponse(
			new HttpProblem(400, 'Invalid Request', 'An organizationId is required')
		);
	return authKit.switchOrganization(event, { organizationId });
};
