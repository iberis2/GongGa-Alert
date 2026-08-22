import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testDataDir = await mkdtemp(path.join(os.tmpdir(), "waitlist-alert-test-"));
process.env.DATA_DIR = testDataDir;
process.env.KAKAO_SEND_MODE = "disabled";

const { parseWaitlistCount } = await import("../lib/parser");
const { runMonitorOnce } = await import("../lib/monitor");
const { loadHistory, loadState } = await import("../lib/storage");

async function resetData(latestCount: number | null) {
  await writeFile(
    path.join(testDataDir, "state.json"),
    `${JSON.stringify(
      {
        sourceUrl:
          "https://www.myhome.go.kr/hws/portal/sch/selectMoveWaitStsDetail.do",
        latestCount,
        lastCheckedAt: null,
        lastChangedAt: null
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(path.join(testDataDir, "history.json"), "[]\n", "utf8");
  await writeFile(path.join(testDataDir, "logs.json"), "[]\n", "utf8");
}

async function testParser() {
  assert.equal(
    parseWaitlistCount("<table><tr><th>입주대기자</th><td>42명</td></tr></table>"),
    42
  );
  assert.equal(parseWaitlistCount("<div>입주대기자 수 : 1, 234 명</div>"), 1234);
  assert.equal(parseWaitlistCount("<div>모집세대수 10</div>"), null);
}

async function testFirstRun() {
  await resetData(null);
  let sent = 0;

  const result = await runMonitorOnce({
    fetchHtml: async () => "<div>입주대기자 10명</div>",
    sendMessage: async () => {
      sent += 1;
    }
  });
  const state = await loadState();
  const history = await loadHistory();

  assert.equal(result.status, "initialized");
  assert.equal(state.latestCount, 10);
  assert.equal(history.length, 0);
  assert.equal(sent, 0);
}

async function testUnchangedRun() {
  await resetData(10);
  let sent = 0;

  const result = await runMonitorOnce({
    fetchHtml: async () => "<div>입주대기자 10명</div>",
    sendMessage: async () => {
      sent += 1;
    }
  });
  const history = await loadHistory();

  assert.equal(result.status, "unchanged");
  assert.equal(history.length, 0);
  assert.equal(sent, 0);
}

async function testChangedRun() {
  await resetData(10);
  let sent = 0;

  const result = await runMonitorOnce({
    fetchHtml: async () => "<div>입주대기자 13명</div>",
    sendMessage: async () => {
      sent += 1;
    }
  });
  const history = await loadHistory();

  assert.equal(result.status, "changed");
  assert.equal(history.length, 1);
  assert.deepEqual(
    {
      previousCount: history[0]?.previousCount,
      currentCount: history[0]?.currentCount,
      diff: history[0]?.diff
    },
    {
      previousCount: 10,
      currentCount: 13,
      diff: 3
    }
  );
  assert.equal(sent, 1);
}

try {
  await testParser();
  await testFirstRun();
  await testUnchangedRun();
  await testChangedRun();
  console.log("All tests passed.");
} finally {
  await rm(testDataDir, { recursive: true, force: true });
}
