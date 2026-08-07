import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase, closeDatabase } from "./client";

await migrate(createDatabase(), {
	migrationsFolder: new URL("../migrations", import.meta.url).pathname,
});
await closeDatabase();
