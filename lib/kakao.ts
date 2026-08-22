import { DASHBOARD_URL, getKakaoConfig } from "./config";
import { appendLog } from "./storage";
import type { HistoryEntry } from "./types";

function buildMessage(change: HistoryEntry, dashboardUrl: string) {
  const diffText = change.diff === null ? "" : ` (${change.diff > 0 ? "+" : ""}${change.diff})`;
  return [
    "입주대기자 수가 변경되었습니다.",
    `이전: ${change.previousCount ?? "없음"}`,
    `현재: ${change.currentCount}${diffText}`,
    `감지 시각: ${new Date(change.checkedAt).toLocaleString("ko-KR")}`,
    `대시보드: ${dashboardUrl}`
  ].join("\n");
}

function buildDefaultTemplate(change: HistoryEntry, dashboardUrl: string) {
  return {
    object_type: "text",
    text: buildMessage(change, dashboardUrl),
    link: {
      web_url: dashboardUrl,
      mobile_web_url: dashboardUrl
    },
    button_title: "대시보드 보기"
  };
}

export async function sendKakaoChangeMessage(
  change: HistoryEntry,
  dashboardUrl = DASHBOARD_URL
) {
  const config = getKakaoConfig();

  if (config.mode === "disabled") {
    await appendLog({
      level: "info",
      message: "카카오 알림 비활성화 상태라 메시지를 보내지 않았습니다."
    });
    return;
  }

  if (!config.accessToken) {
    await appendLog({
      level: "warn",
      message: "KAKAO_ACCESS_TOKEN이 없어 카카오 메시지를 보내지 않았습니다."
    });
    return;
  }

  const template = buildDefaultTemplate(change, dashboardUrl);
  const body = new URLSearchParams({
    template_object: JSON.stringify(template)
  });

  let endpoint = "https://kapi.kakao.com/v2/api/talk/memo/default/send";

  if (config.mode === "friend") {
    if (config.friendUuids.length === 0) {
      await appendLog({
        level: "warn",
        message: "KAKAO_FRIEND_UUIDS가 없어 친구 메시지를 보내지 않았습니다."
      });
      return;
    }

    endpoint = "https://kapi.kakao.com/v1/api/talk/friends/message/default/send";
    body.set("receiver_uuids", JSON.stringify(config.friendUuids));
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    await appendLog({
      level: "error",
      message: "카카오 메시지 발송 실패",
      detail
    });
    throw new Error(`카카오 메시지 발송 실패: ${response.status}`);
  }

  await appendLog({
    level: "info",
    message: `카카오 ${config.mode === "friend" ? "친구" : "나에게"} 메시지를 보냈습니다.`
  });
}
