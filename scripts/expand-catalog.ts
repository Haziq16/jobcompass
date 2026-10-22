// Explicit, bounded operator bootstrap. Does not read private profile/CV/key data.
import { expandCatalog } from "../src/lib/catalog-expansion";
import { authDb } from "../src/lib/db";
async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--boards");
  const requested = index < 0 ? 50 : Number(args[index + 1]);
  if (
    !args.includes("--execute") ||
    !Number.isInteger(requested) ||
    requested < 1 ||
    requested > 2000
  )
    throw new Error(
      "Use --boards 1..2000 --execute with the intended database environment",
    );
  try {
    let checked = 0;
    while (checked < requested) {
      const result = await expandCatalog({
        maxBoards: Math.min(50, requested - checked),
        timeBudgetMs: 120000,
        bypassInterval: true,
      });
      console.log(JSON.stringify(result));
      checked += result.checked;
      if (!result.checked || result.status === "capacity_paused") break;
    }
    console.log(
      JSON.stringify({
        checked,
        activeJobs: await authDb.catalogJob.count({ where: { active: true } }),
        enabledBoards: await authDb.catalogBoard.count({
          where: { enabled: true },
        }),
      }),
    );
  } finally {
    await authDb.$disconnect();
  }
}
void main().catch(() => {
  console.error("Catalogue operation failed");
  process.exitCode = 1;
});
