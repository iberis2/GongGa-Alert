import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fetchNoticeHtml, formatMyHomeError } from "../lib/myhome";

const execFileAsync = promisify(execFile);

const TARGET_URL =
  "https://www.myhome.go.kr/hws/portal/sch/selectMoveWaitStsDetail.do?hsmpSn=30700355&suplyTy=02&atchFileId=FLE00016014&rtsSe=01&styleNm=46&drwtUnit=46";

type ProbeStatus = "success" | "failure";

type ProbeResult = {
  status: ProbeStatus;
  detail: string;
  elapsedMs: number;
};

type DiagnosticsResult = {
  runnerOs: string;
  platform: string;
  publicIp: {
    apiIpify: string;
    ifconfigMe: string;
  };
  dnsResult: string;
  basicCurlStatus: ProbeStatus;
  basicCurlDetail: string;
  browserHeaderCurlStatus: ProbeStatus;
  browserHeaderCurlDetail: string;
  nodeFetchStatus: ProbeStatus;
  nodeFetchDetail: string;
  failurePhase: string;
  summary: string;
  checkedAt: string;
};

function summarizeOutput(value: string, maxLength = 5000) {
  const compact = value.replace(/\r/g, "").trim();
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength)}\n...[truncated]`
    : compact;
}

async function runCommand(command: string, args: string[], timeoutMs = 40_000): Promise<ProbeResult> {
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024
    });

    return {
      status: "success",
      detail: summarizeOutput([stdout, stderr].filter(Boolean).join("\n")),
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    const failed = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: unknown;
      signal?: unknown;
    };

    return {
      status: "failure",
      detail: summarizeOutput(
        [
          failed.message ? `message=${failed.message}` : "",
          failed.code !== undefined ? `code=${String(failed.code)}` : "",
          failed.signal !== undefined ? `signal=${String(failed.signal)}` : "",
          failed.stdout,
          failed.stderr
        ]
          .filter(Boolean)
          .join("\n")
      ),
      elapsedMs: Date.now() - startedAt
    };
  }
}

async function getText(url: string) {
  const result = await runCommand("curl", ["-sS", "--max-time", "10", url], 15_000);
  return result.status === "success" ? result.detail : `failed: ${result.detail}`;
}

async function runNodeFetchProbe(): Promise<ProbeResult> {
  const startedAt = Date.now();

  try {
    await fetchNoticeHtml(TARGET_URL, {
      retryCount: 1,
      retryDelayMs: 0,
      timeoutMs: 30_000
    });

    return {
      status: "success",
      detail: "fetchNoticeHtml succeeded",
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: "failure",
      detail: formatMyHomeError(error),
      elapsedMs: Date.now() - startedAt
    };
  }
}

function decideFailurePhase(result: {
  dnsResult: string;
  basicCurl: ProbeResult;
  browserHeaderCurl: ProbeResult;
  nodeFetch: ProbeResult;
}) {
  if (result.dnsResult.startsWith("failed:")) {
    return "dns";
  }

  if (result.basicCurl.status === "failure" && result.browserHeaderCurl.status === "success") {
    return "headers";
  }

  if (result.basicCurl.status === "success" && result.nodeFetch.status === "failure") {
    return "node-fetch";
  }

  if (
    result.basicCurl.status === "failure" &&
    result.browserHeaderCurl.status === "failure" &&
    result.nodeFetch.status === "failure"
  ) {
    return "runner-network-or-ip";
  }

  if (result.basicCurl.status === "success" || result.browserHeaderCurl.status === "success") {
    return "reachable";
  }

  return "unknown";
}

function summarize(result: {
  failurePhase: string;
  basicCurl: ProbeResult;
  browserHeaderCurl: ProbeResult;
  nodeFetch: ProbeResult;
}) {
  if (result.failurePhase === "headers") {
    return "기본 요청은 실패했지만 브라우저 헤더 요청은 성공했습니다. 요청 헤더/Referer/User-Agent 보강으로 해결될 가능성이 있습니다.";
  }

  if (result.failurePhase === "node-fetch") {
    return "curl은 성공했지만 Node fetch는 실패했습니다. Node undici/TLS/헤더 구현 차이를 확인해야 합니다.";
  }

  if (result.failurePhase === "runner-network-or-ip") {
    return "DNS는 되었지만 모든 GitHub runner 요청 방식이 실패했습니다. GitHub-hosted runner IP 대역 또는 네트워크 경로 제한 가능성이 높습니다.";
  }

  if (result.failurePhase === "dns") {
    return "GitHub runner에서 마이홈 도메인 DNS 조회가 실패했습니다.";
  }

  if (result.failurePhase === "reachable") {
    return "이 runner에서는 마이홈 접속이 가능합니다. OS/runner 네트워크 차이를 비교해 운영 runner 변경을 검토하세요.";
  }

  return "결과가 혼합되어 있습니다. 각 runner artifact의 상세 로그를 비교해야 합니다.";
}

async function main() {
  const runnerOs = process.env.RUNNER_OS || os.type();
  const outputDir = path.join(process.cwd(), "diagnostics");
  const outputPath = path.join(outputDir, `${runnerOs.toLowerCase()}.json`);
  await mkdir(outputDir, { recursive: true });

  const [apiIpify, ifconfigMe, dns, basicCurl, browserHeaderCurl, nodeFetch] =
    await Promise.all([
      getText("https://api.ipify.org"),
      getText("https://ifconfig.me"),
      runCommand("nslookup", ["www.myhome.go.kr"], 20_000),
      runCommand("curl", [
        "-4",
        "-v",
        "--connect-timeout",
        "10",
        "--max-time",
        "30",
        TARGET_URL
      ]),
      runCommand("curl", [
        "-4",
        "-v",
        "--connect-timeout",
        "10",
        "--max-time",
        "30",
        "-H",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-H",
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "-H",
        "Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "-H",
        "Referer: https://www.myhome.go.kr/hws/portal/sch/selectMoveWaitStsListView.do",
        TARGET_URL
      ]),
      runNodeFetchProbe()
    ]);

  const failurePhase = decideFailurePhase({
    dnsResult: dns.status === "success" ? dns.detail : `failed: ${dns.detail}`,
    basicCurl,
    browserHeaderCurl,
    nodeFetch
  });

  const result: DiagnosticsResult = {
    runnerOs,
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    publicIp: {
      apiIpify,
      ifconfigMe
    },
    dnsResult: dns.status === "success" ? dns.detail : `failed: ${dns.detail}`,
    basicCurlStatus: basicCurl.status,
    basicCurlDetail: basicCurl.detail,
    browserHeaderCurlStatus: browserHeaderCurl.status,
    browserHeaderCurlDetail: browserHeaderCurl.detail,
    nodeFetchStatus: nodeFetch.status,
    nodeFetchDetail: nodeFetch.detail,
    failurePhase,
    summary: summarize({
      failurePhase,
      basicCurl,
      browserHeaderCurl,
      nodeFetch
    }),
    checkedAt: new Date().toISOString()
  };

  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

await main();
