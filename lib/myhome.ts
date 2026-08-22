export async function fetchNoticeHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WaitlistAlert/0.1; +https://localhost)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`마이홈 페이지 요청 실패: ${response.status} ${response.statusText}`);
  }

  return response.text();
}
