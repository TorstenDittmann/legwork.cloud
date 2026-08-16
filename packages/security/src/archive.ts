import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import tar, { type Headers } from "tar-stream";
import type { SourceFile } from "@legwork/contracts";
import { assertRelativeRepositoryPath } from "./paths";

export interface ArchiveLimits {
	maxFiles: number;
	maxCompressedBytes: number;
	maxExtractedBytes: number;
	maxFileBytes: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
	maxFiles: 100_000,
	maxCompressedBytes: 250 * 1024 * 1024,
	maxExtractedBytes: 1024 * 1024 * 1024,
	maxFileBytes: 64 * 1024 * 1024,
};

export interface ArchiveBudget {
	fileCount: number;
	compressedBytes: number;
	extractedBytes: number;
}

export function createArchiveBudget(): ArchiveBudget {
	return { fileCount: 0, compressedBytes: 0, extractedBytes: 0 };
}

export function validateArchiveHeader(header: Headers): "file" | "skip" {
	assertRelativeRepositoryPath(header.name);
	if (["symlink", "link"].includes(header.type ?? ""))
		throw new Error("Archive links are not allowed");
	if (header.type === "directory") return "skip";
	if (header.type !== "file" && header.type !== undefined)
		throw new Error(`Unsupported archive entry: ${header.type}`);
	return "file";
}

function withoutArchiveRoot(name: string): string {
	const segments = assertRelativeRepositoryPath(name).split("/");
	return segments.length > 1 ? segments.slice(1).join("/") : (segments[0] ?? "");
}

export async function* extractValidatedTarGz(
	source: ReadableStream<Uint8Array>,
	prefix: string,
	limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
	budget: ArchiveBudget = createArchiveBudget(),
): AsyncGenerator<SourceFile> {
	const extract = tar.extract();
	const queue: Array<{ file: SourceFile; next: () => void }> = [];
	let wake: (() => void) | undefined;
	let failure: unknown;
	let done = false;

	const signal = () => {
		wake?.();
		wake = undefined;
	};
	extract.on("entry", (header, stream, next) => {
		stream.once("error", (error) => {
			failure = error;
			signal();
		});
		try {
			const disposition = validateArchiveHeader(header);
			if (disposition === "skip") {
				stream.resume();
				stream.once("end", next);
				return;
			}
			budget.fileCount += 1;
			const declaredSize = header.size ?? 0;
			if (budget.fileCount > limits.maxFiles) throw new Error("Archive file count limit exceeded");
			if (declaredSize > limits.maxFileBytes) throw new Error("Archive entry size limit exceeded");
			budget.extractedBytes += declaredSize;
			if (budget.extractedBytes > limits.maxExtractedBytes)
				throw new Error("Archive extracted size limit exceeded");
			const chunks: Buffer[] = [];
			let actualSize = 0;
			stream.on("data", (chunk: Buffer) => {
				actualSize += chunk.length;
				if (actualSize > limits.maxFileBytes)
					stream.destroy(new Error("Archive entry size limit exceeded"));
				else chunks.push(chunk);
			});
			stream.once("end", () => {
				const relative = withoutArchiveRoot(header.name);
				if (relative) {
					queue.push({
						file: {
							path: `${prefix}/${relative}`,
							content: Buffer.concat(chunks),
							...(header.mode === undefined ? {} : { mode: header.mode }),
						},
						next,
					});
					signal();
				} else {
					next();
				}
			});
		} catch (error) {
			failure = error;
			stream.resume();
			signal();
			extract.destroy(error instanceof Error ? error : new Error("Invalid archive"));
		}
	});
	extract.once("finish", () => {
		done = true;
		signal();
	});
	extract.once("error", (error) => {
		failure = error;
		done = true;
		signal();
	});

	const counter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			budget.compressedBytes += chunk.length;
			callback(
				budget.compressedBytes > limits.maxCompressedBytes
					? new Error("Archive compressed size limit exceeded")
					: null,
				chunk,
			);
		},
	});
	void pipeline(Readable.fromWeb(source as never), counter, createGunzip(), extract).catch(
		(error) => {
			failure = error;
			done = true;
			signal();
		},
	);

	try {
		while (!done || queue.length > 0) {
			if (failure) throw failure;
			const item = queue.shift();
			if (item) {
				yield item.file;
				item.next();
			} else
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
		}
		if (failure) throw failure;
	} finally {
		if (!done) extract.destroy();
	}
}
