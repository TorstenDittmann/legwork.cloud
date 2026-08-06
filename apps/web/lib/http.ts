import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, AuthorizationError } from "@oncall-ai/auth";
import { MAX_REQUEST_BYTES, problem, type ProblemDetails } from "@oncall-ai/contracts";
import { QuotaExceededError } from "@oncall-ai/db";
import { logger } from "@oncall-ai/observability";

export async function readLimitedJson(
	request: Request,
	maxBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
	const declared = Number(request.headers.get("content-length") ?? "0");
	if (declared > maxBytes)
		throw new HttpProblem(413, "Payload Too Large", `Request body exceeds ${maxBytes} bytes`);
	if (!request.body) throw new HttpProblem(400, "Invalid Request", "A JSON body is required");
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			throw new HttpProblem(413, "Payload Too Large", `Request body exceeds ${maxBytes} bytes`);
		}
		chunks.push(value);
	}
	try {
		const body = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			body.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return JSON.parse(new TextDecoder().decode(body));
	} catch {
		throw new HttpProblem(400, "Invalid JSON", "Request body must contain valid JSON");
	}
}

export class HttpProblem extends Error {
	constructor(
		readonly status: number,
		readonly title: string,
		message: string,
		readonly errors?: Record<string, string[]>,
	) {
		super(message);
	}
}
export function problemResponse(error: unknown): NextResponse<ProblemDetails> {
	let status = 500;
	let title = "Internal Server Error";
	let detail = "The request could not be completed";
	let errors: Record<string, string[]> | undefined;
	if (error instanceof HttpProblem) {
		({ status, title, errors } = error);
		detail = error.message;
	} else if (error instanceof z.ZodError) {
		status = 422;
		title = "Validation Failed";
		detail = "The request payload is invalid";
		errors = Object.fromEntries(
			Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] =>
				Boolean(entry[1]),
			),
		);
	} else if (error instanceof AuthenticationError) {
		status = 401;
		title = "Unauthorized";
		detail = error.message;
	} else if (error instanceof AuthorizationError) {
		status = 403;
		title = "Forbidden";
		detail = error.message;
	} else if (error instanceof QuotaExceededError) {
		status = 429;
		title = "Quota Exceeded";
		detail = error.message;
	} else {
		logger.error({ err: error }, "unhandled HTTP request error");
	}
	return NextResponse.json(problem(status, title, detail, errors), {
		status,
		headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
	});
}
