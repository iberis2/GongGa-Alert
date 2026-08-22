import { DASHBOARD_URL } from "./config";
import { sendKakaoChangeMessage } from "./kakao";
import { fetchNoticeHtml } from "./myhome";
import { parseWaitlistCount } from "./parser";
import {
  appendLog,
  loadState,
  recordHistory,
  saveState
} from "./storage";
import type { MonitorResult } from "./types";

type MonitorDeps = {
  fetchHtml?: typeof fetchNoticeHtml;
  sendMessage?: typeof sendKakaoChangeMessage;
  dashboardUrl?: string;
};

export async function runMonitorOnce(deps: MonitorDeps = {}): Promise<MonitorResult> {
  const fetchHtml = deps.fetchHtml || fetchNoticeHtml;
  const sendMessage = deps.sendMessage || sendKakaoChangeMessage;
  const dashboardUrl = deps.dashboardUrl || DASHBOARD_URL;
  const state = await loadState();
  const checkedAt = new Date().toISOString();

  try {
    const html = await fetchHtml(state.sourceUrl);
    const currentCount = parseWaitlistCount(html);

    if (currentCount === null) {
      await appendLog({
        level: "error",
        message: "입주대기자 수를 찾지 못했습니다.",
        detail: state.sourceUrl
      });
      throw new Error("입주대기자 수를 찾지 못했습니다.");
    }

    if (state.latestCount === null) {
      await saveState({
        ...state,
        latestCount: currentCount,
        lastCheckedAt: checkedAt
      });
      await appendLog({
        level: "info",
        message: `최초 기준값을 저장했습니다: ${currentCount}`
      });
      return {
        status: "initialized",
        checkedAt,
        currentCount,
        sourceUrl: state.sourceUrl
      };
    }

    if (state.latestCount === currentCount) {
      await saveState({
        ...state,
        latestCount: currentCount,
        lastCheckedAt: checkedAt
      });
      await appendLog({
        level: "info",
        message: `변경 없음: ${currentCount}`
      });
      return {
        status: "unchanged",
        checkedAt,
        currentCount,
        sourceUrl: state.sourceUrl
      };
    }

    const change = {
      checkedAt,
      previousCount: state.latestCount,
      currentCount,
      diff: currentCount - state.latestCount,
      sourceUrl: state.sourceUrl
    };

    await recordHistory(change);
    await saveState({
      ...state,
      latestCount: currentCount,
      lastCheckedAt: checkedAt,
      lastChangedAt: checkedAt
    });
    await sendMessage(change, dashboardUrl);

    return {
      status: "changed",
      change
    };
  } catch (error) {
    await appendLog({
      level: "error",
      message: "모니터 실행 중 오류가 발생했습니다.",
      detail: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
