import { requestJson } from "./request-json";
import type { CompactionRecord } from "./agent-api";

const endpoint = "/api/local-agent";

export interface SessionSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;

  completedTurnCount: number;
  incompleteTurnCount: number;
}

export interface ChatLogEntry {
  compactions?: CompactionRecord[];
  id: number;
  sessionId: string;
  turnId: string;
  role: string;
  kind: string;
  content: unknown;
  createdAt: string;
  turnComplete?: boolean;
  contentTruncated?: boolean;
  contentFragment?: boolean;
  contentOffset?: number;
}

export interface SessionRecallResult {
  session: SessionSummary;
  rank: number;
  retrievalSignals: { bm25?: number; dense?: number; fused?: number; mmr?: number };
  match: null | { messageId: number; bm25?: number; dense?: number; totalMatches: number };
  entries: ChatLogEntry[];
  totalMessageCount: number;
  returnedMessageCount: number;
  indexedMessageCount: number;
  returnedRanges: Array<{ fromMessageId: number; toMessageId: number }>;
  isComplete: boolean;
  truncated: boolean;
  nextCursor: string | null;
}

export interface SessionSearchResult {
  retrievalMode: "search" | "recent";
  query?: string;
  requestedLimit: number;
  returnedSessionCount: number;
  droppedSessionCount: number;
  truncated: boolean;
  sessions: SessionRecallResult[];
}

export interface SessionReadResult {
  session: SessionSummary;
  entries: ChatLogEntry[];
  totalMessageCount: number;
  returnedMessageCount: number;
  returnedRanges: Array<{ fromMessageId: number; toMessageId: number }>;
  isComplete: boolean;
  truncated: boolean;
  nextCursor: string | null;
}

export interface SemanticMemory {
  id: number; subject: string; content: string; source: string; createdAt: string; updatedAt: string;
}

export interface ConsolidationTask {
  id: number; taskId: string; trigger: string; status: string; totalBatches: number; completedBatches: number; unresolvedConflicts: number;
  factsCreated: number; factsUpdated: number; factsSkipped: number; factsDeleted: number; factsMerged: number;
  errorType: string | null; startedAt: string; completedAt: string | null;
}

export interface MemoryDashboard {
  overview: { semanticCount: number; indexedSessionCount: number; indexedMessageCount: number; sessionCount: number; databasePath: string; latestConsolidation: ConsolidationTask | null };
  sessions: SessionSummary[];
  semantic: SemanticMemory[];
  chatLog: ChatLogEntry[];
  consolidations: ConsolidationTask[];
}

export function loadMemory(): Promise<MemoryDashboard> {
  return requestJson(`${endpoint}/memory`);
}

export async function memoryAction<T = unknown>(value: Record<string, unknown>): Promise<T> {
  const response = await requestJson<{ ok: true; result: T }>(`${endpoint}/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  return response.result;
}
