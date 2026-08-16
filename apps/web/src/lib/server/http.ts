import { fail, json } from '@sveltejs/kit';
import { z } from 'zod';
import { AuthenticationError, AuthorizationError } from '@legwork/auth/roles';
import { MAX_REQUEST_BYTES, problem } from '@legwork/contracts';
import { QuotaExceededError } from '@legwork/db';
import { logger } from '@legwork/observability';

export async function readLimitedJson(
	request: Request,
	maxBytes = MAX_REQUEST_BYTES
): Promise<unknown> {
	const body = await readLimitedBytes(request, maxBytes, 'A JSON body is required');
	try {
		return JSON.parse(new TextDecoder().decode(body));
	} catch {
		throw new HttpProblem(400, 'Invalid JSON', 'Request body must contain valid JSON');
	}
}

export async function readLimitedBytes(
	request: Request,
	maxBytes = MAX_REQUEST_BYTES,
	missingBodyDetail = 'A request body is required'
): Promise<Uint8Array> {
	const declared = Number(request.headers.get('content-length') ?? '0');
	if (declared > maxBytes)
		throw new HttpProblem(413, 'Payload Too Large', `Request body exceeds ${maxBytes} bytes`);
	if (!request.body) throw new HttpProblem(400, 'Invalid Request', missingBodyDetail);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			throw new HttpProblem(413, 'Payload Too Large', `Request body exceeds ${maxBytes} bytes`);
		}
		chunks.push(value);
	}
	const body = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

export class HttpProblem extends Error {
	constructor(
		readonly status: number,
		readonly title: string,
		message: string,
		readonly errors?: Record<string, string[]>
	) {
		super(message);
	}
}

function describeProblem(error: unknown) {
	let status = 500;
	let title = 'Internal Server Error';
	let detail = 'The request could not be completed';
	let errors: Record<string, string[]> | undefined;
	if (error instanceof HttpProblem) {
		({ status, title, errors } = error);
		detail = error.message;
	} else if (error instanceof z.ZodError) {
		status = 422;
		title = 'Validation Failed';
		detail = 'The request payload is invalid';
		errors = Object.fromEntries(
			Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] =>
				Boolean(entry[1])
			)
		);
	} else if (error instanceof AuthenticationError) {
		status = 401;
		title = 'Unauthorized';
		detail = error.message;
	} else if (error instanceof AuthorizationError) {
		status = 403;
		title = 'Forbidden';
		detail = error.message;
	} else if (error instanceof QuotaExceededError) {
		status = 429;
		title = 'Quota Exceeded';
		detail = error.message;
	} else {
		logger.error({ err: error }, 'unhandled HTTP request error');
	}
	return { status, title, detail, errors };
}

/**
 * Map a thrown error to an RFC 9457 problem response. SvelteKit control-flow
 * throws (redirect()/error()) must be rethrown by callers before reaching this.
 */
export function problemResponse(error: unknown): Response {
	const { status, title, detail, errors } = describeProblem(error);
	return json(problem(status, title, detail, errors), {
		status,
		headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' }
	});
}

/**
 * Map a thrown error to a failed form action carrying the same problem
 * details as problemResponse(). Same rethrow caveat for redirect()/error().
 */
export function problemFail(error: unknown) {
	const { status, title, detail, errors } = describeProblem(error);
	return fail(status, { title, detail, errors });
}
