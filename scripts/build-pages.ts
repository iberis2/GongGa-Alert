import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HistoryEntry, LogEntry, MonitorState } from "../lib/types";

const outputDir = path.join(process.cwd(), "gh-pages");
const dataDir = path.join(process.cwd(), "data");

async function readJson<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path.join(dataDir, fileName), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: string | null) {
  if (!value) {
    return "아직 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatCount(value: number | null) {
  return value === null ? "-" : `${value.toLocaleString("ko-KR")}명`;
}

function renderHistory(history: HistoryEntry[]) {
  if (history.length === 0) {
    return "<div class=\"empty\">아직 변경 이력이 없습니다.</div>";
  }

  return `
    <table>
      <thead>
        <tr>
          <th>감지 시각</th>
          <th>이전</th>
          <th>현재</th>
          <th>변화</th>
        </tr>
      </thead>
      <tbody>
        ${history
          .map(
            (entry) => `
              <tr>
                <td>${escapeHtml(formatDate(entry.checkedAt))}</td>
                <td>${entry.previousCount ?? "-"}</td>
                <td>${entry.currentCount.toLocaleString("ko-KR")}</td>
                <td>${
                  entry.diff === null
                    ? "-"
                    : `${entry.diff > 0 ? "+" : ""}${entry.diff}`
                }</td>
              </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderLogs(logs: LogEntry[]) {
  if (logs.length === 0) {
    return "<div class=\"empty\">아직 실행 로그가 없습니다.</div>";
  }

  return logs
    .slice(0, 10)
    .map(
      (log) => `
        <article class="log ${escapeHtml(log.level)}">
          <strong>[${escapeHtml(log.level)}] ${escapeHtml(log.message)}</strong>
          <p>${escapeHtml(formatDate(log.createdAt))}</p>
          ${log.detail ? `<p>${escapeHtml(log.detail)}</p>` : ""}
        </article>`
    )
    .join("");
}

function renderPage(state: MonitorState, history: HistoryEntry[], logs: LogEntry[]) {
  const generatedAt = new Date().toISOString();
  const isFailing = state.consecutiveFailureCount > 0;
  const statusText = isFailing
    ? `확인 실패 ${state.consecutiveFailureCount}회`
    : "정상 확인";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>입주대기자 수 알리미</title>
    <meta name="description" content="마이홈 청약 공고의 입주대기자 수 변경 이력 대시보드" />
    <style>
      :root {
        --bg: #f6f7f9;
        --panel: #ffffff;
        --panel-soft: #eef5f1;
        --text: #15201b;
        --muted: #64736c;
        --line: #d9e1dd;
        --accent: #0f7b5c;
        --accent-strong: #095a43;
        --warn: #9f5b00;
        --error: #b3261e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Arial, Helvetica, sans-serif;
      }
      .topbar {
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }
      .topbar-inner, .content {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
      }
      .topbar-inner {
        min-height: 72px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      h1, h2, p { margin-top: 0; }
      h1 { margin-bottom: 4px; font-size: 22px; }
      h2 { margin-bottom: 0; font-size: 17px; }
      .subtitle, .muted { color: var(--muted); }
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--panel-soft);
        font-size: 14px;
        white-space: nowrap;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
      }
      .status-pill.warn {
        background: #fff7e8;
      }
      .status-pill.warn .status-dot {
        background: var(--warn);
      }
      .content { padding: 28px 0 48px; }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .metric, .section {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }
      .metric {
        min-height: 132px;
        padding: 18px;
        display: grid;
        align-content: space-between;
      }
      .metric span { color: var(--muted); font-size: 13px; }
      .metric strong {
        display: block;
        margin-top: 10px;
        font-size: 30px;
        line-height: 1.1;
      }
      .metric small { color: var(--muted); line-height: 1.5; }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.8fr);
        gap: 18px;
        margin-top: 18px;
      }
      .health-message {
        margin: 0;
        color: var(--warn);
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      .section { overflow: hidden; }
      .section-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--line);
      }
      .section-body { padding: 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td {
        padding: 12px 10px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }
      th { color: var(--muted); font-weight: 600; }
      .empty {
        min-height: 120px;
        display: grid;
        place-items: center;
        color: var(--muted);
        text-align: center;
      }
      .source-link {
        display: block;
        overflow-wrap: anywhere;
        color: var(--accent-strong);
        line-height: 1.5;
      }
      .logs { display: grid; gap: 10px; }
      .log {
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fbfcfb;
      }
      .log strong { display: block; margin-bottom: 4px; }
      .log.error strong { color: var(--error); }
      .log.warn strong { color: var(--warn); }
      .log p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      @media (max-width: 860px) {
        .topbar-inner {
          align-items: flex-start;
          flex-direction: column;
          padding: 16px 0;
        }
        .summary-grid, .layout { grid-template-columns: 1fr; }
        table { min-width: 620px; }
        .table-section { overflow-x: auto; }
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="topbar-inner">
        <div>
          <h1>입주대기자 수 알리미</h1>
          <p class="subtitle">GitHub Pages에 배포된 마이홈 예비입주자 대기현황 대시보드입니다.</p>
        </div>
        <div class="status-pill ${isFailing ? "warn" : ""}">
          <span class="status-dot"></span>
          ${escapeHtml(statusText)} · ${escapeHtml(formatDate(generatedAt))} 갱신
        </div>
      </div>
    </header>
    <main class="content">
      <section class="summary-grid" aria-label="요약">
        <div class="metric">
          <span>현재 입주대기자</span>
          <strong>${escapeHtml(formatCount(state.latestCount))}</strong>
          <small>마지막 모니터 실행 결과입니다.</small>
        </div>
        <div class="metric">
          <span>마지막 확인</span>
          <strong>${escapeHtml(formatDate(state.lastCheckedAt))}</strong>
          <small>정상으로 값을 읽은 최근 시각입니다.</small>
        </div>
        <div class="metric">
          <span>마지막 변경</span>
          <strong>${escapeHtml(formatDate(state.lastChangedAt))}</strong>
          <small>입주대기자 수가 달라진 최근 시각입니다.</small>
        </div>
        <div class="metric">
          <span>모니터 상태</span>
          <strong>${isFailing ? `${state.consecutiveFailureCount}회 실패` : "정상"}</strong>
          <small>${
            isFailing
              ? `마지막 실패: ${escapeHtml(formatDate(state.lastFailedAt))}`
              : "마지막 정상값을 유지합니다."
          }</small>
        </div>
      </section>
      ${
        isFailing
          ? `<section class="section" style="margin-top:18px">
              <div class="section-header">
                <h2>확인 실패 진단</h2>
              </div>
              <div class="section-body">
                <p class="health-message">${escapeHtml(state.lastErrorSummary || "")}</p>
              </div>
            </section>`
          : ""
      }
      <div class="layout">
        <section class="section table-section">
          <div class="section-header">
            <h2>변경 이력</h2>
            <span class="muted">${history.length.toLocaleString("ko-KR")}건</span>
          </div>
          ${renderHistory(history)}
        </section>
        <section class="section">
          <div class="section-header">
            <h2>감시 대상</h2>
          </div>
          <div class="section-body">
            <a class="source-link" href="${escapeHtml(state.sourceUrl)}">${escapeHtml(state.sourceUrl)}</a>
          </div>
        </section>
      </div>
      <div class="layout">
        <section class="section">
          <div class="section-header">
            <h2>실행 로그</h2>
          </div>
          <div class="section-body logs">
            ${renderLogs(logs)}
          </div>
        </section>
        <section class="section">
          <div class="section-header">
            <h2>운영 메모</h2>
          </div>
          <div class="section-body">
            <p class="muted">GitHub Pages는 정적 호스팅이므로 링크 입력 즉시 확인 기능은 로컬 Next 대시보드에서 사용합니다.</p>
            <p class="muted">자동 갱신은 GitHub Actions가 모니터를 실행하고 이 페이지를 다시 배포할 때 반영됩니다.</p>
          </div>
        </section>
      </div>
    </main>
  </body>
</html>`;
}

const state = await readJson<MonitorState>("state.json", {
  sourceUrl: "",
  latestCount: null,
  lastCheckedAt: null,
  lastChangedAt: null,
  lastFailedAt: null,
  lastErrorSummary: null,
  consecutiveFailureCount: 0
});
const history = await readJson<HistoryEntry[]>("history.json", []);
const logs = await readJson<LogEntry[]>("logs.json", []);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, ".nojekyll"), "", "utf8");
await writeFile(path.join(outputDir, "index.html"), renderPage(state, history, logs), "utf8");
await mkdir(path.join(outputDir, "data"), { recursive: true });
await writeFile(path.join(outputDir, "data", "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
await writeFile(path.join(outputDir, "data", "history.json"), `${JSON.stringify(history, null, 2)}\n`, "utf8");
await writeFile(path.join(outputDir, "data", "logs.json"), `${JSON.stringify(logs, null, 2)}\n`, "utf8");

console.log(`GitHub Pages dashboard built at ${outputDir}`);
