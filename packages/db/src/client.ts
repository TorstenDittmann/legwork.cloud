import { Database as SQLite } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

let client: SQLite | undefined;
let database: Database | undefined;
export type Database = BunSQLiteDatabase<typeof schema>;

export function createDatabase(path = process.env.DATABASE_PATH ?? "local.db"): Database {
	if (!database) {
		client = new SQLite(path, { create: true });
		client.run("PRAGMA journal_mode = WAL");
		client.run("PRAGMA foreign_keys = ON");
		client.run("PRAGMA busy_timeout = 5000");
		database = drizzle(client, { schema });
	}
	return database;
}

export async function closeDatabase(): Promise<void> {
	client?.close();
	client = undefined;
	database = undefined;
}
