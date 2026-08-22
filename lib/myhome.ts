const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRY_COUNT = 3;
const FETCH_RETRY_DELAY_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchNoticeHtml(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FETCH_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
        throw new Error(`마이홈 페이지 요청 실패: ${response.status} ${response.statusText}`);
      }

      return response.text();
    } catch (error) {
      lastError = error;

      if (attempt < FETCH_RETRY_COUNT) {
        await sleep(FETCH_RETRY_DELAY_MS * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("마이홈 페이지 요청에 실패했습니다.");
}
