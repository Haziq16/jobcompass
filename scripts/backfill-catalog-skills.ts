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
  try {
    for (;;) {
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
      if (updated % 5000 === 0) {
        // Reuse dead tuple/index space during this one-time derived-data rebuild.
        await authDb.$executeRawUnsafe('VACUUM (ANALYZE) "CatalogJob"');
        console.log(JSON.stringify({ updated }));
      }
    }
    console.log(JSON.stringify({ updated, complete: true }));
  } finally {
    await authDb.$disconnect();
  }
}
void main().catch(() => {
  console.error("Public catalogue skill backfill failed");
  process.exitCode = 1;
});
