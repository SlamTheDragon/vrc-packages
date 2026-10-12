import { LocalNodeStore } from "../../src/storage/local_sqlite.ts";
import { CrawlerNodeDaemon } from "../../src/runner/daemon.ts";
import { CoordinatorClient } from "../../src/client/node_client.ts";
import { loadNodeRuntimeConfig } from "../../src/config/runtime_config.ts";
import { logger } from "../../src/utils/logging/logger.ts";

const phase = process.env.VRCP_OUTBOX_PHASE;
if (phase !== "initial" && phase !== "replay") throw new Error("Invalid outbox fixture phase");
const config = loadNodeRuntimeConfig(process.cwd(), process.env);
const store = new LocalNodeStore(config.databasePath);
const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities, { maxRetries: 0 });
let sourceFetches = 0;
const daemon = new CrawlerNodeDaemon(config, store, client, { runOnce: true, fetchFn: async () => {
  if (phase !== "initial") throw new Error("Replay must not fetch a source");
  sourceFetches++;
  console.log("VRCP_OUTBOX_SOURCE_FETCH");
  return new Response(null, { status: 304 });
} });
try {
  await daemon.start();
  console.log(`VRCP_OUTBOX_FINISHED ${JSON.stringify({ phase, sourceFetches, runId: daemon.currentRunId })}`);
} finally {
  daemon.stop();
  store.close();
  await logger.close();
}
