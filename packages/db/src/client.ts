import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let client: Client | undefined;
let database: Database | undefined;
export type Database = LibSQLDatabase<typeof schema>;

export function createDatabase(url = process.env.TURSO_DATABASE_URL ?? "file:local.db", authToken = process.env.TURSO_AUTH_TOKEN): Database {
  if (!database) {
    client = createClient({ url, ...(authToken ? { authToken } : {}) });
    database = drizzle(client, { schema });
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  client?.close(); client = undefined; database = undefined;
}
