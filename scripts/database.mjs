import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
const data = path.resolve(".postgres");
const pg = new EmbeddedPostgres({
  databaseDir: data,
  user: "jobcompass",
  password: "local_jobcompass",
  port: 54329,
  persistent: true,
  createPostgresUser: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1", "-c", "timezone=UTC"],
});
if (!existsSync(path.join(data, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='jobcompass'",
);
if (!result.rowCount)
  await client.query(
    "CREATE DATABASE jobcompass ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
  );
await client.end();
console.log(
  "PostgreSQL ready on 127.0.0.1:54329. Data persists in .postgres/. Leave this terminal open.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
