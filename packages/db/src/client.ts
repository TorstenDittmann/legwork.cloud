import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let client: Client | undefined;
let database: Database | undefined;
export type Database = LibSQLDatabase<typeof schema>;

function findWorkspaceRoot(start: string): string {
	let directory = start;
	while (true) {
		try {
			const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
				workspaces?: unknown;
			};
			if (Array.isArray(manifest.workspaces)) return directory;
		} catch {
			// Continue toward the filesystem root when this is not a workspace manifest.
		}
		const parent = dirname(directory);
		if (parent === directory) return start;
		directory = parent;
	}
}

function databaseUrl(value: string): string {
	if (/^(file:|https?:|wss?:|libsql:)/.test(value)) return value;
	const path = isAbsolute(value) ? value : resolve(findWorkspaceRoot(process.cwd()), value);
	return `file:${path}`;
}

export function createDatabase(url = process.env.DATABASE_URL ?? "local.db"): Database {
	if (!database) {
		const authToken = process.env.DATABASE_AUTH_TOKEN;
		client = createClient({ url: databaseUrl(url), ...(authToken ? { authToken } : {}) });
		database = drizzle(client, { schema });
	}
	return database;
}

export async function closeDatabase(): Promise<void> {
	client?.close();
	client = undefined;
	database = undefined;
}
