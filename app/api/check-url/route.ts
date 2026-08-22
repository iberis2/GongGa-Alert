import { NextResponse } from "next/server";
import { fetchNoticeHtml } from "../../../lib/myhome";
import { parseWaitlistCount } from "../../../lib/parser";

function isMyHomeDetailUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.hostname === "www.myhome.go.kr" &&
      url.pathname.endsWith("/selectMoveWaitStsDetail.do")
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const url = body?.url?.trim();

  if (!url || !isMyHomeDetailUrl(url)) {
    return NextResponse.json(
      {
        ok: false,
        error: "마이홈 예비입주자 대기현황 상세 링크만 입력할 수 있습니다."
      },
      { status: 400 }
    );
  }

  const html = await fetchNoticeHtml(url);
  const count = parseWaitlistCount(html);

  if (count === null) {
    return NextResponse.json(
      {
        ok: false,
        error: "입주대기자 수를 찾지 못했습니다."
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    count,
    checkedAt: new Date().toISOString()
  });
}
