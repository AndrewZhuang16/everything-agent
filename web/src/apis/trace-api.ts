import { requestJson } from "./request-json";

const endpoint = "/api/local-agent";

export interface TraceRecord {
  version: 3; eventId?: string; type: string; timestamp: string; sequence?: number; traceId: string; turnId?: string; taskId?: string; sourceTurnId?: string; sessionId?: string;
  iteration?: number; modelCallId?: string; toolCallId?: string; payload?: Record<string, unknown>; [key: string]: unknown;
}

export interface TraceFile {
  path: string;
  records: TraceRecord[];
}

export interface TraceDashboard {
  traces: { traceId: string; startedAt: string; eventCount: number; status: string }[];
  nextCursor: string | null;
}

export function loadTraces(cursor?: string): Promise<TraceDashboard> {
  return requestJson(`${endpoint}/traces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}

export function loadTrace(traceId: string): Promise<{ files: TraceFile[] }> {
  return requestJson(`${endpoint}/traces?traceId=${encodeURIComponent(traceId)}`);
}
