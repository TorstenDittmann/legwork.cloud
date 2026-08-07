import type { Client, InStatement, Row } from "@libsql/client";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
	BaseCheckpointSaver,
	WRITES_IDX_MAP,
	type ChannelVersions,
	type Checkpoint,
	type CheckpointListOptions,
	type CheckpointMetadata,
	type CheckpointTuple,
	type PendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { Database } from "./client";

interface CheckpointRow {
	checkpoint_namespace: string;
	checkpoint_id: string;
	parent_checkpoint_id: string | null;
	type: string;
	checkpoint: Uint8Array;
	metadata: Uint8Array;
}

interface WriteRow {
	task_id: string;
	channel: string;
	type: string;
	value: Uint8Array;
}

const FILTER_KEYS = new Set(["source", "step"]);

export class LibSqlCheckpointSaver extends BaseCheckpointSaver {
	readonly #client: Client;
	readonly #organizationId: string;
	readonly #runId: string;
	readonly #expiresAt: Date;

	constructor(options: { db: Database; organizationId: string; runId: string; expiresAt: Date }) {
		super();
		this.#client = (options.db as Database & { $client: Client }).$client;
		this.#organizationId = options.organizationId;
		this.#runId = options.runId;
		this.#expiresAt = options.expiresAt;
	}

	#scope(config: RunnableConfig): {
		threadId: string;
		namespace: string;
		checkpointId?: string;
	} {
		const threadId = config.configurable?.thread_id;
		if (threadId !== this.#runId)
			throw new Error("LangGraph thread_id must equal the configured analysis run ID");
		const namespace = config.configurable?.checkpoint_ns;
		const checkpointId = config.configurable?.checkpoint_id;
		if (namespace !== undefined && typeof namespace !== "string")
			throw new Error("LangGraph checkpoint namespace must be a string");
		if (checkpointId !== undefined && typeof checkpointId !== "string")
			throw new Error("LangGraph checkpoint ID must be a string");
		return { threadId, namespace: namespace ?? "", checkpointId };
	}

	#config(threadId: string, namespace: string, checkpointId: string): RunnableConfig {
		return {
			configurable: {
				thread_id: threadId,
				checkpoint_ns: namespace,
				checkpoint_id: checkpointId,
			},
		};
	}

	async #tuple(row: CheckpointRow): Promise<CheckpointTuple> {
		const checkpoint = (await this.serde.loadsTyped(row.type, row.checkpoint)) as Checkpoint;
		const metadata = (await this.serde.loadsTyped("json", row.metadata)) as CheckpointMetadata;
		const result = await this.#client.execute({
			sql: `SELECT task_id, channel, type, value
				 FROM langgraph_checkpoint_writes
				 WHERE organization_id = ? AND run_id = ? AND thread_id = ?
				   AND checkpoint_namespace = ? AND checkpoint_id = ?
				 ORDER BY task_id, write_index`,
			args: [
				this.#organizationId,
				this.#runId,
				this.#runId,
				row.checkpoint_namespace,
				row.checkpoint_id,
			],
		});
		const writes = result.rows.map((write) => this.#writeRow(write));
		return {
			config: this.#config(this.#runId, row.checkpoint_namespace, row.checkpoint_id),
			checkpoint,
			metadata,
			...(row.parent_checkpoint_id
				? {
						parentConfig: this.#config(
							this.#runId,
							row.checkpoint_namespace,
							row.parent_checkpoint_id,
						),
					}
				: {}),
			pendingWrites: await Promise.all(
				writes.map(async (write) => [
					write.task_id,
					write.channel,
					await this.serde.loadsTyped(write.type, write.value),
				]),
			),
		};
	}

	#bytes(value: unknown): Uint8Array {
		if (value instanceof Uint8Array) return value;
		if (value instanceof ArrayBuffer) return new Uint8Array(value);
		throw new Error("Expected a binary libSQL column");
	}

	#checkpointRow(row: Row): CheckpointRow {
		return {
			checkpoint_namespace: String(row.checkpoint_namespace),
			checkpoint_id: String(row.checkpoint_id),
			parent_checkpoint_id:
				row.parent_checkpoint_id === null ? null : String(row.parent_checkpoint_id),
			type: String(row.type),
			checkpoint: this.#bytes(row.checkpoint),
			metadata: this.#bytes(row.metadata),
		};
	}

	#writeRow(row: Row): WriteRow {
		return {
			task_id: String(row.task_id),
			channel: String(row.channel),
			type: String(row.type),
			value: this.#bytes(row.value),
		};
	}

	async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
		const scope = this.#scope(config);
		const statement: InStatement = scope.checkpointId
			? {
					sql: `SELECT checkpoint_namespace, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
						 FROM langgraph_checkpoints
						 WHERE organization_id = ? AND run_id = ? AND thread_id = ?
						   AND checkpoint_namespace = ? AND checkpoint_id = ?`,
					args: [
						this.#organizationId,
						this.#runId,
						scope.threadId,
						scope.namespace,
						scope.checkpointId,
					],
				}
			: {
					sql: `SELECT checkpoint_namespace, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
						 FROM langgraph_checkpoints
						 WHERE organization_id = ? AND run_id = ? AND thread_id = ?
						   AND checkpoint_namespace = ?
						 ORDER BY checkpoint_id DESC LIMIT 1`,
					args: [this.#organizationId, this.#runId, scope.threadId, scope.namespace],
				};
		const row = (await this.#client.execute(statement)).rows[0];
		return row ? this.#tuple(this.#checkpointRow(row)) : undefined;
	}

	async *list(
		config: RunnableConfig,
		options?: CheckpointListOptions,
	): AsyncGenerator<CheckpointTuple> {
		const scope = this.#scope(config);
		const clauses = [
			"organization_id = ?",
			"run_id = ?",
			"thread_id = ?",
			"checkpoint_namespace = ?",
		];
		const values: Array<string | number> = [
			this.#organizationId,
			this.#runId,
			scope.threadId,
			scope.namespace,
		];
		const beforeId = options?.before?.configurable?.checkpoint_id;
		if (typeof beforeId === "string") {
			clauses.push("checkpoint_id < ?");
			values.push(beforeId);
		}
		for (const [key, value] of Object.entries(options?.filter ?? {})) {
			if (!FILTER_KEYS.has(key)) throw new Error(`Unsupported checkpoint metadata filter: ${key}`);
			clauses.push(`json_extract(CAST(metadata AS TEXT), '$.${key}') = ?`);
			values.push(typeof value === "number" ? value : String(value));
		}
		const limit = Math.max(0, Math.min(options?.limit ?? 100, 1_000));
		values.push(limit);
		const result = await this.#client.execute({
			sql: `SELECT checkpoint_namespace, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
				 FROM langgraph_checkpoints WHERE ${clauses.join(" AND ")}
				 ORDER BY checkpoint_id DESC LIMIT ?`,
			args: values,
		});
		for (const row of result.rows) yield await this.#tuple(this.#checkpointRow(row));
	}

	async put(
		config: RunnableConfig,
		checkpoint: Checkpoint,
		metadata: CheckpointMetadata,
		_newVersions: ChannelVersions,
	): Promise<RunnableConfig> {
		const scope = this.#scope(config);
		const [checkpointType, checkpointValue] = await this.serde.dumpsTyped(checkpoint);
		const [, metadataValue] = await this.serde.dumpsTyped(metadata);
		await this.#client.execute({
			sql: `INSERT OR REPLACE INTO langgraph_checkpoints
				 (organization_id, run_id, thread_id, checkpoint_namespace, checkpoint_id,
				  parent_checkpoint_id, type, checkpoint, metadata, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				this.#organizationId,
				this.#runId,
				scope.threadId,
				scope.namespace,
				checkpoint.id,
				scope.checkpointId ?? null,
				checkpointType,
				checkpointValue,
				metadataValue,
				Date.now(),
				this.#expiresAt.getTime(),
			],
		});
		return this.#config(scope.threadId, scope.namespace, checkpoint.id);
	}

	async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
		const scope = this.#scope(config);
		if (!scope.checkpointId) throw new Error("A checkpoint ID is required for pending writes");
		const checkpointId = scope.checkpointId;
		const serialized = await Promise.all(
			writes.map(async ([channel, value], index) => {
				const [type, bytes] = await this.serde.dumpsTyped(value);
				return { channel, type, bytes, index: WRITES_IDX_MAP[channel] ?? index };
			}),
		);
		await this.#client.batch(
			serialized.map((write) => ({
				sql: `INSERT OR REPLACE INTO langgraph_checkpoint_writes
				 (organization_id, run_id, thread_id, checkpoint_namespace, checkpoint_id,
				  task_id, write_index, channel, type, value, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					this.#organizationId,
					this.#runId,
					scope.threadId,
					scope.namespace,
					checkpointId,
					taskId,
					write.index,
					write.channel,
					write.type,
					write.bytes,
					Date.now(),
					this.#expiresAt.getTime(),
				],
			})),
			"write",
		);
	}

	async deleteThread(threadId: string): Promise<void> {
		if (threadId !== this.#runId)
			throw new Error("LangGraph thread_id must equal the configured analysis run ID");
		const args = [this.#organizationId, this.#runId, threadId];
		await this.#client.batch(
			[
				{
					sql: "DELETE FROM langgraph_checkpoint_writes WHERE organization_id = ? AND run_id = ? AND thread_id = ?",
					args,
				},
				{
					sql: "DELETE FROM langgraph_checkpoints WHERE organization_id = ? AND run_id = ? AND thread_id = ?",
					args,
				},
			],
			"write",
		);
	}
}
