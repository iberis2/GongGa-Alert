import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadLocalEnvFile(fileName: string) {
  const filePath = path.join(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile(".env");
loadLocalEnvFile(".env.local");

export const DEFAULT_SOURCE_URL =
  "https://www.myhome.go.kr/hws/portal/sch/selectMoveWaitStsDetail.do?hsmpSn=30700355&suplyTy=02&atchFileId=FLE00016014&rtsSe=01&styleNm=46&drwtUnit=46";

export const CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_DASHBOARD_URL = "https://iberis2.github.io/GongGa-Alert/";

export const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim() || DEFAULT_DASHBOARD_URL;

export type KakaoSendMode = "disabled" | "me" | "friend";

export function getKakaoConfig() {
  const mode = (process.env.KAKAO_SEND_MODE?.trim() || "disabled") as KakaoSendMode;
  const restApiKey = process.env.KAKAO_REST_API_KEY?.trim() || "";
  const accessToken = process.env.KAKAO_ACCESS_TOKEN?.trim() || "";
  const refreshToken = process.env.KAKAO_REFRESH_TOKEN?.trim() || "";
  const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim() || "";
  const friendUuids =
    process.env.KAKAO_FRIEND_UUIDS?.split(",")
      .map((uuid) => uuid.trim())
      .filter(Boolean) || [];

  return {
    mode: ["disabled", "me", "friend"].includes(mode) ? mode : "disabled",
    restApiKey,
    accessToken,
    refreshToken,
    clientSecret,
    friendUuids
  };
}
