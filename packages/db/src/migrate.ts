import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDatabase, closeDatabase } from "./client";

await migrate(createDatabase(), {
	migrationsFolder: new URL("../migrations", import.meta.url).pathname,
});
await closeDatabase();
