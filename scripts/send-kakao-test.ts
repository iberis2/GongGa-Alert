import { DASHBOARD_URL, DEFAULT_SOURCE_URL, getKakaoConfig } from "../lib/config";
import { sendKakaoChangeMessage } from "../lib/kakao";
import type { HistoryEntry } from "../lib/types";

const config = getKakaoConfig();

if (config.mode === "disabled") {
  throw new Error("KAKAO_SEND_MODE가 disabled입니다. .env에서 me 또는 friend로 설정하세요.");
}

const change: HistoryEntry = {
  checkedAt: new Date().toISOString(),
  previousCount: null,
  currentCount: 80,
  diff: null,
  sourceUrl: DEFAULT_SOURCE_URL
};

await sendKakaoChangeMessage(change, DASHBOARD_URL);
console.log(`Kakao ${config.mode} test message requested.`);
