// Rebuild derived public mention keys without changing firstSeen/content dates.
import { authDb } from "../src/lib/db";
import {
  catalogSkillKeys,
  CATALOG_SKILL_VERSION,
} from "../src/lib/catalog-skill-signals";
async function main() {
  if (!process.argv.includes("--execute"))
    throw new Error("Review the environment and pass --execute");
  let updated = 0;
  let lastVacuum = 0;
  let connectionFailures = 0;
  try {
    for (;;) {
      try {
        const size = await authDb.$queryRaw<
          { bytes: bigint }[]
        >`SELECT pg_database_size(current_database()) AS bytes`;
        if (Number(size[0].bytes) > 900 * 1024 * 1024)
          throw new Error("Cache maintenance storage reserve reached");
        const rows = await authDb.$queryRaw<
          { id: string; searchText: string; hash: string }[]
        >`SELECT id,"searchText",hash FROM "CatalogJob" WHERE "skillKeysVersion"<${CATALOG_SKILL_VERSION} OR "skillKeysHash" IS DISTINCT FROM hash ORDER BY id LIMIT 500`;
        if (!rows.length) break;
        const data = JSON.stringify(
          rows.map((row) => ({
            id: row.id,
            hash: row.hash,
            keys: catalogSkillKeys(row.searchText),
          })),
        );
        updated +=
          await authDb.$executeRaw`UPDATE "CatalogJob" j SET "skillKeys"=s.keys,"skillKeysVersion"=${CATALOG_SKILL_VERSION},"skillKeysHash"=s.hash FROM jsonb_to_recordset(${data}::jsonb) AS s(id text,hash text,keys text[]) WHERE j.id=s.id AND j.hash=s.hash`;
        if (updated - lastVacuum >= 5000) {
          // Reuse dead tuple/index space during this one-time derived-data rebuild.
          await authDb.$executeRawUnsafe('VACUUM (ANALYZE) "CatalogJob"');
          lastVacuum = updated;
          console.log(JSON.stringify({ updated }));
        }
        connectionFailures = 0;
      } catch (error) {
        const code =
          (error as { code?: string; errorCode?: string }).code ||
          (error as { errorCode?: string }).errorCode;
        if (
          (!["P1001", "P1002", "P1017"].includes(code || "") &&
            (error as { name?: string }).name !==
              "PrismaClientInitializationError") ||
          ++connectionFailures > 3
        )
          throw error;
        await authDb.$disconnect();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log(
          JSON.stringify({
            status: "reconnecting",
            code,
            attempt: connectionFailures,
          }),
        );
      }
    }
    console.log(JSON.stringify({ updated, complete: true }));
  } finally {
    await authDb.$disconnect();
  }
}
void main().catch((error: unknown) => {
  const failure = error as {
    name?: string;
    code?: string;
    meta?: { code?: string };
  };
  console.error(
    JSON.stringify({
      status: "failed",
      name: failure?.name,
      code: failure?.code,
      databaseCode: failure?.meta?.code,
    }),
  );
  process.exitCode = 1;
});
