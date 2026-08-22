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
