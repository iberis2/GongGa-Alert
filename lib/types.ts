export type LogLevel = "info" | "warn" | "error";

export type MonitorState = {
  sourceUrl: string;
  latestCount: number | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastFailedAt: string | null;
  lastErrorSummary: string | null;
  lastTechnicalDetail: string | null;
  consecutiveFailureCount: number;
};

export type HistoryEntry = {
  checkedAt: string;
  previousCount: number | null;
  currentCount: number;
  diff: number | null;
  sourceUrl: string;
};

export type LogEntry = {
  createdAt: string;
  level: LogLevel;
  message: string;
  detail?: string;
};

export type MonitorResult =
  | {
      status: "initialized";
      checkedAt: string;
      currentCount: number;
      sourceUrl: string;
    }
  | {
      status: "unchanged";
      checkedAt: string;
      currentCount: number;
      sourceUrl: string;
    }
  | {
      status: "changed";
      change: HistoryEntry;
    }
  | {
      status: "failed";
      checkedAt: string;
      errorSummary: string;
      consecutiveFailureCount: number;
    };
