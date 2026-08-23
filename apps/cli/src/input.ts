import { readFile } from "node:fs/promises";
import { CliError } from "./errors";

export async function readStdin(maxBytes: number): Promise<string> {
	return readStream(process.stdin, maxBytes, "stdin");
}

export async function readTextFile(path: string, maxBytes: number): Promise<string> {
	let value: Buffer;
	try {
		value = await readFile(path);
	} catch (error) {
		throw new CliError(`Could not read ${path}: ${errorMessage(error)}`);
	}
	if (value.byteLength > maxBytes)
		throw new CliError(`${path} exceeds the ${formatBytes(maxBytes)} limit`);
	return value.toString("utf8");
}

async function readStream(
	stream: NodeJS.ReadableStream,
	maxBytes: number,
	label: string,
): Promise<string> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of stream) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
		size += bytes.byteLength;
		if (size > maxBytes) throw new CliError(`${label} exceeds the ${formatBytes(maxBytes)} limit`);
		chunks.push(bytes);
	}
	return Buffer.concat(chunks).toString("utf8");
}

export async function promptSecret(prompt: string): Promise<string> {
	if (!process.stdin.isTTY || !process.stderr.isTTY || !process.stdin.setRawMode)
		throw new CliError("An ingestion key is required. Use --api-key-stdin or set LEGWORK_API_KEY");

	process.stderr.write(prompt);
	const stdin = process.stdin;
	const wasRaw = stdin.isRaw;
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding("utf8");

	return await new Promise<string>((resolve, reject) => {
		let value = "";
		const finish = (error?: Error) => {
			stdin.off("data", onData);
			stdin.setRawMode(Boolean(wasRaw));
			stdin.pause();
			process.stderr.write("\n");
			if (error) reject(error);
			else resolve(value);
		};
		const onData = (chunk: string | Buffer) => {
			for (const character of String(chunk)) {
				if (character === "\u0003") {
					finish(new CliError("Configuration cancelled", 130));
					return;
				}
				if (character === "\r" || character === "\n" || character === "\u0004") {
					finish();
					return;
				}
				if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
				else value += character;
			}
		};
		stdin.on("data", onData);
	});
}

export async function promptText(prompt: string): Promise<string> {
	if (!process.stdin.isTTY || !process.stderr.isTTY)
		throw new CliError("A service slug is required. Pass --service <service-slug>");
	process.stderr.write(prompt);
	const value = await new Promise<string>((resolve) => {
		process.stdin.resume();
		process.stdin.setEncoding("utf8");
		let input = "";
		const onData = (chunk: string | Buffer) => {
			input += String(chunk);
			const newline = input.search(/[\r\n]/);
			if (newline === -1) return;
			process.stdin.off("data", onData);
			process.stdin.pause();
			resolve(input.slice(0, newline));
		};
		process.stdin.on("data", onData);
	});
	return value.trim();
}

function formatBytes(bytes: number): string {
	return bytes % 1024 === 0 ? `${bytes / 1024} KiB` : `${bytes} byte`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
