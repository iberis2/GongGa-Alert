import { InstantCheckForm } from "./components/InstantCheckForm";
import { loadHistory, loadLogs, loadState } from "../lib/storage";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) {
    return "아직 없음";
  }

  return new Date(value).toLocaleString("ko-KR");
}

export default async function Home() {
  const [state, history, logs] = await Promise.all([
    loadState(),
    loadHistory(),
    loadLogs()
  ]);
  const latestChange = history[0];

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <h1>입주대기자 수 알리미</h1>
            <p>마이홈 예비입주자 대기현황을 1시간마다 확인합니다.</p>
          </div>
          <div className="status-pill" aria-label="모니터 상태">
            <span className="status-dot" aria-hidden="true" />
            로컬 모니터 준비
          </div>
        </div>
      </header>

      <div className="content">
        <section className="summary-grid" aria-label="요약">
          <div className="metric">
            <span>현재 입주대기자</span>
            <strong>
              {state.latestCount === null
                ? "-"
                : `${state.latestCount.toLocaleString("ko-KR")}명`}
            </strong>
            <small>최초 실행 후 기준값이 저장됩니다.</small>
          </div>
          <div className="metric">
            <span>마지막 확인</span>
            <strong>{formatDate(state.lastCheckedAt)}</strong>
            <small>모니터가 실행된 최근 시각입니다.</small>
          </div>
          <div className="metric">
            <span>마지막 변경</span>
            <strong>{formatDate(state.lastChangedAt)}</strong>
            <small>입주대기자 수가 달라진 최근 시각입니다.</small>
          </div>
          <div className="metric">
            <span>최근 변화량</span>
            <strong>
              {latestChange?.diff === null || latestChange?.diff === undefined
                ? "-"
                : `${latestChange.diff > 0 ? "+" : ""}${latestChange.diff}`}
            </strong>
            <small>변경 이력의 최신 항목 기준입니다.</small>
          </div>
        </section>

        <div className="layout">
          <section className="section table-section">
            <div className="section-header">
              <h2>변경 이력</h2>
              <span>{history.length.toLocaleString("ko-KR")}건</span>
            </div>
            {history.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>감지 시각</th>
                    <th>이전</th>
                    <th>현재</th>
                    <th>변화</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={`${entry.checkedAt}-${entry.currentCount}`}>
                      <td>{formatDate(entry.checkedAt)}</td>
                      <td>{entry.previousCount ?? "-"}</td>
                      <td>{entry.currentCount.toLocaleString("ko-KR")}</td>
                      <td>
                        {entry.diff === null
                          ? "-"
                          : `${entry.diff > 0 ? "+" : ""}${entry.diff}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">아직 변경 이력이 없습니다.</div>
            )}
          </section>

          <aside className="section">
            <div className="section-header">
              <h2>상세 링크 확인</h2>
            </div>
            <div className="section-body">
              <InstantCheckForm />
            </div>
          </aside>
        </div>

        <div className="layout">
          <section className="section">
            <div className="section-header">
              <h2>감시 대상</h2>
            </div>
            <div className="section-body">
              <a className="source-link" href={state.sourceUrl} target="_blank">
                {state.sourceUrl}
              </a>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h2>실행 로그</h2>
            </div>
            <div className="section-body logs">
              {logs.length > 0 ? (
                logs.slice(0, 8).map((log) => (
                  <article
                    className="log"
                    data-level={log.level}
                    key={`${log.createdAt}-${log.message}`}
                  >
                    <strong>
                      [{log.level}] {log.message}
                    </strong>
                    <p>{formatDate(log.createdAt)}</p>
                    {log.detail ? <p>{log.detail}</p> : null}
                  </article>
                ))
              ) : (
                <div className="empty">아직 실행 로그가 없습니다.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
