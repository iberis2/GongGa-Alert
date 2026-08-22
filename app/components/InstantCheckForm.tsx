"use client";

import { FormEvent, useState } from "react";

type CheckResult =
  | {
      ok: true;
      count: number;
      checkedAt: string;
    }
  | {
      ok: false;
      error: string;
    };

export function InstantCheckForm() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/check-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });
      const payload = (await response.json()) as CheckResult;
      setResult(payload);
    } catch {
      setResult({
        ok: false,
        error: "확인 요청 중 오류가 발생했습니다."
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="check-form" onSubmit={onSubmit}>
      <label>
        마이홈 예비입주자 대기현황 상세 링크
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.myhome.go.kr/hws/portal/sch/selectMoveWaitStsDetail.do?..."
          required
        />
      </label>
      <button className="button" disabled={isLoading} type="submit">
        {isLoading ? "확인 중" : "입주대기자 수 확인"}
      </button>

      {result?.ok ? (
        <div className="instant-result">
          <span>{new Date(result.checkedAt).toLocaleString("ko-KR")} 확인</span>
          <strong>{result.count.toLocaleString("ko-KR")}명</strong>
        </div>
      ) : null}

      {result && !result.ok ? (
        <div className="log" data-level="error">
          <strong>확인 실패</strong>
          <p>{result.error}</p>
        </div>
      ) : null}
    </form>
  );
}
