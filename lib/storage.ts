import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SOURCE_URL } from "./config";
import type { HistoryEntry, LogEntry, MonitorState } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const HISTORY_PATH = path.join(DATA_DIR, "history.json");
const LOGS_PATH = path.join(DATA_DIR, "logs.json");

const DEFAULT_STATE: MonitorState = {
  sourceUrl: DEFAULT_SOURCE_URL,
  latestCount: null,
  lastCheckedAt: null,
  lastChangedAt: null,
  lastFailedAt: null,
  lastErrorSummary: null,
  consecutiveFailureCount: 0
};

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await ensureDataDir();
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export async function loadState(): Promise<MonitorState> {
  await ensureDataDir();
  const state = await readJsonFile<Partial<MonitorState>>(STATE_PATH, DEFAULT_STATE);

  return {
    ...DEFAULT_STATE,
    ...state,
    sourceUrl: state.sourceUrl || DEFAULT_STATE.sourceUrl,
    latestCount: state.latestCount ?? null,
    lastCheckedAt: state.lastCheckedAt ?? null,
    lastChangedAt: state.lastChangedAt ?? null,
    lastFailedAt: state.lastFailedAt ?? null,
    lastErrorSummary: state.lastErrorSummary ?? null,
    consecutiveFailureCount: state.consecutiveFailureCount ?? 0
  };
}

export async function saveState(state: MonitorState) {
  await writeJsonFile(STATE_PATH, state);
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  await ensureDataDir();
  return readJsonFile(HISTORY_PATH, []);
}

export async function recordHistory(change: HistoryEntry) {
  const history = await loadHistory();
  history.unshift(change);
  await writeJsonFile(HISTORY_PATH, history);
}

export async function loadLogs(): Promise<LogEntry[]> {
  await ensureDataDir();
  return readJsonFile(LOGS_PATH, []);
}

export async function appendLog(entry: Omit<LogEntry, "createdAt">) {
  const logs = await loadLogs();
  logs.unshift({
    createdAt: new Date().toISOString(),
    ...entry
  });

  await writeJsonFile(LOGS_PATH, logs.slice(0, 200));
}
