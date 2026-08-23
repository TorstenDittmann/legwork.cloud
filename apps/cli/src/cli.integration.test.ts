import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const apiKey = `ocai_live_${"a".repeat(43)}`;
const incidentId = "c3e95ed0-09e8-42e4-81bc-818332ea0d42";
const runId = "a6d0ee4f-7db9-46ef-9839-3fd71632b419";

let server: Server;
let apiUrl: string;
let temporaryDirectory: string;
let configPath: string;
const receivedPosts: Array<{
	body: string;
	headers: Record<string, string | string[] | undefined>;
}> = [];

beforeAll(async () => {
	temporaryDirectory = await mkdtemp(join(tmpdir(), "legwork-cli-integration-"));
	configPath = join(temporaryDirectory, "config.json");
	server = createServer(async (request, response) => {
		if (request.method === "GET") {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(
				JSON.stringify({
					status: "ready",
					service: { name: "Payments API", slug: "payments-api" },
				}),
			);
			return;
		}
		if (request.method === "POST") {
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			receivedPosts.push({
				body: Buffer.concat(chunks).toString("utf8"),
				headers: request.headers,
			});
			response.writeHead(202, { "content-type": "application/json" });
			response.end(
				JSON.stringify({
					incidentId,
					runId,
					status: "queued",
					dashboardUrl: `http://127.0.0.1/incidents/${incidentId}`,
				}),
			);
			return;
		}
		response.writeHead(404).end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Test server did not bind a port");
	apiUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	await rm(temporaryDirectory, { force: true, recursive: true });
});

describe("Legwork CLI", () => {
	it("configures once and only submits wrapped commands that fail", async () => {
		const configured = await invoke(
			["configure", "--url", apiUrl, "--service", "payments-api", "--api-key-stdin", "--json"],
			apiKey,
		);
		expect(configured.exitCode).toBe(0);
		expect(JSON.parse(configured.stdout)).toMatchObject({
			status: "configured",
			service: "payments-api",
			verified: true,
		});
		expect(configured.stdout).not.toContain(apiKey);

		const doctor = await invoke(["doctor", "--json"]);
		expect(doctor.exitCode).toBe(0);
		expect(JSON.parse(doctor.stdout)).toMatchObject({
			status: "ready",
			service: { slug: "payments-api" },
		});

		const succeeded = await invoke(["run", "--", "bun", "-e", 'console.log("all good")']);
		expect(succeeded.exitCode).toBe(0);
		expect(succeeded.stdout).toContain("all good");
		expect(receivedPosts).toHaveLength(0);

		const failed = await invoke([
			"run",
			"--",
			"bun",
			"-e",
			'console.error("boom"); process.exit(7)',
			"sensitive-command-argument",
		]);
		expect(failed.exitCode).toBe(7);
		expect(failed.stderr).toContain("boom");
		expect(failed.stderr).toContain("Failure reported: http://127.0.0.1/incidents/");
		expect(receivedPosts).toHaveLength(1);

		const received = receivedPosts[0]!;
		const payload = JSON.parse(received.body) as {
			stackTrace?: string;
			context?: Record<string, string>;
		};
		expect(payload.stackTrace).toContain("boom");
		expect(payload.context).toMatchObject({
			trigger: "cli.run",
			command: "bun",
			exit_code: "7",
		});
		expect(received.body).not.toContain("sensitive-command-argument");
		expect(received.headers.authorization).toBe(`Bearer ${apiKey}`);
		expect(received.headers["idempotency-key"]).toMatch(/^cli-[a-f0-9]{64}$/);
	});
});

async function invoke(
	args: string[],
	stdin?: string,
): Promise<{
	exitCode: number;
	stdout: string;
	stderr: string;
}> {
	const child = spawn("bun", ["apps/cli/src/index.ts", ...args], {
		cwd: process.cwd(),
		env: { ...process.env, LEGWORK_CONFIG: configPath, NO_COLOR: "1" },
		stdio: ["pipe", "pipe", "pipe"],
	});
	const stdout: Buffer[] = [];
	const stderr: Buffer[] = [];
	child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
	child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
	child.stdin.end(stdin);
	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => {
			if (signal) reject(new Error(`CLI exited with ${signal}`));
			else resolve(code ?? 1);
		});
	});
	return {
		exitCode,
		stdout: Buffer.concat(stdout).toString("utf8"),
		stderr: Buffer.concat(stderr).toString("utf8"),
	};
}
