// Read-only contract checks: two public GETs; no database writes or paid providers.
import { boardInput, DirectBoardProvider } from "../src/lib/direct-provider";
async function main() {
  for (const input of [
    { platform: "greenhouse", board: "greenhouse" },
    { platform: "lever", board: "spotify" },
  ]) {
    const board = boardInput.parse(input);
    try {
      const result = await new DirectBoardProvider(board).search({
        query: "All board jobs",
        country: "zz",
        datePosted: "all",
        remoteOnly: false,
      });
      console.log(
        JSON.stringify({
          platform: board.platform,
          board: board.board,
          jobs: result.jobs.length,
          validSourceIds: result.jobs.every((j) =>
            j.providerId.startsWith(`direct:${board.platform}:`),
          ),
          httpsLinks: result.jobs.every((j) =>
            j.applyLinks.every((l) => l.url.startsWith("https://")),
          ),
          checkedAt: result.fetchedAt,
          databaseWrites: 0,
          paidProviderRequests: 0,
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          platform: board.platform,
          board: board.board,
          error: (error as Error).message,
        }),
      );
      process.exitCode = 1;
    }
  }
}
void main();
