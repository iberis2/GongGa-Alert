import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testDataDir = await mkdtemp(path.join(os.tmpdir(), "waitlist-alert-test-"));
process.env.DATA_DIR = testDataDir;
process.env.KAKAO_SEND_MODE = "disabled";

const { parseWaitlistCount } = await import("../lib/parser");
const { runMonitorOnce } = await import("../lib/monitor");
const { sendKakaoChangeMessage } = await import("../lib/kakao");
const { loadHistory, loadLogs, loadState } = await import("../lib/storage");

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

function makeChange() {
  return {
    checkedAt: new Date().toISOString(),
    previousCount: 10,
    currentCount: 13,
    diff: 3,
    sourceUrl: "https://www.myhome.go.kr/hws/portal/sch/selectMoveWaitStsDetail.do"
  };
}

async function resetKakaoEnv() {
  await resetData(10);
  process.env.KAKAO_SEND_MODE = "me";
  process.env.KAKAO_REST_API_KEY = "rest-api-key";
  process.env.KAKAO_ACCESS_TOKEN = "old-access-token";
  process.env.KAKAO_REFRESH_TOKEN = "old-refresh-token";
  process.env.KAKAO_CLIENT_SECRET = "client-secret";
  process.env.KAKAO_FRIEND_UUIDS = "";
}

async function testKakaoSendsWithoutRefresh() {
  await resetKakaoEnv();
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    await sendKakaoChangeMessage(makeChange());
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0], "https://kapi.kakao.com/v2/api/talk/memo/default/send");
}

async function testKakaoRefreshesAfterUnauthorized() {
  await resetKakaoEnv();
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          code: -401,
          msg: "InvalidTokenException old-access-token"
        }),
        { status: 401 }
      );
    }

    if (url === "https://kauth.kakao.com/oauth/token") {
      return new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 43199
        }),
        { status: 200 }
      );
    }

    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    await sendKakaoChangeMessage(makeChange());
  } finally {
    globalThis.fetch = originalFetch;
  }

  const logs = await loadLogs();
  const serializedLogs = JSON.stringify(logs);

  assert.deepEqual(calls, [
    "https://kapi.kakao.com/v2/api/talk/memo/default/send",
    "https://kauth.kakao.com/oauth/token",
    "https://kapi.kakao.com/v2/api/talk/memo/default/send"
  ]);
  assert.match(serializedLogs, /access token 갱신 후 메시지 발송 성공/);
  assert.match(serializedLogs, /KAKAO_REFRESH_TOKEN/);
  assert.equal(serializedLogs.includes("old-access-token"), false);
  assert.equal(serializedLogs.includes("old-refresh-token"), false);
  assert.equal(serializedLogs.includes("new-refresh-token"), false);
}

async function testKakaoFailureMasksSecrets() {
  await resetKakaoEnv();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("failure old-access-token old-refresh-token client-secret", {
      status: 500
    })) as typeof fetch;

  try {
    await assert.rejects(sendKakaoChangeMessage(makeChange()));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const logs = await loadLogs();
  const serializedLogs = JSON.stringify(logs);

  assert.equal(serializedLogs.includes("old-access-token"), false);
  assert.equal(serializedLogs.includes("old-refresh-token"), false);
  assert.equal(serializedLogs.includes("client-secret"), false);
  assert.match(serializedLogs, /\[REDACTED\]/);
}

try {
  await testParser();
  await testFirstRun();
  await testUnchangedRun();
  await testChangedRun();
  await testKakaoSendsWithoutRefresh();
  await testKakaoRefreshesAfterUnauthorized();
  await testKakaoFailureMasksSecrets();
  console.log("All tests passed.");
} finally {
  await rm(testDataDir, { recursive: true, force: true });
}
