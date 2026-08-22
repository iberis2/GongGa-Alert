import { writeFile } from "node:fs/promises";
import { explainMyHomeError } from "../lib/myhome";
import { runMonitorOnce } from "../lib/monitor";
import { loadState } from "../lib/storage";

const outputPath = "monitor-result.json";

try {
  const result = await runMonitorOnce();
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const state = await loadState();
  const technicalDetail =
    state.lastTechnicalDetail ||
    (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  const result = {
    status: "failed",
    checkedAt: state.lastFailedAt || new Date().toISOString(),
    errorSummary: state.lastErrorSummary || explainMyHomeError(technicalDetail),
    technicalDetail,
    consecutiveFailureCount: state.consecutiveFailureCount
  };

  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}
