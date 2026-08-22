import { CHECK_INTERVAL_MS } from "../lib/config";
import { runMonitorOnce } from "../lib/monitor";

async function tick() {
  try {
    const result = await runMonitorOnce();
    console.log(`[${new Date().toISOString()}] ${result.status}`);
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] monitor failed`,
      error instanceof Error ? error.message : error
    );
  }
}

await tick();
setInterval(tick, CHECK_INTERVAL_MS);
