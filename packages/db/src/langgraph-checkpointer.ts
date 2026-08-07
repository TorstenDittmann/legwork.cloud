import type { Database as BunDatabase } from "bun:sqlite";
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

export class BunSqliteCheckpointSaver extends BaseCheckpointSaver {
	readonly #client: BunDatabase;
	readonly #organizationId: string;
	readonly #runId: string;
	readonly #expiresAt: Date;

	constructor(options: { db: Database; organizationId: string; runId: string; expiresAt: Date }) {
		super();
		this.#client = (options.db as Database & { $client: BunDatabase }).$client;
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
		const writes = this.#client
			.query<WriteRow, [string, string, string, string, string]>(
				`SELECT task_id, channel, type, value
				 FROM langgraph_checkpoint_writes
				 WHERE organization_id = ? AND run_id = ? AND thread_id = ?
				   AND checkpoint_namespace = ? AND checkpoint_id = ?
				 ORDER BY task_id, write_index`,
			)
			.all(
				this.#organizationId,
				this.#runId,
				this.#runId,
				row.checkpoint_namespace,
				row.checkpoint_id,
			);
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

	async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
		const scope = this.#scope(config);
		const row = scope.checkpointId
			? this.#client
					.query<CheckpointRow, [string, string, string, string, string]>(
						`SELECT checkpoint_namespace, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
						 FROM langgraph_checkpoints
						 WHERE organization_id = ? AND run_id = ? AND thread_id = ?
						   AND checkpoint_namespace = ? AND checkpoint_id = ?`,
					)
					.get(
						this.#organizationId,
						this.#runId,
						scope.threadId,
						scope.namespace,
						scope.checkpointId,
					)
			: this.#client
					.query<CheckpointRow, [string, string, string, string]>(
						`SELECT checkpoint_namespace, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
						 FROM langgraph_checkpoints
						 WHERE organization_id = ? AND run_id = ? AND thread_id = ?
						   AND checkpoint_namespace = ?
						 ORDER BY checkpoint_id DESC LIMIT 1`,
					)
					.get(this.#organizationId, this.#runId, scope.threadId, scope.namespace);
		return row ? this.#tuple(row) : undefined;
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
		const rows = this.#client
			.query<CheckpointRow, Array<string | number>>(
				`SELECT checkpoint_namespace, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
				 FROM langgraph_checkpoints WHERE ${clauses.join(" AND ")}
				 ORDER BY checkpoint_id DESC LIMIT ?`,
			)
			.all(...values);
		for (const row of rows) yield await this.#tuple(row);
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
		this.#client
			.query(
				`INSERT OR REPLACE INTO langgraph_checkpoints
				 (organization_id, run_id, thread_id, checkpoint_namespace, checkpoint_id,
				  parent_checkpoint_id, type, checkpoint, metadata, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
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
			);
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
		const insert = this.#client.query(
			`INSERT OR REPLACE INTO langgraph_checkpoint_writes
			 (organization_id, run_id, thread_id, checkpoint_namespace, checkpoint_id,
			  task_id, write_index, channel, type, value, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		this.#client.transaction(() => {
			for (const write of serialized)
				insert.run(
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
				);
		})();
	}

	async deleteThread(threadId: string): Promise<void> {
		if (threadId !== this.#runId)
			throw new Error("LangGraph thread_id must equal the configured analysis run ID");
		this.#client.transaction(() => {
			this.#client
				.query(
					"DELETE FROM langgraph_checkpoint_writes WHERE organization_id = ? AND run_id = ? AND thread_id = ?",
				)
				.run(this.#organizationId, this.#runId, threadId);
			this.#client
				.query(
					"DELETE FROM langgraph_checkpoints WHERE organization_id = ? AND run_id = ? AND thread_id = ?",
				)
				.run(this.#organizationId, this.#runId, threadId);
		})();
	}
}
