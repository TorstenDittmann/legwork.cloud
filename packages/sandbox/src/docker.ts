import { spawn } from "node:child_process";
import { once } from "node:events";

export interface DockerResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

export interface DockerCommandOptions {
	/** Bytes written to the command's stdin, or a stream piped with backpressure. */
	input?: Uint8Array | AsyncIterable<Uint8Array> | undefined;
	/** Client-side deadline; in-sandbox work is bounded separately with `timeout`. */
	timeoutMs?: number | undefined;
	/** Captured bytes per stream; output beyond this is dropped. */
	maxOutput?: number | undefined;
	onStdout?: ((chunk: string) => void) | undefined;
	binary?: string;
}

const DEFAULT_MAX_OUTPUT = 1024 * 1024;

/**
 * Runs the Docker CLI with an argv array (never a shell) and captures bounded output.
 * The CLI inherits DOCKER_HOST and friends from the worker environment.
 */
export async function docker(
	args: string[],
	options: DockerCommandOptions = {},
): Promise<DockerResult> {
	const maxOutput = options.maxOutput ?? DEFAULT_MAX_OUTPUT;
	const child = spawn(options.binary ?? "docker", args, {
		stdio: ["pipe", "pipe", "pipe"],
		env: process.env,
	});
	const stdout: Buffer[] = [];
	const stderr: Buffer[] = [];
	let stdoutBytes = 0;
	let stderrBytes = 0;
	child.stdout.on("data", (chunk: Buffer) => {
		if (stdoutBytes < maxOutput) stdout.push(chunk.subarray(0, maxOutput - stdoutBytes));
		stdoutBytes += chunk.length;
		options.onStdout?.(chunk.toString("utf8"));
	});
	child.stderr.on("data", (chunk: Buffer) => {
		if (stderrBytes < maxOutput) stderr.push(chunk.subarray(0, maxOutput - stderrBytes));
		stderrBytes += chunk.length;
	});
	let timedOut = false;
	const timer =
		options.timeoutMs === undefined
			? undefined
			: setTimeout(() => {
					timedOut = true;
					child.kill("SIGKILL");
				}, options.timeoutMs);
	const exited = once(child, "close") as Promise<[number | null, NodeJS.Signals | null]>;
	const spawnFailed = once(child, "error").then(([error]) => {
		throw error;
	});
	try {
		await Promise.race([writeInput(child.stdin, options.input), spawnFailed]);
		const [code] = await Promise.race([exited, spawnFailed]);
		return {
			exitCode: code ?? 137,
			stdout: Buffer.concat(stdout).toString("utf8"),
			stderr: Buffer.concat(stderr).toString("utf8"),
			timedOut,
		};
	} finally {
		if (timer) clearTimeout(timer);
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	}
}

async function writeInput(
	stdin: NodeJS.WritableStream,
	input: DockerCommandOptions["input"],
): Promise<void> {
	// A command that exits before reading all input closes the pipe; its exit code reports why.
	stdin.on("error", () => undefined);
	if (input === undefined) {
		stdin.end();
		return;
	}
	if (input instanceof Uint8Array) {
		stdin.end(input);
		return;
	}
	try {
		for await (const chunk of input) {
			if (!stdin.write(chunk)) await once(stdin, "drain");
		}
	} finally {
		stdin.end();
	}
}

export function isMissingContainer(result: DockerResult): boolean {
	return /no such (container|object)/i.test(result.stderr);
}
