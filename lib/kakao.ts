import { DASHBOARD_URL, getKakaoConfig } from "./config";
import { appendLog } from "./storage";
import type { HistoryEntry } from "./types";

type KakaoConfig = ReturnType<typeof getKakaoConfig>;

type KakaoTokenRefreshResult = {
  accessToken: string;
  refreshTokenRotated: boolean;
  refreshToken?: string;
};

type KakaoSendTarget = {
  endpoint: string;
  body: URLSearchParams;
};

const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";

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

function maskSecret(value: string) {
  if (value.length <= 8) {
    return "[REDACTED]";
  }

  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
}

function sanitizeKakaoDetail(detail: string, config: KakaoConfig) {
  const secrets = [
    config.accessToken,
    config.refreshToken,
    config.clientSecret,
    config.restApiKey,
    ...config.friendUuids
  ].filter(Boolean);

  return secrets.reduce(
    (sanitized, secret) => sanitized.split(secret).join(maskSecret(secret)),
    detail
  );
}

function isUnauthorizedKakaoResponse(response: Response, detail: string) {
  return (
    response.status === 401 ||
    detail.includes("invalid_token") ||
    detail.includes("InvalidTokenException")
  );
}

function buildKakaoSendTarget(config: KakaoConfig, template: object): KakaoSendTarget | null {
  const body = new URLSearchParams({
    template_object: JSON.stringify(template)
  });

  if (config.mode === "me") {
    return {
      endpoint: "https://kapi.kakao.com/v2/api/talk/memo/default/send",
      body
    };
  }

  if (config.mode === "friend") {
    if (config.friendUuids.length === 0) {
      return null;
    }

    body.set("receiver_uuids", JSON.stringify(config.friendUuids));
    return {
      endpoint: "https://kapi.kakao.com/v1/api/talk/friends/message/default/send",
      body
    };
  }

  return null;
}

async function postKakaoMessage(target: KakaoSendTarget, accessToken: string) {
  return fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body: target.body
  });
}

export async function refreshKakaoAccessToken(
  config = getKakaoConfig()
): Promise<KakaoTokenRefreshResult> {
  if (!config.restApiKey || !config.refreshToken) {
    throw new Error("KAKAO_REST_API_KEY 또는 KAKAO_REFRESH_TOKEN이 없어 토큰을 갱신할 수 없습니다.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.restApiKey,
    refresh_token: config.refreshToken
  });

  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body
  });

  const raw = await response.text();

  if (!response.ok) {
    await appendLog({
      level: "error",
      message: "카카오 access token 갱신 실패",
      detail: sanitizeKakaoDetail(raw, config)
    });
    throw new Error(`카카오 access token 갱신 실패: ${response.status}`);
  }

  const payload = JSON.parse(raw) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!payload.access_token) {
    throw new Error("카카오 토큰 갱신 응답에 access_token이 없습니다.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    refreshTokenRotated: Boolean(payload.refresh_token)
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
  const target = buildKakaoSendTarget(config, template);

  if (!target) {
    await appendLog({
      level: "warn",
      message: "KAKAO_FRIEND_UUIDS가 없어 친구 메시지를 보내지 않았습니다."
    });
    return;
  }

  let response = await postKakaoMessage(target, config.accessToken);
  let detail = response.ok ? "" : await response.text();

  if (!response.ok && isUnauthorizedKakaoResponse(response, detail)) {
    const refreshed = await refreshKakaoAccessToken(config);
    response = await postKakaoMessage(target, refreshed.accessToken);
    detail = response.ok ? "" : await response.text();

    if (response.ok) {
      await appendLog({
        level: "info",
        message: "카카오 access token 갱신 후 메시지 발송 성공"
      });

      if (refreshed.refreshTokenRotated) {
        await appendLog({
          level: "warn",
          message: "카카오 refresh token이 갱신되었습니다. GitHub Secret KAKAO_REFRESH_TOKEN을 새 값으로 수동 교체해야 합니다."
        });
      }

      return;
    }
  }

  if (!response.ok) {
    await appendLog({
      level: "error",
      message: "카카오 메시지 발송 실패",
      detail: sanitizeKakaoDetail(detail, config)
    });
    throw new Error(`카카오 메시지 발송 실패: ${response.status}`);
  }

  await appendLog({
    level: "info",
    message: `카카오 ${config.mode === "friend" ? "친구" : "나에게"} 메시지를 보냈습니다.`
  });
}
