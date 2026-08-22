import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRY_COUNT = 3;
const FETCH_RETRY_DELAY_MS = 5_000;

type FetchDiagnostics = {
  name: string;
  message: string;
  causeCode: string | null;
  attempt: number;
  elapsedMs: number;
  timeoutMs: number;
};

export class MyHomeFetchError extends Error {
  diagnostics: FetchDiagnostics;

  constructor(message: string, diagnostics: FetchDiagnostics) {
    super(message);
    this.name = "MyHomeFetchError";
    this.diagnostics = diagnostics;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCauseCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const cause = "cause" in error ? (error as { cause?: unknown }).cause : undefined;

  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return String((cause as { code?: unknown }).code);
  }

  if ("code" in error) {
    return String((error as { code?: unknown }).code);
  }

  return null;
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function formatMyHomeError(error: unknown) {
  if (error instanceof MyHomeFetchError) {
    const { name, message, causeCode, attempt, elapsedMs, timeoutMs } = error.diagnostics;

    return [
      `${name}: ${message}`,
      causeCode ? `cause.code=${causeCode}` : "cause.code=none",
      `attempt=${attempt}`,
      `elapsedMs=${elapsedMs}`,
      `timeoutMs=${timeoutMs}`
    ].join(" | ");
  }

  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function explainMyHomeError(technicalDetail: string) {
  if (technicalDetail.includes("UND_ERR_CONNECT_TIMEOUT")) {
    return "마이홈 공고 페이지에 접속하지 못했습니다. 네트워크 연결이 시간 안에 완료되지 않았고, 총 3번 재시도했지만 실패했습니다. 마이홈 사이트가 일시적으로 느리거나 GitHub Actions 서버에서 마이홈 사이트 접속이 제한되었을 가능성이 있습니다. 기존에 저장된 입주대기자 수는 유지됩니다.";
  }

  if (technicalDetail.includes("AbortError") || technicalDetail.includes("timeout")) {
    return "마이홈 공고 페이지 응답을 기다렸지만 제한 시간 안에 완료되지 않았습니다. 사이트가 일시적으로 느리거나 네트워크 상태가 좋지 않을 수 있습니다. 기존에 저장된 입주대기자 수는 유지됩니다.";
  }

  if (technicalDetail.includes("HTTP 4")) {
    return "마이홈 공고 페이지가 요청을 받아들이지 않았습니다. 공고 링크가 바뀌었거나 접속 권한 또는 요청 방식이 맞지 않을 수 있습니다. 기존에 저장된 입주대기자 수는 유지됩니다.";
  }

  if (technicalDetail.includes("HTTP 5")) {
    return "마이홈 서버에서 오류 응답을 보냈습니다. 마이홈 사이트의 일시적인 문제일 가능성이 있습니다. 기존에 저장된 입주대기자 수는 유지됩니다.";
  }

  if (technicalDetail.includes("입주대기자 수를 찾지 못했습니다")) {
    return "마이홈 공고 페이지는 열렸지만 입주대기자 수를 찾지 못했습니다. 페이지 구조가 바뀌었거나 해당 공고의 표시 방식이 달라졌을 수 있습니다. 기존에 저장된 입주대기자 수는 유지됩니다.";
  }

  return "마이홈 공고 페이지 확인 중 알 수 없는 문제가 발생했습니다. 기존에 저장된 입주대기자 수는 유지됩니다.";
}

export async function fetchNoticeHtml(
  url: string,
  options: {
    retryCount?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  let lastError: unknown;
  let lastDiagnostics: FetchDiagnostics | null = null;
  const retryCount = options.retryCount ?? FETCH_RETRY_COUNT;
  const retryDelayMs = options.retryDelayMs ?? FETCH_RETRY_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; WaitlistAlert/0.1; +https://localhost)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          Connection: "close"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response.text();
    } catch (error) {
      lastError = error;
      lastDiagnostics = {
        name: getErrorName(error),
        message: getErrorMessage(error),
        causeCode: getCauseCode(error),
        attempt,
        elapsedMs: Date.now() - startedAt,
        timeoutMs
      };

      if (attempt < retryCount) {
        await sleep(retryDelayMs * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const message = lastError instanceof Error
    ? `마이홈 페이지 요청 실패: ${lastError.message}`
    : "마이홈 페이지 요청에 실패했습니다.";

  throw new MyHomeFetchError(
    message,
    lastDiagnostics ?? {
      name: "UnknownError",
      message,
      causeCode: null,
      attempt: retryCount,
      elapsedMs: 0,
      timeoutMs
    }
  );
}
