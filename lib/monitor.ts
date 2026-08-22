import { DASHBOARD_URL } from "./config";
import { sendKakaoChangeMessage } from "./kakao";
import { explainMyHomeError, fetchNoticeHtml, formatMyHomeError } from "./myhome";
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

function markHealthy<T extends {
  lastFailedAt: string | null;
  lastErrorSummary: string | null;
  lastTechnicalDetail: string | null;
  consecutiveFailureCount: number;
}>(
  state: T
) {
  return {
    ...state,
    lastFailedAt: null,
    lastErrorSummary: null,
    lastTechnicalDetail: null,
    consecutiveFailureCount: 0
  };
}

function getMonitorTechnicalDetail(error: unknown) {
  return formatMyHomeError(error);
}

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
      throw new Error("입주대기자 수를 찾지 못했습니다.");
    }

    const hadFailures = state.consecutiveFailureCount > 0;
    const healthyState = markHealthy(state);

    if (hadFailures) {
      await appendLog({
        level: "info",
        message: "마이홈 확인이 정상 복구되었습니다.",
        detail: `이전 연속 실패: ${state.consecutiveFailureCount}회`
      });
    }

    if (state.latestCount === null) {
      await saveState({
        ...healthyState,
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
        ...healthyState,
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
      ...healthyState,
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
    const latestState = await loadState();
    const technicalDetail = getMonitorTechnicalDetail(error);
    const errorSummary = explainMyHomeError(technicalDetail);
    const isSameError = latestState.lastTechnicalDetail === technicalDetail;
    const consecutiveFailureCount = isSameError
      ? latestState.consecutiveFailureCount + 1
      : 1;

    await saveState({
      ...latestState,
      lastFailedAt: checkedAt,
      lastErrorSummary: errorSummary,
      lastTechnicalDetail: technicalDetail,
      consecutiveFailureCount
    });

    if (!isSameError) {
      await appendLog({
        level: "error",
        message: "모니터 실행 중 오류가 발생했습니다.",
        detail: `${errorSummary}\n\n기술 상세: ${technicalDetail}`
      });
    }

    if (consecutiveFailureCount === 3) {
      await appendLog({
        level: "warn",
        message: "마이홈 확인이 3회 연속 실패했습니다.",
        detail: `${errorSummary}\n\n기술 상세: ${technicalDetail}`
      });
    }

    throw error;
  }
}
